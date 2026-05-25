using System.IO;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace ImageViewerV30;

/// <summary>
/// rembg ONNX 모델 AI 배경 제거 (u2net, bria-rmbg-2.0).
/// 전처리/후처리는 rembg BaseSession + 각 Session.predict 와 동일합니다.
/// </summary>
public sealed class RembgSegmentationService : IDisposable
{
    private static readonly float[] Mean = [0.485f, 0.456f, 0.406f];
    private static readonly float[] Std = [0.229f, 0.224f, 0.225f];

    private InferenceSession? _session;
    private readonly string _modelPath;
    private readonly RembgModelInfo _model;
    private string? _inputName;
    private string? _outputName;
    private readonly object _lock = new();

    public RembgSegmentationService(string modelPath, RembgModelInfo model)
    {
        _modelPath = modelPath;
        _model = model;
    }

    public static string GetDefaultModelPath() =>
        RembgPaths.GetModelFilePath(RembgModelInfo.U2Net);

    public bool IsModelReady => File.Exists(_modelPath);

    public void EnsureSession()
    {
        if (_session is not null) return;
        lock (_lock)
        {
            if (_session is not null) return;
            if (!File.Exists(_modelPath))
                throw new FileNotFoundException($"ONNX 모델을 찾을 수 없습니다: {_modelPath}");

            var options = new SessionOptions
            {
                LogSeverityLevel = OrtLoggingLevel.ORT_LOGGING_LEVEL_WARNING
            };
            _session = new InferenceSession(_modelPath, options);
            _inputName = _session.InputMetadata.Keys.First();
            _outputName = PickMaskOutputName(_session);
        }
    }

    /// <summary>마스크 텐서 출력 이름 선택 (u2net은 다중 출력).</summary>
    private static string PickMaskOutputName(InferenceSession session)
    {
        string? best = null;
        long bestElements = long.MaxValue;

        foreach (var kv in session.OutputMetadata)
        {
            var dims = kv.Value.Dimensions;
            if (dims.Length == 4 && dims[0] == 1 && dims[1] == 1)
            {
                long elements = dims.Aggregate(1L, (a, d) => a * (d <= 0 ? 1 : d));
                if (elements < bestElements)
                {
                    bestElements = elements;
                    best = kv.Key;
                }
            }
        }

        return best ?? session.OutputMetadata.Keys.First();
    }

    public Image<Rgba32> RemoveBackground(Image<Rgba32> source) =>
        RemoveBackground(source, null);

    public Image<Rgba32> RemoveBackground(Image<Rgba32> source, IProgress<(int percent, string message)>? progress)
    {
        progress?.Report((5, "AI 모델 준비 중..."));
        EnsureSession();

        int origW = source.Width, origH = source.Height;
        progress?.Report((15, "이미지 전처리 중..."));

        // rembg: predict(img) — PIL RGB(투명=검정) 후 리사이즈
        using var rgb = ToRgbOnBlack(source);
        using var resized = rgb.CloneAs<Rgba32>();
        resized.Mutate(x => x.Resize(_model.InputSize, _model.InputSize, KnownResamplers.Lanczos3));

        var inputTensor = BuildInputTensor(resized, progress);
        var inputs = new List<NamedOnnxValue>
        {
            NamedOnnxValue.CreateFromTensor(_inputName!, inputTensor)
        };

        progress?.Report((45, "AI 추론 중..."));
        using var results = _session!.Run(inputs);
        var output = FindMaskTensor(results);

        progress?.Report((65, "마스크 생성 중..."));
        using var mask = BuildMask(output, origW, origH, progress);
        RefineMaskEdges(mask);

        progress?.Report((85, "배경 제거 적용 중..."));
        var result = source.CloneAs<Rgba32>();
        ApplyMask(result, mask, progress);
        progress?.Report((100, "AI 배경 제거 완료"));
        return result;
    }

    /// <summary>PIL Image.convert("RGB")와 동일 — 투명 영역은 검정 배경.</summary>
    private static Image<Rgba32> ToRgbOnBlack(Image<Rgba32> source)
    {
        var flat = new Image<Rgba32>(source.Width, source.Height);
        flat.Mutate(ctx =>
        {
            ctx.BackgroundColor(SixLabors.ImageSharp.Color.Black);
            ctx.DrawImage(source, new SixLabors.ImageSharp.Point(0, 0), 1f);
        });
        return flat;
    }

