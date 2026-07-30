namespace MemoPadV10.Tests;

/// <summary>실제 LocalAppData를 건드리지 않도록 임시 폴더로 앱 경로를 격리합니다.</summary>
internal sealed class AppDataIsolation : IDisposable
{
    private readonly string _root;

    private AppDataIsolation(string root)
    {
        _root = root;
        Directory.CreateDirectory(_root);
        AppPaths.SetRootOverride(_root);
        AppPaths.SuppressUiDialogs = true;
    }

    public string Root => _root;

    public static AppDataIsolation Begin()
    {
        string root = Path.Combine(Path.GetTempPath(), "MemoPadV10.Tests", Guid.NewGuid().ToString("N"));
        return new AppDataIsolation(root);
    }

    public void Dispose()
    {
        AppPaths.SetRootOverride(null);
        AppPaths.SuppressUiDialogs = false;
        try
        {
            if (Directory.Exists(_root))
            {
                Directory.Delete(_root, recursive: true);
            }
        }
        catch
        {
            // ignore cleanup failures
        }
    }
}
