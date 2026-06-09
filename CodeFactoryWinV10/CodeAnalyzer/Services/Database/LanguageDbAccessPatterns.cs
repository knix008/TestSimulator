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
        @"(?m)^\s*(?:(?:public|protected|private|static|abstract|final|synchronized|native|default)\s+)+(?:[\w<>\[\]?,\s]+\s+)?(\w+)\s*\(",
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
    ];

    // ============================================================
    // JavaScript / TypeScript: Prisma + Sequelize + TypeORM + Mongoose
    // ============================================================
    private static readonly IReadOnlyList<OrmPattern> JavaScriptPatterns =
    [
        // Prisma: prisma.model.findMany / findUnique / findFirst / count
        new OrmPattern {
            PatternRegex = new Regex(
                @"\bprisma\s*\.\s*(\w+)\s*\.\s*(?:findMany|findUnique|findFirst|findUniqueOrThrow|findFirstOrThrow|count|aggregate|groupBy)\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Read
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\bprisma\s*\.\s*(\w+)\s*\.\s*(?:create|createMany)\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Create
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\bprisma\s*\.\s*(\w+)\s*\.\s*(?:update|updateMany|upsert)\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Update
        },
        new OrmPattern {
            PatternRegex = new Regex(
                @"\bprisma\s*\.\s*(\w+)\s*\.\s*(?:delete|deleteMany)\s*\(",
                RegexOptions.Compiled | RegexOptions.IgnoreCase),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.Delete
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
        // Knex: knex('tablename')
        new OrmPattern {
            PatternRegex = new Regex(@"\bknex\s*\(\s*['""`](\w+)['""`]", RegexOptions.Compiled),
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.None
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
            EntityNameGroup = 1, Operation = DatabaseCrudOperation.None
        },
        // PDO
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
            PatternRegex = new Regex(@"\b(?:mysql_query|mysql_real_query)\s*\(", RegexOptions.Compiled),
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
                @"\b(?:PQexec|PQexecParams|PQexecPrepared)\s*\(",
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

    private static readonly Dictionary<string, IReadOnlyList<OrmPattern>> OrmPatternsByLanguage =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["python"] = PythonPatterns,
            ["java"] = JavaPatterns,
            ["javascript"] = JavaScriptPatterns,
            ["kotlin"] = KotlinPatterns,
            ["ruby"] = RubyPatterns,
            ["go"] = GoPatterns,
            ["php"] = PhpPatterns,
            ["swift"] = SwiftPatterns,
            ["rust"] = RustPatterns,
            ["cpp"] = CppPatterns,
        };

    internal static IReadOnlyList<OrmPattern> GetOrmPatterns(string languageId) =>
        OrmPatternsByLanguage.TryGetValue(languageId, out var list) ? list : [];
}
