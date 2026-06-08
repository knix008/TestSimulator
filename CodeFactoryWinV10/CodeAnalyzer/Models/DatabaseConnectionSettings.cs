namespace CodeAnalyzer.Models;

public enum AnalysisDatabaseProvider
{
    MySql,
    MariaDb,
    PostgreSql
}

public sealed class DatabaseConnectionSettings
{
    public bool Enabled { get; set; }

    public bool SaveOnAnalysisComplete { get; set; } = true;

    public AnalysisDatabaseProvider Provider { get; set; } = AnalysisDatabaseProvider.PostgreSql;

    public string Host { get; set; } = "localhost";

    public int Port { get; set; }

    public string Database { get; set; } = "codeanalyzer";

    public string Username { get; set; } = "";

    public string Password { get; set; } = "";

    public string TablePrefix { get; set; } = "ca_";

    public bool AutoCreateSchema { get; set; } = true;

    public int SchemaVersion { get; set; }

    public int ResolvePort() =>
        Port > 0
            ? Port
            : Provider switch
            {
                AnalysisDatabaseProvider.PostgreSql => 5432,
                _ => 3306
            };

    public static DatabaseConnectionSettings Clone(DatabaseConnectionSettings? source)
    {
        if (source is null)
        {
            return new DatabaseConnectionSettings();
        }

        return new DatabaseConnectionSettings
        {
            Enabled = source.Enabled,
            SaveOnAnalysisComplete = source.SaveOnAnalysisComplete,
            Provider = source.Provider,
            Host = source.Host,
            Port = source.Port,
            Database = source.Database,
            Username = source.Username,
            Password = source.Password,
            TablePrefix = source.TablePrefix,
            AutoCreateSchema = source.AutoCreateSchema,
            SchemaVersion = source.SchemaVersion
        };
    }

    public static DatabaseConnectionSettings Normalize(DatabaseConnectionSettings? source)
    {
        var settings = Clone(source);
        settings.Host = (settings.Host ?? string.Empty).Trim();
        settings.Database = (settings.Database ?? string.Empty).Trim();
        settings.Username = (settings.Username ?? string.Empty).Trim();
        settings.Password ??= string.Empty;
        settings.TablePrefix = NormalizeTablePrefix(settings.TablePrefix);

        if (string.IsNullOrWhiteSpace(settings.Host))
        {
            settings.Host = "localhost";
        }

        if (string.IsNullOrWhiteSpace(settings.Database))
        {
            settings.Database = "codeanalyzer";
        }

        if (!Enum.IsDefined(settings.Provider))
        {
            settings.Provider = AnalysisDatabaseProvider.PostgreSql;
        }

        if (settings.Port < 0)
        {
            settings.Port = 0;
        }

        return settings;
    }

    public void ValidateForUse()
    {
        var normalized = Normalize(this);
        Host = normalized.Host;
        Database = normalized.Database;
        Username = normalized.Username;
        Password = normalized.Password;
        TablePrefix = normalized.TablePrefix;

        if (string.IsNullOrWhiteSpace(Database))
        {
            throw new InvalidOperationException("데이터베이스 이름을 입력하세요.");
        }

        if (string.IsNullOrWhiteSpace(Username))
        {
            throw new InvalidOperationException("사용자 이름을 입력하세요.");
        }
    }

    public string ResolveRunsTableName() => $"{TablePrefix}analysis_runs";

    private static string NormalizeTablePrefix(string? prefix)
    {
        var value = (prefix ?? "ca_").Trim();
        if (string.IsNullOrWhiteSpace(value))
        {
            return "ca_";
        }

        return value.All(char.IsLetterOrDigit) ? value : "ca_";
    }
}
