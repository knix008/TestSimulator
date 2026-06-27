using ImageRembgWinV10.Localization;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using OpenCvSharp;

namespace ImageRembgWinV10.Services;

internal static class RembgSegmentationService
{
    private const int ModelSize = 320;

    private static readonly float[] Mean = [0.485f, 0.456f, 0.406f];
    private static readonly float[] Std = [0.229f, 0.224f, 0.225f];

    public static Mat GenerateMask(
        Mat bgr,
        Mat selectionMask,
        Mat? foregroundHintMask,
        Mat? backgroundHintMask,
        IProgress<string>? progress = null)
    {
        var provider = RembgModelProvider.Instance;
        provider.EnsureReady(progress);

        using var rgb = new Mat();
        Cv2.CvtColor(bgr, rgb, ColorConversionCodes.BGR2RGB);

        using var resized = new Mat();
        Cv2.Resize(rgb, resized, new OpenCvSharp.Size(ModelSize, ModelSize), 0, 0, InterpolationFlags.Lanczos4);

        var inputTensor = CreateInputTensor(resized);
        using var results = provider.Session.Run([NamedOnnxValue.CreateFromTensor(provider.InputName, inputTensor)]);

        using var modelMask = CreateModelMask(results.First().AsTensor<float>());
        using var fullMask = new Mat();
        Cv2.Resize(modelMask, fullMask, bgr.Size(), 0, 0, InterpolationFlags.Lanczos4);

        using var thresholded = new Mat();
        Cv2.Threshold(fullMask, thresholded, 127, 255, ThresholdTypes.Binary);

        var binary = thresholded.Clone();
        SegmentationMaskBuilder.ApplyPostProcessMasks(binary, selectionMask, foregroundHintMask, backgroundHintMask);
        return binary;
    }

    private static DenseTensor<float> CreateInputTensor(Mat rgb320)
    {
        var maxValue = 0.0;
        var rows = rgb320.Rows;
        var cols = rgb320.Cols;
        for (var y = 0; y < rows; y++)
        {
            for (var x = 0; x < cols; x++)
            {
                var pixel = rgb320.At<Vec3b>(y, x);
                maxValue = Math.Max(maxValue, Math.Max(pixel.Item0, Math.Max(pixel.Item1, pixel.Item2)));
            }
        }

        maxValue = Math.Max(maxValue, 1e-6);
        var tensor = new DenseTensor<float>([1, 3, ModelSize, ModelSize]);
        var scale = (float)(1.0 / maxValue);

        for (var y = 0; y < ModelSize; y++)
        {
            for (var x = 0; x < ModelSize; x++)
            {
                var pixel = rgb320.At<Vec3b>(y, x);
                var channels = new[] { pixel.Item0, pixel.Item1, pixel.Item2 };
                for (var c = 0; c < 3; c++)
                {
                    var normalized = channels[c] * scale;
                    tensor[0, c, y, x] = (normalized - Mean[c]) / Std[c];
                }
            }
        }

        return tensor;
    }

    private static Mat CreateModelMask(Tensor<float> output)
    {
        var outputTensor = output as DenseTensor<float> ?? throw new InvalidOperationException(L.Get("Exception.RembgOutputUnreadable"));
        var height = outputTensor.Dimensions[^2];
        var width = outputTensor.Dimensions[^1];

        var min = float.MaxValue;
        var max = float.MinValue;
        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                var value = outputTensor[0, 0, y, x];
                min = Math.Min(min, value);
                max = Math.Max(max, value);
            }
        }

        var range = Math.Max(max - min, 1e-6f);
        var mask = new Mat(height, width, MatType.CV_8UC1);
        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                var normalized = (outputTensor[0, 0, y, x] - min) / range;
                mask.Set(y, x, (byte)Math.Clamp((int)Math.Round(normalized * 255), 0, 255));
            }
        }

        return mask;
    }
}
