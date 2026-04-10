using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Linq;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;

namespace YOLO26V10.yolo26
{
    internal sealed class DetCandidate
    {
        public float X1Lb { get; set; }
        public float Y1Lb { get; set; }
        public float X2Lb { get; set; }
        public float Y2Lb { get; set; }
        public int ClassId { get; set; }
        public float Confidence { get; set; }
    }

    internal sealed class Yolo26DetectionSession : IDisposable
    {
        private readonly InferenceSession _session;
        private readonly string _inputName;
        private readonly int _netSize;

        public string ExecutionProviderSummary { get; }

        public Yolo26DetectionSession(string onnxPath, int cudaDeviceId = 0)
        {
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

        public (Bitmap Rendered, List<SegInstance> Instances) RunDetection(
            Bitmap source,
            float confThreshold,
            HashSet<int> allowedClassIds)
        {
            if (source == null)
                throw new ArgumentNullException(nameof(source));

            using (var src = new Bitmap(source))
            {
                var lb = LetterboxInfo.FromBitmap(src, _netSize);
                var chw = LetterboxInfo.ToChwTensor(src, lb);
                var inputTensor = new DenseTensor<float>(chw, new[] { 1, 3, _netSize, _netSize });
                var inputs = new List<NamedOnnxValue>
                {
                    NamedOnnxValue.CreateFromTensor(_inputName, inputTensor),
                };

                using (var results = _session.Run(inputs))
                    return Postprocess(src, lb, results, confThreshold, allowedClassIds);
            }
        }

        private (Bitmap, List<SegInstance>) Postprocess(
            Bitmap original,
            LetterboxInfo lb,
            IReadOnlyCollection<NamedOnnxValue> results,
            float confThreshold,
            HashSet<int> allowedClassIds)
        {
            foreach (var r in results)
            {
                var t = r.AsTensor<float>();
                if (t != null && t.Dimensions.Length == 4)
                    throw new InvalidOperationException(
                        "이 ONNX는 세그멘테이션 출력(4차원 프로토)을 포함합니다. 상단에서 작업을 '세그멘테이션'으로 선택하세요.");
            }

            Tensor<float> pred = PickDetectionTensor(results);
            if (pred == null)
                throw new InvalidOperationException(
                    "ONNX 출력에서 객체 검출용 텐서(차원 3)를 찾지 못했습니다. 검출용 .onnx인지 확인하세요.");

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

            if (width < 6)
                throw new InvalidOperationException("검출 출력 채널 수가 너무 작습니다.");

            float P(int det, int ch) => channelsLast ? pred[0, det, ch] : pred[0, ch, det];

            List<DetCandidate> raw;
            if (width == 6)
                raw = CollectEndToEnd(n, P, confThreshold, allowedClassIds);
            else
                raw = CollectClassChannels(n, width, P, confThreshold, allowedClassIds);

            var kept = Nms(raw, iouThreshold: 0.45f, maxDetections: 300);

            var rendered = new Bitmap(original.Width, original.Height, PixelFormat.Format32bppArgb);
            var instances = new List<SegInstance>();
            using (var g = Graphics.FromImage(rendered))
            {
                g.DrawImage(original, 0, 0, original.Width, original.Height);
                g.SmoothingMode = SmoothingMode.AntiAlias;

                for (var i = 0; i < kept.Count; i++)
                {
                    var c = kept[i];
                    var ox1 = (c.X1Lb - lb.PadLeft) / lb.Gain;
                    var oy1 = (c.Y1Lb - lb.PadTop) / lb.Gain;
                    var ox2 = (c.X2Lb - lb.PadLeft) / lb.Gain;
                    var oy2 = (c.Y2Lb - lb.PadTop) / lb.Gain;
                    var rect = RectangleF.FromLTRB(
                        Math.Min(ox1, ox2),
                        Math.Min(oy1, oy2),
                        Math.Max(ox1, ox2),
                        Math.Max(oy1, oy2));

                    instances.Add(new SegInstance
                    {
                        BoxOrig = rect,
                        ClassId = c.ClassId,
                        Confidence = c.Confidence,
                    });

                    var hue = (c.ClassId * 37 + i * 11) % 360;
                    var stroke = ColorFromHsv(hue, 0.65f, 0.95f);
                    using (var pen = new Pen(Color.FromArgb(220, stroke), 2f))
                        g.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);

                    var label = $"{Coco80.Names[c.ClassId]} {c.Confidence:0.00}";
                    using (var font = new Font(FontFamily.GenericSansSerif, 10f, FontStyle.Bold))
                    using (var brush = new SolidBrush(Color.FromArgb(240, Color.White)))
                    using (var bbg = new SolidBrush(Color.FromArgb(180, Color.Black)))
                    {
                        var sz = g.MeasureString(label, font);
                        var lx = rect.X;
                        var ly = Math.Max(0, rect.Y - sz.Height - 2);
                        g.FillRectangle(bbg, lx, ly, sz.Width + 4, sz.Height + 2);
                        g.DrawString(label, font, brush, lx + 2, ly + 1);
                    }
                }
            }

            return (rendered, instances);
        }

