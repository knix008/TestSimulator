using ReqTrace.Persistence.Database;

namespace ReqTrace.Persistence;

public class AppSettings
{
    public List<string> RecentFiles { get; set; } = new();
    public string LastProjectPath { get; set; } = string.Empty;
    public string LastProjectFolder { get; set; } = string.Empty;
    public string LastImportFolder { get; set; } = string.Empty;
    public string LastExportFolder { get; set; } = string.Empty;
    public int WindowWidth { get; set; } = 1200;
    public int WindowHeight { get; set; } = 800;
    public string Language { get; set; } = "ko-KR";
    public string OllamaBaseUrl { get; set; } = "http://localhost:11434";
    public string OllamaModel { get; set; } = string.Empty;
    public bool UseLlmForExcelImport { get; set; } = true;

    public DbProvider DbProvider { get; set; } = DbProvider.MariaDb;
    public string DbServer { get; set; } = "localhost";
    public int DbPort { get; set; }
    public string DbDatabase { get; set; } = "reqtrace";
    public string DbUsername { get; set; } = string.Empty;

    /// <summary>DPAPI-protected (see <see cref="DbCredentialProtector"/>) - never plaintext.</summary>
    public string DbPasswordProtected { get; set; } = string.Empty;

    public bool DbIntegratedSecurity { get; set; }
    public string DbSqliteFilePath { get; set; } = string.Empty;
    public bool DbConnectionConfigured { get; set; }
}
