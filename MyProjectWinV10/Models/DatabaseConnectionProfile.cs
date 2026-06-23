namespace MyProject.Models
{
    public sealed class DatabaseConnectionProfile
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string Name { get; set; } = "Default";
        public DatabaseProviderKind Provider { get; set; } = DatabaseProviderKind.MariaDb;
        public string Server { get; set; } = "localhost";
        public int Port { get; set; } = 3306;
        public string Database { get; set; } = "myproject";
        public string UserName { get; set; } = "";
        public string EncryptedPassword { get; set; } = "";

        public DatabaseConnectionProfile Clone() => new()
        {
            Id = Id,
            Name = Name,
            Provider = Provider,
            Server = Server,
            Port = Port,
            Database = Database,
            UserName = UserName,
            EncryptedPassword = EncryptedPassword
        };

        public string GetPassword() => SecureStorage.Unprotect(EncryptedPassword);

        public void SetPassword(string password) =>
            EncryptedPassword = SecureStorage.Protect(password);

        public void ApplyDefaultPort()
        {
            if (Provider == DatabaseProviderKind.Sqlite)
                Port = 0;
            else if (Port <= 0)
                Port = DatabaseProviderInfo.GetDefaultPort(Provider);
        }

        public bool UsesNetworkServer => Provider != DatabaseProviderKind.Sqlite;
    }

    public sealed class DatabaseProjectSummary
    {
        public int Id { get; init; }
        public string Name { get; init; } = "";
        public DateTime UpdatedUtc { get; init; }
        public long Version { get; init; }
    }

    public sealed class DatabaseScheduleRevision
    {
        public int ProjectId { get; init; }
        public long Version { get; init; }
        public DateTime UpdatedUtc { get; init; }
        public string? UpdatedBy { get; init; }
    }
}
