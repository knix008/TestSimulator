using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using MyProject.Data;
using MySqlConnector;
using Npgsql;

namespace MyProject.Models
{
    public static class DatabaseConnectionFactory
    {
        public static string BuildConnectionString(DatabaseConnectionProfile profile)
        {
            profile.ApplyDefaultPort();
            string password = profile.GetPassword();

            return profile.Provider switch
            {
                DatabaseProviderKind.Sqlite =>
                    $"Data Source={profile.Database};",
                DatabaseProviderKind.PostgreSql =>
                    $"Host={profile.Server};Port={profile.Port};Database={profile.Database};Username={profile.UserName};Password={password};Timeout=10;",
                DatabaseProviderKind.SqlServer =>
                    $"Server={profile.Server},{profile.Port};Database={profile.Database};User Id={profile.UserName};Password={password};TrustServerCertificate=True;Connection Timeout=10;",
                DatabaseProviderKind.MariaDb or DatabaseProviderKind.MySql =>
                    $"Server={profile.Server};Port={profile.Port};Database={profile.Database};User={profile.UserName};Password={password};Connection Timeout=10;",
                _ => throw new NotSupportedException($"Unsupported database provider: {profile.Provider}")
            };
        }

        public static ProjectDbContext CreateContext(DatabaseConnectionProfile profile)
        {
            var options = CreateOptions(profile);
            return new ProjectDbContext(options);
        }

        public static DbContextOptions<ProjectDbContext> CreateOptions(DatabaseConnectionProfile profile)
        {
            var builder = new DbContextOptionsBuilder<ProjectDbContext>();
            Configure(builder, profile);
            return builder.Options;
        }

        public static void Configure(DbContextOptionsBuilder options, DatabaseConnectionProfile profile)
        {
            string connectionString = BuildConnectionString(profile);

            switch (profile.Provider)
            {
                case DatabaseProviderKind.Sqlite:
                    options.UseSqlite(connectionString);
                    break;
                case DatabaseProviderKind.MariaDb:
                    options.UseMySql(connectionString, new MariaDbServerVersion(new Version(10, 11, 0)));
                    break;
                case DatabaseProviderKind.MySql:
                    options.UseMySql(connectionString, new MySqlServerVersion(new Version(8, 0, 0)));
                    break;
                case DatabaseProviderKind.PostgreSql:
                    options.UseNpgsql(connectionString);
                    break;
                case DatabaseProviderKind.SqlServer:
                    options.UseSqlServer(connectionString);
                    break;
                default:
                    throw new NotSupportedException($"Unsupported database provider: {profile.Provider}");
            }
        }

        /// <summary>
        /// Creates the target database when it does not exist yet.
        /// Returns <c>true</c> when a new database (or SQLite file) was created.
        /// </summary>
        public static bool EnsureDatabaseExists(DatabaseConnectionProfile profile)
        {
            profile.ApplyDefaultPort();

            return profile.Provider switch
            {
                DatabaseProviderKind.Sqlite => EnsureSqliteDatabase(profile),
                DatabaseProviderKind.MariaDb or DatabaseProviderKind.MySql => EnsureMySqlDatabase(profile),
                DatabaseProviderKind.PostgreSql => EnsurePostgreSqlDatabase(profile),
                DatabaseProviderKind.SqlServer => EnsureSqlServerDatabase(profile),
                _ => throw new NotSupportedException($"Unsupported database provider: {profile.Provider}")
            };
        }

        public static bool TestConnection(DatabaseConnectionProfile profile)
        {
            bool created = EnsureDatabaseExists(profile);
            using var context = CreateContext(profile);
            context.Database.OpenConnection();
            context.Database.CloseConnection();
            return created;
        }

        public static bool EnsureSchema(DatabaseConnectionProfile profile)
        {
            bool created = EnsureDatabaseExists(profile);
            using var context = CreateContext(profile);
            context.Database.EnsureCreated();
            UpgradeSchema(context, profile.Provider);
            return created;
        }

        private static void UpgradeSchema(ProjectDbContext context, DatabaseProviderKind provider)
        {
            try
            {
                string sql = provider switch
                {
                    DatabaseProviderKind.Sqlite =>
                        "ALTER TABLE mp_projects ADD COLUMN UpdatedBy TEXT NULL;",
                    DatabaseProviderKind.SqlServer =>
                        "ALTER TABLE mp_projects ADD UpdatedBy NVARCHAR(256) NULL;",
                    DatabaseProviderKind.PostgreSql =>
                        "ALTER TABLE mp_projects ADD COLUMN \"UpdatedBy\" VARCHAR(256) NULL;",
                    DatabaseProviderKind.MariaDb or DatabaseProviderKind.MySql =>
                        "ALTER TABLE mp_projects ADD COLUMN UpdatedBy VARCHAR(256) NULL;",
                    _ => ""
                };

                if (!string.IsNullOrEmpty(sql))
                    context.Database.ExecuteSqlRaw(sql);
            }
            catch
            {
                // Column already exists on upgraded databases.
            }
        }

