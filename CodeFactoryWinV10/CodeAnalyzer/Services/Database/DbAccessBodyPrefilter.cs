namespace CodeAnalyzer.Services.Database;

/// <summary>무거운 정규식 전에 DB 접근 가능성을 빠르게 판별합니다.</summary>
internal static class DbAccessBodyPrefilter
{
    private static readonly string[] UniversalSqlMarkers =
    [
        "SELECT ", "INSERT ", "UPDATE ", "DELETE ", " FROM ", "CREATE TABLE", "MERGE INTO",
        "@Table", "@Entity", "ATTACH DATABASE", "CREATE DATABASE", "USE "
    ];

    private static readonly string[] JvmMarkers =
    [
        "Repository", "Jdbc", "EntityManager", "JpaRepository", "createQuery", "createNativeQuery",
        "@Query", "@Table", "getConnection", "PreparedStatement", "NamedParameterJdbc", "Hibernate",
        "SqlSession", "MyBatis", "executeQuery", "executeUpdate"
    ];

    private static readonly string[] JsMarkers =
    [
        "prisma", "mongoose", "sequelize", "typeorm", "createConnection", "createPool", "knex",
        ".query(", ".execute(", "findMany", "findOne", "createQueryBuilder", "Repository",
        "getRepository", "PrismaClient", "DataSource"
    ];

    private static readonly string[] DotNetMarkers =
    [
        "DbContext", "DbSet", ".Set<", "SaveChanges", "FromSqlRaw", "ExecuteSqlRaw", "SqlConnection",
        "Npgsql", "MySqlConnection", "EntityFramework"
    ];

    private static readonly string[] CatalogMarkers =
    [
        "jdbc:", "mysql://", "postgres://", "postgresql://", "mongodb://", "mariadb://",
        "Database=", "Initial Catalog", "Data Source", "sqlite3_open", "getConnection",
        "createConnection", "createPool", "SqlConnection", "PQconnect", "mysql_connect",
        "CREATE DATABASE", "DROP DATABASE", "ATTACH DATABASE"
    ];

    internal static bool MayContainDbAccess(string body, string languageId)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return false;
        }

        if (ContainsAny(body, UniversalSqlMarkers))
        {
            return true;
        }

        if (IsLanguage(languageId, "java", "kotlin") && ContainsAny(body, JvmMarkers))
        {
            return true;
        }

        if (IsLanguage(languageId, "javascript") && ContainsAny(body, JsMarkers))
        {
            return true;
        }

        if (IsLanguage(languageId, "csharp", "vbnet") && ContainsAny(body, DotNetMarkers))
        {
            return true;
        }

        return false;
    }

    internal static bool MayContainCatalogAccess(string body, string? languageId = null)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return false;
        }

        return ContainsAny(body, CatalogMarkers);
    }

    private static bool ContainsAny(string body, IReadOnlyList<string> markers)
    {
        foreach (var marker in markers)
        {
            if (body.Contains(marker, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private static bool IsLanguage(string languageId, params string[] ids)
    {
        foreach (var id in ids)
        {
            if (languageId.Equals(id, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }
}
