using System.Text.Json;
using System.Windows.Forms;
using MyProject.Theme;

namespace MyProject.Models
{
    public static class AppSettings
    {
        public static string UserDataFolder => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MyProject");

        private static string SettingsPath => Path.Combine(UserDataFolder, "settings.json");

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            WriteIndented = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        public static string LastDirectory { get; private set; } = GetDefaultDirectory();
        public static DependencyType DefaultDependencyType { get; private set; } = DependencyType.FS;
        public static int[] TaskGridColumnWidths { get; private set; } = DefaultTaskGridColumnWidths();
        public static bool RestoreLastSession { get; private set; } = true;
        public static string? LastSessionProjectPath { get; private set; }
        public static bool LastSessionIsRecovery { get; private set; }
        public static bool HasSavedWindowBounds { get; private set; }
        public static int? WindowX { get; private set; }
        public static int? WindowY { get; private set; }
        public static int WindowWidth { get; private set; } = 1280;
        public static int WindowHeight { get; private set; } = 720;
        public static FormWindowState WindowState { get; private set; } = FormWindowState.Normal;
        public static IReadOnlyList<string> RecentFiles { get; private set; } = Array.Empty<string>();
        public static IReadOnlyList<DatabaseConnectionProfile> DatabaseProfiles { get; private set; } = Array.Empty<DatabaseConnectionProfile>();
        public static string? LastDatabaseProfileId { get; private set; }
        public static bool DatabaseAutoRefreshEnabled { get; private set; } = true;
        public const int DatabaseAutoRefreshIntervalSeconds = 5;
        public static string? DatabaseEditorName { get; private set; }
        public static AppLanguage UiLanguage { get; private set; } = AppLanguage.Korean;
        public static bool GanttExportTransparentBackground { get; private set; }

        public const int MaxRecentFiles = 10;

        private static string RecoveryProjectPath => Path.Combine(UserDataFolder, "session_recovery.myprj");

        public static bool HasUserData =>
            File.Exists(SettingsPath) || File.Exists(RecoveryProjectPath);

        public static void PurgeUserData()
        {
            if (!Directory.Exists(UserDataFolder))
                return;

            try
            {
                Directory.Delete(UserDataFolder, recursive: true);
            }
            catch
            {
                foreach (var file in Directory.EnumerateFiles(UserDataFolder, "*", SearchOption.AllDirectories))
                {
                    try { File.Delete(file); } catch { /* best effort */ }
                }
            }
        }

        private static int[] DefaultTaskGridColumnWidths() =>
            new[] { 36, 220, 72, 40, 96, 84, 68, 132 };

