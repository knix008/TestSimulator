using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using OpenCvSharp;
using System.Windows.Forms;

namespace Yolo26Detection1._0
{
    internal sealed class Yolo26OnnxDetector : IDisposable
    {
        private const int InputSize = 640;
        private const int MaxDets = 300;
        private const int BoxStride = 6;

        private const string DefaultInputName = "images";
        private const string DefaultOutputName = "output0";

        private readonly InferenceSession _session;
        private readonly string _inputName;
        private readonly string _outputName;

        private PictureBox _pictureBox;
        private Panel _scrollablePanel;
        private float _zoomFactor = 1.0f;
        private System.Drawing.Point _dragStartPoint;
        private bool _isDragging;

        internal Yolo26OnnxDetector(string onnxPath)
        {
            if (string.IsNullOrWhiteSpace(onnxPath))
                throw new ArgumentException("ONNX 경로가 비어 있습니다.", nameof(onnxPath));

            var fullPath = Path.GetFullPath(onnxPath.Trim());
            if (!File.Exists(fullPath))
                throw new FileNotFoundException("ONNX 파일을 찾을 수 없습니다.", fullPath);

            byte[] modelBytes;
            try
            {
                modelBytes = File.ReadAllBytes(fullPath);
            }
            catch (Exception ex)
            {
                throw new IOException($"ONNX 파일을 읽을 수 없습니다: {fullPath}", ex);
            }

            if (modelBytes.Length == 0)
                throw new InvalidDataException($"ONNX 파일이 비어 있습니다: {fullPath}");

            _session = CreateInferenceSession(fullPath, modelBytes);
            _inputName = ResolveIoName(_session.InputMetadata, DefaultInputName, "입력");
            _outputName = ResolveIoName(_session.OutputMetadata, DefaultOutputName, "출력");
        }

