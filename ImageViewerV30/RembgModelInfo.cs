using System.IO;

namespace ImageViewerV30;

/// <summary>rembg 공식 ONNX 모델 정의 (https://github.com/danielgatis/rembg).</summary>
public sealed class RembgModelInfo
{
    public required string Id { get; init; }
    public required string DisplayName { get; init; }
    public required string FileName { get; init; }
    public required string DownloadUrl { get; init; }
    public required int InputSize { get; init; }
    public string? Md5Hex { get; init; }
    public string? Sha256Hex { get; init; }

    /// <summary>rembg RMBG 2.0 (bria-rmbg-2.0.onnx) — rembg2 권장 모델.</summary>
    public static RembgModelInfo BriaRmbg2 { get; } = new()
    {
        Id = "bria-rmbg-2.0",
        DisplayName = "RMBG 2.0 (rembg2)",
        FileName = "bria-rmbg-2.0.onnx",
        DownloadUrl = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/bria-rmbg-2.0.onnx",
        InputSize = 1024,
        Sha256Hex = "5b486f08200f513f460da46dd701db5fbb47d79b4be4b708a19444bcd4e79958"
    };

    /// <summary>rembg 기본 u2net 모델 (경량).</summary>
    public static RembgModelInfo U2Net { get; } = new()
    {
        Id = "u2net",
        DisplayName = "u2net (기본)",
        FileName = "u2net.onnx",
        DownloadUrl = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx",
        InputSize = 320,
        Md5Hex = "60024c5c889badc19c04ad937298a77b"
    };

    /// <summary>목록 순서 = UI 기본 선택 (u2net이 가볍고 안정적).</summary>
    public static IReadOnlyList<RembgModelInfo> All { get; } = [U2Net, BriaRmbg2];

    public static RembgModelInfo? FindById(string id)
    {
        foreach (var m in All)
            if (m.Id == id) return m;
        return null;
    }

    public static string GetPath(string modelsDirectory, RembgModelInfo model) =>
        Path.Combine(modelsDirectory, model.FileName);

    public override string ToString() => DisplayName;
}
