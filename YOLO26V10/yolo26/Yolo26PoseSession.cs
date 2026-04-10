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
    internal sealed class PoseCandidate
    {
        public float X1Lb { get; set; }
        public float Y1Lb { get; set; }
        public float X2Lb { get; set; }
        public float Y2Lb { get; set; }
        public int ClassId { get; set; }
        public float Confidence { get; set; }
        public int NumKeypoints { get; set; }
        public int KptDim { get; set; }
        public float[] Kpts { get; set; }
    }

    internal sealed class Yolo26PoseSession : IDisposable
    {
        private static readonly (int A, int B)[] CocoSkeleton =
        {
            (15, 13), (13, 11), (16, 14), (14, 12), (11, 12), (5, 11), (6, 12), (5, 6), (5, 7), (6, 8),
            (7, 9), (8, 10), (1, 2), (0, 1), (0, 2), (1, 3), (2, 4), (3, 5), (4, 6),
        };

        private readonly InferenceSession _session;
        private readonly string _inputName;
        private readonly int _netSize;

        public string ExecutionProviderSummary { get; }

        public Yolo26PoseSession(string onnxPath, int cudaDeviceId = 0)
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

        public (Bitmap Rendered, List<SegInstance> Instances) RunPose(
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
                        "??ONNX???멸렇硫섑뀒?댁뀡 異쒕젰(4李⑥썝 ?꾨줈?????ы븿?⑸땲?? ?멸렇硫섑뀒?댁뀡 ?묒뾽???좏깮?섏꽭??");
            }

            if (!TryPickPoseTensor(results, out var pred, out var layout))
                throw new InvalidOperationException(
                    "?ъ쫰 異쒕젰 ?먯꽌瑜??댁꽍?????놁뒿?덈떎. yolo26*-pose ONNX?몄? ?뺤씤?섏꽭??");

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

            var raw = new List<PoseCandidate>();
            for (var i = 0; i < n; i++)
            {
                if (layout.EndToEnd)
                    TryAddEndToEnd(i, P, layout, confThreshold, allowedClassIds, raw);
                else
                    TryAddRaw(i, P, layout, confThreshold, allowedClassIds, raw);
            }

            var kept = NmsPose(raw, iouThreshold: 0.45f, maxDetections: 50);
            var instances = new List<SegInstance>();
            foreach (var c in kept)
            {
                var ox1 = (c.X1Lb - lb.PadLeft) / lb.Gain;
                var oy1 = (c.Y1Lb - lb.PadTop) / lb.Gain;
                var ox2 = (c.X2Lb - lb.PadLeft) / lb.Gain;
                var oy2 = (c.Y2Lb - lb.PadTop) / lb.Gain;
                instances.Add(new SegInstance
                {
                    BoxOrig = RectangleF.FromLTRB(
                        Math.Min(ox1, ox2),
                        Math.Min(oy1, oy2),
                        Math.Max(ox1, ox2),
                        Math.Max(oy1, oy2)),
                    ClassId = c.ClassId,
                    Confidence = c.Confidence,
                });
            }

            var rendered = new Bitmap(original.Width, original.Height, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(rendered))
            {
                g.DrawImage(original, 0, 0, original.Width, original.Height);
                g.SmoothingMode = SmoothingMode.AntiAlias;
                for (var p = 0; p < kept.Count; p++)
                {
                    var c = kept[p];
                    var hue = (c.ClassId * 37) % 360;
                    var stroke = ColorFromHsv(hue, 0.65f, 0.95f);
                    using (var pen = new Pen(Color.FromArgb(220, stroke), 8f))
                    {
                        var ox1 = (c.X1Lb - lb.PadLeft) / lb.Gain;
                        var oy1 = (c.Y1Lb - lb.PadTop) / lb.Gain;
                        var ox2 = (c.X2Lb - lb.PadLeft) / lb.Gain;
                        var oy2 = (c.Y2Lb - lb.PadTop) / lb.Gain;
                        g.DrawRectangle(pen, ox1, oy1, Math.Max(1f, ox2 - ox1), Math.Max(1f, oy2 - oy1));
                    }

                    var ptsOrig = MapKeypointsToOrig(c, lb);
                    DrawSkeleton(g, ptsOrig, c.Kpts, c.NumKeypoints, c.KptDim, stroke);

                    var label = c.ClassId >= 0 && c.ClassId < Coco80.Names.Length
                        ? $"{Coco80.Names[c.ClassId]} {c.Confidence:0.00}"
                        : $"cls{c.ClassId} {c.Confidence:0.00}";
                    using (var font = new Font(FontFamily.GenericSansSerif, Math.Max(24f, Math.Min(36f, original.Width / 48f)), FontStyle.Bold))
                    using (var brush = new SolidBrush(Color.FromArgb(240, Color.White)))
                    using (var bbg = new SolidBrush(Color.FromArgb(180, Color.Black)))
                    {
                        var ox1 = (c.X1Lb - lb.PadLeft) / lb.Gain;
                        var oy1 = (c.Y1Lb - lb.PadTop) / lb.Gain;
                        var sz = g.MeasureString(label, font);
                        var lx = ox1;
                        var ly = Math.Max(0, oy1 - sz.Height - 2);
                        g.FillRectangle(bbg, lx, ly, sz.Width + 10, sz.Height + 6);
                        g.DrawString(label, font, brush, lx + 5, ly + 3);
                    }
                }
            }

            return (rendered, instances);
        }

        private readonly struct PoseLayout
        {
            public PoseLayout(int nc, int nk, int kptDim, bool endToEnd)
            {
                Nc = nc;
                Nk = nk;
                KptDim = kptDim;
                EndToEnd = endToEnd;
            }

            public int Nc { get; }
            public int Nk { get; }
            public int KptDim { get; }
            public bool EndToEnd { get; }
        }

        private static bool TryPickPoseTensor(
            IReadOnlyCollection<NamedOnnxValue> results,
            out Tensor<float> pred,
            out PoseLayout layout)
        {
            pred = null;
            layout = default;
            Tensor<float> best = null;
            var bestRank = -1;
            long bestN = -1;

            foreach (var r in results)
            {
                var t = r.AsTensor<float>();
                if (t == null || t.Dimensions.Length != 3)
                    continue;
                var a = (int)t.Dimensions[1];
                var b = (int)t.Dimensions[2];
                var w = Math.Min(a, b);
                var num = Math.Max(a, b);
                if (!TryInferPoseLayout(w, out var lay))
                    continue;
                var rank = lay.Nk * 100 + lay.Nc;
                if (rank > bestRank || (rank == bestRank && num > bestN))
                {
                    bestRank = rank;
                    bestN = num;
                    best = t;
                    layout = lay;
                }
            }

            if (best == null)
                return false;
            pred = best;
            return true;
        }

        private static bool TryInferPoseLayout(int width, out PoseLayout layout)
        {
            layout = default;
            if (width < 21)
                return false;

            // 84 = 4 + 80 ?대옒??寃異?梨꾨꼸 ???ъ쫰濡??ㅼ씤?섏? ?딆쓬
            if (width == 84)
                return false;

            var restE2e = width - 6;
            if (restE2e >= 15 && restE2e % 3 == 0)
            {
                var nk = restE2e / 3;
                if (nk >= 5 && nk <= 32)
                {
                    layout = new PoseLayout(1, nk, 3, true);
                    return true;
                }
            }

            PoseLayout? best = null;
            var bestScore = -1;
            for (var kptDim = 3; kptDim >= 2; kptDim--)
            {
                for (var nk = 17; nk >= 5; nk--)
                {
                    var nc = width - 4 - nk * kptDim;
                    if (nc < 1 || nc > 80)
                        continue;
                    var score = nk * 1000 + (nc == 1 ? 500 : 0) + (kptDim == 3 ? 100 : 0);
                    if (score > bestScore)
                    {
                        bestScore = score;
                        best = new PoseLayout(nc, nk, kptDim, false);
                    }
                }
            }

            if (best.HasValue)
            {
                layout = best.Value;
                return true;
            }

            return false;
        }

        private void TryAddRaw(
            int i,
            Func<int, int, float> P,
            PoseLayout layout,
            float confThreshold,
            HashSet<int> allowedClassIds,
            List<PoseCandidate> list)
        {
            var cx = P(i, 0);
            var cy = P(i, 1);
            var bw = P(i, 2);
            var bh = P(i, 3);
            var bestC = -1;
            var bestS = 0f;
            for (var c = 0; c < layout.Nc; c++)
            {
                var s = ScoreValue(P(i, 4 + c));
                if (s > bestS)
                {
                    bestS = s;
                    bestC = c;
                }
            }

            if (bestC < 0 || bestS < confThreshold || float.IsNaN(bestS))
                return;
            if (allowedClassIds != null && !allowedClassIds.Contains(bestC))
                return;

            var halfW = bw * 0.5f;
            var halfH = bh * 0.5f;
            var x1 = cx - halfW;
            var y1 = cy - halfH;
            var x2 = cx + halfW;
            var y2 = cy + halfH;

            var kptCount = layout.Nk * layout.KptDim;
            var kpts = new float[kptCount];
            var baseCh = 4 + layout.Nc;
            for (var k = 0; k < kptCount; k++)
                kpts[k] = P(i, baseCh + k);

            list.Add(new PoseCandidate
            {
                X1Lb = x1,
                Y1Lb = y1,
                X2Lb = x2,
                Y2Lb = y2,
                ClassId = bestC,
                Confidence = bestS,
                NumKeypoints = layout.Nk,
                KptDim = layout.KptDim,
                Kpts = kpts,
            });
        }

        private void TryAddEndToEnd(
            int i,
            Func<int, int, float> P,
            PoseLayout layout,
            float confThreshold,
            HashSet<int> allowedClassIds,
            List<PoseCandidate> list)
        {
            var x1 = P(i, 0);
            var y1 = P(i, 1);
            var x2 = P(i, 2);
            var y2 = P(i, 3);
            var conf = P(i, 4);
            var cid = (int)Math.Round(P(i, 5));
            if (float.IsNaN(conf) || conf < confThreshold)
                return;
            if (cid < 0 || cid >= Coco80.Names.Length)
                return;
            if (allowedClassIds != null && !allowedClassIds.Contains(cid))
                return;

            if (x1 <= 1.5f && x2 <= 1.5f && y1 <= 1.5f && y2 <= 1.5f && x2 > x1)
            {
                x1 *= _netSize;
                x2 *= _netSize;
                y1 *= _netSize;
                y2 *= _netSize;
            }

            var kptCount = layout.Nk * layout.KptDim;
            var kpts = new float[kptCount];
            for (var k = 0; k < kptCount; k++)
                kpts[k] = P(i, 6 + k);

            list.Add(new PoseCandidate
            {
                X1Lb = x1,
                Y1Lb = y1,
                X2Lb = x2,
                Y2Lb = y2,
                ClassId = cid,
                Confidence = conf,
                NumKeypoints = layout.Nk,
                KptDim = layout.KptDim,
                Kpts = kpts,
            });
        }

        private static float ScoreValue(float raw)
        {
            if (raw >= 0f && raw <= 1f)
                return raw;
            return 1f / (1f + (float)Math.Exp(-raw));
        }

        private static List<PoseCandidate> NmsPose(List<PoseCandidate> boxes, float iouThreshold, int maxDetections)
        {
            if (boxes.Count == 0)
                return boxes;
            var ordered = boxes.OrderByDescending(b => b.Confidence).ToList();
            var selected = new List<PoseCandidate>();
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

        private static float IoU(PoseCandidate a, PoseCandidate b)
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

        private static PointF[] MapKeypointsToOrig(PoseCandidate c, LetterboxInfo lb)
        {
            var pts = new PointF[c.NumKeypoints];
            for (var k = 0; k < c.NumKeypoints; k++)
            {
                var o = k * c.KptDim;
                var x = c.Kpts[o];
                var y = c.Kpts[o + 1];
                pts[k] = new PointF(
                    (x - lb.PadLeft) / lb.Gain,
                    (y - lb.PadTop) / lb.Gain);
            }

            return pts;
        }

        private static void DrawSkeleton(Graphics g, PointF[] pts, float[] kpts, int nk, int kptDim, Color stroke)
        {
            var visTh = 0.25f;
            bool Vis(int idx)
            {
                if (idx < 0 || idx >= nk)
                    return false;
                if (kptDim < 3)
                    return true;
                return kpts[idx * kptDim + 2] > visTh;
            }

            using (var linePen = new Pen(Color.FromArgb(200, stroke), 8f))
            {
                foreach (var (a, b) in CocoSkeleton)
                {
                    if (a >= nk || b >= nk)
                        continue;
                    if (!Vis(a) || !Vis(b))
                        continue;
                    g.DrawLine(linePen, pts[a], pts[b]);
                }
            }

            using (var fill = new SolidBrush(Color.FromArgb(230, stroke)))
            {
                for (var i = 0; i < nk; i++)
                {
                    if (!Vis(i))
                        continue;
                    var r = 8f;
                    g.FillEllipse(fill, pts[i].X - r, pts[i].Y - r, r * 2, r * 2);
                }
            }
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




