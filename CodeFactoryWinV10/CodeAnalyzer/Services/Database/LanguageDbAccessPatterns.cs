using System.Text.RegularExpressions;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Database;

/// <summary>언어별 함수 헤더 검출 정규식 및 ORM/DB 접근 패턴 정의.</summary>
internal static class LanguageDbAccessPatterns
{
    // ============================================================
    // 언어별 함수·메서드 헤더 검출 정규식
    // ============================================================

    private static readonly Regex PythonFunctionHeader = new(
        @"(?m)^\s*(?:async\s+)?def\s+(\w+)\s*\(",
        RegexOptions.Compiled);

    private static readonly Regex GoFunctionHeader = new(
        @"(?m)^\s*func\s+(?:\([^)]*\)\s*)?(\w+)\s*\(",
        RegexOptions.Compiled);

    private static readonly Regex RubyMethodHeader = new(
        @"(?m)^\s*def\s+(?:self\s*\.\s*)?(\w+)",
        RegexOptions.Compiled);

    private static readonly Regex PhpFunctionHeader = new(
        @"(?m)^\s*(?:(?:public|protected|private|static|abstract|final)\s+)*function\s+(\w+)\s*\(",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex RustFunctionHeader = new(
        @"(?m)^\s*(?:pub(?:\s*\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)\s*[<(]",
        RegexOptions.Compiled);

    private static readonly Regex SwiftFunctionHeader = new(
        @"(?m)^\s*(?:(?:public|private|internal|open|fileprivate|override|static|class|mutating|nonmutating|dynamic|final|required|convenience)\s+)*func\s+(\w+)\s*[<(]",
        RegexOptions.Compiled);

    private static readonly Regex KotlinFunctionHeader = new(
        @"(?m)^\s*(?:(?:public|private|protected|internal|override|abstract|open|final|suspend|inline|tailrec|operator|infix)\s+)*fun\s+(?:<[^>]*>\s+)?(\w+)\s*\(",
        RegexOptions.Compiled);

    private static readonly Regex JavaFunctionHeader = new(
        @"(?m)^\s*(?:(?:public|protected|private|static|abstract|final|synchronized|native|default)\s+)*(?:[\w<>\[\]?,\s]+\s+)?(\w+)\s*\(",
        RegexOptions.Compiled);

    private static readonly Regex CppFunctionHeader = new(
        @"(?m)^\s*(?:(?:virtual|static|inline|explicit|friend|extern|constexpr|override|final)\s+)*(?:[\w:<>\[\]?&*]+\s+)+(?:\w+::)*(\w+)\s*\(",
        RegexOptions.Compiled);

    // named function / class method / const fn assignment — groups 1, 2, 3
    private static readonly Regex JsFunctionHeader = new(
        @"(?m)(?:(?:export\s+(?:default\s+)?)?(?:async\s+)?function(?:\s*\*)?\s+(\w+)\s*\(|^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>))",
        RegexOptions.Compiled);

    private static readonly Regex VbNetFunctionHeader = new(
        @"(?m)^\s*(?:(?:Public|Private|Protected|Friend|Shared|Overrides|Overridable|MustOverride|Shadows|NotOverridable|Async|Partial)\s+)*(?:Sub|Function)\s+(\w+)\s*\(",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Dictionary<string, Regex> FunctionHeadersByLanguage =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["python"] = PythonFunctionHeader,
            ["go"] = GoFunctionHeader,
            ["ruby"] = RubyMethodHeader,
            ["php"] = PhpFunctionHeader,
            ["rust"] = RustFunctionHeader,
            ["swift"] = SwiftFunctionHeader,
            ["kotlin"] = KotlinFunctionHeader,
            ["java"] = JavaFunctionHeader,
            ["cpp"] = CppFunctionHeader,
            ["javascript"] = JsFunctionHeader,
            ["vbnet"] = VbNetFunctionHeader,
        };

    internal static Regex? GetFunctionHeaderRegex(string languageId) =>
        FunctionHeadersByLanguage.TryGetValue(languageId, out var rx) ? rx : null;

    // ============================================================
    // ORM 패턴 정의
    // ============================================================

    internal sealed class OrmPattern
    {
        public required Regex PatternRegex { get; init; }
        /// <summary>엔티티·테이블 이름 캡처 그룹 번호 (0 = 추출 불가).</summary>
        public int EntityNameGroup { get; init; }
        public required DatabaseCrudOperation Operation { get; init; }
        public DatabaseTableAccessPattern AccessPattern { get; init; } = DatabaseTableAccessPattern.EntityType;
        /// <summary>knex('table'), DB::table('table') 등 문자열 리터럴 테이블명.</summary>
        public bool UsesLiteralTableName { get; init; }
    }

    // ============================================================
    // Python: Django ORM + SQLAlchemy
    // ============================================================
    private static readonly IReadOnlyList<OrmPattern> PythonPatterns =
    [
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)\.objects\.(filter|all|get|first|last|count|exists|values|aggregate|distinct|order_by|select_related|prefetch_related|annotate|using|raw|only|defer|values_list|earliest|latest|none)\b",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Read
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)\.objects\.(create|bulk_create|get_or_create|update_or_create)\b",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Create
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)\.objects\.(update|bulk_update)\b",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Update
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)\.objects\.delete\b",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Delete
        },
        // SQLAlchemy: session.query(Entity)
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:session|db\.session|self\.session|self\.db)\s*\.\s*query\s*\(\s*(\w+)",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Read
        },
        // SQLAlchemy Core: select(table) / insert(table) / update(table) / delete(table)
        new OrmPattern {
            PatternRegex = new Regex(@"\bselect\s*\(\s*(\w+)\s*\)", RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Read
        },
        new OrmPattern {
            PatternRegex = new Regex(@"\binsert\s*\(\s*(\w+)\s*\)", RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Create
        },
        new OrmPattern {
            PatternRegex = new Regex(@"\bupdate\s*\(\s*(\w+)\s*\)", RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Update
        },
        new OrmPattern {
            PatternRegex = new Regex(@"\bdelete\s*\(\s*(\w+)\s*\)", RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Delete
        },
    ];

    // ============================================================
    // Java: JPA/Hibernate + Spring Data
    // ============================================================
    private static readonly IReadOnlyList<OrmPattern> JavaPatterns =
    [
        new OrmPattern {
            PatternRegex = new Regex(
                @"\bentityManager\s*\.\s*find\s*\(\s*(\w+)\s*\.class",
                RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Read
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\bentityManager\s*\.\s*(?:persist|merge)\s*\(",
                RegexOptions.Compiled),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.Create | DatabaseCrudOperation.Update
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\bentityManager\s*\.\s*remove\s*\(",
                RegexOptions.Compiled),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.Delete
        },
        // Spring Data: xyzRepository.save/saveAll
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)(?:Repository|Repo|Dao)\s*\.\s*(?:save|saveAll|saveAndFlush|saveAllAndFlush)\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Create | DatabaseCrudOperation.Update
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)(?:Repository|Repo|Dao)\s*\.\s*(?:findById|findAll|findBy\w+|existsById|existsBy\w*|count\w*|getById|getReferenceById|findOne|findFirst\w*|findTop\w*)\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Read
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)(?:Repository|Repo|Dao)\s*\.\s*(?:deleteById|delete|deleteAll|deleteBy\w+)\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Delete
        },
        // JDBC / Spring JdbcTemplate
        new OrmPattern {
            PatternRegex = new Regex(
                @"\bjdbcTemplate\s*\.\s*(?:query|queryForObject|queryForList|queryForMap|update|batchUpdate)\s*\(",
                RegexOptions.Compiled),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.None
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\bnamedParameterJdbcTemplate\s*\.\s*(?:query|queryForObject|queryForList|update|batchUpdate)\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.None
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:session|entityManager)\s*\.\s*create(?:SQL|Native)Query\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.None
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:stmt|statement|ps|preparedStatement)\s*\.\s*(?:executeQuery|executeUpdate|execute)\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.None
        },
    ];

    // ============================================================
    // JavaScript/TypeScript: Prisma + Sequelize + TypeORM + Mongoose
    // ============================================================
    private static readonly IReadOnlyList<OrmPattern> JavaScriptPatterns =
    [
        // Prisma: prisma.model / *Client.model
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:prisma|\w+Client)\s*\.\s*(\w+)\s*\.\s*(?:findMany|findUnique|findFirst|findUniqueOrThrow|findFirstOrThrow|count|aggregate|groupBy)\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Read
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:prisma|\w+Client)\s*\.\s*(\w+)\s*\.\s*(?:create|createMany)\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Create
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:prisma|\w+Client)\s*\.\s*(\w+)\s*\.\s*(?:update|updateMany|upsert)\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Update
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:prisma|\w+Client)\s*\.\s*(\w+)\s*\.\s*(?:delete|deleteMany)\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Delete
        },
        // Node pg / mysql2 / mariadb
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:pool|connection|conn|client|db)\s*\.\s*(?:query|execute)\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.None
        },
        new OrmPattern {
            PatternRegex = new Regex(@"\bmariadb\s*\.\s*create(?:Connection|Pool)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.None
        },
        // Sequelize: Model.findAll / findOne / findByPk / count
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)\s*\.\s*(?:findAll|findOne|findByPk|findAndCountAll|findOrCreate|findOrBuild)\s*\(",
                RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Read
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)\s*\.\s*(?:bulkCreate|upsert)\s*\(",
                RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Create
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)\s*\.\s*(?:destroy|truncate)\s*\(",
                RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Delete
        },
        // TypeORM: getRepository(Entity)
        new OrmPattern {
            PatternRegex = new Regex(@"\bgetRepository\s*\(\s*(\w+)", RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.None
        },
        // TypeORM: manager.find/findOne/findBy(Entity, ...)
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:manager|dataSource|AppDataSource)\s*\.\s*(?:find|findOne|findOneBy|findBy|findAndCount|count)\s*\(\s*(\w+)",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Read
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:manager|dataSource|AppDataSource)\s*\.\s*(?:delete|remove)\s*\(\s*(\w+)",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Delete
        },
        // Mongoose: Model.find / findOne / findById
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)\s*\.\s*(?:findOne|findById|countDocuments|estimatedDocumentCount|aggregate)\s*\(",
                RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Read
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)\s*\.\s*insertMany\s*\(",
                RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Create
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)\s*\.\s*(?:updateOne|updateMany|findOneAndUpdate|findByIdAndUpdate|replaceOne)\s*\(",
                RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Update
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)\s*\.\s*(?:deleteOne|deleteMany|findOneAndDelete|findByIdAndDelete|findOneAndRemove)\s*\(",
                RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Delete
        },
        // Knex: knex('tablename') / knex.table('tablename')
        new OrmPattern {
            PatternRegex = new Regex(@"\bknex\s*\(\s*['""`](\w+)['""`]", RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.None, UsesLiteralTableName = true
        },
        new OrmPattern {
            PatternRegex = new Regex(@"\bknex\s*\.\s*table\s*\(\s*['""`](\w+)['""`]", RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.None, UsesLiteralTableName = true
        },
    ];

    // ============================================================
    // Ruby: ActiveRecord
    // ============================================================
    private static readonly IReadOnlyList<OrmPattern> RubyPatterns =
    [
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)\.(find|find_by|find_by_\w+|where|all|first|last|take|count|exists\?|pluck|select|includes|joins|group|order|limit|offset|having|sum|average|minimum|maximum|ids|pick|none)\b",
                RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Read
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)\.(create|create!|insert|insert!|insert_all|insert_all!|upsert|upsert_all)\b",
                RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Create
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)\.(update|update!|update_all|update_attribute|update_attributes|update_column|update_columns|save|save!|touch)\b",
                RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Update
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)\.(destroy|destroy!|destroy_all|destroy_by|delete|delete_all|delete_by)\b",
                RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Delete
        },
    ];

    // ============================================================
    // Go: database/sql + GORM
    // ============================================================
    private static readonly IReadOnlyList<OrmPattern> GoPatterns =
    [
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:db|tx|DB|gdb|conn)\s*\.\s*(?:Find|First|Last|Take|Scan|Pluck|Count|Raw)\b",
                RegexOptions.Compiled),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.Read
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:db|tx|DB|gdb|conn)\s*\.\s*(?:Create|FirstOrCreate|FirstOrInit)\b",
                RegexOptions.Compiled),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.Create
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:db|tx|DB|gdb|conn)\s*\.\s*(?:Save|Update|Updates)\b",
                RegexOptions.Compiled),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.Update
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:db|tx|DB|gdb|conn)\s*\.\s*Delete\b",
                RegexOptions.Compiled),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.Delete
        },
        // database/sql
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:db|tx|stmt|rows)\s*\.\s*(?:Query|QueryRow|QueryContext|QueryRowContext)\b",
                RegexOptions.Compiled),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.Read
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:db|tx|stmt)\s*\.\s*(?:Exec|ExecContext)\b",
                RegexOptions.Compiled),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.None
        },
    ];

    // ============================================================
    // PHP: Laravel Eloquent + PDO
    // ============================================================
    private static readonly IReadOnlyList<OrmPattern> PhpPatterns =
    [
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)::(all|find|findOrFail|findMany|where|whereIn|whereNotIn|whereBetween|first|firstOrFail|latest|oldest|get|count|exists|pluck|value|paginate|simplePaginate|chunk|cursor|lazy|findOrNew|withTrashed|onlyTrashed)\b",
                RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Read
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)::(create|firstOrCreate|firstOrNew|updateOrCreate|insert|insertOrIgnore|upsert|forceCreate)\b",
                RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Create
        },
        new OrmPattern {
            PatternRegex = new Regex(@"\b(\w+)::update\s*\(", RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Update
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)::(destroy|delete|forceDelete|truncate)\b",
                RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Delete
        },
        // DB::table('name')
        new OrmPattern {
            PatternRegex = new Regex(@"\bDB\s*::\s*table\s*\(\s*['""](\w+)['""]", RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.None, UsesLiteralTableName = true
        },
        // PDO / PostgreSQL C API
        new OrmPattern {
            PatternRegex = new Regex(@"\bpg_(?:query|prepare|execute|send_query|query_params)\s*\(", RegexOptions.Compiled),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.None
        },
        new OrmPattern {
            PatternRegex = new Regex(@"\$\w+\s*->\s*(?:query|prepare|execute|exec)\s*\(", RegexOptions.Compiled),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.None
        },
    ];

    // ============================================================
    // Kotlin: Spring Data JPA + Exposed + Room
    // ============================================================
    private static readonly IReadOnlyList<OrmPattern> KotlinPatterns =
    [
        // Exposed DSL
        new OrmPattern {
            PatternRegex = new Regex(@"\b(\w+)\s*\.\s*selectAll\s*\(", RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Read
        },
        new OrmPattern {
            PatternRegex = new Regex(@"\b(\w+)\s*\.\s*select\s*\{", RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Read
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)\s*\.\s*(?:insert|batchInsert|insertAndGetId)\s*[\({]",
                RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Create
        },
        new OrmPattern {
            PatternRegex = new Regex(@"\b(\w+)\s*\.\s*update\s*[\({]", RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Update
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)\s*\.\s*(?:deleteWhere|deleteAll|deleteIgnoreWhere)\s*[\({]",
                RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Delete
        },
        // Spring Data (same pattern as Java)
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)(?:Repository|Repo)\s*\.\s*(?:save|saveAll|saveAndFlush)\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Create | DatabaseCrudOperation.Update
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)(?:Repository|Repo)\s*\.\s*(?:findById|findAll|findBy\w+|existsById|count\w*|getById)\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Read
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)(?:Repository|Repo)\s*\.\s*(?:deleteById|delete|deleteAll)\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Delete
        },
    ];

    // ============================================================
    // Swift: Core Data + GRDB
    // ============================================================
    private static readonly IReadOnlyList<OrmPattern> SwiftPatterns =
    [
        new OrmPattern {
            PatternRegex = new Regex(@"\bNSFetchRequest\s*<\s*(\w+)\s*>", RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Read
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\bNSEntityDescription\s*\.\s*insertNewObject\s*\(\s*forEntityName\s*:\s*[""'](\w+)[""']",
                RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Create
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:context|managedObjectContext|viewContext|backgroundContext)\s*\.\s*fetch\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.Read
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:context|managedObjectContext|viewContext|backgroundContext)\s*\.\s*save\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.Create | DatabaseCrudOperation.Update
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:context|managedObjectContext|viewContext|backgroundContext)\s*\.\s*delete\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.Delete
        },
        // GRDB
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(\w+)\s*\.\s*(?:fetchAll|fetchOne|fetchCount|fetchCursor)\s*\(",
                RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Read
        },
    ];

    // ============================================================
    // Rust: Diesel + SQLx
    // ============================================================
    private static readonly IReadOnlyList<OrmPattern> RustPatterns =
    [
        new OrmPattern {
            PatternRegex = new Regex(
                @"\bdiesel\s*::\s*insert_into\s*\(\s*(?:\w+::)*(\w+)::table\b",
                RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Create
        },
        new OrmPattern {
            PatternRegex = new Regex(@"\bdiesel\s*::\s*update\s*\(", RegexOptions.Compiled),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.Update
        },
        new OrmPattern {
            PatternRegex = new Regex(@"\bdiesel\s*::\s*delete\s*\(", RegexOptions.Compiled),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.Delete
        },
        new OrmPattern {
            PatternRegex = new Regex(@"\.load\s*::\s*<\s*(\w+)", RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Read
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\.(?:first|get_result|get_results)\s*::\s*<\s*(\w+)",
                RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Read
        },
        new OrmPattern {
            PatternRegex = new Regex(@"\bsqlx\s*::\s*(?:query|query_as|query_scalar)\b", RegexOptions.Compiled),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.None
        },
    ];

    // ============================================================
    // C/C++: MySQL / SQLite / PostgreSQL / ODBC C APIs
    // ============================================================
    private static readonly IReadOnlyList<OrmPattern> CppPatterns =
    [
        new OrmPattern {
            PatternRegex = new Regex(@"\b(?:mysql_query|mysql_real_query|mysql_stmt_execute)\s*\(", RegexOptions.Compiled),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.None
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:mariadb_query|mariadb_real_query|mariadb_stmt_execute)\s*\(",
                RegexOptions.Compiled),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.None
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:sqlite3_exec|sqlite3_prepare_v2|sqlite3_prepare|sqlite3_step)\s*\(",
                RegexOptions.Compiled),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.None
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:PQexec|PQexecParams|PQexecPrepared|PQprepare)\s*\(",
                RegexOptions.Compiled),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.None
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:SQLExecDirect|SQLExecute|SQLPrepare)\s*\(",
                RegexOptions.Compiled),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.None
        },
    ];

    // ============================================================
    // C#: Dapper + NHibernate native SQL
    // ============================================================
    private static readonly IReadOnlyList<OrmPattern> CSharpPatterns =
    [
        new OrmPattern {
            PatternRegex = new Regex(
                @"\.(?:Query(?:Async|First|FirstOrDefault|Single|SingleOrDefault|Multiple)?|Execute(?:Async)?|ExecuteScalar(?:Async)?)\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.None
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\bSqlMapper\s*\.\s*(?:Query|Execute|QueryAsync|ExecuteAsync)\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.None
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\b(?:session|Session)\s*\.\s*Create(?:SQL)?Query\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 0, Operation = DatabaseCrudOperation.None
        },
    ];

    private static readonly IReadOnlyList<OrmPattern> VbNetPatterns = CSharpPatterns;

    // ============================================================
    // 언어별 SQL 문자열 인자 캡처 (DB 범용 · 언어 API 특화)
    // ============================================================

    internal sealed class NativeSqlCapturePattern
    {
        public required Regex PatternRegex { get; init; }
        public int SqlLiteralGroup { get; init; } = 1;
        public bool IsTaggedTemplate { get; init; }
    }

    private const string SqlStringArg =
        @"(?:""(?:\\.|[^""\\])*""|'(?:\\.|[^'\\])*'|@?""(?:(?:\\.|[^""\\])*)"")";

    private static readonly IReadOnlyList<NativeSqlCapturePattern> CSharpNativeSql =
    [
        new NativeSqlCapturePattern {
            PatternRegex = new Regex(
                @"\.(?:Query(?:Async|First|FirstOrDefault|Single|SingleOrDefault|Multiple)?|Execute(?:Async)?|ExecuteScalar(?:Async)?)\s*\(\s*" + SqlStringArg,
                RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.Singleline),
            SqlLiteralGroup = 1
        },
    ];

    private static readonly IReadOnlyList<NativeSqlCapturePattern> PythonNativeSql =
    [
        new NativeSqlCapturePattern {
            PatternRegex = new Regex(
                @"\.(?:execute|executemany|executescript)\s*\(\s*(""(?:\\.|[^""\\])*""|'(?:\\.|[^'\\])*'|""""""[\s\S]*?""""""|'''[\s\S]*?''')",
                RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.Singleline),
            SqlLiteralGroup = 1
        },
    ];

    private static readonly IReadOnlyList<NativeSqlCapturePattern> JavaScriptNativeSql =
    [
        new NativeSqlCapturePattern {
            PatternRegex = new Regex(@"\bsql\s*`(?:\\.|[^`\\])*`", RegexOptions.Compiled | RegexOptions.IgnoreCase),
            IsTaggedTemplate = true
        },
        new NativeSqlCapturePattern {
            PatternRegex = new Regex(
                @"\.(?:query|execute)\s*\(\s*" + SqlStringArg,
                RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.Singleline),
            SqlLiteralGroup = 1
        },
    ];

    private static readonly IReadOnlyList<NativeSqlCapturePattern> GoNativeSql =
    [
        new NativeSqlCapturePattern {
            PatternRegex = new Regex(
                @"\.(?:Query|QueryRow|Exec|Prepare)(?:Context)?\s*\(\s*(?:`(?:\\.|[^`\\])*`|""(?:\\.|[^""\\])*"")",
                RegexOptions.Compiled | RegexOptions.Singleline),
            SqlLiteralGroup = 1
        },
    ];

    private static readonly IReadOnlyList<NativeSqlCapturePattern> JavaNativeSql =
    [
        new NativeSqlCapturePattern {
            PatternRegex = new Regex(
                @"\.(?:prepareStatement|executeQuery|executeUpdate|execute)\s*\(\s*" + SqlStringArg,
                RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.Singleline),
            SqlLiteralGroup = 1
        },
    ];

    private static readonly IReadOnlyList<NativeSqlCapturePattern> PhpNativeSql =
    [
        new NativeSqlCapturePattern {
            PatternRegex = new Regex(
                @"(?:->|\:\:)\s*(?:query|prepare|exec)\s*\(\s*" + SqlStringArg,
                RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.Singleline),
            SqlLiteralGroup = 1
        },
    ];

    private static readonly IReadOnlyList<NativeSqlCapturePattern> RubyNativeSql =
    [
        new NativeSqlCapturePattern {
            PatternRegex = new Regex(
                @"\.(?:execute|exec_query|exec_insert|exec_delete|exec_update)\s*\(\s*" + SqlStringArg,
                RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.Singleline),
            SqlLiteralGroup = 1
        },
    ];

    private static readonly IReadOnlyList<NativeSqlCapturePattern> RustNativeSql =
    [
        new NativeSqlCapturePattern {
            PatternRegex = new Regex(
                @"\bsqlx::query(?:_as|_scalar|_as_unchecked)?!\s*\(\s*(?:r#)?""(?:\\.|[^""\\])*""",
                RegexOptions.Compiled | RegexOptions.Singleline),
            SqlLiteralGroup = 0
        },
    ];

    private static readonly IReadOnlyList<NativeSqlCapturePattern> SwiftNativeSql =
    [
        new NativeSqlCapturePattern {
            PatternRegex = new Regex(
                @"\.(?:execute|run|fetch)\s*\(\s*(?:sql:\s*)?" + SqlStringArg,
                RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.Singleline),
            SqlLiteralGroup = 1
        },
    ];

    private static readonly IReadOnlyList<NativeSqlCapturePattern> CppNativeSql =
    [
        new NativeSqlCapturePattern {
            PatternRegex = new Regex(
                @"\b(?:mysql_query|mysql_real_query|mysqli_query|PQexec|PQexecParams|SQLExecDirect)\s*\([^,]+,\s*" + SqlStringArg,
                RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.Singleline),
            SqlLiteralGroup = 1
        },
    ];

    private static readonly Dictionary<string, IReadOnlyList<NativeSqlCapturePattern>> NativeSqlByLanguage =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["csharp"] = CSharpNativeSql,
            ["vbnet"] = CSharpNativeSql,
            ["python"] = PythonNativeSql,
            ["javascript"] = JavaScriptNativeSql,
            ["java"] = JavaNativeSql,
            ["kotlin"] = JavaNativeSql,
            ["go"] = GoNativeSql,
            ["php"] = PhpNativeSql,
            ["ruby"] = RubyNativeSql,
            ["rust"] = RustNativeSql,
            ["swift"] = SwiftNativeSql,
            ["cpp"] = CppNativeSql,
        };

    private static readonly Dictionary<string, IReadOnlyList<OrmPattern>> OrmPatternsByLanguage =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["csharp"] = CSharpPatterns,
            ["vbnet"] = VbNetPatterns,
            ["python"] = PythonPatterns,
            ["java"] = JavaPatterns,
            ["javascript"] = JavaScriptPatterns,
            ["kotlin"] = [.. KotlinPatterns, .. JavaPatterns],
            ["ruby"] = RubyPatterns,
            ["go"] = GoPatterns,
            ["php"] = PhpPatterns,
            ["swift"] = SwiftPatterns,
            ["rust"] = RustPatterns,
            ["cpp"] = CppPatterns,
        };

    internal static IReadOnlyList<OrmPattern> GetOrmPatterns(string languageId) =>
        OrmPatternsByLanguage.TryGetValue(languageId, out var list) ? list : [];

    internal static bool HasDbExecutionSignal(string body, string languageId)
    {
        if (string.IsNullOrWhiteSpace(body) || string.IsNullOrWhiteSpace(languageId))
        {
            return false;
        }

        foreach (var pattern in GetNativeSqlCapturePatterns(languageId))
        {
            if (pattern.PatternRegex.IsMatch(body))
            {
                return true;
            }
        }

        foreach (var ormPattern in GetOrmPatterns(languageId))
        {
            if (ormPattern.EntityNameGroup <= 0 && ormPattern.PatternRegex.IsMatch(body))
            {
                return true;
            }
        }

        return false;
    }

    internal static void ScanNativeSqlArguments(string body, string languageId, Action<string> scanSql)
    {
        if (string.IsNullOrWhiteSpace(body) || string.IsNullOrWhiteSpace(languageId))
        {
            return;
        }

        foreach (var pattern in GetNativeSqlCapturePatterns(languageId))
        {
            foreach (Match match in pattern.PatternRegex.Matches(body))
            {
                string raw;
                if (pattern.IsTaggedTemplate)
                {
                    raw = match.Value;
                    var start = raw.IndexOf('`');
                    var end = raw.LastIndexOf('`');
                    if (start < 0 || end <= start)
                    {
                        continue;
                    }

                    raw = raw[(start + 1)..end];
                }
                else if (pattern.SqlLiteralGroup > 0 && match.Groups[pattern.SqlLiteralGroup].Success)
                {
                    raw = match.Groups[pattern.SqlLiteralGroup].Value;
                }
                else
                {
                    raw = match.Value;
                    var quote = raw.IndexOf('"');
                    if (quote < 0)
                    {
                        continue;
                    }

                    var endQuote = raw.LastIndexOf('"');
                    if (endQuote <= quote)
                    {
                        continue;
                    }

                    raw = raw[(quote + 1)..endQuote];
                }

                if (!SqlPatternHelper.TryUnwrapSqlLiteral(
                        pattern.IsTaggedTemplate ? $"`{raw}`" : raw,
                        out var sql))
                {
                    if (pattern.IsTaggedTemplate)
                    {
                        sql = raw;
                    }
                    else
                    {
                        continue;
                    }
                }

                var normalized = SqlPatternHelper.NormalizeSqlLiteralEscapes(sql);
                if (SqlPatternHelper.LooksLikeSqlStatement(normalized))
                {
                    scanSql(normalized);
                }
            }
        }
    }

    private static IEnumerable<NativeSqlCapturePattern> GetNativeSqlCapturePatterns(string languageId)
    {
        if (NativeSqlByLanguage.TryGetValue(languageId, out var patterns))
        {
            foreach (var pattern in patterns)
            {
                yield return pattern;
            }
        }
    }
}
