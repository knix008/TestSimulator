using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;

namespace YOLO26BrainV10.Inference;

/// <summary>
/// Ultralytics-style YOLO11 (and compatible) ONNX: instance segmentation or detection.
/// Box outputs from standard Ultralytics ONNX exports use center-x, center-y, width, height in letterboxed pixel space.
/// Class names must match the dataset used when training/exporting the model.
/// </summary>
public sealed class BrainYolo26Session : IDisposable
{
    private readonly InferenceSession _session;
    private readonly string _inputName;
    private readonly int _netSize;
    private readonly IReadOnlyList<string> _classNames;

    public string ExecutionProviderSummary { get; }

    public BrainYolo26Session(string onnxPath, IReadOnlyList<string> classNames, int cudaDeviceId = 0)
    {
        ArgumentNullException.ThrowIfNull(classNames);
        if (classNames.Count == 0)
            throw new ArgumentException("At least one class name is required.", nameof(classNames));

        _classNames = classNames;
        _session = YoloOnnxSessionFactory.CreateSession(onnxPath, cudaDeviceId, out var summary);
        ExecutionProviderSummary = summary;
        _inputName = _session.InputMetadata.Keys.First();
        var shape = _session.InputMetadata[_inputName].Dimensions;
        if (shape != null && shape.Length >= 4 && shape[2] > 0)
            _netSize = (int)shape[2];
        else
            _netSize = 640;
    }

    public int NetSize => _netSize;

    public void Dispose() => _session.Dispose();

    /// <summary>Runs segmentation (if ONNX includes mask prototypes) or detection; returns an annotated bitmap.</summary>
    public (Bitmap Annotated, IReadOnlyList<BrainDetection> Detections) Detect(
        Bitmap source,
        float confThreshold = 0.25f,
        IReadOnlySet<int>? allowedClassIds = null)
    {
        ArgumentNullException.ThrowIfNull(source);

        using var src = new Bitmap(source);
        var lb = LetterboxInfo.FromBitmap(src, _netSize);
        var chw = LetterboxInfo.ToChwTensor(src, lb);
        var inputTensor = new DenseTensor<float>(chw, new[] { 1, 3, _netSize, _netSize });
        var inputs = new List<NamedOnnxValue> { NamedOnnxValue.CreateFromTensor(_inputName, inputTensor) };

        using var results = _session.Run(inputs);
        return Postprocess(src, lb, results, confThreshold, allowedClassIds);
    }

    private (Bitmap, IReadOnlyList<BrainDetection>) Postprocess(
        Bitmap original,
        LetterboxInfo lb,
        IReadOnlyCollection<NamedOnnxValue> results,
        float confThreshold,
        IReadOnlySet<int>? allowedClassIds)
    {
        var nc = _classNames.Count;
        var proto = PickProtoTensor(results);
        var nm = proto != null ? (int)proto.Dimensions[1] : 0;

        if (proto != null)
        {
            var pred = PickPredTensor(results, nc, nm);
            if (pred == null)
                throw new InvalidOperationException(
                    $"세그멘테이션 ONNX와 클래스 수가 맞지 않습니다. 라벨 {nc}개이면 예측 채널은 {4 + nc + nm}개여야 합니다(마스크 계수 {nm}).");

            return PostprocessSegmentation(original, lb, pred, proto, nm, confThreshold, allowedClassIds);
        }

        var detPred = PickPredTensor(results, nc, 0) ?? PickDetectionTensorLegacy(results)
                      ?? throw new InvalidOperationException(
                          "3차원 검출 출력 텐서를 찾을 수 없습니다. ONNX가 Ultralytics 검출/세그 형식인지 확인하세요.");

        return PostprocessDetectionOnly(original, lb, detPred, confThreshold, allowedClassIds);
    }

    private static DenseTensor<float>? PickProtoTensor(IReadOnlyCollection<NamedOnnxValue> results)
    {
        foreach (var r in results)
        {
            if (r.AsTensor<float>() is not DenseTensor<float> t)
                continue;
            if (t.Dimensions.Length != 4)
                continue;
            var d0 = (int)t.Dimensions[0];
            var d1 = (int)t.Dimensions[1];
            var d2 = (int)t.Dimensions[2];
            var d3 = (int)t.Dimensions[3];
            if (d0 != 1 || d1 is < 4 or > 256 || d2 < 8 || d3 < 8)
                continue;
            return t;
        }

        return null;
    }

