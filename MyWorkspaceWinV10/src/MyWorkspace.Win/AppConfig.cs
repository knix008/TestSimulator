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
        DatabaseSettings = LoadDatabaseSettings(config);
        EmailSettings = LoadEmailSettings(config);
        UiSettings = LoadUiSettings(config);
        ApplyUiSettings(UiSettings, persist: false);
        PageTemplateProvider.Initialize(BuiltInTemplateDirectory, UserTemplateDirectory);
        ReloadServices();
    }

    public static void LoadUiPreferences()
    {
        if (File.Exists(LocalSettingsPath))
        {
            try
            {
                var root = JsonNode.Parse(File.ReadAllText(LocalSettingsPath))?.AsObject();
                if (root?["Ui"] != null)
                {
                    UiSettings = ParseUiSettings(root["Ui"]!.AsObject());
                    ApplyUiSettings(UiSettings, persist: false);
                    return;
                }
            }
            catch
            {
                // fall back to defaults
            }
        }

        UiSettings = UiSettings.Default.Clone();
        ApplyUiSettings(UiSettings, persist: false);
    }

    public static void SaveUiSettings(UiSettings settings)
    {
        UiSettings = settings.Clone();
        ApplyUiSettings(UiSettings, persist: true);
    }

    private static void ApplyUiSettings(UiSettings settings, bool persist)
    {
        Localization.SetLanguage(settings.Language);
        AppTheme.ApplyTheme(settings.Theme);

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
            ["Language"] = settings.Language.ToString()
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

        if (Enum.TryParse<AppLanguage>(section["Language"], true, out var language))
            settings.Language = language;

        return settings;
    }

    private static UiSettings ParseUiSettings(JsonObject section)
    {
        var settings = UiSettings.Default.Clone();

        if (Enum.TryParse<AppThemeKind>(section["Theme"]?.GetValue<string>(), true, out var theme))
            settings.Theme = theme;

        if (Enum.TryParse<AppLanguage>(section["Language"]?.GetValue<string>(), true, out var language))
            settings.Language = language;

        return settings;
    }

    public static void ReloadServices()
    {
        Services?.Dispose();
        Services = new AppServices(DatabaseSettings, EmailSettings);
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

    public static void SaveLocalDatabaseSettings(DatabaseSettings settings)
    {
        var directory = Path.GetDirectoryName(LocalSettingsPath)!;
        Directory.CreateDirectory(directory);

        JsonObject root;
        if (File.Exists(LocalSettingsPath))
            root = JsonNode.Parse(File.ReadAllText(LocalSettingsPath))?.AsObject() ?? new JsonObject();
        else
            root = new JsonObject();

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
        DatabaseSettings = settings.Clone();
        ReloadServices();
    }

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
            var provider = DatabaseProviderType.MariaDB;
            if (Enum.TryParse<DatabaseProviderType>(section["Provider"], true, out var parsedProvider))
                provider = parsedProvider;

            return new DatabaseSettings
            {
                Provider = provider,
                Server = section["Server"] ?? "localhost",
                Port = section["Port"] ?? DatabaseSettings.GetDefaultPort(provider),
                Database = section["Database"] ?? "myworkspace",
                User = section["User"] ?? "root",
                Password = section["Password"] ?? string.Empty,
                SqliteFilePath = section["SqliteFilePath"] ?? DatabaseSettings.GetDefaultSqlitePath()
            };
        }

        var legacyConnection = config.GetConnectionString("MariaDb");
        if (!string.IsNullOrWhiteSpace(legacyConnection))
            return ParseLegacyMariaConnectionString(legacyConnection);

        throw new InvalidOperationException("appsettings.json에 Database 설정이 필요합니다.");
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