        private static bool EnsureSqliteDatabase(DatabaseConnectionProfile profile)
        {
            string path = profile.Database.Trim();
            if (string.IsNullOrWhiteSpace(path))
                throw new ArgumentException("SQLite database file path is required.");

            if (path.Equals(":memory:", StringComparison.OrdinalIgnoreCase))
                return false;

            string fullPath = Path.GetFullPath(path);
            string? directory = Path.GetDirectoryName(fullPath);
            if (!string.IsNullOrEmpty(directory))
                Directory.CreateDirectory(directory);

            bool existed = File.Exists(fullPath);
            if (!existed)
            {
                using (File.Create(fullPath)) { }
            }

            return !existed;
        }

        private static bool EnsureMySqlDatabase(DatabaseConnectionProfile profile)
        {
            ValidateDatabaseName(profile.Database);
            string password = profile.GetPassword();
            string serverConnection =
                $"Server={profile.Server};Port={profile.Port};User={profile.UserName};Password={password};Connection Timeout=10;";

            using var connection = new MySqlConnection(serverConnection);
            connection.Open();

            bool existed = MySqlDatabaseExists(connection, profile.Database);
            if (!existed)
            {
                string databaseName = QuoteMySqlIdentifier(profile.Database);
                using var command = connection.CreateCommand();
                command.CommandText = $"CREATE DATABASE IF NOT EXISTS {databaseName};";
                command.ExecuteNonQuery();
            }

            return !existed;
        }

        private static bool MySqlDatabaseExists(MySqlConnection connection, string databaseName)
        {
            using var command = connection.CreateCommand();
            command.CommandText = "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = @name;";
            var parameter = command.CreateParameter();
            parameter.ParameterName = "@name";
            parameter.Value = databaseName;
            command.Parameters.Add(parameter);
            return command.ExecuteScalar() != null;
        }

        private static bool EnsurePostgreSqlDatabase(DatabaseConnectionProfile profile)
        {
            ValidateDatabaseName(profile.Database);
            string password = profile.GetPassword();
            string adminConnection =
                $"Host={profile.Server};Port={profile.Port};Database=postgres;Username={profile.UserName};Password={password};Timeout=10;";

            using var connection = new NpgsqlConnection(adminConnection);
            connection.Open();

            if (PostgreSqlDatabaseExists(connection, profile.Database))
                return false;

            using var create = connection.CreateCommand();
            create.CommandText = $"CREATE DATABASE {QuotePostgreSqlIdentifier(profile.Database)};";
            create.ExecuteNonQuery();
            return true;
        }

        private static bool PostgreSqlDatabaseExists(NpgsqlConnection connection, string databaseName)
        {
            using var command = connection.CreateCommand();
            command.CommandText = "SELECT 1 FROM pg_database WHERE datname = @name;";
            command.Parameters.AddWithValue("name", databaseName);
            return command.ExecuteScalar() != null;
        }

        private static bool EnsureSqlServerDatabase(DatabaseConnectionProfile profile)
        {
            ValidateDatabaseName(profile.Database);
            string password = profile.GetPassword();
            string masterConnection =
                $"Server={profile.Server},{profile.Port};Database=master;User Id={profile.UserName};Password={password};TrustServerCertificate=True;Connection Timeout=10;";

            using var connection = new SqlConnection(masterConnection);
            connection.Open();

            if (SqlServerDatabaseExists(connection, profile.Database))
                return false;

            using var create = connection.CreateCommand();
            create.CommandText = $"CREATE DATABASE {QuoteSqlServerIdentifier(profile.Database)};";
            create.ExecuteNonQuery();
            return true;
        }

        private static bool SqlServerDatabaseExists(SqlConnection connection, string databaseName)
        {
            using var command = connection.CreateCommand();
            command.CommandText = "SELECT 1 FROM sys.databases WHERE name = @name;";
            command.Parameters.AddWithValue("@name", databaseName);
            return command.ExecuteScalar() != null;
        }

        private static void ValidateDatabaseName(string databaseName)
        {
            if (string.IsNullOrWhiteSpace(databaseName))
                throw new ArgumentException("Database name is required.");

            if (databaseName.Equals(":memory:", StringComparison.OrdinalIgnoreCase))
                return;

            if (databaseName.Length > 128)
                throw new ArgumentException("Database name is too long.");

            foreach (char character in databaseName)
            {
                if (char.IsLetterOrDigit(character) || character is '_' or '-' or '.')
                    continue;

                throw new ArgumentException($"Database name contains invalid character: '{character}'");
            }
        }

        private static string QuoteMySqlIdentifier(string identifier)
        {
            return $"`{identifier.Replace("`", "``", StringComparison.Ordinal)}`";
        }

        private static string QuotePostgreSqlIdentifier(string identifier)
        {
            return $"\"{identifier.Replace("\"", "\"\"", StringComparison.Ordinal)}\"";
        }

        private static string QuoteSqlServerIdentifier(string identifier)
        {
            return $"[{identifier.Replace("]", "]]", StringComparison.Ordinal)}]";
        }
    }
}