    private static Tensor<float>? PickPredTensor(IReadOnlyCollection<NamedOnnxValue> results, int nc, int nmExtra)
    {
        var expected = 4 + nc + nmExtra;
        Tensor<float>? best = null;
        var bestScore = -1L;
        foreach (var r in results)
        {
            var t = r.AsTensor<float>();
            if (t == null || t.Dimensions.Length != 3)
                continue;
            var d1 = (int)t.Dimensions[1];
            var d2 = (int)t.Dimensions[2];
            var channelsLast = d2 < d1;
            var width = channelsLast ? d2 : d1;
            if (width != expected)
                continue;
            var n = channelsLast ? d1 : d2;
            var score = (long)n * width;
            if (score > bestScore)
            {
                bestScore = score;
                best = t;
            }
        }

        return best;
    }

    private static Tensor<float>? PickDetectionTensorLegacy(IReadOnlyCollection<NamedOnnxValue> results)
    {
        Tensor<float>? best = null;
        var bestScore = -1L;
        foreach (var r in results)
        {
            var t = r.AsTensor<float>();
            if (t == null || t.Dimensions.Length != 3)
                continue;
            var a = (int)t.Dimensions[1];
            var b = (int)t.Dimensions[2];
            var w = Math.Min(a, b);
            if (w < 5)
                continue;
            var score = (long)Math.Max(a, b) * w;
            if (score > bestScore)
            {
                bestScore = score;
                best = t;
            }
        }

        return best;
    }

    private (Bitmap, IReadOnlyList<BrainDetection>) PostprocessDetectionOnly(
        Bitmap original,
        LetterboxInfo lb,
        Tensor<float> pred,
        float confThreshold,
        IReadOnlySet<int>? allowedClassIds)
    {
        var d1 = (int)pred.Dimensions[1];
        var d2 = (int)pred.Dimensions[2];
        var channelsLast = d2 < d1;
        int n;
        int width;
        if (channelsLast)
        {
            n = d1;
            width = d2;
        }
        else
        {
            n = d2;
            width = d1;
        }

        if (width < 5)
            throw new InvalidOperationException("Unexpected detection channel count.");

        float P(int det, int ch) => channelsLast ? pred[0, det, ch] : pred[0, ch, det];

        List<DetCandidate> raw = width == 6
            ? CollectEndToEnd(n, P, confThreshold, allowedClassIds, _classNames.Count, _netSize)
            : CollectClassChannels(n, width, P, confThreshold, allowedClassIds, _classNames.Count, nm: 0, out _);

        return RenderBoxes(original, lb, Nms(raw, 0.45f, 300));
    }

