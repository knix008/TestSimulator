using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace BGRemoveWin1._0
{
    public class BackgroundRemovalProcessor : IDisposable
    {
        private InferenceSession? _session;
        private int _modelSize = 320;

        private static readonly float[] Mean = { 0.485f, 0.456f, 0.406f };
        private static readonly float[] Std  = { 0.229f, 0.224f, 0.225f };

        public bool IsModelLoaded => _session != null;

        public void LoadModel(string modelPath)
        {
            _session?.Dispose();
            _session = new InferenceSession(modelPath);

            // 모델 입력 크기를 동적으로 읽기 (없으면 320 유지)
            var inputMeta = _session.InputMetadata.Values.First();
            if (inputMeta.Dimensions.Length == 4 && inputMeta.Dimensions[2] > 0)
                _modelSize = (int)inputMeta.Dimensions[2];
        }

        public Bitmap RemoveBackground(Bitmap original)
        {
            if (_session == null)
                throw new InvalidOperationException("모델이 로드되지 않았습니다.");

            int size = _modelSize;
            float[] inputData = PreprocessImage(original, size);

            var tensor = new DenseTensor<float>(inputData, new[] { 1, 3, size, size });

            string inputName  = _session.InputNames[0];
            string outputName = _session.OutputNames[0];

            var inputs = new List<NamedOnnxValue>
            {
                NamedOnnxValue.CreateFromTensor(inputName, tensor)
            };

            using var results = _session.Run(inputs, new[] { outputName });
            float[] maskData = results[0].AsEnumerable<float>().ToArray();

            return ApplyMask(original, maskData, size, size);
        }

        private static float[] PreprocessImage(Bitmap src, int size)
        {
            using var resized = new Bitmap(src, size, size);

            var rect    = new Rectangle(0, 0, size, size);
            var bmpData = resized.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            byte[] pixels = new byte[Math.Abs(bmpData.Stride) * size];
            Marshal.Copy(bmpData.Scan0, pixels, 0, pixels.Length);
            resized.UnlockBits(bmpData);

            float[] tensor = new float[3 * size * size];

            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    int offset = y * bmpData.Stride + x * 4;
                    float r = pixels[offset + 2] / 255.0f;
                    float g = pixels[offset + 1] / 255.0f;
                    float b = pixels[offset + 0] / 255.0f;

                    int idx = y * size + x;
                    tensor[0 * size * size + idx] = (r - Mean[0]) / Std[0];
                    tensor[1 * size * size + idx] = (g - Mean[1]) / Std[1];
                    tensor[2 * size * size + idx] = (b - Mean[2]) / Std[2];
                }
            }

            return tensor;
        }

        private static Bitmap ApplyMask(Bitmap original, float[] mask, int maskW, int maskH)
        {
            int w = original.Width;
            int h = original.Height;
            var result = new Bitmap(w, h, PixelFormat.Format32bppArgb);

            var srcRect  = new Rectangle(0, 0, w, h);
            var dstRect  = new Rectangle(0, 0, w, h);
            var srcData  = original.LockBits(srcRect, ImageLockMode.ReadOnly,  PixelFormat.Format32bppArgb);
            var dstData  = result.LockBits(dstRect,   ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);

            byte[] srcPixels = new byte[Math.Abs(srcData.Stride) * h];
            byte[] dstPixels = new byte[Math.Abs(dstData.Stride) * h];
            Marshal.Copy(srcData.Scan0, srcPixels, 0, srcPixels.Length);
            original.UnlockBits(srcData);

            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    int mx = Math.Clamp((int)((float)x / w * maskW), 0, maskW - 1);
                    int my = Math.Clamp((int)((float)y / h * maskH), 0, maskH - 1);
                    float alpha = mask[my * maskW + mx];

                    int srcOff = y * srcData.Stride + x * 4;
                    int dstOff = y * dstData.Stride + x * 4;

                    dstPixels[dstOff + 0] = srcPixels[srcOff + 0]; // B
                    dstPixels[dstOff + 1] = srcPixels[srcOff + 1]; // G
                    dstPixels[dstOff + 2] = srcPixels[srcOff + 2]; // R
                    dstPixels[dstOff + 3] = (byte)Math.Clamp((int)(alpha * 255), 0, 255); // A
                }
            }

            Marshal.Copy(dstPixels, 0, dstData.Scan0, dstPixels.Length);
            result.UnlockBits(dstData);
            return result;
        }

        public void UnloadModel()
        {
            _session?.Dispose();
            _session = null;
        }

        public void Dispose()
        {
            _session?.Dispose();
        }
    }
}
