using System.IO;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace ImageViewerV30;

/// <summary>
/// rembg 공식 ONNX 모델로 배경 제거 (RMBG 2.0 / u2net).
/// </summary>
public sealed class RembgBackgroundRemover : IDisposable
{
    private RembgSegmentationService? _onnx;
    private string? _loadedModelId;

    public RembgModelInfo Model { get; set; } = RembgModelInfo.U2Net;

    public static string ModelsDirectory => RembgPaths.WritableModelsDirectory;

    public static bool IsModelInstalled(RembgModelInfo? model = null) =>
        RembgPaths.IsModelInstalled(model ?? RembgModelInfo.U2Net);

    public static string DescribeEngine(RembgModelInfo? model = null)
    {
        var m = model ?? RembgModelInfo.U2Net;
        return IsModelInstalled(m)
            ? $"rembg ONNX ({m.FileName})"
            : $"rembg ONNX ({m.FileName}) — 다운로드 필요";
    }

    public async Task<Image<Rgba32>> RemoveBackgroundAsync(
        Image<Rgba32> source,
        IProgress<(int percent, string message)>? progress = null)
    {
        progress?.Report((5, $"{Model.DisplayName} 모델 준비 중..."));
        string modelPath = await EnsureModelInstalledAsync(Model, progress);
        EnsureSession(modelPath);
        return _onnx!.RemoveBackground(source, progress);
    }

    public void InvalidateSession()
    {
        _onnx?.Dispose();
        _onnx = null;
        _loadedModelId = null;
    }

    public static Task<string> EnsureModelInstalledAsync(
        RembgModelInfo model,
        IProgress<(int percent, string message)>? progress = null)
    {
        RembgPaths.EnsureWritableModelsDirectory();
        return DownloadRembgModel.DownloadModelIfNotExistsAsync(model, ModelsDirectory, progress);
    }

    public static Task<string> EnsureModelInstalledAsync(IProgress<(int percent, string message)>? progress = null) =>
        EnsureModelInstalledAsync(RembgModelInfo.U2Net, progress);

    private void EnsureSession(string modelPath)
    {
        if (_onnx is not null && _loadedModelId == Model.Id)
            return;

        _onnx?.Dispose();
        _onnx = new RembgSegmentationService(modelPath, Model);
        _loadedModelId = Model.Id;
    }

    public void Dispose()
    {
        _onnx?.Dispose();
        _onnx = null;
        _loadedModelId = null;
    }
}