    private (Bitmap, IReadOnlyList<BrainDetection>) PostprocessSegmentation(
        Bitmap original,
        LetterboxInfo lb,
        Tensor<float> pred,
        DenseTensor<float> proto,
        int nm,
        float confThreshold,
        IReadOnlySet<int>? allowedClassIds)
    {
        var d1 = (int)pred.Dimensions[1];
        var d2 = (int)pred.Dimensions[2];
        var channelsLast = d2 < d1;
        int n;
        int width;
        if (channelsLast)
        {
            n = d1;
            width = d2;
        }
        else
        {
            n = d2;
            width = d1;
        }

        float P(int det, int ch) => channelsLast ? pred[0, det, ch] : pred[0, ch, det];

        var raw = CollectClassChannels(n, width, P, confThreshold, allowedClassIds, _classNames.Count, nm, out _);
        var kept = Nms(raw, 0.45f, 300);

        var mh = (int)proto.Dimensions[2];
        var mw = (int)proto.Dimensions[3];

        var rendered = new Bitmap(original.Width, original.Height, PixelFormat.Format32bppArgb);
        var list = new List<BrainDetection>();
        using (var g = Graphics.FromImage(rendered))
        {
            g.DrawImage(original, 0, 0, original.Width, original.Height);
        }

        var data = rendered.LockBits(
            new Rectangle(0, 0, rendered.Width, rendered.Height),
            ImageLockMode.ReadWrite,
            PixelFormat.Format32bppArgb);
        try
        {
            var stride = data.Stride;
            var ptr = data.Scan0;
            unsafe
            {
                var p = (byte*)ptr.ToPointer();
                foreach (var c in kept)
                {
                    var ox1 = (c.X1Lb - lb.PadLeft) / lb.Gain;
                    var oy1 = (c.Y1Lb - lb.PadTop) / lb.Gain;
                    var ox2 = (c.X2Lb - lb.PadLeft) / lb.Gain;
                    var oy2 = (c.Y2Lb - lb.PadTop) / lb.Gain;
                    var rect = RectangleF.FromLTRB(
                        Math.Min(ox1, ox2),
                        Math.Min(oy1, oy2),
                        Math.Max(ox1, ox2),
                        Math.Max(oy1, oy2));

                    var label = ClassLabel(c.ClassId);
                    list.Add(new BrainDetection
                    {
                        Box = rect,
                        ClassId = c.ClassId,
                        Confidence = c.Confidence,
                        Label = label,
                    });

                    if (c.MaskCoeffs is not { Length: > 0 })
                        continue;

                    var maskLow = ComputeMaskLowRes(proto, nm, mh, mw, c.MaskCoeffs);
                    var maskNet = BilinearResize(maskLow, mw, mh, lb.NetSize, lb.NetSize);

                    var hue = (c.ClassId * 37) % 360;
                    var stroke = ColorFromHsv(hue, 0.65f, 0.95f);
                    var ar = stroke.R;
                    var ag = stroke.G;
                    var ab = stroke.B;

                    for (var oy = 0; oy < original.Height; oy++)
                    {
                        var row = oy * stride;
                        var yLb = oy * lb.Gain + lb.PadTop;
                        if (yLb < 0 || yLb >= lb.NetSize - 0.001f)
                            continue;
                        for (var ox = 0; ox < original.Width; ox++)
                        {
                            var xLb = ox * lb.Gain + lb.PadLeft;
                            if (xLb < 0 || xLb >= lb.NetSize - 0.001f)
                                continue;

                            var mv = SampleBilinear(maskNet, lb.NetSize, lb.NetSize, xLb, yLb);
                            if (mv < 0.25f)
                                continue;

                            var aFill = (byte)Math.Clamp((int)(mv * 100f), 0, 120);
                            if (aFill == 0)
                                continue;

                            var i = row + ox * 4;
                            var b0 = p[i];
                            var g0 = p[i + 1];
                            var r0 = p[i + 2];
                            var a0 = p[i + 3];
                            var t = aFill / 255f;
                            p[i] = (byte)(b0 * (1 - t) + ab * t);
                            p[i + 1] = (byte)(g0 * (1 - t) + ag * t);
                            p[i + 2] = (byte)(r0 * (1 - t) + ar * t);
                            p[i + 3] = Math.Max(a0, aFill);
                        }
                    }
                }
            }
        }
        finally
        {
            rendered.UnlockBits(data);
        }

        using (var g = Graphics.FromImage(rendered))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            foreach (var c in kept)
            {
                var ox1 = (c.X1Lb - lb.PadLeft) / lb.Gain;
                var oy1 = (c.Y1Lb - lb.PadTop) / lb.Gain;
                var ox2 = (c.X2Lb - lb.PadLeft) / lb.Gain;
                var oy2 = (c.Y2Lb - lb.PadTop) / lb.Gain;
                var rect = RectangleF.FromLTRB(
                    Math.Min(ox1, ox2),
                    Math.Min(oy1, oy2),
                    Math.Max(ox1, ox2),
                    Math.Max(oy1, oy2));
                var hue = (c.ClassId * 37) % 360;
                var stroke = ColorFromHsv(hue, 0.65f, 0.95f);
                using var pen = new Pen(Color.FromArgb(220, stroke), Math.Max(2f, original.Width / 512f));
                g.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);

                var lbl = $"{ClassLabel(c.ClassId)} {c.Confidence:0.00}";
                using var font = new Font(FontFamily.GenericSansSerif, Math.Max(10f, Math.Min(18f, original.Width / 64f)), FontStyle.Bold);
                using var brush = new SolidBrush(Color.FromArgb(240, Color.White));
                using var bbg = new SolidBrush(Color.FromArgb(180, Color.Black));
                var sz = g.MeasureString(lbl, font);
                var lx = rect.X;
                var ly = Math.Max(0, rect.Y - sz.Height - 2);
                g.FillRectangle(bbg, lx, ly, sz.Width + 8, sz.Height + 4);
                g.DrawString(lbl, font, brush, lx + 4, ly + 2);
            }
        }

        return (rendered, list);
    }

    private (Bitmap, IReadOnlyList<BrainDetection>) RenderBoxes(
        Bitmap original,
        LetterboxInfo lb,
        List<DetCandidate> kept)
    {
        var rendered = new Bitmap(original.Width, original.Height, PixelFormat.Format32bppArgb);
        var list = new List<BrainDetection>();
        using (var g = Graphics.FromImage(rendered))
        {
            g.DrawImage(original, 0, 0, original.Width, original.Height);
            g.SmoothingMode = SmoothingMode.AntiAlias;

            foreach (var c in kept)
            {
                var ox1 = (c.X1Lb - lb.PadLeft) / lb.Gain;
                var oy1 = (c.Y1Lb - lb.PadTop) / lb.Gain;
                var ox2 = (c.X2Lb - lb.PadLeft) / lb.Gain;
                var oy2 = (c.Y2Lb - lb.PadTop) / lb.Gain;
                var rect = RectangleF.FromLTRB(
                    Math.Min(ox1, ox2),
                    Math.Min(oy1, oy2),
                    Math.Max(ox1, ox2),
                    Math.Max(oy1, oy2));

                var label = ClassLabel(c.ClassId);
                list.Add(new BrainDetection
                {
                    Box = rect,
                    ClassId = c.ClassId,
                    Confidence = c.Confidence,
                    Label = label,
                });

                var hue = (c.ClassId * 37) % 360;
                var stroke = ColorFromHsv(hue, 0.65f, 0.95f);
                using var pen = new Pen(Color.FromArgb(220, stroke), Math.Max(2f, original.Width / 512f));
                g.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);

                var text = $"{label} {c.Confidence:0.00}";
                using var font = new Font(FontFamily.GenericSansSerif, Math.Max(10f, Math.Min(18f, original.Width / 64f)), FontStyle.Bold);
                using var brush = new SolidBrush(Color.FromArgb(240, Color.White));
                using var bbg = new SolidBrush(Color.FromArgb(180, Color.Black));
                var sz = g.MeasureString(text, font);
                var lx = rect.X;
                var ly = Math.Max(0, rect.Y - sz.Height - 2);
                g.FillRectangle(bbg, lx, ly, sz.Width + 8, sz.Height + 4);
                g.DrawString(text, font, brush, lx + 4, ly + 2);
            }
        }

        return (rendered, list);
    }

    private string ClassLabel(int classId) =>
        (uint)classId < (uint)_classNames.Count ? _classNames[classId] : $"class_{classId}";

    private static float[] ComputeMaskLowRes(
        DenseTensor<float> proto,
        int nm,
        int mh,
        int mw,
        ReadOnlySpan<float> coeff)
    {
        var m = new float[mh * mw];
        for (var py = 0; py < mh; py++)
        {
            for (var px = 0; px < mw; px++)
            {
                float s = 0;
                for (var k = 0; k < nm; k++)
                    s += coeff[k] * proto[0, k, py, px];
                m[py * mw + px] = Sigmoid(s);
            }
        }

        return m;
    }

    private static float Sigmoid(float x) => 1f / (1f + (float)Math.Exp(-x));

    private static float[] BilinearResize(float[] src, int sw, int sh, int dw, int dh)
    {
        var dst = new float[dw * dh];
        for (var y = 0; y < dh; y++)
        {
            var sy = ((y + 0.5f) / dh) * sh - 0.5f;
            var y0 = (int)Math.Floor(sy);
            var y1 = Math.Min(y0 + 1, sh - 1);
            var fy = sy - y0;
            for (var x = 0; x < dw; x++)
            {
                var sx = ((x + 0.5f) / dw) * sw - 0.5f;
                var x0 = (int)Math.Floor(sx);
                var x1 = Math.Min(x0 + 1, sw - 1);
                var fx = sx - x0;
                var v00 = src[y0 * sw + x0];
                var v01 = src[y0 * sw + x1];
                var v10 = src[y1 * sw + x0];
                var v11 = src[y1 * sw + x1];
                var v0 = v00 * (1 - fx) + v01 * fx;
                var v1 = v10 * (1 - fx) + v11 * fx;
                dst[y * dw + x] = v0 * (1 - fy) + v1 * fy;
            }
        }

        return dst;
    }

    private static float SampleBilinear(float[] grid, int w, int h, float x, float y)
    {
        if (w <= 0 || h <= 0)
            return 0;
        if (x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1)
            return 0;
        var x0 = (int)Math.Floor(x);
        var y0 = (int)Math.Floor(y);
        var x1 = Math.Min(x0 + 1, w - 1);
        var y1 = Math.Min(y0 + 1, h - 1);
        var fx = x - x0;
        var fy = y - y0;
        var v00 = grid[y0 * w + x0];
        var v01 = grid[y0 * w + x1];
        var v10 = grid[y1 * w + x0];
        var v11 = grid[y1 * w + x1];
        var v0 = v00 * (1 - fx) + v01 * fx;
        var v1 = v10 * (1 - fx) + v11 * fx;
        return v0 * (1 - fy) + v1 * fy;
    }

    private static List<DetCandidate> CollectEndToEnd(
        int n,
        Func<int, int, float> P,
        float confThreshold,
        IReadOnlySet<int>? allowedClassIds,
        int ncCap,
        int netSize)
    {
        var list = new List<DetCandidate>();
        for (var i = 0; i < n; i++)
        {
            var x1 = P(i, 0);
            var y1 = P(i, 1);
            var x2 = P(i, 2);
            var y2 = P(i, 3);
            var conf = P(i, 4);
            var cid = (int)Math.Round(P(i, 5));
            if (float.IsNaN(conf) || conf < confThreshold)
                continue;
            if (cid < 0 || cid >= ncCap)
                continue;
            if (allowedClassIds != null && !allowedClassIds.Contains(cid))
                continue;

            if (x1 <= 1.5f && y1 >= 0f && x2 <= 1.5f && y2 <= 1.5f && x2 > x1)
            {
                x1 *= netSize;
                x2 *= netSize;
                y1 *= netSize;
                y2 *= netSize;
            }

            list.Add(new DetCandidate
            {
                X1Lb = x1,
                Y1Lb = y1,
                X2Lb = x2,
                Y2Lb = y2,
                ClassId = cid,
                Confidence = conf,
            });
        }

        return list;
    }

    private static List<DetCandidate> CollectClassChannels(
        int n,
        int width,
        Func<int, int, float> P,
        float confThreshold,
        IReadOnlySet<int>? allowedClassIds,
        int ncCap,
        int nm,
        out int nmOut)
    {
        nmOut = nm;
        var nc = width - 4 - nm;
        if (nc <= 0)
            return new List<DetCandidate>();

        var ncUse = Math.Min(nc, ncCap);
        var list = new List<DetCandidate>();
        for (var i = 0; i < n; i++)
        {
            var cx = P(i, 0);
            var cy = P(i, 1);
            var bw = P(i, 2);
            var bh = P(i, 3);
            UltralyticsCxcywhToXyxy(cx, cy, bw, bh, out var x1, out var y1, out var x2, out var y2);

            var bestC = -1;
            var bestS = 0f;
            for (var c = 0; c < ncUse; c++)
            {
                var s = ScoreValue(P(i, 4 + c));
                if (s > bestS)
                {
                    bestS = s;
                    bestC = c;
                }
            }

            if (bestC < 0 || bestS < confThreshold || float.IsNaN(bestS))
                continue;
            if (allowedClassIds != null && !allowedClassIds.Contains(bestC))
                continue;

            float[]? coeffs = null;
            if (nm > 0)
            {
                coeffs = new float[nm];
                for (var k = 0; k < nm; k++)
                    coeffs[k] = P(i, 4 + nc + k);
            }

            list.Add(new DetCandidate
            {
                X1Lb = x1,
                Y1Lb = y1,
                X2Lb = x2,
                Y2Lb = y2,
                ClassId = bestC,
                Confidence = bestS,
                MaskCoeffs = coeffs,
            });
        }

        return list;
    }

    private static void UltralyticsCxcywhToXyxy(float cx, float cy, float w, float h, out float x1, out float y1, out float x2, out float y2)
    {
        x1 = cx - w * 0.5f;
        y1 = cy - h * 0.5f;
        x2 = cx + w * 0.5f;
        y2 = cy + h * 0.5f;
    }

    private static float ScoreValue(float raw) =>
        raw is >= 0f and <= 1f ? raw : 1f / (1f + (float)Math.Exp(-raw));

    private static List<DetCandidate> Nms(List<DetCandidate> boxes, float iouThreshold, int maxDetections)
    {
        if (boxes.Count == 0)
            return boxes;

        var ordered = boxes.OrderByDescending(b => b.Confidence).ToList();
        var selected = new List<DetCandidate>();
        var suppressed = new bool[ordered.Count];
        for (var i = 0; i < ordered.Count && selected.Count < maxDetections; i++)
        {
            if (suppressed[i])
                continue;
            selected.Add(ordered[i]);
            for (var j = i + 1; j < ordered.Count; j++)
            {
                if (suppressed[j])
                    continue;
                if (ordered[j].ClassId != ordered[i].ClassId)
                    continue;
                if (IoU(ordered[i], ordered[j]) >= iouThreshold)
                    suppressed[j] = true;
            }
        }

        return selected;
    }

    private static float IoU(DetCandidate a, DetCandidate b)
    {
        var ix1 = Math.Max(a.X1Lb, b.X1Lb);
        var iy1 = Math.Max(a.Y1Lb, b.Y1Lb);
        var ix2 = Math.Min(a.X2Lb, b.X2Lb);
        var iy2 = Math.Min(a.Y2Lb, b.Y2Lb);
        var iw = Math.Max(0f, ix2 - ix1);
        var ih = Math.Max(0f, iy2 - iy1);
        var inter = iw * ih;
        var areaA = Math.Max(0f, a.X2Lb - a.X1Lb) * Math.Max(0f, a.Y2Lb - a.Y1Lb);
        var areaB = Math.Max(0f, b.X2Lb - b.X1Lb) * Math.Max(0f, b.Y2Lb - b.Y1Lb);
        var union = areaA + areaB - inter;
        if (union <= 1e-6f)
            return 0f;
        return inter / union;
    }

    private static Color ColorFromHsv(float h, float s, float v)
    {
        var hi = (int)(h / 60) % 6;
        var f = h / 60 - hi;
        var p = v * (1 - s);
        var q = v * (1 - f * s);
        var t = v * (1 - (1 - f) * s);
        float r, g, b;
        switch (hi)
        {
            case 0:
                r = v;
                g = t;
                b = p;
                break;
            case 1:
                r = q;
                g = v;
                b = p;
                break;
            case 2:
                r = p;
                g = v;
                b = t;
                break;
            case 3:
                r = p;
                g = q;
                b = v;
                break;
            case 4:
                r = t;
                g = p;
                b = v;
                break;
            default:
                r = v;
                g = p;
                b = q;
                break;
        }

        return Color.FromArgb((int)(r * 255), (int)(g * 255), (int)(b * 255));
    }

    private sealed class DetCandidate
    {
        public float X1Lb { get; set; }
        public float Y1Lb { get; set; }
        public float X2Lb { get; set; }
        public float Y2Lb { get; set; }
        public int ClassId { get; set; }
        public float Confidence { get; set; }
        public float[]? MaskCoeffs { get; set; }
    }
}