        public static void Load()
        {
            if (DesignTime.IsActive)
                return;

            if (!File.Exists(SettingsPath))
                return;

            var json = File.ReadAllText(SettingsPath, System.Text.Encoding.UTF8);
            var data = JsonSerializer.Deserialize<SettingsData>(json, JsonOptions);
            if (data == null)
                return;

            if (!string.IsNullOrWhiteSpace(data.LastDirectory) && Directory.Exists(data.LastDirectory))
                LastDirectory = data.LastDirectory;

            if (Enum.TryParse<DependencyType>(data.DefaultDependencyType, out var depType))
                DefaultDependencyType = depType;

            if (data.TaskGridColumnWidths is { Length: >= 7 })
                TaskGridColumnWidths = SanitizeColumnWidths(data.TaskGridColumnWidths);

            RestoreLastSession = data.RestoreLastSession ?? true;
            LastSessionProjectPath = string.IsNullOrWhiteSpace(data.LastSessionProjectPath)
                ? null
                : data.LastSessionProjectPath;
            LastSessionIsRecovery = data.LastSessionIsRecovery;
            HasSavedWindowBounds = data.WindowWidth is > 0 && data.WindowHeight is > 0;
            if (data.WindowWidth is > 0)
                WindowWidth = data.WindowWidth.Value;
            if (data.WindowHeight is > 0)
                WindowHeight = data.WindowHeight.Value;
            if (data.WindowX is >= -10000 and <= 10000)
                WindowX = data.WindowX;
            if (data.WindowY is >= -10000 and <= 10000)
                WindowY = data.WindowY;
            if (Enum.TryParse<FormWindowState>(data.WindowState, out var windowState)
                && windowState is FormWindowState.Normal or FormWindowState.Maximized)
                WindowState = windowState;

            if (data.RecentFiles is { Count: > 0 })
            {
                var loaded = new List<string>();
                foreach (var path in data.RecentFiles)
                {
                    if (string.IsNullOrWhiteSpace(path))
                        continue;

                    try
                    {
                        string fullPath = Path.GetFullPath(path);
                        if (!File.Exists(fullPath))
                            continue;
                        if (loaded.Any(p => string.Equals(p, fullPath, StringComparison.OrdinalIgnoreCase)))
                            continue;
                        loaded.Add(fullPath);
                    }
                    catch
                    {
                        // skip invalid paths
                    }

                    if (loaded.Count >= MaxRecentFiles)
                        break;
                }

                RecentFiles = loaded.ToArray();
            }

            if (data.DatabaseProfiles is { Count: > 0 })
            {
                DatabaseProfiles = data.DatabaseProfiles
                    .Where(p => !string.IsNullOrWhiteSpace(p.Id))
                    .Select(p => new DatabaseConnectionProfile
                    {
                        Id = p.Id,
                        Name = string.IsNullOrWhiteSpace(p.Name) ? "Default" : p.Name,
                        Provider = Enum.TryParse<DatabaseProviderKind>(p.Provider, out var provider)
                            ? provider
                            : DatabaseProviderKind.MariaDb,
                        Server = p.Server ?? "localhost",
                        Port = p.Port ?? DatabaseProviderInfo.GetDefaultPort(DatabaseProviderKind.MariaDb),
                        Database = p.Database ?? "myproject",
                        UserName = p.UserName ?? "",
                        EncryptedPassword = p.EncryptedPassword ?? ""
                    })
                    .ToArray();
            }

            if (!string.IsNullOrWhiteSpace(data.LastDatabaseProfileId))
                LastDatabaseProfileId = data.LastDatabaseProfileId;

            if (data.DatabaseAutoRefreshEnabled.HasValue)
                DatabaseAutoRefreshEnabled = data.DatabaseAutoRefreshEnabled.Value;

            if (!string.IsNullOrWhiteSpace(data.DatabaseEditorName))
                DatabaseEditorName = data.DatabaseEditorName.Trim();

            if (!string.IsNullOrWhiteSpace(data.UiLanguage))
                UiLanguage = AppLanguageExtensions.Parse(data.UiLanguage);

            if (data.GanttExportTransparentBackground.HasValue)
                GanttExportTransparentBackground = data.GanttExportTransparentBackground.Value;
        }

        public static void Save()
        {
            if (DesignTime.IsActive)
                return;

            var directory = Path.GetDirectoryName(SettingsPath);
            if (!string.IsNullOrEmpty(directory))
                Directory.CreateDirectory(directory);

            var data = new SettingsData
            {
                LastDirectory = LastDirectory,
                DefaultDependencyType = DefaultDependencyType.ToString(),
                TaskGridColumnWidths = TaskGridColumnWidths,
                RestoreLastSession = RestoreLastSession,
                LastSessionProjectPath = LastSessionProjectPath,
                LastSessionIsRecovery = LastSessionIsRecovery,
                WindowX = WindowX,
                WindowY = WindowY,
                WindowWidth = HasSavedWindowBounds ? WindowWidth : null,
                WindowHeight = HasSavedWindowBounds ? WindowHeight : null,
                WindowState = WindowState.ToString(),
                RecentFiles = RecentFiles.Count > 0 ? RecentFiles.ToList() : null,
                DatabaseProfiles = DatabaseProfiles.Count > 0
                    ? DatabaseProfiles.Select(p => new DatabaseProfileData
                    {
                        Id = p.Id,
                        Name = p.Name,
                        Provider = p.Provider.ToString(),
                        Server = p.Server,
                        Port = p.Port,
                        Database = p.Database,
                        UserName = p.UserName,
                        EncryptedPassword = p.EncryptedPassword
                    }).ToList()
                    : null,
                LastDatabaseProfileId = LastDatabaseProfileId,
                DatabaseAutoRefreshEnabled = DatabaseAutoRefreshEnabled,
                DatabaseEditorName = DatabaseEditorName,
                UiLanguage = UiLanguage.ToStorageCode(),
                GanttExportTransparentBackground = GanttExportTransparentBackground
            };
            var json = JsonSerializer.Serialize(data, JsonOptions);
            File.WriteAllText(SettingsPath, json, System.Text.Encoding.UTF8);
        }

