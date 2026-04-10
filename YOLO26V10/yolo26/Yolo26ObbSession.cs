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
    internal sealed class ObbCandidate
    {
        public float CxLb { get; set; }
        public float CyLb { get; set; }
        public float WLb { get; set; }
        public float HLb { get; set; }
        public float ThetaRad { get; set; }
        public int ClassId { get; set; }
        public float Confidence { get; set; }
    }

    internal sealed class Yolo26ObbSession : IDisposable
    {
        private readonly InferenceSession _session;
        private readonly string _inputName;
        private readonly int _netSize;

        public string ExecutionProviderSummary { get; }

        /// <summary>?대옒????(泥?異붾줎 ??異쒕젰 梨꾨꼸?먯꽌 媛깆떊).</summary>
        public int NumClasses { get; private set; } = ObbLabels.DefaultClassCount;

        public Yolo26ObbSession(string onnxPath, int cudaDeviceId = 0)
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

        public (Bitmap Rendered, List<SegInstance> Instances) RunObb(
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
                var inputs = new List<NamedOnnxValue> { NamedOnnxValue.CreateFromTensor(_inputName, inputTensor) };

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
                        "??ONNX???멸렇硫섑뀒?댁뀡 異쒕젰(4李⑥썝)???ы븿?⑸땲?? ?묒뾽??OBB媛 ?꾨땶 ??ぉ?쇰줈 ?좏깮?섏꽭??");
            }

            var pred = PickObbTensor(results);
            if (pred == null)
                throw new InvalidOperationException(
                    "ONNX 異쒕젰?먯꽌 OBB???먯꽌(3李⑥썝)瑜?李얠? 紐삵뻽?듬땲?? yolo26*-obb ONNX?몄? ?뺤씤?섏꽭??");

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
                throw new InvalidOperationException("OBB 異쒕젰 梨꾨꼸 ?섍? ?덈Т ?묒뒿?덈떎(理쒖냼 6: xywhr+?먯닔).");

            NumClasses = width - 5;
            if (NumClasses < 1)
                throw new InvalidOperationException("OBB ?대옒??梨꾨꼸???놁뒿?덈떎.");

            float P(int det, int ch) => channelsLast ? pred[0, det, ch] : pred[0, ch, det];

            List<ObbCandidate> raw;
            if (width == 6)
                raw = CollectSingleClass(n, P, confThreshold, allowedClassIds);
            else
                raw = CollectMultiClass(n, width, P, confThreshold, allowedClassIds);

            var kept = NmsObb(raw, iouThreshold: 0.45f, maxDetections: 300);

            var rendered = new Bitmap(original.Width, original.Height, PixelFormat.Format32bppArgb);
            var instances = new List<SegInstance>();
            using (var g = Graphics.FromImage(rendered))
            {
                g.DrawImage(original, 0, 0, original.Width, original.Height);
                g.SmoothingMode = SmoothingMode.AntiAlias;

                for (var i = 0; i < kept.Count; i++)
                {
                    var c = kept[i];
                    var polyOrig = MapCornersToOriginal(c, lb);
                    var xs = polyOrig.Select(p => p.X).ToArray();
                    var ys = polyOrig.Select(p => p.Y).ToArray();
                    var rect = RectangleF.FromLTRB(
                        xs.Min(),
                        ys.Min(),
                        xs.Max(),
                        ys.Max());

                    instances.Add(new SegInstance
                    {
                        BoxOrig = rect,
                        ClassId = c.ClassId,
                        Confidence = c.Confidence,
                    });

                    var hue = (c.ClassId * 37) % 360;
                    var stroke = ColorFromHsv(hue, 0.65f, 0.95f);
                    using (var pen = new Pen(Color.FromArgb(220, stroke), 8f))
                        g.DrawPolygon(pen, polyOrig);

                    var name = ObbLabels.GetLabel(c.ClassId, NumClasses);
                    var label = $"{name} {c.Confidence:0.00}";
                    using (var font = new Font(FontFamily.GenericSansSerif, Math.Max(24f, Math.Min(36f, original.Width / 48f)), FontStyle.Bold))
                    using (var brush = new SolidBrush(Color.FromArgb(240, Color.White)))
                    using (var bbg = new SolidBrush(Color.FromArgb(180, Color.Black)))
                    {
                        var sz = g.MeasureString(label, font);
                        var lx = rect.X;
                        var ly = Math.Max(0, rect.Y - sz.Height - 2);
                        g.FillRectangle(bbg, lx, ly, sz.Width + 10, sz.Height + 6);
                        g.DrawString(label, font, brush, lx + 5, ly + 3);
                    }
                }
            }

            return (rendered, instances);
        }

        private static PointF[] MapCornersToOriginal(ObbCandidate c, LetterboxInfo lb)
        {
            var corners = CornersLetterbox(c.CxLb, c.CyLb, c.WLb, c.HLb, c.ThetaRad);
            var mapped = new PointF[4];
            for (var i = 0; i < 4; i++)
            {
                mapped[i] = new PointF(
                    (corners[i].X - lb.PadLeft) / lb.Gain,
                    (corners[i].Y - lb.PadTop) / lb.Gain);
            }

            return mapped;
        }

        /// <summary>Ultralytics xywhr: 以묒떖, ??룸넂?? ?쇰뵒???뚯쟾(??異?湲곗?).</summary>
        private static PointF[] CornersLetterbox(float cx, float cy, float w, float h, float theta)
        {
            var hw = w * 0.5f;
            var hh = h * 0.5f;
            var cs = (float)Math.Cos(theta);
            var sn = (float)Math.Sin(theta);
            var wx = cs * hw;
            var wy = sn * hw;
            var hx = -sn * hh;
            var hy = cs * hh;
            return new[]
            {
                new PointF(cx - wx - hx, cy - wy - hy),
                new PointF(cx + wx - hx, cy + wy - hy),
                new PointF(cx + wx + hx, cy + wy + hy),
                new PointF(cx - wx + hx, cy - wy + hy),
            };
        }

        private static Tensor<float> PickObbTensor(IReadOnlyCollection<NamedOnnxValue> results)
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
                var wch = Math.Min(a, b);
                if (wch < 6)
                    continue;
                var score = (long)Math.Max(a, b) * wch;
                if (score > bestScore)
                {
                    bestScore = score;
                    best = t;
                }
            }

            return best;
        }

        private List<ObbCandidate> CollectSingleClass(
            int n,
            Func<int, int, float> P,
            float confThreshold,
            HashSet<int> allowedClassIds)
        {
            var list = new List<ObbCandidate>();
            for (var i = 0; i < n; i++)
            {
                var cx = P(i, 0);
                var cy = P(i, 1);
                var w = P(i, 2);
                var h = P(i, 3);
                var r = P(i, 4);
                var conf = P(i, 5);
                if (float.IsNaN(conf) || conf < confThreshold)
                    continue;
                if (allowedClassIds != null && !allowedClassIds.Contains(0))
                    continue;

                NormalizeBox(ref cx, ref cy, ref w, ref h, ref r);
                list.Add(new ObbCandidate
                {
                    CxLb = cx,
                    CyLb = cy,
                    WLb = w,
                    HLb = h,
                    ThetaRad = r,
                    ClassId = 0,
                    Confidence = conf,
                });
            }

            return list;
        }

        private List<ObbCandidate> CollectMultiClass(
            int n,
            int width,
            Func<int, int, float> P,
            float confThreshold,
            HashSet<int> allowedClassIds)
        {
            var nc = width - 5;
            var list = new List<ObbCandidate>();
            for (var i = 0; i < n; i++)
            {
                var cx = P(i, 0);
                var cy = P(i, 1);
                var w = P(i, 2);
                var h = P(i, 3);
                var r = P(i, 4);

                var bestC = -1;
                var bestS = 0f;
                for (var c = 0; c < nc; c++)
                {
                    var s = ScoreValue(P(i, 5 + c));
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

                NormalizeBox(ref cx, ref cy, ref w, ref h, ref r);
                list.Add(new ObbCandidate
                {
                    CxLb = cx,
                    CyLb = cy,
                    WLb = w,
                    HLb = h,
                    ThetaRad = r,
                    ClassId = bestC,
                    Confidence = bestS,
                });
            }

            return list;
        }

        private void NormalizeBox(ref float cx, ref float cy, ref float w, ref float h, ref float r)
        {
            if (cx <= 1.5f && cy <= 1.5f && w <= 1.5f && h <= 1.5f)
            {
                cx *= _netSize;
                cy *= _netSize;
                w *= _netSize;
                h *= _netSize;
            }

            if (w < 0)
                w = -w;
            if (h < 0)
                h = -h;
            if (Math.Abs(r) > (float)(Math.PI * 2) + 0.01f && Math.Abs(r) < 400f)
                r = r * (float)(Math.PI / 180.0);
        }

        private static float ScoreValue(float raw)
        {
            if (raw >= 0f && raw <= 1f)
                return raw;
            return 1f / (1f + (float)Math.Exp(-raw));
        }

        private static List<ObbCandidate> NmsObb(List<ObbCandidate> boxes, float iouThreshold, int maxDetections)
        {
            if (boxes.Count == 0)
                return boxes;

            var ordered = boxes.OrderByDescending(b => b.Confidence).ToList();
            var selected = new List<ObbCandidate>();
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
                    if (AabbIou(ordered[i], ordered[j]) >= iouThreshold)
                        suppressed[j] = true;
                }
            }

            return selected;
        }

        private static void Aabb(ObbCandidate c, out float x1, out float y1, out float x2, out float y2)
        {
            var p = CornersLetterbox(c.CxLb, c.CyLb, c.WLb, c.HLb, c.ThetaRad);
            x1 = p.Min(t => t.X);
            y1 = p.Min(t => t.Y);
            x2 = p.Max(t => t.X);
            y2 = p.Max(t => t.Y);
        }

        private static float AabbIou(ObbCandidate a, ObbCandidate b)
        {
            Aabb(a, out var ax1, out var ay1, out var ax2, out var ay2);
            Aabb(b, out var bx1, out var by1, out var bx2, out var by2);
            var ix1 = Math.Max(ax1, bx1);
            var iy1 = Math.Max(ay1, by1);
            var ix2 = Math.Min(ax2, bx2);
            var iy2 = Math.Min(ay2, by2);
            var iw = Math.Max(0f, ix2 - ix1);
            var ih = Math.Max(0f, iy2 - iy1);
            var inter = iw * ih;
            var areaA = Math.Max(0f, ax2 - ax1) * Math.Max(0f, ay2 - ay1);
            var areaB = Math.Max(0f, bx2 - bx1) * Math.Max(0f, by2 - by1);
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



