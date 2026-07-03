using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Configuration;
using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;
using MyWorkspace.Core.Templates;
using MyWorkspace.Data;

namespace MyWorkspace.Win;

internal static class AppConfig
{
    public static DatabaseSettings DatabaseSettings { get; private set; } = DatabaseSettings.CreateDefault();

    public static EmailSettings EmailSettings { get; private set; } = new();

    public static UiSettings UiSettings { get; private set; } = UiSettings.Default;

    public static AppServices Services { get; private set; } = null!;

    public static DatabaseSettings PrimaryDatabaseSettings { get; private set; } = DatabaseSettings.CreateDefault();

    public static bool IsOfflineFallbackActive { get; private set; }

    public static bool HasPendingOfflineSaves { get; private set; }

    public static bool IsDatabaseConnectionDisabled { get; private set; }

    public static bool IsDatabaseConnected => !IsDatabaseConnectionDisabled && Services != null;

    public static string LocalSettingsPath =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MyWorkspaceWinV10",
            "appsettings.local.json");

    public static bool HasLocalDatabaseSettings =>
        File.Exists(LocalSettingsPath) &&
        JsonNode.Parse(File.ReadAllText(LocalSettingsPath))?["Database"] != null;

    public static string UserTemplateDirectory =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MyWorkspaceWinV10",
            "Templates",
            "Pages");

    public static string BuiltInTemplateDirectory =>
        Path.Combine(AppContext.BaseDirectory, "Templates", "Pages");

    public static bool TryInitialize(out string errorMessage)
    {
        try
        {
            Initialize();
            errorMessage = string.Empty;
            return true;
        }
        catch (Exception ex)
        {
            errorMessage = ex.Message;
            return false;
        }
    }

    public static bool TryBootstrapForStartup(out string errorMessage) =>
        TryInitialize(out errorMessage);

    public static bool TryBootstrapForStartup() =>
        TryBootstrapForStartup(out _);

    public static void Initialize()
    {
        var config = BuildConfiguration();
        IsDatabaseConnectionDisabled = LoadDatabaseConnectionDisabled(config);
        var useDefaultSqlite = !HasLocalDatabaseSettings && !IsDatabaseConnectionDisabled;
        DatabaseSettings = LoadDatabaseSettings(config);
        if (useDefaultSqlite)
            DatabaseSettings = DatabaseSettings.CreateDefault(DatabaseProviderType.SQLite);

        EmailSettings = LoadEmailSettings(config);
        UiSettings = LoadUiSettings(config);
        ApplyUiSettings(UiSettings, persist: false);
        PageTemplateProvider.Initialize(BuiltInTemplateDirectory, UserTemplateDirectory);
        PrimaryDatabaseSettings = DatabaseSettings.Clone();

        if (IsDatabaseConnectionDisabled)
        {
            Services?.Dispose();
            Services = null!;
            IsOfflineFallbackActive = false;
            return;
        }

        if (TryReloadPrimaryServices())
        {
            IsOfflineFallbackActive = false;
            if (useDefaultSqlite && DatabaseSettings.Provider == DatabaseProviderType.SQLite)
                SaveLocalDatabaseSettings(DatabaseSettings, reloadServices: false);
            return;
        }

        if (!TryReloadOfflineFallbackServices())
            throw new InvalidOperationException(Localization.Get(K.DbConnectionFailedGeneric));

        IsOfflineFallbackActive = true;
    }

    public static bool IsPrimarySqlite =>
        PrimaryDatabaseSettings.Provider == DatabaseProviderType.SQLite;

    public static AppServices GetAutoSaveSqliteServices()
    {
        if (Services != null &&
            !IsDatabaseConnectionDisabled &&
            IsPrimarySqlite &&
            LocalAutoSaveDatabase.IsSameDatabaseFile(PrimaryDatabaseSettings) &&
            !IsOfflineFallbackActive)
        {
            return Services;
        }

        return LocalAutoSaveDatabase.GetServices();
    }

    internal static bool ShouldTryOfflineSave(Exception exception)
    {
        if (IsOfflineFallbackActive)
            return false;

        if (OfflineFallbackDatabase.IsSameDatabaseFile(PrimaryDatabaseSettings))
            return false;

        return IsDatabaseRelatedException(exception);
    }

    internal static void MarkOfflineSaveUsed() => HasPendingOfflineSaves = true;

    private static bool TryReloadPrimaryServices()
    {
        if (OfflineFallbackDatabase.IsSameDatabaseFile(PrimaryDatabaseSettings))
            return false;

        try
        {
            Services?.Dispose();
            Services = new AppServices(PrimaryDatabaseSettings, EmailSettings);
            if (!Services.Db.Database.CanConnect())
            {
                Services.Dispose();
                Services = null!;
                return false;
            }

            return true;
        }
        catch
        {
            Services?.Dispose();
            Services = null!;
            return false;
        }
    }

    private static bool TryReloadOfflineFallbackServices()
    {
        try
        {
            Services?.Dispose();
            Services = OfflineFallbackDatabase.GetServices();
            return Services.Db.Database.CanConnect();
        }
        catch
        {
            Services?.Dispose();
            Services = null!;
            return false;
        }
    }

    private static bool IsDatabaseRelatedException(Exception exception)
    {
        for (var current = exception; current != null; current = current.InnerException)
        {
            var typeName = current.GetType().FullName ?? string.Empty;
            if (typeName.Contains("MySql", StringComparison.OrdinalIgnoreCase) ||
                typeName.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) ||
                typeName.Contains("SqlException", StringComparison.OrdinalIgnoreCase) ||
                typeName.Contains("Sqlite", StringComparison.OrdinalIgnoreCase) ||
                typeName.Contains("DbUpdate", StringComparison.OrdinalIgnoreCase) ||
                typeName.Contains("DbException", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            if (current is InvalidOperationException &&
                current.Message.Contains("database", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    public static void LoadUiPreferences()
    {
        try
        {
            var config = BuildConfiguration();
            UiSettings = LoadUiSettings(config);
        }
        catch
        {
            UiSettings = UiSettings.Default.Clone();
        }

        ApplyUiSettings(UiSettings, persist: false);
    }

    public static void SaveUiSettings(UiSettings settings)
    {
        UiSettings = settings.Clone();
        ApplyUiSettings(UiSettings, persist: true);
    }

    public static void RecordSuccessfulLogin(string username)
    {
        var settings = UiSettings.Clone();
        settings.LastLoginUsername = username.Trim();
        settings.HasLoggedInOnce = true;
        SaveUiSettings(settings);
    }

    public static void RecordLastActivePage(int userId, int pageId)
    {
        if (userId <= 0 || pageId <= 0)
            return;

        var key = userId.ToString(System.Globalization.CultureInfo.InvariantCulture);
        if (UiSettings.LastPageIdsByUserId.TryGetValue(key, out var existing) && existing == pageId)
            return;

        var settings = UiSettings.Clone();
        settings.LastPageIdsByUserId[key] = pageId;
        SaveUiSettings(settings);
    }

    public static int? GetLastActivePageId(int userId)
    {
        if (userId <= 0)
            return null;

        var key = userId.ToString(System.Globalization.CultureInfo.InvariantCulture);
        return UiSettings.LastPageIdsByUserId.TryGetValue(key, out var pageId) && pageId > 0
            ? pageId
            : null;
    }

    public static string? GetLastPageTemplateId()
    {
        var templateId = UiSettings.LastPageTemplateId?.Trim();
        return string.IsNullOrEmpty(templateId) ? null : templateId;
    }

    public static void RecordLastPageTemplateId(string templateId)
    {
        var trimmed = templateId.Trim();
        if (string.IsNullOrEmpty(trimmed))
            return;

        if (string.Equals(UiSettings.LastPageTemplateId, trimmed, StringComparison.OrdinalIgnoreCase))
            return;

        var settings = UiSettings.Clone();
        settings.LastPageTemplateId = trimmed;
        SaveUiSettings(settings);
    }

    public static void SetTitleBarPageSearchVisible(bool visible)
    {
        if (UiSettings.ShowTitleBarPageSearch == visible)
            return;

        var settings = UiSettings.Clone();
        settings.ShowTitleBarPageSearch = visible;
        SaveUiSettings(settings);
    }

    private static void ApplyUiSettings(UiSettings settings, bool persist)
    {
        Localization.SetLanguage(settings.Language);
        AppTheme.ApplyAppearance(settings);

        if (!persist)
            return;

        var directory = Path.GetDirectoryName(LocalSettingsPath)!;
        Directory.CreateDirectory(directory);

        JsonObject root;
        if (File.Exists(LocalSettingsPath))
            root = JsonNode.Parse(File.ReadAllText(LocalSettingsPath))?.AsObject() ?? new JsonObject();
        else
            root = new JsonObject();

        root["Ui"] = new JsonObject
        {
            ["Theme"] = settings.Theme.ToString(),
            ["ColorThemeIndex"] = settings.ColorThemeIndex,
            ["UseCustomAccentColor"] = settings.UseCustomAccentColor,
            ["CustomAccentArgb"] = settings.CustomAccentArgb,
            ["Language"] = settings.Language.ToString(),
            ["LastLoginUsername"] = settings.LastLoginUsername,
            ["HasLoggedInOnce"] = settings.HasLoggedInOnce,
            ["FontScaleStep"] = settings.FontScaleStep,
            ["LastExportDirectory"] = settings.LastExportDirectory,
            ["LastOpenDirectory"] = settings.LastOpenDirectory,
            ["LastProjectDirectory"] = settings.LastProjectDirectory,
            ["RecentProjectPaths"] = SerializeRecentProjectPaths(settings.RecentProjectPaths),
            ["LastPageIdsByUserId"] = SerializeLastPageIds(settings.LastPageIdsByUserId),
            ["LastPageTemplateId"] = settings.LastPageTemplateId,
            ["ShowTitleBarPageSearch"] = settings.ShowTitleBarPageSearch
        };

        File.WriteAllText(LocalSettingsPath, root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    private static UiSettings LoadUiSettings(IConfiguration config)
    {
        var section = config.GetSection("Ui");
        if (!section.Exists())
            return UiSettings.Default.Clone();

        return ParseUiSettings(section);
    }

    private static UiSettings ParseUiSettings(IConfiguration section)
    {
        var settings = UiSettings.Default.Clone();

        if (Enum.TryParse<AppThemeKind>(section["Theme"], true, out var theme))
            settings.Theme = theme;

        if (int.TryParse(section["ColorThemeIndex"], out var colorThemeIndex))
            settings.ColorThemeIndex = PastelThemeCatalog.NormalizeIndex(colorThemeIndex);

        if (bool.TryParse(section["UseCustomAccentColor"], out var useCustomAccentColor))
            settings.UseCustomAccentColor = useCustomAccentColor;

        if (int.TryParse(section["CustomAccentArgb"], out var customAccentArgb))
            settings.CustomAccentArgb = customAccentArgb;

        if (Enum.TryParse<AppLanguage>(section["Language"], true, out var language))
            settings.Language = language;

        settings.LastLoginUsername = section["LastLoginUsername"]?.Trim() ?? string.Empty;
        settings.LastExportDirectory = section["LastExportDirectory"]?.Trim() ?? string.Empty;
        settings.LastOpenDirectory = section["LastOpenDirectory"]?.Trim() ?? string.Empty;
        settings.LastProjectDirectory = section["LastProjectDirectory"]?.Trim() ?? string.Empty;

        if (bool.TryParse(section["HasLoggedInOnce"], out var hasLoggedInOnce))
            settings.HasLoggedInOnce = hasLoggedInOnce;
        else if (!string.IsNullOrWhiteSpace(settings.LastLoginUsername))
            settings.HasLoggedInOnce = true;

        if (int.TryParse(section["FontScaleStep"], out var fontScaleStep))
            settings.FontScaleStep = UiFontScale.Normalize(fontScaleStep);

        ApplyLastPageIds(settings, section.GetSection("LastPageIdsByUserId"));
        ApplyRecentProjectPaths(settings, section.GetSection("RecentProjectPaths"));
        settings.LastPageTemplateId = section["LastPageTemplateId"]?.Trim() ?? string.Empty;

        if (bool.TryParse(section["ShowTitleBarPageSearch"], out var showTitleBarPageSearch))
            settings.ShowTitleBarPageSearch = showTitleBarPageSearch;

        return settings;
    }

    private static JsonArray SerializeRecentProjectPaths(IReadOnlyList<string> recentProjectPaths)
    {
        var json = new JsonArray();
        foreach (var path in recentProjectPaths)
        {
            if (!string.IsNullOrWhiteSpace(path))
                json.Add(path);
        }

        return json;
    }

    private static void ApplyRecentProjectPaths(UiSettings settings, IConfigurationSection section)
    {
        if (!section.Exists())
            return;

        foreach (var child in section.GetChildren())
        {
            var path = child.Value?.Trim();
            if (!string.IsNullOrWhiteSpace(path))
                settings.RecentProjectPaths.Add(path);
        }
    }

    private static void ApplyRecentProjectPaths(UiSettings settings, JsonArray? section)
    {
        if (section == null)
            return;

        foreach (var node in section)
        {
            var path = node?.GetValue<string>()?.Trim();
            if (!string.IsNullOrWhiteSpace(path))
                settings.RecentProjectPaths.Add(path);
        }
    }

    private static JsonObject SerializeLastPageIds(Dictionary<string, int> lastPageIdsByUserId)
    {
        var json = new JsonObject();
        foreach (var (userId, pageId) in lastPageIdsByUserId)
        {
            if (pageId > 0)
                json[userId] = pageId;
        }

        return json;
    }

    private static void ApplyLastPageIds(UiSettings settings, IConfigurationSection section)
    {
        if (!section.Exists())
            return;

        foreach (var child in section.GetChildren())
        {
            if (int.TryParse(child.Key, out var userId) &&
                userId > 0 &&
                int.TryParse(child.Value, out var pageId) &&
                pageId > 0)
            {
                settings.LastPageIdsByUserId[userId.ToString(System.Globalization.CultureInfo.InvariantCulture)] = pageId;
            }
        }
    }

    private static void ApplyLastPageIds(UiSettings settings, JsonObject? section)
    {
        if (section == null)
            return;

        foreach (var (key, value) in section)
        {
            if (!int.TryParse(key, out var userId) || userId <= 0)
                continue;

            if (value is JsonValue jsonValue && jsonValue.TryGetValue(out int pageId) && pageId > 0)
                settings.LastPageIdsByUserId[userId.ToString(System.Globalization.CultureInfo.InvariantCulture)] = pageId;
        }
    }

    private static UiSettings ParseUiSettings(JsonObject section)
    {
        var settings = UiSettings.Default.Clone();

        if (Enum.TryParse<AppThemeKind>(section["Theme"]?.GetValue<string>(), true, out var theme))
            settings.Theme = theme;

        if (Enum.TryParse<AppLanguage>(section["Language"]?.GetValue<string>(), true, out var language))
            settings.Language = language;

        settings.LastLoginUsername = section["LastLoginUsername"]?.GetValue<string>()?.Trim() ?? string.Empty;
        settings.LastExportDirectory = section["LastExportDirectory"]?.GetValue<string>()?.Trim() ?? string.Empty;
        settings.LastOpenDirectory = section["LastOpenDirectory"]?.GetValue<string>()?.Trim() ?? string.Empty;
        settings.LastProjectDirectory = section["LastProjectDirectory"]?.GetValue<string>()?.Trim() ?? string.Empty;

        if (section["HasLoggedInOnce"] is JsonValue hasLoggedInOnceValue &&
            hasLoggedInOnceValue.TryGetValue(out bool hasLoggedInOnce))
            settings.HasLoggedInOnce = hasLoggedInOnce;
        else if (!string.IsNullOrWhiteSpace(settings.LastLoginUsername))
            settings.HasLoggedInOnce = true;

        if (section["FontScaleStep"] is JsonValue fontScaleValue &&
            fontScaleValue.TryGetValue(out int fontScaleStep))
            settings.FontScaleStep = UiFontScale.Normalize(fontScaleStep);

        ApplyLastPageIds(settings, section["LastPageIdsByUserId"] as JsonObject);
        ApplyRecentProjectPaths(settings, section["RecentProjectPaths"] as JsonArray);
        settings.LastPageTemplateId = section["LastPageTemplateId"]?.GetValue<string>()?.Trim() ?? string.Empty;

        if (section["ShowTitleBarPageSearch"] is JsonValue showTitleBarPageSearchValue &&
            showTitleBarPageSearchValue.TryGetValue(out bool showTitleBarPageSearch))
            settings.ShowTitleBarPageSearch = showTitleBarPageSearch;

        return settings;
    }

    public static void ReloadServices()
    {
        PrimaryDatabaseSettings = DatabaseSettings.Clone();

        if (IsDatabaseConnectionDisabled)
        {
            Services?.Dispose();
            Services = null!;
            IsOfflineFallbackActive = false;
            return;
        }

        if (TryReloadPrimaryServices())
        {
            IsOfflineFallbackActive = false;
            return;
        }

        if (!TryReloadOfflineFallbackServices())
            throw new InvalidOperationException(Localization.Get(K.DbConnectionFailedGeneric));

        IsOfflineFallbackActive = true;
    }

    public static bool TestConnection(DatabaseSettings settings, bool createIfNotExists, out string errorMessage, out bool databaseCreated) =>
        DatabaseProvisioner.TestConnection(settings, createIfNotExists, out errorMessage, out databaseCreated);

    public static bool TestConnection(DatabaseSettings settings, out string errorMessage)
    {
        return TestConnection(settings, createIfNotExists: false, out errorMessage, out _);
    }

    public static bool SaveAndApplyDatabaseSettings(DatabaseSettings settings, bool createIfNotExists, out string errorMessage)
    {
        if (!TestConnection(settings, createIfNotExists, out errorMessage, out _))
            return false;

        SaveLocalDatabaseSettings(settings);
        errorMessage = string.Empty;
        return true;
    }

    public static void SaveLocalDatabaseSettings(DatabaseSettings settings, bool reloadServices = true)
    {
        WriteLocalDatabaseSettings(settings);
        DatabaseSettings = settings.Clone();
        IsDatabaseConnectionDisabled = false;

        if (reloadServices)
            ReloadServices();
    }

    private static void WriteLocalDatabaseSettings(DatabaseSettings settings)
    {
        var directory = Path.GetDirectoryName(LocalSettingsPath)!;
        Directory.CreateDirectory(directory);

        JsonObject root;
        if (File.Exists(LocalSettingsPath))
            root = JsonNode.Parse(File.ReadAllText(LocalSettingsPath))?.AsObject() ?? new JsonObject();
        else
            root = new JsonObject();

        root["DatabaseConnectionDisabled"] = false;
        root["Database"] = new JsonObject
        {
            ["Provider"] = settings.Provider.ToString(),
            ["Server"] = settings.Server,
            ["Port"] = settings.Port,
            ["Database"] = settings.Database,
            ["User"] = settings.User,
            ["Password"] = settings.Password,
            ["SqliteFilePath"] = settings.SqliteFilePath
        };

        File.WriteAllText(LocalSettingsPath, root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    public static void DisconnectDatabase()
    {
        Services?.Dispose();
        Services = null!;
        IsOfflineFallbackActive = false;
        HasPendingOfflineSaves = false;
        IsDatabaseConnectionDisabled = true;

        var directory = Path.GetDirectoryName(LocalSettingsPath)!;
        Directory.CreateDirectory(directory);

        JsonObject root;
        if (File.Exists(LocalSettingsPath))
            root = JsonNode.Parse(File.ReadAllText(LocalSettingsPath))?.AsObject() ?? new JsonObject();
        else
            root = new JsonObject();

        root["DatabaseConnectionDisabled"] = true;
        File.WriteAllText(LocalSettingsPath, root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    private static bool LoadDatabaseConnectionDisabled(IConfiguration config) =>
        bool.TryParse(config["DatabaseConnectionDisabled"], out var disabled) && disabled;

    public static void SaveLocalEmailSettings(EmailSettings settings)
    {
        var directory = Path.GetDirectoryName(LocalSettingsPath)!;
        Directory.CreateDirectory(directory);

        JsonObject root;
        if (File.Exists(LocalSettingsPath))
            root = JsonNode.Parse(File.ReadAllText(LocalSettingsPath))?.AsObject() ?? new JsonObject();
        else
            root = new JsonObject();

        root["Email"] = new JsonObject
        {
            ["Enabled"] = settings.Enabled,
            ["SmtpHost"] = settings.SmtpHost,
            ["Port"] = settings.Port,
            ["EnableSsl"] = settings.EnableSsl,
            ["Username"] = settings.Username,
            ["Password"] = settings.Password,
            ["FromAddress"] = settings.FromAddress,
            ["FromDisplayName"] = settings.FromDisplayName
        };

        File.WriteAllText(LocalSettingsPath, root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        EmailSettings = settings.Clone();
        ReloadServices();
    }

    private static IConfiguration BuildConfiguration() =>
        new ConfigurationBuilder()
            .SetBasePath(AppContext.BaseDirectory)
            .AddJsonFile("appsettings.json", optional: false, reloadOnChange: false)
            .AddJsonFile(LocalSettingsPath, optional: true, reloadOnChange: false)
            .Build();

    private static EmailSettings LoadEmailSettings(IConfiguration config)
    {
        var section = config.GetSection("Email");
        _ = int.TryParse(section["Port"], out var port);
        if (port <= 0)
            port = 587;

        _ = bool.TryParse(section["Enabled"], out var enabled);
        _ = bool.TryParse(section["EnableSsl"], out var enableSsl);

        return new EmailSettings
        {
            Enabled = enabled,
            SmtpHost = section["SmtpHost"] ?? string.Empty,
            Port = port,
            EnableSsl = section["EnableSsl"] == null || enableSsl,
            Username = section["Username"] ?? string.Empty,
            Password = section["Password"] ?? string.Empty,
            FromAddress = section["FromAddress"] ?? string.Empty,
            FromDisplayName = section["FromDisplayName"] ?? "MyWorkspace"
        };
    }

    private static DatabaseSettings LoadDatabaseSettings(IConfiguration config)
    {
        var section = config.GetSection("Database");
        if (section.Exists())
        {
            var provider = DatabaseProviderType.SQLite;
            if (Enum.TryParse<DatabaseProviderType>(section["Provider"], true, out var parsedProvider))
                provider = parsedProvider;

            var sqlitePath = section["SqliteFilePath"];
            return new DatabaseSettings
            {
                Provider = provider,
                Server = section["Server"] ?? "localhost",
                Port = section["Port"] ?? DatabaseSettings.GetDefaultPort(provider),
                Database = section["Database"] ?? "myworkspace",
                User = section["User"] ?? "root",
                Password = section["Password"] ?? string.Empty,
                SqliteFilePath = string.IsNullOrWhiteSpace(sqlitePath)
                    ? DatabaseSettings.GetDefaultSqlitePath()
                    : sqlitePath.Trim()
            };
        }

        var legacyConnection = config.GetConnectionString("MariaDb");
        if (!string.IsNullOrWhiteSpace(legacyConnection))
            return ParseLegacyMariaConnectionString(legacyConnection);

        return DatabaseSettings.CreateDefault(DatabaseProviderType.SQLite);
    }

    private static DatabaseSettings ParseLegacyMariaConnectionString(string connectionString)
    {
        var settings = DatabaseSettings.CreateDefault(DatabaseProviderType.MariaDB);

        foreach (var part in connectionString.Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            var idx = part.IndexOf('=');
            if (idx <= 0)
                continue;

            var key = part[..idx].Trim().ToLowerInvariant();
            var value = part[(idx + 1)..].Trim();

            switch (key)
            {
                case "server":
                case "host":
                    settings.Server = value;
                    break;
                case "port":
                    settings.Port = value;
                    break;
                case "database":
                case "db":
                    settings.Database = value;
                    break;
                case "user":
                case "uid":
                case "user id":
                    settings.User = value;
                    break;
                case "password":
                case "pwd":
                    settings.Password = value;
                    break;
            }
        }

        return settings;
    }
}

internal static class SessionContext
{
    private static User? _currentUser;

    public static bool IsLoggedIn => _currentUser != null;

    public static User CurrentUser =>
        _currentUser ?? throw new InvalidOperationException(Localization.Get(K.SessionLoginRequired));

    public static bool IsAdmin => IsLoggedIn && _currentUser!.Role == Core.Enums.UserRole.Admin;

    public static void SetUser(User user) => _currentUser = user;

    public static void UpdateUsername(string username)
    {
        if (_currentUser != null)
            _currentUser.Username = username.Trim();
    }

    public static void Clear() => _currentUser = null;
}
