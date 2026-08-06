using System.Reflection;

namespace FileMasterWinV10.Helpers;

public static class AppInfo
{
    /// <summary>창 제목, 작업 표시줄 등 UI 표시 이름.</summary>
    public const string DisplayName = "Command Center";

    /// <summary>실행 파일 이름(확장자 제외).</summary>
    public const string ExecutableName = "CommandCenter";

    /// <summary>%AppData% 하위 설정 폴더 이름.</summary>
    public const string AppDataFolderName = "CommandCenter";

    /// <summary>어셈블리 버전(예: 1.0.0.0).</summary>
    public static string Version =>
        Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "1.0.0.0";

    /// <summary>빌드 시각(csproj에서 AssemblyMetadata로 주입, UTC).</summary>
    public static string BuildDate =>
        Assembly.GetExecutingAssembly()
            .GetCustomAttributes<AssemblyMetadataAttribute>()
            .FirstOrDefault(a => a.Key == "BuildTimestamp")?.Value is { Length: > 0 } ts
            ? ts
            : "-";
}
