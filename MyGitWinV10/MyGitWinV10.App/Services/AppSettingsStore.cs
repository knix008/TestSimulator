using System.Text.Json;

namespace MyGitWinV10.App.Services;

public sealed class AppSettingsStore
{
    public const int MaxRecentRepositories = 10;

    private static readonly string SettingsDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "MyGitWinV10");
    private static readonly string SettingsFile = Path.Combine(SettingsDirectory, "settings.json");

    public string? LastRepositoryPath { get; set; }

    public List<string> RecentRepositoryPaths { get; set; } = [];

    public static AppSettingsStore Load()
    {
        try
        {
            if (!File.Exists(SettingsFile))
            {
                return new AppSettingsStore();
            }

            var json = File.ReadAllText(SettingsFile);
            var store = JsonSerializer.Deserialize<AppSettingsStore>(json) ?? new AppSettingsStore();
            store.EnsureRecentFromLegacy();
            return store;
        }
        catch
        {
            return new AppSettingsStore();
        }
    }

    public void Save()
    {
        try
        {
            Directory.CreateDirectory(SettingsDirectory);
            var json = JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(SettingsFile, json);
        }
        catch
        {
            // Best-effort persistence.
        }
    }

    public void RecordRecentRepository(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return;
        }

        try
        {
            path = Path.GetFullPath(path);
        }
        catch
        {
            return;
        }

        RecentRepositoryPaths.RemoveAll(existing =>
            string.Equals(existing, path, StringComparison.OrdinalIgnoreCase));
        RecentRepositoryPaths.Insert(0, path);

        if (RecentRepositoryPaths.Count > MaxRecentRepositories)
        {
            RecentRepositoryPaths.RemoveRange(MaxRecentRepositories, RecentRepositoryPaths.Count - MaxRecentRepositories);
        }

        LastRepositoryPath = path;
    }

    public void RemoveRecentRepository(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return;
        }

        if (RecentRepositoryPaths.RemoveAll(existing =>
                string.Equals(existing, path, StringComparison.OrdinalIgnoreCase)) > 0
            && string.Equals(LastRepositoryPath, path, StringComparison.OrdinalIgnoreCase))
        {
            LastRepositoryPath = RecentRepositoryPaths.FirstOrDefault();
        }
    }

    private void EnsureRecentFromLegacy()
    {
        if (string.IsNullOrWhiteSpace(LastRepositoryPath))
        {
            return;
        }

        if (RecentRepositoryPaths.Any(path =>
                string.Equals(path, LastRepositoryPath, StringComparison.OrdinalIgnoreCase)))
        {
            return;
        }

        RecentRepositoryPaths.Insert(0, LastRepositoryPath);
        if (RecentRepositoryPaths.Count > MaxRecentRepositories)
        {
            RecentRepositoryPaths.RemoveRange(MaxRecentRepositories, RecentRepositoryPaths.Count - MaxRecentRepositories);
        }
    }
}