        /// <summary>
        /// 먼저 <c>new InferenceSession(path, opts)</c>를 시도하고, 실패 시 같은 파일을 읽은 바이트로 재시도합니다.
        /// </summary>
        private static InferenceSession CreateInferenceSession(string fullPath, byte[] modelBytes)
        {
            Exception last = null;
            foreach (var level in new[]
                     {
                         GraphOptimizationLevel.ORT_ENABLE_ALL,
                         GraphOptimizationLevel.ORT_ENABLE_EXTENDED,
                         GraphOptimizationLevel.ORT_DISABLE_ALL,
                     })
            {
                try
                {
                    var opts = new SessionOptions();
                    opts.GraphOptimizationLevel = level;
                    opts.LogSeverityLevel = OrtLoggingLevel.ORT_LOGGING_LEVEL_WARNING;
                    try
                    {
                        return new InferenceSession(fullPath, opts);
                    }
                    catch (Exception)
                    {
                        var opts2 = new SessionOptions();
                        opts2.GraphOptimizationLevel = level;
                        opts2.LogSeverityLevel = OrtLoggingLevel.ORT_LOGGING_LEVEL_WARNING;
                        return new InferenceSession(modelBytes, opts2);
                    }
                }
                catch (OnnxRuntimeException ex)
                {
                    last = ex;
                }
                catch (Exception ex)
                {
                    last = ex;
                    break;
                }
            }

            var sb = new StringBuilder();
            sb.AppendLine("ONNX 추론 세션을 만들 수 없습니다.");
            sb.AppendLine($"파일: {fullPath}");
            sb.AppendLine($"크기: {modelBytes.Length} bytes");
            if (last != null)
            {
                sb.AppendLine("원인: " + last.Message);
                if (last.InnerException != null)
                    sb.AppendLine("내부: " + last.InnerException.Message);
                var msg = last.Message ?? "";
                if (msg.IndexOf("IR version", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    sb.AppendLine(
                        "→ ONNX IR 버전 불일치: 최신 보내기(IR 10+)는 Microsoft.ML.OnnxRuntime 1.20+ 필요. NuGet을 1.20.1 이상(권장 1.24.x)으로 올린 뒤 복원·재빌드하세요.");
                }
            }
            sb.AppendLine("확인: e2e YOLO26 ONNX, Visual C++ 재배포 패키지.");
            throw new InvalidOperationException(sb.ToString(), last);
        }

        private static string ResolveIoName(
            IReadOnlyDictionary<string, NodeMetadata> meta,
            string preferred,
            string kind)
        {
            if (meta == null || meta.Count == 0)
                throw new InvalidOperationException($"모델에 {kind} 메타데이터가 없습니다.");

            if (meta.ContainsKey(preferred))
                return preferred;

            if (meta.Count == 1)
                return meta.Keys.First();

            throw new InvalidOperationException(
                $"{kind} 이름을 결정할 수 없습니다. 기대 '{preferred}', 실제: {string.Join(", ", meta.Keys)}");
        }

        internal IReadOnlyList<Detection> Detect(Mat bgr, float confThreshold)
        {
            if (bgr == null || bgr.Empty())
                throw new ArgumentException("이미지가 비어 있습니다.");

            using (var lb = Letterbox(bgr, InputSize))
            {
                var input = new float[1 * 3 * InputSize * InputSize];
                MatToTensorNchw(lb.Image, input);

                var tensor = new DenseTensor<float>(input, new[] { 1, 3, InputSize, InputSize });
                var inputs = new List<NamedOnnxValue> { NamedOnnxValue.CreateFromTensor(_inputName, tensor) };

                using (var results = _session.Run(inputs))
                {
                    var output = results.Single(o => o.Name == _outputName).AsTensor<float>();
                    return ParseOutput(output, confThreshold, lb);
                }
            }
        }

        internal static Mat DrawDetections(Mat bgr, IReadOnlyList<Detection> dets)
        {
            const double fontScale = 0.55;
            const int fontThickness = 2;
            var vis = bgr.Clone();
            for (int i = 0; i < dets.Count; i++)
            {
                var d = dets[i];
                var p1 = new Point((int)Math.Round(d.X1), (int)Math.Round(d.Y1));
                var p2 = new Point((int)Math.Round(d.X2), (int)Math.Round(d.Y2));
                DetectionColors.GetForInstance(i, out var boxCol, out var labelBg, out var labelTxt);
                Cv2.Rectangle(vis, p1, p2, boxCol, 2);
                string name = d.ClassId >= 0 && d.ClassId < CocoNames.Labels.Length
                    ? CocoNames.Labels[d.ClassId]
                    : $"cls{d.ClassId}";
                string label = $"#{i + 1} {name} {d.Confidence:0.00}";
                int baseline = 0;
                var sz = Cv2.GetTextSize(label, HersheyFonts.HersheySimplex, fontScale, fontThickness, out baseline);
                int padX = 4, padY = 3;
                int labelTop = p1.Y - sz.Height - padY * 2;
                int labelBottom = p1.Y;
                if (labelTop < 0)
                {
                    labelBottom = Math.Min(vis.Height - 1, p2.Y + sz.Height + padY * 2);
                    labelTop = labelBottom - sz.Height - padY * 2;
                }
                var bgP1 = new Point(p1.X, labelTop);
                var bgP2 = new Point(p1.X + sz.Width + padX * 2, labelBottom);
                Cv2.Rectangle(vis, bgP1, bgP2, labelBg, -1);
                Cv2.Rectangle(vis, bgP1, bgP2, boxCol, 1);
                var textPt = new Point(p1.X + padX, labelBottom - padY - 1);
                Cv2.PutText(vis, label, textPt, HersheyFonts.HersheySimplex, fontScale, labelTxt, fontThickness);
            }
            return vis;
        }

        private static List<Detection> ParseOutput(Tensor<float> t, float confThreshold, LetterboxInfo lb)
        {
            var dims = t.Dimensions.ToArray();
            if (dims.Length != 3 || dims[0] != 1 || dims[1] != MaxDets || dims[2] != BoxStride)
                throw new InvalidOperationException($"예상하지 않은 출력 형식입니다: [{string.Join(",", dims)}]. e2e YOLO26 ONNX(1,300,6)를 사용하세요.");

            var list = new List<Detection>();
            for (int i = 0; i < MaxDets; i++)
            {
                float conf = t[0, i, 4];
                if (conf < confThreshold)
                    continue;

                float x1 = t[0, i, 0];
                float y1 = t[0, i, 1];
                float x2 = t[0, i, 2];
                float y2 = t[0, i, 3];
                int cls = (int)Math.Round(t[0, i, 5]);

                x1 = (x1 - lb.PadLeft) / lb.Gain;
                y1 = (y1 - lb.PadTop) / lb.Gain;
                x2 = (x2 - lb.PadLeft) / lb.Gain;
                y2 = (y2 - lb.PadTop) / lb.Gain;

                x1 = Clamp(x1, 0, lb.SourceWidth);
                x2 = Clamp(x2, 0, lb.SourceWidth);
                y1 = Clamp(y1, 0, lb.SourceHeight);
                y2 = Clamp(y2, 0, lb.SourceHeight);

                if (x2 <= x1 || y2 <= y1)
                    continue;

                list.Add(new Detection(x1, y1, x2, y2, conf, cls));
            }
            return list;
        }

        private static float Clamp(float v, float a, float b)
        {
            if (v < a) return a;
            if (v > b) return b;
            return v;
        }

        private static void MatToTensorNchw(Mat bgr640, float[] dest)
        {
            int h = bgr640.Height;
            int w = bgr640.Width;
            int hw = h * w;
            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    var v = bgr640.At<Vec3b>(y, x);
                    int i = y * w + x;
                    dest[0 * hw + i] = v.Item2 / 255f;
                    dest[1 * hw + i] = v.Item1 / 255f;
                    dest[2 * hw + i] = v.Item0 / 255f;
                }
            }
        }

