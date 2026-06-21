using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace MyGitWinV10.App.Services;

public sealed class LastSuccessfulSession
{
    public const string ModeLocal = "local";
    public const string ModeRemote = "remote";

    public string Mode { get; set; } = ModeLocal;

    public string Path { get; set; } = "";

    public string? RemoteUrl { get; set; }

    [JsonIgnore]
    public bool IsRemote =>
        string.Equals(Mode, ModeRemote, StringComparison.OrdinalIgnoreCase);
}

public sealed class AppSettingsStore
{
    public const int MaxRecentRepositories = 10;
    public const int MaxRecentCloneUrls = 10;
    public const int MaxCommitCategories = 30;

    private static readonly string SettingsDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "MyGitWinV10");
    private static readonly string SettingsFile = Path.Combine(SettingsDirectory, "settings.json");

    public string? LastRepositoryPath { get; set; }

    public LastSuccessfulSession? LastSuccessfulSession { get; set; }

    public List<string> RecentRepositoryPaths { get; set; } = [];

    // Records every clone URL the user has typed, whether the clone succeeded or failed —
    // a failed attempt shouldn't force the user to retype the same URL next time.
    public List<string> RecentCloneUrls { get; set; } = [];

    public List<string> CommitCategories { get; set; } = [];

    // PAT is encrypted with Windows DPAPI (current user + machine) before it touches disk —
    // settings.json itself stays plain JSON, so the token must never be written in the clear.
    public string? GitHubUsername { get; set; }

    public string? GitHubTokenProtected { get; set; }

    public void SetGitHubCredentials(string? username, string? token)
    {
        GitHubUsername = string.IsNullOrWhiteSpace(username) ? null : username.Trim();
        GitHubTokenProtected = string.IsNullOrWhiteSpace(token) ? null : ProtectToken(token);
    }

    public string? GetGitHubToken()
    {
        if (string.IsNullOrWhiteSpace(GitHubTokenProtected))
        {
            return null;
        }

        try
        {
            byte[] protectedBytes = Convert.FromBase64String(GitHubTokenProtected);
            byte[] bytes = ProtectedData.Unprotect(protectedBytes, optionalEntropy: null, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(bytes);
        }
        catch
        {
            return null;
        }
    }

    private static string ProtectToken(string token)
    {
        byte[] bytes = Encoding.UTF8.GetBytes(token);
        byte[] protectedBytes = ProtectedData.Protect(bytes, optionalEntropy: null, DataProtectionScope.CurrentUser);
        return Convert.ToBase64String(protectedBytes);
    }

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
            store.EnsureLastSuccessfulSessionFromLegacy();
            store.EnsureCommitCategoriesInitialized();
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

    public void RecordSuccessfulLocalSession(string path)
    {
        RecordRecentRepository(path);
        if (!TryNormalizeRepositoryPath(path, out var normalizedPath))
        {
            return;
        }

        LastSuccessfulSession = new LastSuccessfulSession
        {
            Mode = LastSuccessfulSession.ModeLocal,
            Path = normalizedPath
        };
    }

    public void RecordSuccessfulRemoteBrowseSession(string cachePath, string remoteUrl)
    {
        if (string.IsNullOrWhiteSpace(remoteUrl)
            || !TryNormalizeRepositoryPath(cachePath, out var normalizedPath))
        {
            return;
        }

        LastSuccessfulSession = new LastSuccessfulSession
        {
            Mode = LastSuccessfulSession.ModeRemote,
            Path = normalizedPath,
            RemoteUrl = remoteUrl.Trim().TrimEnd('/')
        };
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

        if (LastSuccessfulSession is not null
            && string.Equals(LastSuccessfulSession.Path, path, StringComparison.OrdinalIgnoreCase))
        {
            LastSuccessfulSession = null;
        }
    }

    public void RecordRecentCloneUrl(string url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return;
        }

        RecentCloneUrls.RemoveAll(existing => string.Equals(existing, url, StringComparison.OrdinalIgnoreCase));
        RecentCloneUrls.Insert(0, url);

        if (RecentCloneUrls.Count > MaxRecentCloneUrls)
        {
            RecentCloneUrls.RemoveRange(MaxRecentCloneUrls, RecentCloneUrls.Count - MaxRecentCloneUrls);
        }
    }

    public void RemoveRecentCloneUrl(string url)
    {
        RecentCloneUrls.RemoveAll(existing => string.Equals(existing, url, StringComparison.OrdinalIgnoreCase));
    }

    public IReadOnlyList<string> GetCommitCategories()
    {
        EnsureCommitCategoriesInitialized();
        return CommitCategories;
    }

    public void SetCommitCategories(IEnumerable<string> categories)
    {
        CommitCategories = NormalizeCategoryList(categories);
    }

    public void RecordCommitCategory(string category)
    {
        if (string.IsNullOrWhiteSpace(category))
        {
            return;
        }

        category = category.Trim();
        EnsureCommitCategoriesInitialized();
        CommitCategories.RemoveAll(existing =>
            string.Equals(existing, category, StringComparison.OrdinalIgnoreCase));
        CommitCategories.Insert(0, category);

        if (CommitCategories.Count > MaxCommitCategories)
        {
            CommitCategories.RemoveRange(MaxCommitCategories, CommitCategories.Count - MaxCommitCategories);
        }
    }

    public void ResetCommitCategoriesToDefaults()
    {
        CommitCategories = CommitMessageFormatter.DefaultCategories.ToList();
    }

    private void EnsureCommitCategoriesInitialized()
    {
        if (CommitCategories.Count > 0)
        {
            return;
        }

        CommitCategories.AddRange(CommitMessageFormatter.DefaultCategories);
    }

    private static List<string> NormalizeCategoryList(IEnumerable<string> categories)
    {
        var normalized = new List<string>();
        foreach (string category in categories)
        {
            string trimmed = category.Trim();
            if (string.IsNullOrWhiteSpace(trimmed))
            {
                continue;
            }

            if (normalized.Any(existing =>
                    string.Equals(existing, trimmed, StringComparison.OrdinalIgnoreCase)))
            {
                continue;
            }

            normalized.Add(trimmed);
        }

        return normalized;
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

    private void EnsureLastSuccessfulSessionFromLegacy()
    {
        if (LastSuccessfulSession is not null
            && !string.IsNullOrWhiteSpace(LastSuccessfulSession.Path))
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(LastRepositoryPath))
        {
            return;
        }

        LastSuccessfulSession = new LastSuccessfulSession
        {
            Mode = LastSuccessfulSession.ModeLocal,
            Path = LastRepositoryPath
        };
    }

    private static bool TryNormalizeRepositoryPath(string path, out string normalizedPath)
    {
        normalizedPath = string.Empty;
        if (string.IsNullOrWhiteSpace(path))
        {
            return false;
        }

        try
        {
            normalizedPath = Path.GetFullPath(path);
            return true;
        }
        catch
        {
            return false;
        }
    }
}
