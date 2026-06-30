using Microsoft.EntityFrameworkCore;
using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;

namespace MyWorkspace.Data;

public static class DatabaseContextFactory
{
    public static DbContextOptions<AppDbContext> CreateOptions(DatabaseSettings settings)
    {
        var connectionString = settings.BuildConnectionString();
        var builder = new DbContextOptionsBuilder<AppDbContext>();

        switch (settings.Provider)
        {
            case DatabaseProviderType.MariaDB:
            case DatabaseProviderType.MySQL:
                builder.UseMySql(connectionString, ServerVersion.AutoDetect(connectionString));
                break;

            case DatabaseProviderType.PostgreSQL:
                builder.UseNpgsql(connectionString);
                break;

            case DatabaseProviderType.SqlServer:
                builder.UseSqlServer(connectionString);
                break;

            case DatabaseProviderType.SQLite:
                builder.UseSqlite(connectionString);
                break;

            default:
                throw new NotSupportedException($"지원하지 않는 DB 유형입니다: {settings.Provider}");
        }

        return builder.Options;
    }

    public static bool TestConnection(DatabaseSettings settings, out string errorMessage)
    {
        try
        {
            using var db = new AppDbContext(CreateOptions(settings));
            if (!db.Database.CanConnect())
            {
                errorMessage = "데이터베이스에 연결할 수 없습니다.";
                return false;
            }

            errorMessage = string.Empty;
            return true;
        }
        catch (Exception ex)
        {
            errorMessage = ex.Message;
            return false;
        }
    }
}