        public static void RememberFromPath(string? filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
                return;

            var directory = Path.GetDirectoryName(filePath);
            if (string.IsNullOrWhiteSpace(directory) || !Directory.Exists(directory))
                return;

            if (string.Equals(LastDirectory, directory, StringComparison.OrdinalIgnoreCase))
                return;

            LastDirectory = directory;
            Save();
        }

        public static void RememberRecentFile(string? filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
                return;

            string fullPath = Path.GetFullPath(filePath);
            var list = RecentFiles.ToList();
            list.RemoveAll(p => string.Equals(p, fullPath, StringComparison.OrdinalIgnoreCase));
            list.Insert(0, fullPath);
            if (list.Count > MaxRecentFiles)
                list.RemoveRange(MaxRecentFiles, list.Count - MaxRecentFiles);

            RecentFiles = list.ToArray();
            Save();
        }

        public static void RemoveRecentFile(string? filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
                return;

            string fullPath = Path.GetFullPath(filePath);
            var list = RecentFiles
                .Where(p => !string.Equals(p, fullPath, StringComparison.OrdinalIgnoreCase))
                .ToArray();
            if (list.Length == RecentFiles.Count)
                return;

            RecentFiles = list;
            Save();
        }

        public static void PruneMissingRecentFiles()
        {
            var list = RecentFiles.Where(File.Exists).ToArray();
            if (list.Length == RecentFiles.Count)
                return;

            RecentFiles = list;
            Save();
        }

        public static void RememberTaskGridColumnWidths(int[] widths)
        {
            var sanitized = SanitizeColumnWidths(widths);
            if (sanitized.SequenceEqual(TaskGridColumnWidths))
                return;

            TaskGridColumnWidths = sanitized;
            Save();
        }

        private static int[] SanitizeColumnWidths(int[] widths)
        {
            var defaults = DefaultTaskGridColumnWidths();
            widths = MigrateLegacyColumnWidths(widths, defaults.Length);
            var result = new int[defaults.Length];
            for (int i = 0; i < result.Length; i++)
            {
                int value = i < widths.Length ? widths[i] : defaults[i];
                result[i] = Math.Clamp(value, GetMinColumnWidth(i), 800);
            }
            return result;
        }

        private static int[] MigrateLegacyColumnWidths(int[] widths, int targetLength)
        {
            if (widths.Length >= targetLength)
                return widths;

            if (widths.Length == 7 && targetLength == 8)
            {
                var defaults = DefaultTaskGridColumnWidths();
                return new[] { widths[0], widths[1], widths[2], widths[3], widths[4], widths[5], defaults[6], widths[6] };
            }

            return widths;
        }

        private static int GetMinColumnWidth(int columnIndex) => columnIndex switch
        {
            0 => 32,   // ID
            1 => 100,  // Task Name
            2 => 68,   // Start
            3 => 36,   // Days
            4 => 80,   // Progress
            5 => 60,   // Resource
            6 => 60,   // Alloc %
            7 => 56,   // Deliverable
            _ => 24
        };

        public static int[] GetMinColumnWidths()
        {
            var defaults = DefaultTaskGridColumnWidths();
            return Enumerable.Range(0, defaults.Length).Select(GetMinColumnWidth).ToArray();
        }

        public static void RememberDependencyType(DependencyType type)
        {
            if (DefaultDependencyType == type)
                return;

            DefaultDependencyType = type;
            Save();
        }

        public static string GetRecoveryProjectPath() => RecoveryProjectPath;

        public static void RememberSession(string? projectPath, bool isRecovery)
        {
            RestoreLastSession = true;
            LastSessionProjectPath = string.IsNullOrWhiteSpace(projectPath) ? null : projectPath;
            LastSessionIsRecovery = isRecovery;
            Save();
        }

        public static void RememberWindowBounds(int x, int y, int width, int height, FormWindowState state)
        {
            width = Math.Clamp(width, 800, 10000);
            height = Math.Clamp(height, 500, 10000);

            WindowX = x;
            WindowY = y;
            WindowWidth = width;
            WindowHeight = height;
            WindowState = state is FormWindowState.Maximized
                ? FormWindowState.Maximized
                : FormWindowState.Normal;
            HasSavedWindowBounds = true;
        }

        public static void ClearSession()
        {
            LastSessionProjectPath = null;
            LastSessionIsRecovery = false;
            Save();
        }

        public static bool TryGetSessionProjectPath(out string path)
        {
            if (!RestoreLastSession
                || string.IsNullOrWhiteSpace(LastSessionProjectPath)
                || !File.Exists(LastSessionProjectPath))
            {
                path = "";
                return false;
            }

            path = LastSessionProjectPath;
            return true;
        }