    /// <summary>rembg BaseSession.normalize — 0~255 픽셀을 전역 최댓값으로 나눈 뒤 ImageNet 정규화.</summary>
    private DenseTensor<float> BuildInputTensor(Image<Rgba32> image, IProgress<(int percent, string message)>? progress)
    {
        int size = _model.InputSize;
        float maxPixel = 1e-6f;
        for (int y = 0; y < size; y++)
        {
            for (int x = 0; x < size; x++)
            {
                var p = image[x, y];
                maxPixel = Math.Max(maxPixel, Math.Max(p.R, Math.Max(p.G, p.B)));
            }
        }

        var tensor = new DenseTensor<float>([1, 3, size, size]);
        for (int y = 0; y < size; y++)
        {
            for (int x = 0; x < size; x++)
            {
                var p = image[x, y];
                float r = p.R / maxPixel;
                float g = p.G / maxPixel;
                float b = p.B / maxPixel;
                tensor[0, 0, y, x] = (r - Mean[0]) / Std[0];
                tensor[0, 1, y, x] = (g - Mean[1]) / Std[1];
                tensor[0, 2, y, x] = (b - Mean[2]) / Std[2];
            }

            if (y % 64 == 0)
            {
                int pct = 15 + y * 10 / Math.Max(1, size);
                progress?.Report((pct, "이미지 전처리 중..."));
            }
        }
        return tensor;
    }

    private Tensor<float> FindMaskTensor(IDisposableReadOnlyCollection<DisposableNamedOnnxValue> results)
    {
        if (_outputName is not null)
        {
            foreach (var r in results)
            {
                if (r.Name == _outputName)
                    return r.AsTensor<float>().Clone();
            }
        }

        return results.First().AsTensor<float>().Clone();
    }

    /// <summary>rembg predict — output[:,0,:,:], min-max, 0~255 마스크.</summary>
    private Image<L8> BuildMask(Tensor<float> output, int targetW, int targetH, IProgress<(int percent, string message)>? progress)
    {
        int h, w;
        float min = float.MaxValue, max = float.MinValue;

        if (output.Dimensions.Length == 4)
        {
            h = (int)output.Dimensions[2];
            w = (int)output.Dimensions[3];
            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    float v = output[0, 0, y, x];
                    min = Math.Min(min, v);
                    max = Math.Max(max, v);
                }
            }
        }
        else
        {
            h = (int)output.Dimensions[^2];
            w = (int)output.Dimensions[^1];
            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    float v = output[y, x];
                    min = Math.Min(min, v);
                    max = Math.Max(max, v);
                }
            }
        }

        float range = Math.Max(max - min, 1e-8f);
        var maskSmall = new Image<L8>(w, h);

        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                float raw = output.Dimensions.Length == 4
                    ? output[0, 0, y, x]
                    : output[y, x];

                float normalized = Math.Clamp((raw - min) / range, 0f, 1f);
                maskSmall[x, y] = new L8((byte)(normalized * 255));
            }

            if (y % 16 == 0)
            {
                int pct = 65 + y * 15 / Math.Max(1, h);
                progress?.Report((pct, "마스크 생성 중..."));
            }
        }

        progress?.Report((80, "마스크 크기 조정 중..."));
        maskSmall.Mutate(x => x.Resize(targetW, targetH, KnownResamplers.Lanczos3));
        return maskSmall;
    }

    /// <summary>마스크 경계 부드럽게 (rembg post_process_mask 경량 버전).</summary>
    private static void RefineMaskEdges(Image<L8> mask)
    {
        mask.Mutate(x => x.GaussianBlur(0.6f));
    }

    /// <summary>rembg putalpha — 마스크를 알파 채널로 적용.</summary>
    private static void ApplyMask(Image<Rgba32> image, Image<L8> mask, IProgress<(int percent, string message)>? progress)
    {
        image.ProcessPixelRows(mask, (imageAccessor, maskAccessor) =>
        {
            for (int y = 0; y < imageAccessor.Height; y++)
            {
                var imgRow = imageAccessor.GetRowSpan(y);
                var maskRow = maskAccessor.GetRowSpan(y);
                for (int x = 0; x < imgRow.Length; x++)
                {
                    ref var p = ref imgRow[x];
                    byte alpha = maskRow[x].PackedValue;
                    p = new Rgba32(p.R, p.G, p.B, alpha);
                }

                if (y % 64 == 0)
                {
                    int pct = 85 + y * 14 / Math.Max(1, imageAccessor.Height);
                    progress?.Report((pct, "배경 제거 적용 중..."));
                }
            }
        });
    }

    public void Dispose()
    {
        lock (_lock)
        {
            _session?.Dispose();
            _session = null;
            _inputName = null;
            _outputName = null;
        }
    }
}
