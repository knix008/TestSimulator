using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;

namespace SuperResolutionApp;

public abstract class OnnxSuperResolutionEngine : ISuperResolutionEngine
{
    public abstract SrAlgorithm Algorithm { get; }

    public Task<Bitmap> UpscaleAsync(Bitmap input, SrOptions options, IProgress<int>? progress = null)
    {
        if (string.IsNullOrWhiteSpace(options.ModelPath))
        {
            throw new InvalidOperationException($"{Algorithm} requires an ONNX model file.");
        }

        if (!File.Exists(options.ModelPath))
        {
            throw new FileNotFoundException("Model file not found.", options.ModelPath);
        }

        return Task.Run(() => RunOnnx(input, options.ModelPath, progress));
    }

    private static Bitmap RunOnnx(Bitmap input, string modelPath, IProgress<int>? progress)
    {
        progress?.Report(2);
        using var session = new InferenceSession(modelPath);
        var inputMeta = session.InputMetadata.First();
        var outputMeta = session.OutputMetadata.First();
        progress?.Report(10);

        using var rgbBitmap = Ensure24bppRgb(input);
        var inputTensor = ImageToTensor(rgbBitmap, progress);
        var inputValue = NamedOnnxValue.CreateFromTensor(inputMeta.Key, inputTensor);
        progress?.Report(62);
        using IDisposableReadOnlyCollection<DisposableNamedOnnxValue> results = session.Run(new[] { inputValue });

        var outputTensor = results.First(x => x.Name == outputMeta.Key).AsTensor<float>();
        progress?.Report(74);
        var output = TensorToBitmap(outputTensor, progress);
        progress?.Report(100);
        return output;
    }

    private static Bitmap Ensure24bppRgb(Bitmap src)
    {
        if (src.PixelFormat == System.Drawing.Imaging.PixelFormat.Format24bppRgb)
        {
            return (Bitmap)src.Clone();
        }

        var dst = new Bitmap(src.Width, src.Height, System.Drawing.Imaging.PixelFormat.Format24bppRgb);
        using var g = Graphics.FromImage(dst);
        g.DrawImage(src, new Rectangle(0, 0, src.Width, src.Height));
        return dst;
    }

    private static DenseTensor<float> ImageToTensor(Bitmap image, IProgress<int>? progress)
    {
        int h = image.Height;
        int w = image.Width;
        var tensor = new DenseTensor<float>(new[] { 1, 3, h, w });

        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                var c = image.GetPixel(x, y);
                tensor[0, 0, y, x] = c.R / 255f;
                tensor[0, 1, y, x] = c.G / 255f;
                tensor[0, 2, y, x] = c.B / 255f;
            }
            if (y % Math.Max(1, h / 20) == 0)
            {
                int pct = 10 + (int)Math.Round((y / (double)Math.Max(1, h - 1)) * 50d);
                progress?.Report(Math.Clamp(pct, 10, 60));
            }
        }

        return tensor;
    }

    private static Bitmap TensorToBitmap(Tensor<float> tensor, IProgress<int>? progress)
    {
        if (tensor.Rank != 4 || tensor.Dimensions[0] != 1 || tensor.Dimensions[1] != 3)
        {
            throw new InvalidOperationException("Expected output tensor shape [1,3,H,W].");
        }

        int h = tensor.Dimensions[2];
        int w = tensor.Dimensions[3];
        var bmp = new Bitmap(w, h, System.Drawing.Imaging.PixelFormat.Format24bppRgb);

        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                int r = ToByte(tensor[0, 0, y, x]);
                int g = ToByte(tensor[0, 1, y, x]);
                int b = ToByte(tensor[0, 2, y, x]);
                bmp.SetPixel(x, y, Color.FromArgb(r, g, b));
            }
            if (y % Math.Max(1, h / 20) == 0)
            {
                int pct = 74 + (int)Math.Round((y / (double)Math.Max(1, h - 1)) * 24d);
                progress?.Report(Math.Clamp(pct, 74, 98));
            }
        }

        return bmp;
    }

    private static int ToByte(float value)
    {
        value = Math.Clamp(value, 0f, 1f);
        return (int)Math.Round(value * 255f);
    }
}