        private static LetterboxInfo Letterbox(Mat src, int target)
        {
            int srcW = src.Width;
            int srcH = src.Height;
            float r = Math.Min((float)target / srcH, (float)target / srcW);
            int newW = (int)Math.Round(srcW * r);
            int newH = (int)Math.Round(srcH * r);
            float dw = (target - newW) / 2f;
            float dh = (target - newH) / 2f;
            int top = (int)Math.Round(dh - 0.1);
            int bottom = (int)Math.Round(dh + 0.1);
            int left = (int)Math.Round(dw - 0.1);
            int right = (int)Math.Round(dw + 0.1);

            using (var resized = new Mat())
            {
                Cv2.Resize(src, resized, new OpenCvSharp.Size(newW, newH), 0, 0, InterpolationFlags.Linear);
                var dst = new Mat();
                Cv2.CopyMakeBorder(resized, dst, top, bottom, left, right, BorderTypes.Constant, new Scalar(114, 114, 114));
                return new LetterboxInfo(dst, r, left, top, srcW, srcH);
            }
        }

        public void InitializeZoomAndDrag(PictureBox pictureBox, Panel scrollablePanel)
        {
            _pictureBox = pictureBox;
            _scrollablePanel = scrollablePanel;

            _pictureBox.SizeMode = PictureBoxSizeMode.AutoSize;
            _scrollablePanel.AutoScroll = true;

            _scrollablePanel.MouseWheel += ScrollablePanel_MouseWheel;
            _pictureBox.MouseDown += PictureBox_MouseDown;
            _pictureBox.MouseMove += PictureBox_MouseMove;
            _pictureBox.MouseUp += PictureBox_MouseUp;
        }

        private void ScrollablePanel_MouseWheel(object sender, MouseEventArgs e)
        {
            if (e.Delta > 0)
                _zoomFactor *= 1.1f;
            else
                _zoomFactor /= 1.1f;

            _pictureBox.Width = (int)(_pictureBox.Image.Width * _zoomFactor);
            _pictureBox.Height = (int)(_pictureBox.Image.Height * _zoomFactor);
        }

        private void PictureBox_MouseDown(object sender, MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Left)
            {
                _isDragging = true;
                _dragStartPoint = e.Location;
            }
        }

        private void PictureBox_MouseMove(object sender, MouseEventArgs e)
        {
            if (_isDragging)
            {
                var dx = e.Location.X - _dragStartPoint.X;
                var dy = e.Location.Y - _dragStartPoint.Y;

                _scrollablePanel.AutoScrollPosition = new System.Drawing.Point(
                    -_scrollablePanel.AutoScrollPosition.X - dx,
                    -_scrollablePanel.AutoScrollPosition.Y - dy);
            }
        }

        private void PictureBox_MouseUp(object sender, MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Left)
            {
                _isDragging = false;
            }
        }

        public void Dispose()
        {
            _session?.Dispose();
        }

        private sealed class LetterboxInfo : IDisposable
        {
            internal Mat Image { get; }
            internal float Gain { get; }
            internal int PadLeft { get; }
            internal int PadTop { get; }
            internal int SourceWidth { get; }
            internal int SourceHeight { get; }

            internal LetterboxInfo(Mat image, float gain, int padLeft, int padTop, int sourceWidth, int sourceHeight)
            {
                Image = image;
                Gain = gain;
                PadLeft = padLeft;
                PadTop = padTop;
                SourceWidth = sourceWidth;
                SourceHeight = sourceHeight;
            }

            public void Dispose()
            {
                Image?.Dispose();
            }
        }
    }

    internal struct Detection
    {
        internal float X1;
        internal float Y1;
        internal float X2;
        internal float Y2;
        internal float Confidence;
        internal int ClassId;

        internal Detection(float x1, float y1, float x2, float y2, float confidence, int classId)
        {
            X1 = x1;
            Y1 = y1;
            X2 = x2;
            Y2 = y2;
            Confidence = confidence;
            ClassId = classId;
        }
    }
}
