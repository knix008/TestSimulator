using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;

namespace YOLO26BrainV10.Inference;

/// <summary>
/// Ultralytics-style YOLO26 (and compatible) ONNX: instance segmentation or detection.
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

    /// <summary>True when ONNX outputs include an Ultralytics-style mask prototype tensor (YOLO-seg export).</summary>
    public bool SupportsInstanceSegmentation { get; }

    public BrainYolo26Session(string onnxPath, IReadOnlyList<string> classNames, int cudaDeviceId = 0)
    {
        ArgumentNullException.ThrowIfNull(classNames);
        if (classNames.Count == 0)
            throw new ArgumentException("At least one class name is required.", nameof(classNames));

        _classNames = classNames;
        _session = YoloOnnxSessionFactory.CreateSession(onnxPath, cudaDeviceId, out var summary);
        ExecutionProviderSummary = summary;
        SupportsInstanceSegmentation = OutputMetadataLooksLikeUltralyticsMaskProto(_session);
        _inputName = ResolveImageInputName(_session);
        var shape = _session.InputMetadata[_inputName].Dimensions;
        if (shape != null && shape.Length >= 4 && shape[2] > 0)
            _netSize = (int)shape[2];
        else
            _netSize = 640;
    }

    public int NetSize => _netSize;

    public void Dispose() => _session.Dispose();

    private static bool OutputMetadataLooksLikeUltralyticsMaskProto(InferenceSession session)
    {
        foreach (var meta in session.OutputMetadata.Values)
        {
            var d = meta.Dimensions;
            if (d is null || d.Length != 4)
                continue;
            if (!TryGetProtoNmAndSize(d[0], d[1], d[2], d[3], out _, out _, out _))
                continue;
            return true;
        }

        return false;
    }

    /// <summary>Ultralytics ONNX uses the input name "images" when present; otherwise the first 4D image input.</summary>
    private static string ResolveImageInputName(InferenceSession session)
    {
        foreach (var name in session.InputMetadata.Keys)
        {
            if (string.Equals(name, "images", StringComparison.OrdinalIgnoreCase))
                return name;
        }

        foreach (var kv in session.InputMetadata)
        {
            var shape = kv.Value.Dimensions;
            if (shape is { Length: >= 4 })
                return kv.Key;
        }

        return session.InputMetadata.Keys.First();
    }

    /// <summary>
    /// True when dimensions look like Ultralytics mask prototypes [1, nm, H, W] (nm much smaller than H,W).
    /// </summary>
    private static bool TryGetProtoNmAndSize(int d0, int d1, int d2, int d3, out int nm, out int mh, out int mw)
    {
        nm = mh = mw = 0;
        if (d0 != 1 && d0 != -1)
            return false;
        if (d1 is < 4 or > 128 || d2 < 8 || d3 < 8 || d2 > 4096 || d3 > 4096)
            return false;
        // NCHW: mask coefficient count must be smaller than spatial axes (rejects [1,H,W,C] mis-order).
        if (d1 >= d2 || d1 >= d3)
            return false;
        nm = d1;
        mh = d2;
        mw = d3;
        return true;
    }

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
            var pred = PickPredTensor(results, nm);
            if (pred == null)
                throw new InvalidOperationException(
                    "Ultralytics 세그 형식의 3차원 예측 텐서를 찾지 못했습니다. " +
                    $"마스크 프로토 채널 수(nm)={nm}, UI 클래스 이름 {nc}개. " +
                    "data.yaml의 names 개수와 클래스란(쉼표 구분) 개수를 모델과 맞추세요. " +
                    $"출력: {FormatOutputShapes(results)}");

            return PostprocessSegmentation(original, lb, pred, proto, nm, confThreshold, allowedClassIds);
        }

        var detPred = PickPredTensor(results, 0) ?? PickDetectionTensorLegacy(results)
                      ?? throw new InvalidOperationException(
                          "3차원 검출 출력 텐서를 찾을 수 없습니다. ONNX가 Ultralytics 검출/세그 형식인지 확인하세요. " +
                          $"출력: {FormatOutputShapes(results)}");

        return PostprocessDetectionOnly(original, lb, detPred, confThreshold, allowedClassIds);
    }

    private static DenseTensor<float>? PickProtoTensor(IReadOnlyCollection<NamedOnnxValue> results)
    {
        DenseTensor<float>? best = null;
        var bestArea = -1L;
        foreach (var r in results)
        {
            if (r.AsTensor<float>() is not DenseTensor<float> t)
                continue;
            var td = t.Dimensions;
            if (td.Length != 4)
                continue;
            if (!TryGetProtoNmAndSize(td[0], td[1], td[2], td[3], out _, out var h, out var w))
                continue;
            var area = (long)h * w;
            if (area > bestArea)
            {
                bestArea = area;
                best = t;
            }
        }

        return best;
    }

    /// <summary>
    /// Finds the main YOLO predictions tensor. Channel width must be 4 + nc_model + nmExtra (Ultralytics).
    /// nc_model is taken from the tensor shape. Class scores are argmax'd over all nc_model channels so a
    /// COCO ONNX still works when the UI lists only a short name list (extra indices show as class_N).
    /// </summary>
    private static Tensor<float>? PickPredTensor(IReadOnlyCollection<NamedOnnxValue> results, int nmExtra)
    {
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
            var n = channelsLast ? d1 : d2;
            if (n < 1 || width < 4)
                continue;

            if (nmExtra > 0)
            {
                var ncModel = width - 4 - nmExtra;
                if (ncModel < 1)
                    continue;
            }
            else if (width != 6 && width < 5)
            {
                continue;
            }

            var score = (long)n * width;
            if (score > bestScore)
            {
                bestScore = score;
                best = t;
            }
        }

        return best;
    }

    private static string FormatOutputShapes(IReadOnlyCollection<NamedOnnxValue> results)
    {
        var parts = new List<string>();
        foreach (var r in results)
        {
            var t = r.AsTensor<float>();
            if (t == null)
            {
                parts.Add($"{r.Name}:<non-float>");
                continue;
            }

            parts.Add($"{r.Name}:[{string.Join(",", t.Dimensions.ToArray())}]");
        }

        return parts.Count == 0 ? "(없음)" : string.Join("; ", parts);
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
            ? CollectEndToEnd(n, P, confThreshold, allowedClassIds, _netSize)
            : CollectClassChannels(
                n,
                width,
                P,
                confThreshold,
                allowedClassIds,
                nm: 0,
                _netSize,
                _classNames.Count,
                out _);

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

        var raw = width == 6 + nm
            ? CollectEndToEndWithMask(n, P, confThreshold, allowedClassIds, nm, _netSize)
            : CollectClassChannels(
                n,
                width,
                P,
                confThreshold,
                allowedClassIds,
                nm,
                _netSize,
                _classNames.Count,
                out _);
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
                        HasMask = c.MaskCoeffs is { Length: > 0 },
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
                    HasMask = false,
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
        if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0)
            return new float[Math.Max(0, dw * dh)];

        var dst = new float[dw * dh];
        for (var y = 0; y < dh; y++)
        {
            var sy = ((y + 0.5f) / dh) * sh - 0.5f;
            var y0 = (int)Math.Floor(sy);
            var y1 = y0 + 1;
            var fy = sy - y0;
            if (y0 < 0)
            {
                y0 = 0;
                y1 = 0;
                fy = 0f;
            }
            else if (y1 >= sh)
            {
                y1 = sh - 1;
                y0 = sh - 1;
                fy = 0f;
            }

            for (var x = 0; x < dw; x++)
            {
                var sx = ((x + 0.5f) / dw) * sw - 0.5f;
                var x0 = (int)Math.Floor(sx);
                var x1 = x0 + 1;
                var fx = sx - x0;
                if (x0 < 0)
                {
                    x0 = 0;
                    x1 = 0;
                    fx = 0f;
                }
                else if (x1 >= sw)
                {
                    x1 = sw - 1;
                    x0 = sw - 1;
                    fx = 0f;
                }

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
            if (cid < 0 || cid > 65_000)
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

    private static List<DetCandidate> CollectEndToEndWithMask(
        int n,
        Func<int, int, float> P,
        float confThreshold,
        IReadOnlySet<int>? allowedClassIds,
        int nm,
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
            if (cid < 0 || cid > 65_000)
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

            float[]? coeffs = null;
            if (nm > 0)
            {
                coeffs = new float[nm];
                for (var k = 0; k < nm; k++)
                    coeffs[k] = P(i, 6 + k);
            }

            list.Add(new DetCandidate
            {
                X1Lb = x1,
                Y1Lb = y1,
                X2Lb = x2,
                Y2Lb = y2,
                ClassId = cid,
                Confidence = conf,
                MaskCoeffs = coeffs,
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
        int nm,
        int netSize,
        int preferredClassCount,
        out int nmOut)
    {
        nmOut = nm;
        var channelsAfterBox = width - 4 - nm;
        if (channelsAfterBox <= 0)
            return new List<DetCandidate>();

        // Ultralytics variants can be either:
        // - [cx,cy,w,h, cls... , mask...]
        // - [cx,cy,w,h,obj, cls... , mask...]
        // Prefer explicit UI class count when shape matches it (or +1 objectness).
        var hasObjectness = false;
        int nc;
        if (preferredClassCount > 0 && channelsAfterBox == preferredClassCount + 1)
        {
            hasObjectness = true;
            nc = preferredClassCount;
        }
        else if (preferredClassCount > 0 && channelsAfterBox == preferredClassCount)
        {
            nc = preferredClassCount;
        }
        else
        {
            // Fallback for generic models with unknown class count.
            nc = channelsAfterBox;
        }

        if (nc <= 0)
            return new List<DetCandidate>();

        var classBase = hasObjectness ? 5 : 4;
        var list = new List<DetCandidate>();
        for (var i = 0; i < n; i++)
        {
            var cx = P(i, 0);
            var cy = P(i, 1);
            var bw = P(i, 2);
            var bh = P(i, 3);
            UltralyticsCxcywhToXyxy(cx, cy, bw, bh, out var x1, out var y1, out var x2, out var y2);
            MaybeScaleNormalizedLetterboxBox(netSize, ref x1, ref y1, ref x2, ref y2);

            var bestC = -1;
            var bestS = 0f;
            var obj = hasObjectness ? ScoreValue(P(i, 4)) : 1f;
            for (var c = 0; c < nc; c++)
            {
                var s = obj * ScoreValue(P(i, classBase + c));
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
                    coeffs[k] = P(i, classBase + nc + k);
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

    /// <summary>Some ONNX exports use cx,cy,w,h in 0–1 on the letterboxed square instead of pixels.</summary>
    private static void MaybeScaleNormalizedLetterboxBox(int netSize, ref float x1, ref float y1, ref float x2, ref float y2)
    {
        if (netSize <= 0)
            return;
        if (x2 > 1.5f || y2 > 1.5f)
            return;
        if (x1 < 0f || y1 < 0f)
            return;
        x1 *= netSize;
        y1 *= netSize;
        x2 *= netSize;
        y2 *= netSize;
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
