using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace RemBGWin1._0
{
    /// <summary>
    /// U2Net ONNX 모델을 사용하여 이미지 배경을 제거합니다.
    /// </summary>
    public class BackgroundRemovalProcessor : IDisposable
    {
        private InferenceSession? _session;
        private int _modelSize = 320;

        // ImageNet 정규화 파라미터
        private static readonly float[] Mean = { 0.485f, 0.456f, 0.406f };
        private static readonly float[] Std  = { 0.229f, 0.224f, 0.225f };

        public bool IsLoaded => _session != null;

        // ── Model management ─────────────────────────────────────────────

        public void Load(string modelPath)
        {
            _session?.Dispose();
            _session = new InferenceSession(modelPath);

            // 모델 입력 크기 동적 감지
            var meta = _session.InputMetadata.Values.First();
            if (meta.Dimensions.Length == 4 && meta.Dimensions[2] > 0)
                _modelSize = (int)meta.Dimensions[2];
        }

        public void Unload()
        {
            _session?.Dispose();
            _session = null;
        }

        // ── Inference ────────────────────────────────────────────────────

        public Bitmap Process(Bitmap source)
        {
            if (_session == null)
                throw new InvalidOperationException("모델이 로드되지 않았습니다.");

            int sz = _modelSize;

            float[] inputData = Preprocess(source, sz);
            var tensor = new DenseTensor<float>(inputData, new[] { 1, 3, sz, sz });

            string inputName  = _session.InputNames[0];
            string outputName = _session.OutputNames[0];

            using var outputs = _session.Run(
                new[] { NamedOnnxValue.CreateFromTensor(inputName, tensor) },
                new[] { outputName });

            float[] mask = outputs[0].AsEnumerable<float>().ToArray();
            return ApplyAlphaMask(source, mask, sz, sz);
        }

        // ── Preprocessing ────────────────────────────────────────────────

        private static float[] Preprocess(Bitmap src, int size)
        {
            using var resized  = new Bitmap(src, size, size);
            var rect    = new Rectangle(0, 0, size, size);
            var bmpData = resized.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);

            byte[] pixels = new byte[Math.Abs(bmpData.Stride) * size];
            Marshal.Copy(bmpData.Scan0, pixels, 0, pixels.Length);
            resized.UnlockBits(bmpData);

            float[] tensor = new float[3 * size * size];

            for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
            {
                int offset = y * bmpData.Stride + x * 4;
                float r = pixels[offset + 2] / 255f;
                float g = pixels[offset + 1] / 255f;
                float b = pixels[offset + 0] / 255f;

                int idx = y * size + x;
                tensor[0 * size * size + idx] = (r - Mean[0]) / Std[0];
                tensor[1 * size * size + idx] = (g - Mean[1]) / Std[1];
                tensor[2 * size * size + idx] = (b - Mean[2]) / Std[2];
            }

            return tensor;
        }

        // ── Mask application ─────────────────────────────────────────────

        private static Bitmap ApplyAlphaMask(Bitmap src, float[] mask, int maskW, int maskH)
        {
            int w = src.Width;
            int h = src.Height;

            var result  = new Bitmap(w, h, PixelFormat.Format32bppArgb);
            var srcRect = new Rectangle(0, 0, w, h);
            var dstRect = new Rectangle(0, 0, w, h);

            var srcData = src.LockBits(srcRect, ImageLockMode.ReadOnly,  PixelFormat.Format32bppArgb);
            var dstData = result.LockBits(dstRect, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);

            byte[] srcPixels = new byte[Math.Abs(srcData.Stride) * h];
            byte[] dstPixels = new byte[Math.Abs(dstData.Stride) * h];
            Marshal.Copy(srcData.Scan0, srcPixels, 0, srcPixels.Length);
            src.UnlockBits(srcData);

            for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                int mx = Math.Clamp((int)((float)x / w * maskW), 0, maskW - 1);
                int my = Math.Clamp((int)((float)y / h * maskH), 0, maskH - 1);
                float alpha = mask[my * maskW + mx];

                int si = y * srcData.Stride + x * 4;
                int di = y * dstData.Stride + x * 4;

                dstPixels[di + 0] = srcPixels[si + 0]; // B
                dstPixels[di + 1] = srcPixels[si + 1]; // G
                dstPixels[di + 2] = srcPixels[si + 2]; // R
                dstPixels[di + 3] = (byte)Math.Clamp((int)(alpha * 255), 0, 255); // A
            }

            Marshal.Copy(dstPixels, 0, dstData.Scan0, dstPixels.Length);
            result.UnlockBits(dstData);
            return result;
        }

        public void Dispose() => _session?.Dispose();
    }
}
