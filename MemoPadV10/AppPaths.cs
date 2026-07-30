namespace MemoPadV10;

/// <summary>앱 데이터 루트. 테스트에서 임시 폴더로 바꿀 수 있습니다.</summary>
internal static class AppPaths
{
    private static string? _rootOverride;

    public static string Root =>
        _rootOverride
        ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MemoPadV10");

    /// <summary>테스트에서 MessageBox 등을 띄우지 않습니다.</summary>
    public static bool SuppressUiDialogs { get; set; }

    /// <summary>테스트용 루트를 설정합니다. null이면 기본 LocalAppData 경로로 복원합니다.</summary>
    public static void SetRootOverride(string? rootDirectory)
    {
        _rootOverride = string.IsNullOrWhiteSpace(rootDirectory) ? null : rootDirectory;
    }

    public static string Combine(params string[] segments) =>
        Path.Combine(new[] { Root }.Concat(segments).ToArray());
}
