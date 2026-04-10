using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Linq;
using System.Runtime.InteropServices;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using OpenCvSharp;

namespace YOLO26V10.yolo26
{
    internal sealed class SegInstance
    {
        public RectangleF BoxOrig { get; set; }
        public int ClassId { get; set; }
        public float Confidence { get; set; }
    }

    internal sealed class Yolo26SegmentationSession : IDisposable
    {
        private readonly InferenceSession _session;
        private readonly string _inputName;
        private readonly int _netSize;

        /// <summary>?ㅼ젣 ?ъ슜 以묒씤 ?ㅽ뻾 怨듦툒???붿빟(?? CUDA ?먮뒗 CPU ?대갚 ?ъ쑀).</summary>
        public string ExecutionProviderSummary { get; }

        public Yolo26SegmentationSession(string onnxPath, int cudaDeviceId = 0)
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

        /// <summary>?먮낯 醫뚰몴怨꾩쓽 ?몄뒪?댁뒪 紐⑸줉怨??쒓컖?붾맂 鍮꾪듃留듭쓣 諛섑솚?⑸땲??</summary>
        public (Bitmap Rendered, List<SegInstance> Instances) RunSegmentation(
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
            Tensor<float> pred = null;
            Tensor<float> proto = null;
            foreach (var r in results)
            {
                var t = r.AsTensor<float>();
                if (t == null)
                    continue;
                if (t.Dimensions.Length == 3)
                    pred = t;
                else if (t.Dimensions.Length == 4)
                    proto = t;
            }

            if (pred == null)
                throw new InvalidOperationException("ONNX 異쒕젰?먯꽌 ?덉륫 ?먯꽌(??겕 3)瑜?李얠? 紐삵뻽?듬땲??");
            if (proto == null)
                throw new InvalidOperationException("ONNX 異쒕젰?먯꽌 ?꾨줈??留덉뒪???먯꽌(??겕 4)瑜?李얠? 紐삵뻽?듬땲??");

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
                throw new InvalidOperationException("?멸렇硫섑뀒?댁뀡 紐⑤뜽???꾨땶 寃?媛숈뒿?덈떎(梨꾨꼸 ??遺議?.");

            float P(int det, int ch) => channelsLast ? pred[0, det, ch] : pred[0, ch, det];

            var nm = width - 6;
            var nmProto = (int)proto.Dimensions[1];
            if (nm != nmProto)
                throw new InvalidOperationException($"留덉뒪??怨꾩닔 ??{nm})? ?꾨줈??梨꾨꼸({nmProto})???쇱튂?섏? ?딆뒿?덈떎.");

            var mh = (int)proto.Dimensions[2];
            var mw = (int)proto.Dimensions[3];

            var rendered = new Bitmap(original.Width, original.Height, PixelFormat.Format32bppArgb);
            var instances = new List<SegInstance>();
            using (var g = Graphics.FromImage(rendered))
            {
                g.DrawImage(original, 0, 0, original.Width, original.Height);
                g.SmoothingMode = SmoothingMode.AntiAlias;

            for (var i = 0; i < n; i++)
            {
                var conf = P(i, 4);
                if (conf < confThreshold || float.IsNaN(conf))
                    continue;

                var cid = (int)Math.Round(P(i, 5));
                if (cid < 0 || cid >= Coco80.Names.Length)
                    continue;
                if (allowedClassIds != null && !allowedClassIds.Contains(cid))
                    continue;

                var x1 = P(i, 0);
                var y1 = P(i, 1);
                var x2 = P(i, 2);
                var y2 = P(i, 3);

                var coeffs = new float[nm];
                for (var k = 0; k < nm; k++)
                    coeffs[k] = P(i, 6 + k);

                var hue = (cid * 37 + i * 11) % 360;
                var fillColor = ColorFromHsv(hue, 0.65f, 0.95f);

                using (var maskSmall = new Mat(mh, mw, MatType.CV_32FC1))
                {
                    for (var y = 0; y < mh; y++)
                    {
                        for (var x = 0; x < mw; x++)
                        {
                            float sum = 0;
                            for (var k = 0; k < nm; k++)
                                sum += coeffs[k] * proto[0, k, y, x];
                            maskSmall.Set(y, x, Sigmoid(sum));
                        }
                    }

                    using (var maskNet = new Mat())
                    {
                        Cv2.Resize(
                            maskSmall,
                            maskNet,
                            new OpenCvSharp.Size(_netSize, _netSize),
                            0,
                            0,
                            InterpolationFlags.Linear);

                        var nw = (int)Math.Round(lb.OrigWidth * lb.Gain);
                        var nh = (int)Math.Round(lb.OrigHeight * lb.Gain);
                        var roi = new Rect(lb.PadLeft, lb.PadTop, nw, nh);
                        using (var cropped = new Mat(maskNet, roi))
                        using (var maskOrig = new Mat())
                        {
                            Cv2.Resize(
                                cropped,
                                maskOrig,
                                new OpenCvSharp.Size(lb.OrigWidth, lb.OrigHeight),
                                0,
                                0,
                                InterpolationFlags.Linear);

                            BlendMask(rendered, maskOrig, fillColor, 0.38f);
                        }
                    }
                }

                var ox1 = (x1 - lb.PadLeft) / lb.Gain;
                var oy1 = (y1 - lb.PadTop) / lb.Gain;
                var ox2 = (x2 - lb.PadLeft) / lb.Gain;
                var oy2 = (y2 - lb.PadTop) / lb.Gain;
                var rect = RectangleF.FromLTRB(
                    Math.Min(ox1, ox2),
                    Math.Min(oy1, oy2),
                    Math.Max(ox1, ox2),
                    Math.Max(oy1, oy2));

                instances.Add(new SegInstance
                {
                    BoxOrig = rect,
                    ClassId = cid,
                    Confidence = conf,
                });

                using (var pen = new Pen(Color.FromArgb(220, fillColor), 2f))
                {
                    g.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);
                }

                var label = $"{Coco80.Names[cid]} {conf:0.00}";
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

        private static float Sigmoid(float x) => 1f / (1f + (float)Math.Exp(-x));

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

        private static void BlendMask(Bitmap dest, Mat maskOrig, Color tint, float alpha)
        {
            var w = dest.Width;
            var h = dest.Height;
            if (maskOrig.Width != w || maskOrig.Height != h)
                return;

            var rect = new Rectangle(0, 0, w, h);
            var bd = dest.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            try
            {
                var stride = bd.Stride;
                var bytes = Math.Abs(stride) * h;
                var buf = new byte[bytes];
                Marshal.Copy(bd.Scan0, buf, 0, bytes);

                for (var y = 0; y < h; y++)
                {
                    var row = y * stride;
                    for (var x = 0; x < w; x++)
                    {
                        var m = maskOrig.At<float>(y, x);
                        if (m < 0.5f)
                            continue;
                        var o = row + x * 4;
                        var b = buf[o + 0];
                        var g = buf[o + 1];
                        var r = buf[o + 2];
                        var a = buf[o + 3];
                        var wa = m * alpha;
                        buf[o + 0] = (byte)(b * (1 - wa) + tint.B * wa);
                        buf[o + 1] = (byte)(g * (1 - wa) + tint.G * wa);
                        buf[o + 2] = (byte)(r * (1 - wa) + tint.R * wa);
                        buf[o + 3] = a;
                    }
                }

                Marshal.Copy(buf, 0, bd.Scan0, bytes);
            }
            finally
            {
                dest.UnlockBits(bd);
            }
        }
    }
}