        public static DatabaseConnectionProfile? GetDatabaseProfile(string? profileId)
        {
            if (string.IsNullOrWhiteSpace(profileId))
                return null;

            return DatabaseProfiles.FirstOrDefault(p => string.Equals(p.Id, profileId, StringComparison.Ordinal));
        }

        public static DatabaseConnectionProfile? GetLastDatabaseProfile() =>
            GetDatabaseProfile(LastDatabaseProfileId) ?? DatabaseProfiles.FirstOrDefault();

        public static void RememberDatabaseProfile(DatabaseConnectionProfile profile)
        {
            var list = DatabaseProfiles.ToList();
            int index = list.FindIndex(p => string.Equals(p.Id, profile.Id, StringComparison.Ordinal));
            var stored = profile.Clone();
            if (index >= 0)
                list[index] = stored;
            else
                list.Add(stored);

            DatabaseProfiles = list.ToArray();
            LastDatabaseProfileId = stored.Id;
            Save();
        }

        public static void RememberLastDatabaseProfile(string profileId)
        {
            if (string.IsNullOrWhiteSpace(profileId))
                return;

            if (string.Equals(LastDatabaseProfileId, profileId, StringComparison.Ordinal))
                return;

            LastDatabaseProfileId = profileId;
            Save();
        }

        public static void SetDatabaseAutoRefreshEnabled(bool enabled)
        {
            if (DatabaseAutoRefreshEnabled == enabled)
                return;

            DatabaseAutoRefreshEnabled = enabled;
            Save();
        }

        public static void SetGanttExportTransparentBackground(bool enabled)
        {
            if (GanttExportTransparentBackground == enabled)
                return;

            GanttExportTransparentBackground = enabled;
            Save();
        }

        public static void SetUiLanguage(AppLanguage language)
        {
            if (UiLanguage == language)
                return;

            UiLanguage = language;
            Save();
            AppLocalizer.Apply(language);
        }

        public static string GetDatabaseEditorName()
        {
            if (!string.IsNullOrWhiteSpace(DatabaseEditorName))
                return DatabaseEditorName.Trim();

            return $"{Environment.UserName}@{Environment.MachineName}";
        }

        public static void RemoveDatabaseProfile(string profileId)
        {
            var list = DatabaseProfiles.Where(p => !string.Equals(p.Id, profileId, StringComparison.Ordinal)).ToArray();
            if (list.Length == DatabaseProfiles.Count)
                return;

            DatabaseProfiles = list;
            if (string.Equals(LastDatabaseProfileId, profileId, StringComparison.Ordinal))
                LastDatabaseProfileId = list.FirstOrDefault()?.Id;
            Save();
        }

        public static void ApplyTo(FileDialog dialog)
        {
            dialog.InitialDirectory = GetValidDirectory();
        }

        private static string GetValidDirectory() =>
            Directory.Exists(LastDirectory) ? LastDirectory : GetDefaultDirectory();

        private static string GetDefaultDirectory() =>
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);

        private sealed class SettingsData
        {
            public string LastDirectory { get; set; } = "";
            public string DefaultDependencyType { get; set; } = "FS";
            public int[]? TaskGridColumnWidths { get; set; }
            public bool? RestoreLastSession { get; set; }
            public string? LastSessionProjectPath { get; set; }
            public bool LastSessionIsRecovery { get; set; }
            public int? WindowX { get; set; }
            public int? WindowY { get; set; }
            public int? WindowWidth { get; set; }
            public int? WindowHeight { get; set; }
            public string? WindowState { get; set; }
            public List<string>? RecentFiles { get; set; }
            public List<DatabaseProfileData>? DatabaseProfiles { get; set; }
            public string? LastDatabaseProfileId { get; set; }
            public bool? DatabaseAutoRefreshEnabled { get; set; }
            public string? DatabaseEditorName { get; set; }
            public string? UiLanguage { get; set; }
            public bool? GanttExportTransparentBackground { get; set; }
        }

        private sealed class DatabaseProfileData
        {
            public string Id { get; set; } = "";
            public string Name { get; set; } = "";
            public string Provider { get; set; } = DatabaseProviderKind.MariaDb.ToString();
            public string? Server { get; set; }
            public int? Port { get; set; }
            public string? Database { get; set; }
            public string? UserName { get; set; }
            public string? EncryptedPassword { get; set; }
        }
    }
}
