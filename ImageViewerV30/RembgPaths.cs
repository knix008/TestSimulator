using System.IO;

namespace ImageViewerV30;

/// <summary>rembg ONNX 모델 경로 (MSI 설치 폴더는 쓰기 불가 → 사용자 로컬 데이터 사용).</summary>
public static class RembgPaths
{
    private static string? _writableModelsDir;

    /// <summary>다운로드·캐시용 쓰기 가능 경로 (%LocalAppData%\ImageViewerV30\models).</summary>
    public static string WritableModelsDirectory
    {
        get
        {
            if (_writableModelsDir is not null)
                return _writableModelsDir;

            _writableModelsDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "ImageViewerV30",
                "models");
            return _writableModelsDir;
        }
    }

    /// <summary>설치 폴더 내 models (읽기 전용, 수동 배포 시).</summary>
    public static string BundledModelsDirectory =>
        Path.Combine(AppContext.BaseDirectory, "models");

    /// <summary>모델 조회·다운로드에 사용할 실제 경로.</summary>
    public static string GetModelFilePath(RembgModelInfo model)
    {
        string writable = Path.Combine(WritableModelsDirectory, model.FileName);
        if (File.Exists(writable))
            return writable;

        string bundled = Path.Combine(BundledModelsDirectory, model.FileName);
        if (File.Exists(bundled))
            return bundled;

        return writable;
    }

    public static bool IsModelInstalled(RembgModelInfo model) =>
        File.Exists(GetModelFilePath(model));

    public static void EnsureWritableModelsDirectory()
    {
        Directory.CreateDirectory(WritableModelsDirectory);
    }
}
