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
    internal sealed class Yolo26ClassifySession : IDisposable
    {
        private readonly InferenceSession _session;
        private readonly string _inputName;
        private readonly int _netSize;

        public string ExecutionProviderSummary { get; }

        public Yolo26ClassifySession(string onnxPath, int cudaDeviceId = 0)
        {
            _session = YoloOnnxSessionFactory.CreateSession(onnxPath, cudaDeviceId, out var summary);
            ExecutionProviderSummary = summary;
            _inputName = _session.InputMetadata.Keys.First();
            var shape = _session.InputMetadata[_inputName].Dimensions;
            if (shape != null && shape.Length >= 4 && shape[2] > 0)
                _netSize = (int)shape[2];
            else if (shape != null && shape.Length == 4 && shape[3] > 0)
                _netSize = (int)shape[3];
            else
                _netSize = 224;
        }

        public int NetSize => _netSize;

        public void Dispose() => _session.Dispose();

        public (Bitmap Rendered, List<SegInstance> TopPredictions) RunClassify(
            Bitmap source,
            float minTop1Probability,
            HashSet<int> allowedClassIdsIgnored)
        {
            _ = allowedClassIdsIgnored;
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
                    return Postprocess(src, results, minTop1Probability);
            }
        }

        private (Bitmap, List<SegInstance>) Postprocess(Bitmap original, IReadOnlyCollection<NamedOnnxValue> results, float minTop1)
        {
            var logitsTensor = PickLogitsTensor(results);
            if (logitsTensor == null)
                throw new InvalidOperationException(
                    "분류용 로짓 텐서를 찾지 못했습니다. yolo26*-cls ONNX인지 확인하세요.");

            if (!TryGetClassCount(logitsTensor, out var numClasses))
                throw new InvalidOperationException("분류 출력 차원을 해석할 수 없습니다.");

            var logits = new float[numClasses];
            for (var i = 0; i < numClasses; i++)
                logits[i] = ReadLogit(logitsTensor, i);

            var probs = Softmax(logits);
            var order = Enumerable.Range(0, numClasses).OrderByDescending(i => probs[i]).ToList();
            var topK = Math.Min(5, numClasses);
            var top = new List<SegInstance>();
            for (var r = 0; r < topK; r++)
            {
                var idx = order[r];
                top.Add(new SegInstance
                {
                    BoxOrig = RectangleF.Empty,
                    ClassId = idx,
                    Confidence = probs[idx],
                });
            }

            if (top.Count == 0 || top[0].Confidence < minTop1)
            {
                // Still draw results; caller may filter in UI. We add a note in rendering.
            }

            var rendered = new Bitmap(original.Width, original.Height, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(rendered))
            {
                g.DrawImage(original, 0, 0, original.Width, original.Height);
                g.SmoothingMode = SmoothingMode.AntiAlias;
                var lines = new List<string>();
                for (var r = 0; r < topK; r++)
                {
                    var idx = order[r];
                    var name = Imagenet1kLabels.GetName(idx);
                    lines.Add($"{r + 1}. {name} ({probs[idx]:0.000})");
                }

                using (var font = new Font(FontFamily.GenericSansSerif, 11f, FontStyle.Bold))
                {
                    var pad = 12f;
                    var lineH = font.GetHeight(g);
                    var maxW = 0f;
                    foreach (var line in lines)
                    {
                        var sz = g.MeasureString(line, font);
                        if (sz.Width > maxW)
                            maxW = sz.Width;
                    }

                    var boxH = pad * 2 + lineH * lines.Count;
                    var boxW = maxW + pad * 2;
                    using (var bg = new SolidBrush(Color.FromArgb(200, 20, 24, 28)))
                        g.FillRectangle(bg, 8, 8, boxW, boxH);
                    for (var i = 0; i < lines.Count; i++)
                    {
                        var c = i == 0 && top[0].Confidence < minTop1
                            ? Color.Orange
                            : Color.White;
                        using (var br = new SolidBrush(c))
                            g.DrawString(lines[i], font, br, 8 + pad, 8 + pad + i * lineH);
                    }
                }
            }

            return (rendered, top);
        }

        private static Tensor<float> PickLogitsTensor(IReadOnlyCollection<NamedOnnxValue> results)
        {
            Tensor<float> best = null;
            var bestN = 0;
            foreach (var r in results)
            {
                var t = r.AsTensor<float>();
                if (t == null)
                    continue;
                if (!TryGetClassCount(t, out var n))
                    continue;
                if (n > bestN)
                {
                    bestN = n;
                    best = t;
                }
            }

            return best;
        }

        private static float ReadLogit(Tensor<float> t, int i)
        {
            var d = t.Dimensions;
            if (d.Length == 2)
                return t[0, i];
            if (d.Length == 1)
                return t[i];
            if (d.Length == 4)
                return t[0, i, 0, 0];
            throw new InvalidOperationException("지원하지 않는 분류 출력 차원입니다.");
        }

        private static bool TryGetClassCount(Tensor<float> t, out int count)
        {
            count = 0;
            var d = t.Dimensions;
            if (d.Length == 2 && d[0] == 1)
            {
                count = (int)d[1];
                return count > 1;
            }

            if (d.Length == 1)
            {
                count = (int)d[0];
                return count > 1;
            }

            if (d.Length == 4 && d[0] == 1)
            {
                var n = (int)d[1];
                var rest = 1L;
                for (var i = 2; i < d.Length; i++)
                    rest *= d[i];
                if (rest == 1 && n > 1)
                {
                    count = n;
                    return true;
                }
            }

            return false;
        }

        private static float[] Softmax(float[] z)
        {
            var max = z.Max();
            var ex = new float[z.Length];
            var sum = 0f;
            for (var i = 0; i < z.Length; i++)
            {
                ex[i] = (float)Math.Exp(Math.Min(z[i] - max, 40f));
                sum += ex[i];
            }

            if (sum <= 1e-12f)
                return z.Select(_ => 1f / z.Length).ToArray();
            for (var i = 0; i < ex.Length; i++)
                ex[i] /= sum;
            return ex;
        }
    }
}
