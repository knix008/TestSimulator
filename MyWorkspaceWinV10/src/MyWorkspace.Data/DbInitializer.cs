using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Security;

namespace MyWorkspace.Data;

public static class DbInitializer
{
    public const string DefaultAdminUsername = "admin";
    public const string DefaultAdminPassword = "admin";

    private static readonly Regex SqlIdentifierPattern = new("^[A-Za-z_][A-Za-z0-9_]*$", RegexOptions.Compiled);

    public static void Initialize(AppDbContext db)
    {
        db.Database.EnsureCreated();
        EnsurePageVersionsTable(db);
        EnsurePageChangeLogsTable(db);
        EnsureWorkspaceFavoritesTable(db);
        EnsureUserNotificationColumns(db);

        if (db.Users.Any())
            return;

        var now = DateTime.UtcNow;
        db.Users.Add(new User
        {
            Username = DefaultAdminUsername,
            PasswordHash = PasswordHasher.Hash(DefaultAdminPassword),
            Role = UserRole.Admin,
            CreatedAt = now,
            UpdatedAt = now
        });
        db.SaveChanges();
    }

    private static void EnsurePageVersionsTable(AppDbContext db)
    {
        if (TableExists(db, "page_versions"))
            return;

        var provider = db.Database.ProviderName ?? string.Empty;

        if (provider.Contains("MySql", StringComparison.OrdinalIgnoreCase))
        {
            db.Database.ExecuteSqlRaw("""
                CREATE TABLE IF NOT EXISTS page_versions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    page_id INT NOT NULL,
                    title VARCHAR(200) NOT NULL,
                    content LONGTEXT NOT NULL,
                    saved_by_user_id INT NOT NULL,
                    saved_at DATETIME(6) NOT NULL,
                    INDEX ix_page_versions_page_saved (page_id, saved_at),
                    CONSTRAINT fk_page_versions_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
                    CONSTRAINT fk_page_versions_user FOREIGN KEY (saved_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
                ) ENGINE=InnoDB;
                """);
            return;
        }

        if (provider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
        {
            db.Database.ExecuteSqlRaw("""
                CREATE TABLE IF NOT EXISTS page_versions (
                    id SERIAL PRIMARY KEY,
                    page_id INT NOT NULL,
                    title VARCHAR(200) NOT NULL,
                    content TEXT NOT NULL,
                    saved_by_user_id INT NOT NULL,
                    saved_at TIMESTAMP NOT NULL,
                    CONSTRAINT fk_page_versions_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
                    CONSTRAINT fk_page_versions_user FOREIGN KEY (saved_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
                );
                CREATE INDEX IF NOT EXISTS ix_page_versions_page_saved ON page_versions (page_id, saved_at);
                """);
            return;
        }

        if (provider.Contains("SqlServer", StringComparison.OrdinalIgnoreCase))
        {
            db.Database.ExecuteSqlRaw("""
                IF OBJECT_ID(N'page_versions', N'U') IS NULL
                BEGIN
                    CREATE TABLE page_versions (
                        id INT IDENTITY(1,1) PRIMARY KEY,
                        page_id INT NOT NULL,
                        title NVARCHAR(200) NOT NULL,
                        content NVARCHAR(MAX) NOT NULL,
                        saved_by_user_id INT NOT NULL,
                        saved_at DATETIME2 NOT NULL,
                        CONSTRAINT fk_page_versions_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
                        CONSTRAINT fk_page_versions_user FOREIGN KEY (saved_by_user_id) REFERENCES users(id)
                    );
                    CREATE INDEX ix_page_versions_page_saved ON page_versions (page_id, saved_at);
                END
                """);
            return;
        }

        if (provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            db.Database.ExecuteSqlRaw("""
                CREATE TABLE IF NOT EXISTS page_versions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    page_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    saved_by_user_id INTEGER NOT NULL,
                    saved_at TEXT NOT NULL,
                    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
                    FOREIGN KEY (saved_by_user_id) REFERENCES users(id)
                );
                CREATE INDEX IF NOT EXISTS ix_page_versions_page_saved ON page_versions (page_id, saved_at);
                """);
        }
    }

    private static void EnsurePageChangeLogsTable(AppDbContext db)
    {
        if (TableExists(db, "page_change_logs"))
            return;

        var provider = db.Database.ProviderName ?? string.Empty;

        if (provider.Contains("MySql", StringComparison.OrdinalIgnoreCase))
        {
            db.Database.ExecuteSqlRaw("""
                CREATE TABLE IF NOT EXISTS page_change_logs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    page_id INT NOT NULL,
                    changed_by_user_id INT NOT NULL,
                    changed_at DATETIME(6) NOT NULL,
                    action VARCHAR(40) NOT NULL,
                    old_title VARCHAR(200) NULL,
                    new_title VARCHAR(200) NULL,
                    old_content_length INT NULL,
                    new_content_length INT NULL,
                    note VARCHAR(500) NULL,
                    INDEX ix_page_change_logs_page_changed (page_id, changed_at),
                    CONSTRAINT fk_page_change_logs_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
                    CONSTRAINT fk_page_change_logs_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
                ) ENGINE=InnoDB;
                """);
            return;
        }

        if (provider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
        {
            db.Database.ExecuteSqlRaw("""
                CREATE TABLE IF NOT EXISTS page_change_logs (
                    id SERIAL PRIMARY KEY,
                    page_id INT NOT NULL,
                    changed_by_user_id INT NOT NULL,
                    changed_at TIMESTAMP NOT NULL,
                    action VARCHAR(40) NOT NULL,
                    old_title VARCHAR(200) NULL,
                    new_title VARCHAR(200) NULL,
                    old_content_length INT NULL,
                    new_content_length INT NULL,
                    note VARCHAR(500) NULL,
                    CONSTRAINT fk_page_change_logs_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
                    CONSTRAINT fk_page_change_logs_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
                );
                CREATE INDEX IF NOT EXISTS ix_page_change_logs_page_changed ON page_change_logs (page_id, changed_at);
                """);
            return;
        }

        if (provider.Contains("SqlServer", StringComparison.OrdinalIgnoreCase))
        {
            db.Database.ExecuteSqlRaw("""
                IF OBJECT_ID(N'page_change_logs', N'U') IS NULL
                BEGIN
                    CREATE TABLE page_change_logs (
                        id INT IDENTITY(1,1) PRIMARY KEY,
                        page_id INT NOT NULL,
                        changed_by_user_id INT NOT NULL,
                        changed_at DATETIME2 NOT NULL,
                        action NVARCHAR(40) NOT NULL,
                        old_title NVARCHAR(200) NULL,
                        new_title NVARCHAR(200) NULL,
                        old_content_length INT NULL,
                        new_content_length INT NULL,
                        note NVARCHAR(500) NULL,
                        CONSTRAINT fk_page_change_logs_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
                        CONSTRAINT fk_page_change_logs_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
                    );
                    CREATE INDEX ix_page_change_logs_page_changed ON page_change_logs (page_id, changed_at);
                END
                """);
            return;
        }

        if (provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            db.Database.ExecuteSqlRaw("""
                CREATE TABLE IF NOT EXISTS page_change_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    page_id INTEGER NOT NULL,
                    changed_by_user_id INTEGER NOT NULL,
                    changed_at TEXT NOT NULL,
                    action TEXT NOT NULL,
                    old_title TEXT NULL,
                    new_title TEXT NULL,
                    old_content_length INTEGER NULL,
                    new_content_length INTEGER NULL,
                    note TEXT NULL,
                    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
                    FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
                );
                CREATE INDEX IF NOT EXISTS ix_page_change_logs_page_changed ON page_change_logs (page_id, changed_at);
                """);
        }
    }

    private static void EnsureWorkspaceFavoritesTable(AppDbContext db)
    {
        if (TableExists(db, "workspace_favorites"))
            return;

        var provider = db.Database.ProviderName ?? string.Empty;

        if (provider.Contains("MySql", StringComparison.OrdinalIgnoreCase))
        {
            db.Database.ExecuteSqlRaw("""
                CREATE TABLE IF NOT EXISTS workspace_favorites (
                    user_id INT NOT NULL,
                    workspace_id INT NOT NULL,
                    created_at DATETIME(6) NOT NULL,
                    PRIMARY KEY (user_id, workspace_id),
                    CONSTRAINT fk_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    CONSTRAINT fk_favorites_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                ) ENGINE=InnoDB;
                """);
            return;
        }

        if (provider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
        {
            db.Database.ExecuteSqlRaw("""
                CREATE TABLE IF NOT EXISTS workspace_favorites (
                    user_id INT NOT NULL,
                    workspace_id INT NOT NULL,
                    created_at TIMESTAMP NOT NULL,
                    PRIMARY KEY (user_id, workspace_id),
                    CONSTRAINT fk_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    CONSTRAINT fk_favorites_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                );
                """);
            return;
        }

        if (provider.Contains("SqlServer", StringComparison.OrdinalIgnoreCase))
        {
            db.Database.ExecuteSqlRaw("""
                IF OBJECT_ID(N'workspace_favorites', N'U') IS NULL
                BEGIN
                    CREATE TABLE workspace_favorites (
                        user_id INT NOT NULL,
                        workspace_id INT NOT NULL,
                        created_at DATETIME2 NOT NULL,
                        PRIMARY KEY (user_id, workspace_id),
                        CONSTRAINT fk_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                        CONSTRAINT fk_favorites_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                    );
                END
                """);
            return;
        }

        if (provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            db.Database.ExecuteSqlRaw("""
                CREATE TABLE IF NOT EXISTS workspace_favorites (
                    user_id INTEGER NOT NULL,
                    workspace_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (user_id, workspace_id),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                );
                """);
        }
    }

    private static void EnsureUserNotificationColumns(AppDbContext db)
    {
        AddColumnIfMissing(db, "users", "email", "VARCHAR(200) NULL", "TEXT NULL", "NVARCHAR(200) NULL", "TEXT");
        AddColumnIfMissing(db, "users", "notify_on_page_update", "TINYINT(1) NOT NULL DEFAULT 0", "BOOLEAN NOT NULL DEFAULT FALSE", "BIT NOT NULL DEFAULT 0", "INTEGER NOT NULL DEFAULT 0");
        AddColumnIfMissing(db, "users", "notify_on_workspace_change", "TINYINT(1) NOT NULL DEFAULT 0", "BOOLEAN NOT NULL DEFAULT FALSE", "BIT NOT NULL DEFAULT 0", "INTEGER NOT NULL DEFAULT 0");
    }

    private static void AddColumnIfMissing(
        AppDbContext db,
        string tableName,
        string columnName,
        string mySqlDefinition,
        string pgDefinition,
        string sqlServerDefinition,
        string sqliteDefinition)
    {
        if (ColumnExists(db, tableName, columnName))
            return;

        var provider = db.Database.ProviderName ?? string.Empty;
        var definition = provider switch
        {
            _ when provider.Contains("MySql", StringComparison.OrdinalIgnoreCase) => mySqlDefinition,
            _ when provider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) => pgDefinition,
            _ when provider.Contains("SqlServer", StringComparison.OrdinalIgnoreCase) => sqlServerDefinition,
            _ when provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase) => sqliteDefinition,
            _ => mySqlDefinition
        };

        ValidateSqlIdentifier(tableName);
        ValidateSqlIdentifier(columnName);

        var sql = FormattableString.Invariant($"ALTER TABLE {tableName} ADD COLUMN {columnName} {definition};");
        db.Database.ExecuteSqlRaw(sql);
    }

    private static void ValidateSqlIdentifier(string identifier)
    {
        if (!SqlIdentifierPattern.IsMatch(identifier))
            throw new InvalidOperationException($"Invalid SQL identifier: {identifier}");
    }

    private static bool ColumnExists(AppDbContext db, string tableName, string columnName)
    {
        var connection = db.Database.GetDbConnection();
        connection.Open();

        try
        {
            using var command = connection.CreateCommand();
            var provider = db.Database.ProviderName ?? string.Empty;

            if (provider.Contains("MySql", StringComparison.OrdinalIgnoreCase))
            {
                command.CommandText = """
                    SELECT COUNT(*)
                    FROM information_schema.columns
                    WHERE table_schema = DATABASE() AND table_name = @tableName AND column_name = @columnName
                    """;
            }
            else if (provider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
            {
                command.CommandText = """
                    SELECT COUNT(*)
                    FROM information_schema.columns
                    WHERE table_schema = current_schema() AND table_name = @tableName AND column_name = @columnName
                    """;
            }
            else if (provider.Contains("SqlServer", StringComparison.OrdinalIgnoreCase))
            {
                command.CommandText = """
                    SELECT COUNT(*)
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_NAME = @tableName AND COLUMN_NAME = @columnName
                    """;
            }
            else if (provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
            {
                command.CommandText = """
                    SELECT COUNT(*)
                    FROM pragma_table_info(@tableName)
                    WHERE name = @columnName
                    """;
            }
            else
            {
                return false;
            }

            var tableParam = command.CreateParameter();
            tableParam.ParameterName = "@tableName";
            tableParam.Value = tableName;
            command.Parameters.Add(tableParam);

            var columnParam = command.CreateParameter();
            columnParam.ParameterName = "@columnName";
            columnParam.Value = columnName;
            command.Parameters.Add(columnParam);

            var result = command.ExecuteScalar();
            return Convert.ToInt32(result) > 0;
        }
        finally
        {
            connection.Close();
        }
    }

    private static bool TableExists(AppDbContext db, string tableName)
    {
        var connection = db.Database.GetDbConnection();
        connection.Open();

        try
        {
            using var command = connection.CreateCommand();
            var provider = db.Database.ProviderName ?? string.Empty;

            if (provider.Contains("MySql", StringComparison.OrdinalIgnoreCase))
            {
                command.CommandText = """
                    SELECT COUNT(*)
                    FROM information_schema.tables
                    WHERE table_schema = DATABASE() AND table_name = @tableName
                    """;
            }
            else if (provider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
            {
                command.CommandText = """
                    SELECT COUNT(*)
                    FROM information_schema.tables
                    WHERE table_schema = current_schema() AND table_name = @tableName
                    """;
            }
            else if (provider.Contains("SqlServer", StringComparison.OrdinalIgnoreCase))
            {
                command.CommandText = """
                    SELECT COUNT(*)
                    FROM INFORMATION_SCHEMA.TABLES
                    WHERE TABLE_NAME = @tableName
                    """;
            }
            else if (provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
            {
                command.CommandText = """
                    SELECT COUNT(*)
                    FROM sqlite_master
                    WHERE type = 'table' AND name = @tableName
                    """;
            }
            else
            {
                return false;
            }

            var parameter = command.CreateParameter();
            parameter.ParameterName = "@tableName";
            parameter.Value = tableName;
            command.Parameters.Add(parameter);

            var result = command.ExecuteScalar();
            return Convert.ToInt32(result) > 0;
        }
        finally
        {
            connection.Close();
        }
    }
}
