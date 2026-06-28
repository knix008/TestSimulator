using ImageRembgWinV10.Localization;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using OpenCvSharp;

namespace ImageRembgWinV10.Services;

internal static class Rembg2SegmentationService
{
    private const int ModelSize = 1024;

    private static readonly float[] Mean = [0.485f, 0.456f, 0.406f];
    private static readonly float[] Std = [0.229f, 0.224f, 0.225f];

    public static Mat GenerateMask(
        Mat bgr,
        Mat selectionMask,
        Mat? foregroundHintMask,
        Mat? backgroundHintMask,
        IProgress<string>? progress = null)
    {
        var provider = Rembg2ModelProvider.Instance;
        provider.EnsureReady(progress);

        using var rgb = new Mat();
        Cv2.CvtColor(bgr, rgb, ColorConversionCodes.BGR2RGB);

        using var resized = new Mat();
        Cv2.Resize(rgb, resized, new OpenCvSharp.Size(ModelSize, ModelSize), 0, 0, InterpolationFlags.Lanczos4);

        var inputTensor = CreateInputTensor(resized);
        using var results = provider.Session.Run([NamedOnnxValue.CreateFromTensor(provider.InputName, inputTensor)]);

        using var modelMask = CreateModelMask(results.Last().AsTensor<float>());
        using var fullMask = new Mat();
        Cv2.Resize(modelMask, fullMask, bgr.Size(), 0, 0, InterpolationFlags.Lanczos4);

        using var thresholded = new Mat();
        Cv2.Threshold(fullMask, thresholded, 127, 255, ThresholdTypes.Binary);

        var binary = thresholded.Clone();
        SegmentationMaskBuilder.ApplyPostProcessMasks(binary, selectionMask, foregroundHintMask, backgroundHintMask);
        return binary;
    }

    private static DenseTensor<float> CreateInputTensor(Mat rgb1024)
    {
        var tensor = new DenseTensor<float>([1, 3, ModelSize, ModelSize]);

        for (var y = 0; y < ModelSize; y++)
        {
            for (var x = 0; x < ModelSize; x++)
            {
                var pixel = rgb1024.At<Vec3b>(y, x);
                var channels = new[] { pixel.Item0, pixel.Item1, pixel.Item2 };
                for (var c = 0; c < 3; c++)
                {
                    var normalized = channels[c] / 255f;
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

        // Some ONNX exports already bake the final sigmoid/normalization into the graph
        // (output already in [0, 1]); others emit raw logits. Only apply sigmoid for the
        // latter, otherwise applying it twice would push everything above the threshold.
        var alreadyProbability = min >= -0.05f && max <= 1.05f;

        var mask = new Mat(height, width, MatType.CV_8UC1);
        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                var value = outputTensor[0, 0, y, x];
                var probability = alreadyProbability
                    ? Math.Clamp(value, 0f, 1f)
                    : 1f / (1f + MathF.Exp(-value));
                mask.Set(y, x, (byte)Math.Clamp((int)Math.Round(probability * 255f), 0, 255));
            }
        }

        return mask;
    }
}