        private static Tensor<float> PickDetectionTensor(IReadOnlyCollection<NamedOnnxValue> results)
        {
            Tensor<float> best = null;
            var bestScore = -1L;
            foreach (var r in results)
            {
                var t = r.AsTensor<float>();
                if (t == null || t.Dimensions.Length != 3)
                    continue;
                var a = (int)t.Dimensions[1];
                var b = (int)t.Dimensions[2];
                var n = Math.Max(a, b);
                var w = Math.Min(a, b);
                if (w < 6)
                    continue;
                var score = (long)n * w;
                if (score > bestScore)
                {
                    bestScore = score;
                    best = t;
                }
            }

            return best;
        }

        private List<DetCandidate> CollectEndToEnd(
            int n,
            Func<int, int, float> P,
            float confThreshold,
            HashSet<int> allowedClassIds)
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
                if (cid < 0 || cid >= Coco80.Names.Length)
                    continue;
                if (allowedClassIds != null && !allowedClassIds.Contains(cid))
                    continue;

                if (x1 <= 1.5f && y1 >= 0f && x2 <= 1.5f && y2 <= 1.5f && x2 > x1)
                {
                    x1 *= _netSize;
                    x2 *= _netSize;
                    y1 *= _netSize;
                    y2 *= _netSize;
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

        private List<DetCandidate> CollectClassChannels(
            int n,
            int width,
            Func<int, int, float> P,
            float confThreshold,
            HashSet<int> allowedClassIds)
        {
            var nc = width - 4;
            if (nc <= 0)
                return new List<DetCandidate>();

            var ncCap = Math.Min(nc, Coco80.Names.Length);
            var list = new List<DetCandidate>();
            for (var i = 0; i < n; i++)
            {
                var x1 = P(i, 0);
                var y1 = P(i, 1);
                var x2 = P(i, 2);
                var y2 = P(i, 3);

                var bestC = -1;
                var bestS = 0f;
                for (var c = 0; c < ncCap; c++)
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

                list.Add(new DetCandidate
                {
                    X1Lb = x1,
                    Y1Lb = y1,
                    X2Lb = x2,
                    Y2Lb = y2,
                    ClassId = bestC,
                    Confidence = bestS,
                });
            }

            return list;
        }

        private static float ScoreValue(float raw)
        {
            if (raw >= 0f && raw <= 1f)
                return raw;
            return 1f / (1f + (float)Math.Exp(-raw));
        }

        private static List<DetCandidate> Nms(List<DetCandidate> boxes, float iouThreshold, int maxDetections)
        {
            if (boxes.Count == 0)
                return boxes;

            var ordered = boxes
                .OrderByDescending(b => b.Confidence)
                .ToList();
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

            return Color.FromArgb(
                (int)(r * 255),
                (int)(g * 255),
                (int)(b * 255));
        }
    }
}
