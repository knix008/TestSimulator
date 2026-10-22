'use strict';

// Default taint models: sources, sinks, sanitizers, guards and propagators per
// language. Everything here is plain JSON once exported (regexes become
// strings), so users can add their own entries through ctx.options.taintModels.
//
// Chain text: a member/call chain is written as dotted text, calls end with
// "()", indexing with "[]":  req.query.id   request.getParameter()   $_GET[]
//
// Entry kinds
//   source      chain | (root, rootType, path) | call+intoArg ; label ; trust 'high'|'low'
//   param       ann | fnAnn | clsBase | type | notType | notName | notDef  (parameters that are sources)
//   sink        vuln ; call | (method, recv) | assign ; args ; argHas | argLacks | fileHas | fileLacks | objKey | notObject | kw
//   sanitizer   vulns ; call | (method, recv) ; argHas
//   guard       vulns ; call | (method, recv) | text ; check
//   propagator  call | (method, recv) ; from ; to

const ALL = 'all';
const NUM_TYPES = /^(int|long|short|byte|bool|boolean|double|float|decimal|uint|ulong|Int|Long|Short|Byte|Boolean|Double|Float|Integer|BigDecimal|BigInteger|UUID|Guid|DateTime|LocalDate|int32|int64|uint32|uint64|float64|float32|bool\?|int\?|long\?)\??$/;

const M = [];
const add = (kind, lang, spec) => M.push(Object.assign({ kind, lang }, spec));
const src = (lang, label, spec, trust) => add('source', lang, Object.assign({ label, trust: trust || 'high' }, spec));
const sink = (lang, vuln, spec) => add('sink', lang, Object.assign({ vuln }, spec));
const san = (lang, vulns, spec) => add('sanitizer', lang, Object.assign({ vulns }, spec));
const guard = (lang, vulns, spec) => add('guard', lang, Object.assign({ vulns }, spec));
const prop = (lang, spec) => add('propagator', lang, spec);
const param = (lang, label, spec) => add('param', lang, Object.assign({ label }, spec));

// ---------------------------------------------------------------- sources
// JavaScript / TypeScript: Express, Koa, Next.js, Fastify, Hapi, DOM
src('js', 'HTTP request', { root: /^(req|request|_req|r)$/, path: /^\.(query|body|params|headers|cookies|signedCookies|url|originalUrl|baseUrl|path|hostname|files?|rawBody|payload)(?![\w$])/ });
src('js', 'HTTP request', { root: /^(req|request)$/, path: /^\.(get|header|param|header)\(\)/ });
src('js', 'HTTP request', { root: /^(ctx|context)$/, path: /^\.(query|params|querystring|headers|header|cookies\.get\(\)|request\.(body|query|headers|files?))(?![\w$])/ });
src('js', 'HTTP request', { root: /^(req|request)$/, path: /^\.(nextUrl\.searchParams|json\(\)|formData\(\)|text\(\))/ });
src('js', 'HTTP request', { chain: /^(searchParams|url\.searchParams|request\.nextUrl\.searchParams)\.get\(\)/ });
src('js', 'URL/DOM input', { chain: /^((window|document|self|top)\.)?location\.(hash|search|href|pathname)(?![\w$])|^document\.(URL|documentURI|referrer|cookie|baseURI)(?![\w$])|^window\.name$|^(event|e|evt|msg)\.data$/, remap: { code: 'xss' }, notFor: ['ssrf', 'sqli', 'nosqli', 'cmdi', 'path', 'log', 'header', 'ldap', 'xpath', 'deser'] });
src('js', 'command-line argument', { chain: /^process\.argv(?![\w$])/ }, 'low');
src('js', 'environment variable', { chain: /^process\.env(?![\w$])/ }, 'low');
src('js', 'file content', { chain: /^(fs\.)?(readFileSync|readFile)\(\)|^fs\.promises\.readFile\(\)/ }, 'low');
src('js', 'standard input', { chain: /^process\.stdin(?![\w$])|^(rl|readline)\.question\(\)|^prompt\(\)/ }, 'low');

// Python: Flask, Django, FastAPI, Starlette, Tornado
src('py', 'HTTP request', { root: /^(request|req|flask\.request)$/, path: /^\.(args|form|values|json|data|cookies|headers|files|get_json\(\)|get_data\(\)|stream|query_params|path_params|path|full_path|url|query_string|environ|GET|POST|COOKIES|META|body|FILES|data|query|match_info|POST\.get\(\)|GET\.get\(\)|json\(\)|form\(\)|body\(\))(?![\w$])/ });
src('py', 'HTTP request', { root: /^self$/, path: /^\.(get_argument|get_arguments|get_query_argument|get_body_argument|get_cookie)\(\)|^\.request\.(body|arguments|query|headers|uri)/ });
src('py', 'command-line argument', { chain: /^sys\.argv(?![\w$])/ }, 'low');
src('py', 'environment variable', { chain: /^os\.(environ|getenv\(\)|environ\.get\(\))/ }, 'low');
src('py', 'standard input', { chain: /^(input|raw_input)\(\)|^sys\.stdin(?![\w$])/ }, 'low');
src('py', 'file content', { chain: /^open\(\)\.(read|readline|readlines)\(\)/ }, 'low');
param('py', 'route parameter', { fnAnn: /@\s*\w+(\s*\.\s*\w+)*\s*\.\s*(route|get|post|put|delete|patch|api_route|websocket)\b/, notName: /^(self|cls|request|req|db|session|response|background_tasks|current_user)$/, notType: /Request|Response|Session|BackgroundTasks|\bint\b|\bfloat\b|\bbool\b|UUID|WebSocket/, notDef: /Depends|Security/ });
param('py', 'view argument', { clsBase: /View|APIView|ViewSet/, fnName: /^(get|post|put|delete|patch)$/, notName: /^(self|cls|request|req|args|kwargs)$/ });

// Java / Kotlin: Servlet, Spring, JAX-RS
src('java', 'HTTP request', { root: /^(req|request|httpRequest|servletRequest|httpServletRequest)$/, rootType: /HttpServletRequest|ServletRequest|HttpRequest|ServerHttpRequest|WebRequest|NativeWebRequest/, path: /^\.(getParameter|getParameterValues|getParameterMap|getParameterNames|getHeader|getHeaders|getHeaderNames|getQueryString|getRequestURI|getRequestURL|getPathInfo|getCookies|getInputStream|getReader|getPart|getParts|getRemoteUser|getServletPath|getQueryParams|getFirst|getBody|getAttribute)\(\)/ });
src('java', 'HTTP cookie', { chain: /^\w+\.getValue\(\)$/, rootType: /^Cookie$/ });
src('java', 'command-line argument', { chain: /^args(\[\])?$/, fnName: /^main$/ }, 'low');
src('java', 'environment variable', { chain: /^System\.(getenv|getProperty)\(\)/ }, 'low');
src('java', 'standard input', { chain: /^(new )?Scanner\(\)\.(next|nextLine)\(\)|^\w+\.readLine\(\)$|^System\.console\(\)\.readLine\(\)|^readLine\(\)$|^readln\(\)$/ }, 'low');
src('java', 'file content', { chain: /^Files\.(readString|readAllLines|readAllBytes|lines)\(\)/ }, 'low');
param('java', 'request parameter', { ann: /@\s*(RequestParam|PathVariable|RequestBody|RequestHeader|CookieValue|ModelAttribute|RequestPart|MatrixVariable|QueryParam|PathParam|FormParam|HeaderParam|CookieParam|MatrixParam|BeanParam|QueryValue|PathVariable|Header|Body)\b/, notType: NUM_TYPES });
param('java', 'request parameter', { fnAnn: /@\s*(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\b/, type: /^(String|String\?|List\s*<\s*String\s*>|Map\s*<\s*String\s*,\s*String\s*>|String\[\])$/, notAnnAny: true });

// C#: ASP.NET Core / MVC / WebForms
src('cs', 'HTTP request', { root: /^(Request|HttpContext\.Request|context\.Request|httpContext\.Request|req|request|_httpContextAccessor\.HttpContext\.Request)$/, path: /^(\.(Query|Form|Headers|Cookies|QueryString|Params|Body|Path|RouteValues|Url|RawUrl|ServerVariables|Files|InputStream|UserAgent|UrlReferrer))?(\[\]|\.(Get|GetValues|TryGetValue)\(\)|(?![\w$]))/, rootType: /HttpRequest/ });
src('cs', 'HTTP request', { chain: /^(HttpContext|context|httpContext|this\.HttpContext)\.Request\.(Query|Form|Headers|Cookies|QueryString|Body|Path|RouteValues)/ });
src('cs', 'command-line argument', { chain: /^args(\[\])?$/, fnName: /^Main$/ }, 'low');
src('cs', 'environment variable', { chain: /^Environment\.GetEnvironmentVariable\(\)/ }, 'low');
src('cs', 'standard input', { chain: /^Console\.(ReadLine|Read)\(\)/ }, 'low');
src('cs', 'file content', { chain: /^File\.(ReadAllText|ReadAllLines|ReadAllBytes)\(\)/ }, 'low');
param('cs', 'request parameter', { ann: /\[\s*(FromQuery|FromBody|FromRoute|FromForm|FromHeader)\b/, notType: NUM_TYPES });
param('cs', 'action parameter', { fnAnn: /\[\s*(HttpGet|HttpPost|HttpPut|HttpDelete|HttpPatch|Route|AcceptVerbs)\b/, type: /^(string|string\?|String|IFormCollection|string\[\])$/ });
param('cs', 'action parameter', { clsBase: /\b(Controller|ControllerBase|ApiController|PageModel)\b/, fnPublic: true, type: /^(string|string\?|String|string\[\])$/ });

// PHP
src('php', 'HTTP request', { chain: /^\$_(GET|POST|REQUEST|COOKIE|FILES|SERVER)(?![\w$])|^\$HTTP_(GET|POST|COOKIE)_VARS/ });
src('php', 'HTTP request', { chain: /^(file_get_contents|fopen)\(\)$/, argHas: /php:\/\/input/ });
src('php', 'HTTP request', { chain: /^(filter_input|getallheaders|apache_request_headers)\(\)/ });
src('php', 'HTTP request', { root: /^\$(request|req|this->request)$/, rootType: /Request/, path: /^\.(input|get|query|post|all|cookie|header|file|json|getContent|only|except|route|string|validated)\(\)|^\.(query|request|cookies|headers|files)\.(get|all)\(\)/ });
src('php', 'HTTP request', { chain: /^(request\(\)\.(input|get|query|all)\(\)|request\(\)|Request\.(input|get|query|all)\(\)|Input\.(get|all)\(\))/ });
src('php', 'command-line argument', { chain: /^\$argv(?![\w$])/ }, 'low');
src('php', 'environment variable', { chain: /^(getenv\(\)|\$_ENV)/ }, 'low');
src('php', 'standard input', { chain: /^(fgets|readline|stream_get_contents)\(\)/, argHas: /STDIN|^\s*$/ }, 'low');

// Go: net/http, gin, echo, fiber, chi, mux
src('go', 'HTTP request', { root: /^(r|req|request|httpReq)$/, rootType: /http\.Request/, path: /^\.(URL\.(Query\(\)|RawQuery|Path|String\(\))|FormValue\(\)|PostFormValue\(\)|Form|PostForm|MultipartForm|Header|Body|Cookie\(\)|Cookies\(\)|Referer\(\)|UserAgent\(\)|RequestURI|Host|PathValue\(\))/ });
src('go', 'HTTP request', { root: /^(c|ctx|context)$/, rootType: /gin\.Context|echo\.Context|fiber\.Ctx|\*fiber\.Ctx/, path: /^\.(Query|DefaultQuery|Param|Params|PostForm|DefaultPostForm|GetHeader|Cookie|FormValue|QueryParam|QueryParams|FormParams|Get|Body|BodyParser|GetRawData|QueryArray|PostFormArray|FullPath)\(\)|^\.Request\.(URL|Body|Header|Form)/ });
src('go', 'HTTP request', { chain: /^(mux\.Vars|chi\.URLParam)\(\)/ });
src('go', 'HTTP request', { root: /^(c|ctx)$/, rootType: /gin\.Context|echo\.Context|fiber\.Ctx/, call: /^\.(ShouldBind\w*|Bind\w*|BodyParser)$/, intoArg: 0 });
src('go', 'command-line argument', { chain: /^os\.Args(?![\w$])|^flag\.(Arg|Args)\(\)/ }, 'low');
src('go', 'environment variable', { chain: /^os\.(Getenv|LookupEnv)\(\)/ }, 'low');
src('go', 'standard input', { chain: /^os\.Stdin(?![\w$])|^\w+\.(ReadString|Text)\(\)$/ }, 'low');
src('go', 'file content', { chain: /^(os|ioutil)\.ReadFile\(\)/ }, 'low');

// Ruby on Rails / Sinatra / Rack
src('rb', 'HTTP request', { chain: /^(params|cookies|request\.(params|query_parameters|request_parameters|body|headers|cookies|query_string|url|path|fullpath|env|raw_post|referer|referrer|user_agent|host))(?![\w$])/ });
src('rb', 'HTTP request', { chain: /^(params\.(permit|require|fetch|dig|to_unsafe_h|to_h|slice)\(\))/ });
src('rb', 'command-line argument', { chain: /^ARGV(?![\w$])/ }, 'low');
src('rb', 'environment variable', { chain: /^ENV(?![\w$])/ }, 'low');
src('rb', 'standard input', { chain: /^(gets|STDIN\.gets|\$stdin\.gets|STDIN\.read|\$stdin\.read)(\(\))?$/ }, 'low');
src('rb', 'file content', { chain: /^(File|IO)\.(read|readlines)\(\)/ }, 'low');

// ---------------------------------------------------------------- sinks
const DB_RECV = /(^|\.|_)(db|conn|connection|pool|client|knex|sequelize|pg|mysql|sqlite\d?|database|tx|trx|prisma|sql|cursor|cur|stmt|statement|em|entityManager|manager|jdbcTemplate|jdbc|template|session|dataSource|ds|dbh|pdo|mysqli|wpdb|DB|Db|engine|orm|repo|query|q|c|context|_context|ctx|dbContext|_db|Database|connection\(\)|getConnection\(\)|createStatement\(\)|ActiveRecord::Base\.connection|ActiveRecord\.Base\.connection)$/i;

// SQL injection
sink('js', 'sqli', { method: /^(query|execute|raw|exec|run|all|get|each|prepare|queryRaw|executeRaw|whereRaw|orWhereRaw|havingRaw|orderByRaw|joinRaw|unsafe|literal|none|one|many|any|oneOrNone|manyOrNone|result|multi)$/, recv: DB_RECV, args: [0] });
sink('js', 'sqli', { method: /^(\$queryRawUnsafe|\$executeRawUnsafe)$/, args: [0] });
sink('js', 'sqli', { call: /^(sequelize|db\.sequelize|knex)\.(query|raw)$/, args: [0] });
sink('py', 'sqli', { method: /^(execute|executemany|executescript|mogrify|raw|extra|exec_driver_sql)$/, args: [0], notRecv: /^(subprocess|os|session\.http)$/ });
sink('py', 'sqli', { call: /^(RawSQL|pandas\.read_sql|pd\.read_sql|read_sql_query|read_sql)$/, args: [0] });
sink('java', 'sqli', { method: /^(executeQuery|executeUpdate|executeLargeUpdate|execute|addBatch|prepareStatement|prepareCall|nativeSQL)$/, recv: /./, args: [0] });
sink('java', 'sqli', { method: /^(createQuery|createNativeQuery|createSQLQuery)$/, args: [0] });
sink('java', 'sqli', { method: /^(query|queryForObject|queryForList|queryForMap|queryForRowSet|update|batchUpdate|execute|queryForStream)$/, recv: /(jdbcTemplate|jdbc|template|namedParameterJdbcTemplate|JdbcTemplate)$/i, args: [0] });
sink('cs', 'sqli', { call: /^(SqlCommand|SqliteCommand|SQLiteCommand|MySqlCommand|NpgsqlCommand|OracleCommand|OleDbCommand|OdbcCommand|SqlDataAdapter|MySqlDataAdapter)$/, args: [0] });
sink('cs', 'sqli', { assign: /\.CommandText$/ });
sink('cs', 'sqli', { method: /^(ExecuteSqlRaw|ExecuteSqlRawAsync|FromSqlRaw|SqlQuery|ExecuteSqlCommand|ExecuteSqlCommandAsync|FromSql|SqlQueryRaw)$/, args: [0] });
sink('cs', 'sqli', { method: /^(Query|QueryAsync|QueryFirst|QueryFirstOrDefault|QuerySingle|QuerySingleOrDefault|QueryFirstOrDefaultAsync|QueryMultiple|Execute|ExecuteAsync|ExecuteScalar|ExecuteReader)$/, recv: /(conn|connection|db|_db|cnn|con|_connection|sqlConnection)$/i, args: [0] });
sink('php', 'sqli', { call: /^(mysql_query|mysql_unbuffered_query|mysql_db_query|sqlite_query|mssql_query|odbc_exec|db2_exec|oci_parse)$/, args: [0] });
sink('php', 'sqli', { call: /^(mysqli_query|mysqli_real_query|mysqli_multi_query|mysqli_prepare|pg_query|pg_send_query|pg_prepare)$/, args: 'last' });
sink('php', 'sqli', { method: /^(query|exec|prepare|multi_query|real_query|get_results|get_row|get_var|get_col|unprepared|statement|select|whereRaw|selectRaw|orderByRaw|havingRaw|raw)$/, recv: /\$(db|pdo|conn|connection|mysqli|dbh|wpdb|this\.db|this\.pdo|link)$|^DB$/i, args: [0] });
sink('php', 'sqli', { call: /^(DB\.(raw|select|statement|unprepared|insert|update|delete)|DB::(raw|select|statement|unprepared))$/, args: [0] });
sink('go', 'sqli', { method: /^(Query|QueryRow|Exec|Prepare|Raw|Select|Get)$/, recv: /^(db|tx|conn|stmt|DB|sqlDB|database|d\.db|s\.db|r\.db|h\.db|app\.db|repo\.db|pool|sqlx|gdb)$|\.(db|DB|conn|pool)$/, args: [0] });
sink('go', 'sqli', { method: /^(QueryContext|QueryRowContext|ExecContext|PrepareContext|SelectContext|GetContext)$/, recv: /^(db|tx|conn|stmt|DB|database|pool)$|\.(db|DB|conn|pool)$/, args: [1] });
sink('go', 'sqli', { method: /^(Where|Order|Having|Joins|Group)$/, recv: /^(db|tx|gdb|DB|query)$|\.(db|DB)$/, args: [0], stringOnly: true });
sink('rb', 'sqli', { method: /^(find_by_sql|count_by_sql|execute|exec_query|select_all|select_one|select_value|select_rows|exec_update|exec_delete|exec_insert)$/, args: [0] });
sink('rb', 'sqli', { method: /^(where|order|reorder|group|having|joins|select|pluck|from|lock|exists\?|delete_all|update_all|destroy_all|calculate|find_by|not|or|rewhere)$/, recv: /^[A-Z]\w*|\.(where|order|all|unscoped|joins)\(\)$/, args: [0], notObject: true, stringOnly: true });

// NoSQL injection (MongoDB, operator injection and $where)
sink('js', 'nosqli', { method: /^(find|findOne|findOneAndUpdate|findOneAndDelete|findOneAndReplace|updateOne|updateMany|deleteOne|deleteMany|replaceOne|countDocuments|count|aggregate|distinct|remove|update|where|exists)$/, recv: /(collection|coll|col|db\.\w+|User|Users|\w+Model|Model|model|users|this\.\w+|\w+Collection|\w+Repo|mongo\w*)$/, args: [0] });
sink('js', 'nosqli', { objKey: /^\$where$/ });
sink('py', 'nosqli', { method: /^(find|find_one|find_one_and_update|find_one_and_delete|update_one|update_many|delete_one|delete_many|count_documents|aggregate|replace_one|distinct)$/, args: [0], objKeyOrWhole: true });
sink('java', 'nosqli', { call: /^(Document\.parse|BasicDBObject\.parse|BsonDocument\.parse|JSON\.parse|BasicQuery|Criteria\.where|Filters\.where|where)$/, args: [0] });
sink('java', 'nosqli', { call: /^(BasicDBObject|Document)$/, args: [1], argHas: /\$where/ });
sink('cs', 'nosqli', { call: /^(BsonDocument\.Parse|BsonJavaScript|BsonSerializer\.Deserialize|JsonCommand)$/, args: [0] });
sink('cs', 'nosqli', { call: /^(BsonDocument)$/, args: [1], argHas: /\$where/ });
sink('php', 'nosqli', { method: /^(find|findOne|updateOne|updateMany|deleteOne|deleteMany|count|aggregate|countDocuments)$/, recv: /\$(collection|coll|col|db|mongo|users|this\.collection)|->\w+$/, args: [0], objKeyOrWhole: true });
sink('go', 'nosqli', { method: /^(Find|FindOne|UpdateOne|UpdateMany|DeleteOne|DeleteMany|CountDocuments|Aggregate)$/, recv: /(coll|collection|col|c|db\.Collection\(\))$/i, args: [1], argHas: /\$where/ });
sink('rb', 'nosqli', { method: /^(find|find_one|where|aggregate|update_one|delete_one)$/, recv: /(collection|coll|client\[\]|\[\])$/, args: [0], argHas: /\$where/ });

// OS command injection
sink('js', 'cmdi', { call: /^((child_process|cp|childProcess|require\(\))\.)?(exec|execSync)$/, args: [0] });
sink('js', 'cmdi', { call: /^((child_process|cp|childProcess)\.)?(spawn|spawnSync|execFile|execFileSync|fork)$/, args: [0] });
sink('js', 'cmdi', { call: /^((child_process|cp|childProcess)\.)?(spawn|spawnSync|execFile|execFileSync)$/, args: [1], argHas: /shell\s*:\s*true/ });
sink('js', 'cmdi', { call: /^(execa|execaSync|execaCommand|execaCommandSync|shell\.exec|shelljs\.exec|\$)$/, args: [0] });
sink('py', 'cmdi', { call: /^(os\.(system|popen|popen2|popen3|popen4|execl|execle|execlp|execlpe|execv|execve|execvp|execvpe|spawnl|spawnle|spawnlp|spawnv|spawnve|spawnvp|startfile)|commands\.(getoutput|getstatusoutput)|subprocess\.(getoutput|getstatusoutput)|pty\.spawn|asyncio\.create_subprocess_shell)$/, args: [0] });
sink('py', 'cmdi', { call: /^(subprocess\.(call|run|Popen|check_output|check_call)|Popen|call|run|check_output)$/, args: [0], argHas: /shell\s*=\s*True/ });
sink('py', 'cmdi', { call: /^(subprocess\.(call|run|Popen|check_output|check_call)|Popen)$/, args: [0], firstElement: true });
sink('java', 'cmdi', { method: /^exec$/, recv: /(Runtime\.getRuntime\(\)|runtime|rt|Runtime)$/, args: 'all' });
sink('java', 'cmdi', { call: /^(ProcessBuilder|new ProcessBuilder)$/, args: 'all' });
sink('java', 'cmdi', { method: /^command$/, recv: /(pb|processBuilder|builder|ProcessBuilder\(\))$/i, args: 'all' });
sink('cs', 'cmdi', { call: /^(Process\.Start|System\.Diagnostics\.Process\.Start|ProcessStartInfo)$/, args: 'all' });
sink('cs', 'cmdi', { assign: /\.(FileName|Arguments)$/, recvType: /ProcessStartInfo/ });
sink('cs', 'cmdi', { assign: /StartInfo\.(FileName|Arguments)$/ });
sink('php', 'cmdi', { call: /^(exec|system|shell_exec|passthru|popen|proc_open|pcntl_exec|expect_popen)$/, args: [0] });
sink('php', 'cmdi', { shell: true });
sink('go', 'cmdi', { call: /^exec\.(Command|CommandContext)$/, args: 'all' });
sink('go', 'cmdi', { call: /^(syscall\.Exec|os\.StartProcess)$/, args: 'all' });
sink('rb', 'cmdi', { call: /^(system|exec|spawn|`|IO\.popen|Open3\.(popen2|popen2e|popen3|capture2|capture2e|capture3|pipeline\w*)|Kernel\.(system|exec|spawn|open)|PTY\.spawn)$/, args: 'all' });
sink('rb', 'cmdi', { shell: true });

// Code injection
sink('js', 'code', { call: /^(eval|window\.eval|global\.eval|globalThis\.eval|Function|new Function|vm\.(runInNewContext|runInThisContext|runInContext|compileFunction)|vm\.Script|Script|execScript)$/, args: [0] });
sink('js', 'code', { call: /^(setTimeout|setInterval|setImmediate|window\.setTimeout|window\.setInterval)$/, args: [0], stringOnly: true });
sink('js', 'code', { call: /^(require|import)$/, args: [0], label: 'dynamic module load' });
sink('py', 'code', { call: /^(eval|exec|compile|execfile|__builtins__\.eval|builtins\.eval|code\.InteractiveInterpreter\(\)\.runsource)$/, args: [0] });
sink('java', 'code', { method: /^(eval|compile)$/, recv: /(engine|scriptEngine|se|js|nashorn|ScriptEngine|getEngineByName\(\)|groovyShell|shell)$/i, args: [0] });
sink('java', 'code', { method: /^(parseExpression|evaluate|parse|createValueExpression|createMethodExpression)$/, recv: /(parser|expressionParser|SpelExpressionParser\(\)|elProcessor|expressionFactory|ognl|Ognl|MVEL|GroovyShell\(\)|groovyShell|shell)$/i, args: 'all' });
sink('java', 'code', { call: /^(Ognl\.getValue|Ognl\.parseExpression|MVEL\.eval|MVEL\.compileExpression)$/, args: [0] });
sink('cs', 'code', { call: /^(CSharpScript\.(EvaluateAsync|RunAsync|Create)|CSharpCodeProvider\(\)\.CompileAssemblyFromSource)$/, args: [0] });
sink('cs', 'code', { method: /^(CompileAssemblyFromSource)$/, args: 'all' });
sink('php', 'code', { call: /^(eval|assert|create_function)$/, args: 'all' });
sink('php', 'code', { call: /^preg_replace$/, args: [1], argHas: /\/[a-z]*e[a-z]*["']\s*,/ });
sink('rb', 'code', { call: /^(eval|instance_eval|class_eval|module_eval|binding\.eval|Kernel\.eval|instance_exec|class_exec)$/, args: [0] });
sink('rb', 'code', { method: /^(eval|instance_eval|class_eval|module_eval)$/, args: [0] });

// Path traversal
const FS_METHODS = 'readFile|readFileSync|writeFile|writeFileSync|appendFile|appendFileSync|createReadStream|createWriteStream|unlink|unlinkSync|rm|rmSync|rmdir|rmdirSync|open|openSync|readdir|readdirSync|stat|statSync|lstat|access|accessSync|exists|existsSync|mkdir|mkdirSync|rename|renameSync|copyFile|copyFileSync|truncate|chmod|chown|readlink|realpath|outputFile|readJson|writeJson|remove|copy|move|ensureFile';
sink('js', 'path', { call: new RegExp('^(fs|fse|fs\\.promises|fsp|fsPromises|promises|fsExtra)\\.(' + FS_METHODS + ')$'), args: [0] });
sink('js', 'path', { call: new RegExp('^(' + FS_METHODS + ')$'), args: [0], needsImport: /^(fs|fs-extra|fs\/promises|node:fs|node:fs\/promises|graceful-fs)$/ });
sink('js', 'path', { call: new RegExp('^(fs|fse|fs\\.promises|fsp|fsPromises|fsExtra)\\.(rename|renameSync|copyFile|copyFileSync|copy|move|symlink|link)$'), args: [1] });
sink('js', 'path', { method: /^(sendFile|download|attachment|render)$/, recv: /^(res|response|reply|ctx|h)$/, args: [0], argLacks: /root\s*:/ });
sink('py', 'path', { call: /^(open|io\.open|codecs\.open|os\.(remove|unlink|rmdir|removedirs|mkdir|makedirs|listdir|scandir|rename|replace|chmod|chown|open|stat|walk|truncate)|shutil\.(copy|copyfile|copy2|copytree|move|rmtree|make_archive)|os\.path\.(exists|isfile|getsize)|send_file|flask\.send_file|FileResponse|tarfile\.open|zipfile\.ZipFile|pathlib\.Path\(\)\.(open|read_text|read_bytes|write_text|write_bytes|unlink)|aiofiles\.open|numpy\.load|np\.load|pd\.read_csv|pandas\.read_csv)$/, args: [0] });
sink('py', 'path', { method: /^(read_text|read_bytes|write_text|write_bytes)$/, args: 'recv' });
sink('java', 'path', { call: /^(FileInputStream|FileOutputStream|FileReader|FileWriter|RandomAccessFile|ZipFile|JarFile|FileSystemResource)$/, args: 'all', newOnly: true });
sink('java', 'path', { call: /^(Paths\.get|Path\.of|Files\.(newInputStream|newOutputStream|newBufferedReader|newBufferedWriter|readAllBytes|readAllLines|readString|lines|write|writeString|delete|deleteIfExists|copy|move|createFile|createDirectory|createDirectories|exists|list|walk|newByteChannel|isReadable)|FileUtils\.(readFileToString|readFileToByteArray|readLines|writeStringToFile|deleteQuietly|forceDelete|copyFile|openInputStream))$/, args: [0] });
sink('java', 'path', { method: /^resolve$/, recv: /(Path|path|base|dir|root|Paths\.get\(\)|Path\.of\(\))$/i, args: [0] });
sink('cs', 'path', { call: /^((System\.IO\.)?File\.(ReadAllText|ReadAllBytes|ReadAllLines|ReadLines|WriteAllText|WriteAllBytes|WriteAllLines|AppendAllText|Open|OpenRead|OpenWrite|OpenText|Delete|Copy|Move|Create|CreateText|Exists|Replace|ReadAllTextAsync|WriteAllTextAsync|ReadAllBytesAsync)|Directory\.(Delete|GetFiles|CreateDirectory|EnumerateFiles|Move|GetDirectories)|FileStream|StreamReader|StreamWriter|FileInfo|DirectoryInfo|PhysicalFile|PhysicalFileResult|XmlReader\.Create)$/, args: [0] });
sink('kt', 'path', { method: /^(readText|readBytes|readLines|writeText|writeBytes|appendText|appendBytes|delete|deleteRecursively|forEachLine|bufferedReader|bufferedWriter|inputStream|outputStream|copyTo|renameTo|listFiles)$/, recv: /(File\(\)|file|f|path|target)$/i, args: 'recv' });
sink('php', 'path', { call: /^(file_get_contents|file_put_contents|fopen|file|readfile|unlink|rmdir|mkdir|copy|rename|opendir|scandir|glob|is_file|file_exists|filesize|fpassthru|parse_ini_file|highlight_file|show_source|move_uploaded_file|simplexml_load_file|touch|chmod|tempnam|SplFileObject|SplFileInfo|DirectoryIterator|ZipArchive\(\)\.open)$/, args: [0], argLacks: /php:\/\/input/ });
sink('php', 'path', { echoKw: /^(include|require|include_once|require_once)$/ });
sink('go', 'path', { call: /^(os\.(Open|OpenFile|Create|ReadFile|WriteFile|Remove|RemoveAll|Mkdir|MkdirAll|Rename|Stat|Lstat|ReadDir|Chmod|Truncate|DirFS)|ioutil\.(ReadFile|WriteFile|ReadDir)|filepath\.Walk|filepath\.WalkDir|template\.ParseFiles)$/, args: [0] });
sink('go', 'path', { call: /^http\.ServeFile$/, args: [2] });
sink('go', 'path', { method: /^(File|FileAttachment|Attachment|SendFile|Download)$/, recv: /^(c|ctx)$/, args: [0] });
sink('rb', 'path', { call: /^(File\.(open|read|write|readlines|delete|unlink|new|binread|binwrite|foreach|rename|exist\?|file\?|size|chmod|truncate)|IO\.(read|readlines|binread|write|foreach|copy_stream)|FileUtils\.(rm|rm_rf|rm_r|cp|cp_r|mv|mkdir_p|touch|remove|remove_file|copy|move|ln_s)|Dir\.(glob|entries|mkdir|rmdir|delete|children|each_child|foreach)|Pathname\.new|YAML\.load_file|send_file|send_data_file|Zip::File\.open|Zip\.File\.open)$/, args: [0] });
sink('rb', 'path', { method: /^render$/, kw: ['file', 'template', 'partial'], args: [] });

// XSS (reflected / stored / DOM)
sink('js', 'xss', { method: /^(send|write|end)$/, recv: /^(res|response|reply|ctx\.res|h)$/, args: [0], label: 'HTTP response' });
sink('js', 'xss', { assign: /^(ctx|this)\.body$/ });
sink('js', 'xss', { assign: /\.(innerHTML|outerHTML|srcdoc)$/ });
sink('js', 'xss', { method: /^(insertAdjacentHTML)$/, args: [1] });
sink('js', 'xss', { method: /^(write|writeln)$/, recv: /^(window\.)?document$/, args: 'all' });
sink('js', 'xss', { method: /^(html|append|prepend|after|before|replaceWith|wrap|wrapAll|wrapInner|parseHTML)$/, recv: /^(\$|jQuery)\(\)$|^\$\w*$|\.(find|children|parent|closest|first|last|eq|siblings)\(\)$/, args: [0] });
sink('js', 'xss', { call: /^(\$|jQuery)$/, args: [0] });
sink('js', 'xss', { method: /^(createContextualFragment|parseFromString)$/, args: [0] });
sink('js', 'xss', { objKey: /^__html$/ });
sink('js', 'xss', { assign: /^(v-html|dangerouslySetInnerHTML)$/ });
sink('py', 'xss', { call: /^(HttpResponse|make_response|Response|flask\.Response|Markup|markupsafe\.Markup|mark_safe|format_html|HTMLResponse|SafeString|render_to_response|jsonify_raw)$/, args: [0] });
sink('py', 'xss', { method: /^(write|finish)$/, recv: /^(self|response|resp|handler)$/, args: [0] });
sink('py', 'xss', { routeReturn: true, label: 'route response' });
sink('java', 'xss', { method: /^(write|print|println|printf|format|append)$/, recv: /(getWriter\(\)|getOutputStream\(\)|out|writer|pw|printWriter|response\.getWriter\(\)|resp\.getWriter\(\))$/, args: 'all' });
sink('java', 'xss', { routeReturn: true, fnAnn: /produces\s*=\s*[^)]*HTML/i, label: 'controller response' });
sink('cs', 'xss', { method: /^(Write|WriteAsync|WriteFile|BinaryWrite|Output\.Write)$/, recv: /^(Response|HttpContext\.Response|context\.Response|Response\.Output|writer|Context\.Response)$/, args: [0] });
sink('cs', 'xss', { call: /^(HtmlString|MvcHtmlString|Html\.Raw|HtmlHelper\.Raw|MarkupString)$/, args: [0] });
sink('cs', 'xss', { call: /^Content$/, args: [0], argHas: /text\/html/ });
sink('cs', 'xss', { method: /^Raw$/, recv: /^(Html|@Html)$/, args: [0] });
sink('php', 'xss', { echoKw: /^(echo|print)$/ });
sink('php', 'xss', { call: /^(printf|vprintf|print_r|exit|die|var_dump)$/, args: [0] });
sink('php', 'xss', { method: /^(setContent|make|response|send)$/, recv: /(response|Response|\$response|response\(\))$/, args: [0] });
sink('go', 'xss', { call: /^(fmt\.Fprintf|fmt\.Fprint|fmt\.Fprintln|io\.WriteString)$/, args: 'rest1', arg0Name: /^(w|rw|res|writer|resp|response)$/ });
sink('go', 'xss', { method: /^(Write|WriteString)$/, recv: /^(w|rw|res|writer|resp|response)$/, args: [0] });
sink('go', 'xss', { call: /^(template\.HTML|template\.JS|template\.HTMLAttr|template\.URL|template\.CSS)$/, args: [0] });
sink('go', 'xss', { method: /^(Data|Blob)$/, recv: /^(c|ctx)$/, args: 'rest1', argHas: /text\/html/ });
sink('rb', 'xss', { method: /^(html_safe|raw)$/, args: 'recv' });
sink('rb', 'xss', { call: /^(raw|render_inline_html)$/, args: [0] });
sink('rb', 'ssti', { method: /^render$/, kw: ['inline'], args: [] });
sink('rb', 'xss', { method: /^render$/, kw: ['html', 'body'], args: [] });

// SSRF
sink('js', 'ssrf', { call: /^(fetch|axios|got|request|needle|superagent|node-fetch|ky|phin|undici\.request|undici\.fetch|window\.fetch)$/, args: [0] });
sink('js', 'ssrf', { method: /^(get|post|put|delete|patch|head|request|stream|options)$/, recv: /^(axios|got|http|https|request|needle|superagent|ky|client|httpClient|this\.http|this\.httpClient|instance|api|undici)$/, args: [0] });
sink('js', 'ssrf', { call: /^(http|https)\.(get|request)$/, args: [0] });
sink('py', 'ssrf', { call: /^(requests\.(get|post|put|delete|patch|head|options|request|Session\(\)\.get)|urllib\.request\.urlopen|urllib2\.urlopen|urlopen|urllib\.urlopen|httpx\.(get|post|put|delete|request|stream)|aiohttp\.request|http\.client\.HTTPConnection|HTTPConnection|HTTPSConnection|pycurl\.Curl\(\)\.setopt|urllib\.request\.Request)$/, args: [0], kw: ['url'] });
sink('py', 'ssrf', { call: /^requests\.request$/, args: [1], kw: ['url'] });
sink('py', 'ssrf', { method: /^(get|post|put|delete|request|fetch|stream)$/, recv: /^(session|s|client|httpx_client|http|self\.session|self\.client|aiohttp_session)$/, args: [0], kw: ['url'] });
sink('java', 'ssrf', { method: /^(openConnection|openStream|getContent)$/, args: 'recv' });
sink('java', 'ssrf', { method: /^(getForObject|getForEntity|postForObject|postForEntity|exchange|execute|put|delete|headForHeaders|patchForObject|optionsForAllow)$/, recv: /(restTemplate|template|rest|client|RestTemplate\(\))$/i, args: [0] });
sink('java', 'ssrf', { method: /^(uri|create|newBuilder|url|target|resolveTemplate)$/, recv: /(HttpRequest|webClient|client|builder|WebClient\.create\(\)|Request\.Builder\(\)|ClientBuilder\.newClient\(\)|HttpRequest\.newBuilder\(\)|\.get\(\)|\.post\(\))$|^(URI|HttpGet|HttpPost)$/, args: [0] });
sink('java', 'ssrf', { call: /^(HttpGet|HttpPost|HttpPut|HttpDelete|HttpHead|HttpRequest\.newBuilder|Jsoup\.connect|HttpURLConnection)$/, args: [0] });
sink('cs', 'ssrf', { method: /^(GetAsync|GetStringAsync|GetByteArrayAsync|GetStreamAsync|PostAsync|PutAsync|DeleteAsync|SendAsync|PatchAsync|DownloadString|DownloadData|DownloadFile|OpenRead|UploadString|DownloadStringTaskAsync)$/, recv: /(client|http|httpClient|_client|_httpClient|_http|wc|webClient|WebClient\(\)|HttpClient\(\))$/i, args: [0] });
sink('cs', 'ssrf', { call: /^(WebRequest\.Create|HttpWebRequest\.Create|WebRequest\.CreateHttp|HttpRequestMessage)$/, args: [0] });
sink('php', 'ssrf', { call: /^(curl_init|get_headers|fsockopen|pfsockopen|stream_socket_client|get_meta_tags)$/, args: [0] });
sink('php', 'ssrf', { call: /^curl_setopt$/, args: [2], argHas: /CURLOPT_URL/ });
sink('php', 'ssrf', { call: /^(file_get_contents|fopen)$/, args: [0], argHas: /https?:/ });
sink('php', 'ssrf', { method: /^(get|post|request|put|delete|send)$/, recv: /\$(client|http|guzzle|httpClient|this\.client)$|^Http$/, args: 'all' });
sink('go', 'ssrf', { call: /^http\.(Get|Post|Head|PostForm)$/, args: [0] });
sink('go', 'ssrf', { call: /^http\.(NewRequest|NewRequestWithContext)$/, args: 'rest1' });
sink('go', 'ssrf', { method: /^(Get|Post|Head|PostForm)$/, recv: /^(client|c|httpClient|http\.DefaultClient|h\.client|s\.client)$/, args: [0] });
sink('go', 'ssrf', { call: /^(net\.Dial|net\.DialTimeout|tls\.Dial)$/, args: [1] });
sink('rb', 'ssrf', { call: /^(Net::HTTP\.(get|get_response|post_form|start|new)|Net\.HTTP\.(get|get_response|post_form|start|new)|URI\.open|URI\.parse\(\)\.open|HTTParty\.(get|post|put|delete)|Faraday\.(get|post|new)|RestClient\.(get|post|put|delete)|Typhoeus\.(get|post)|Excon\.(get|post)|HTTP\.(get|post)|open-uri|OpenURI\.open_uri)$/, args: [0] });

// Open redirect
sink('js', 'redirect', { method: /^redirect$/, recv: /^(res|response|reply|ctx|h)$/, args: 'last' });
sink('js', 'redirect', { assign: /^((window|document|self|top)\.)?location(\.href)?$/ });
sink('js', 'redirect', { method: /^(assign|replace)$/, recv: /^((window|document|self|top)\.)?location$/, args: [0] });
sink('js', 'redirect', { call: /^(window\.open|redirect|NextResponse\.redirect|Response\.redirect)$/, args: [0] });
sink('py', 'redirect', { call: /^(redirect|flask\.redirect|HttpResponseRedirect|HttpResponsePermanentRedirect|RedirectResponse|django\.shortcuts\.redirect)$/, args: [0], kw: ['url', 'to', 'location'] });
sink('java', 'redirect', { method: /^(sendRedirect|setRedirect)$/, args: [0] });
sink('java', 'redirect', { call: /^RedirectView$/, args: [0] });
sink('java', 'redirect', { method: /^(setHeader|addHeader)$/, args: [1], argHas: /"Location"/i });
sink('java', 'redirect', { routeReturn: true, fnAnn: /Mapping/, retPrefix: /^redirect:/, label: 'redirect: view' });
sink('cs', 'redirect', { call: /^(Redirect|RedirectPermanent|RedirectPreserveMethod|LocalRedirect_unchecked|RedirectResult|Response\.Redirect|HttpContext\.Response\.Redirect)$/, args: [0] });
sink('cs', 'redirect', { method: /^Redirect$/, recv: /Response$/, args: [0] });
sink('php', 'redirect', { call: /^header$/, args: [0], argHas: /Location\s*:/i });
sink('php', 'redirect', { call: /^(redirect|Redirect\.to|Redirect::to|wp_redirect)$/, args: [0] });
sink('php', 'redirect', { method: /^(to|away)$/, recv: /^(redirect\(\)|Redirect)$/, args: [0] });
sink('go', 'redirect', { call: /^http\.Redirect$/, args: [2] });
sink('go', 'redirect', { method: /^Redirect$/, recv: /^(c|ctx)$/, args: [1] });
sink('rb', 'redirect', { call: /^(redirect_to|redirect)$/, args: [0], notObject: true });

// LDAP injection
sink('js', 'ldap', { method: /^search$/, recv: /(ldap|client|ldapClient|ad|conn)$/i, args: 'all' });
sink('py', 'ldap', { method: /^(search|search_s|search_st|search_ext|search_ext_s|paged_search)$/, recv: /(ldap|conn|connection|l|ld|con|ldap_conn|self\.conn)$/i, args: 'all' });
sink('java', 'ldap', { method: /^(search|lookup|list|listBindings|getAttributes)$/, recv: /(ctx|context|dirContext|ldapContext|ldapTemplate|template|initialDirContext|dctx)$/i, args: [0, 1] });
sink('java', 'ldap', { call: /^(LdapQueryBuilder\.query\(\)\.filter|query\(\)\.filter|SearchRequest)$/, args: 'all' });
sink('cs', 'ldap', { call: /^(DirectorySearcher|DirectoryEntry|SearchRequest)$/, args: 'all' });
sink('cs', 'ldap', { assign: /\.Filter$/ });
sink('php', 'ldap', { call: /^(ldap_search|ldap_list|ldap_read|ldap_compare)$/, args: [1, 2] });
sink('go', 'ldap', { call: /^ldap\.NewSearchRequest$/, args: 'all' });
sink('go', 'ldap', { method: /^Search$/, recv: /(l|conn|ldap|lc)$/i, args: 'all' });
sink('rb', 'ldap', { call: /^(Net::LDAP::Filter\.(construct|eq)|Net\.LDAP\.Filter\.(construct|eq))$/, args: 'all' });
sink('rb', 'ldap', { method: /^search$/, recv: /(ldap|conn)$/i, args: 'all' });

// XPath injection
sink('js', 'xpath', { call: /^(xpath\.(select|select1|evaluate|parse)|document\.evaluate)$/, args: [0] });
sink('py', 'xpath', { method: /^(xpath|XPath|find|findall|iterfind|findtext)$/, recv: /(tree|root|doc|etree|xml|dom|element|el|node|parsed)$/i, args: [0] });
sink('py', 'xpath', { call: /^(etree\.XPath|lxml\.etree\.XPath|XPath)$/, args: [0] });
sink('java', 'xpath', { method: /^(evaluate|compile|evaluateExpression|selectNodes|selectSingleNode)$/, recv: /(xpath|xPath|XPathFactory\.newInstance\(\)\.newXPath\(\)|newXPath\(\)|xp|document|doc)$/i, args: [0] });
sink('cs', 'xpath', { method: /^(SelectNodes|SelectSingleNode|Evaluate|Select|Compile|XPathSelectElement|XPathSelectElements|XPathEvaluate)$/, args: [0] });
sink('php', 'xpath', { method: /^(query|evaluate|xpath)$/, recv: /\$(xpath|xp|doc|xml|dom|sxe|this\.xpath)$/i, args: [0] });
sink('go', 'xpath', { call: /^xpath\.(Compile|MustCompile)$/, args: [0] });
sink('go', 'xpath', { call: /^(xmlquery|htmlquery)\.(Find|FindOne|QueryAll|Query)$/, args: [1] });
sink('rb', 'xpath', { method: /^(xpath|at_xpath|search|at|elements)$/, recv: /(doc|xml|document|root|node|REXML::XPath)$/i, args: [0] });
sink('rb', 'xpath', { call: /^(REXML::XPath\.(first|each|match)|REXML\.XPath\.(first|each|match))$/, args: [1] });

// XXE: entity-resolving XML parsers fed tainted data
sink('js', 'xxe', { call: /^(libxmljs\.parseXml|libxmljs\.parseXmlString|libxmljs2\.parseXml|libxml\.parseXml|parseXml|parseXmlString)$/, args: [0], argHas: /noent\s*:\s*true/ });
sink('py', 'xxe', { call: /^(etree\.fromstring|etree\.XML|etree\.parse|lxml\.etree\.fromstring|lxml\.etree\.parse|lxml\.etree\.XML|xml\.dom\.pulldom\.parseString|xml\.sax\.parseString|pulldom\.parseString|sax\.parseString)$/, args: [0], fileLacks: /resolve_entities\s*=\s*False|defusedxml/, fileHas: /lxml|resolve_entities\s*=\s*True|pulldom|sax/ });
sink('java', 'xxe', { method: /^(parse|unmarshal|createXMLStreamReader|createXMLEventReader|newTransformer|newSchema|read|build|transform)$/, recv: /(builder|db|documentBuilder|parser|saxParser|reader|xmlReader|unmarshaller|xif|factory|xmlInputFactory|saxBuilder|sb|transformer|tf|xr|newDocumentBuilder\(\)|newSAXParser\(\)|createUnmarshaller\(\)|SAXReader\(\)|SAXBuilder\(\))$/i, args: 'all', fileLacks: /disallow-doctype-decl"\s*,\s*true|FEATURE_SECURE_PROCESSING\s*,\s*true|ACCESS_EXTERNAL_DTD\s*,\s*""|SUPPORT_DTD\s*,\s*false|external-general-entities"\s*,\s*false|IS_SUPPORTING_EXTERNAL_ENTITIES\s*,\s*false|setExpandEntityReferences\s*\(\s*false/ });
sink('cs', 'xxe', { method: /^(LoadXml|Load|ReadXml|Create|Parse|Deserialize)$/, recv: /(doc|xmlDoc|xml|document|XmlDocument\(\)|XmlReader|reader|ds|dataSet|XDocument|XElement|serializer)$/i, args: [0], fileHas: /DtdProcessing\s*\.\s*Parse|XmlUrlResolver|ProhibitDtd\s*=\s*false/ });
sink('php', 'xxe', { call: /^(simplexml_load_string|simplexml_load_file|xml_parse|SimpleXMLElement)$/, args: [0], orFile: true, argHas: /LIBXML_NOENT|LIBXML_DTDLOAD|libxml_disable_entity_loader\s*\(\s*false/ });
sink('php', 'xxe', { method: /^(loadXML|load|loadHTML|xml)$/, recv: /\$(dom|doc|xml|document|reader|this\.dom)$/i, args: [0], orFile: true, argHas: /LIBXML_NOENT|LIBXML_DTDLOAD/ });
sink('rb', 'xxe', { call: /^(Nokogiri::XML|Nokogiri\.XML|Nokogiri::XML::Document\.parse|LibXML::XML::Document\.string|REXML::Document\.new)$/, args: [0], orFile: true, argHas: /noent|NOENT|DTDLOAD|dtdload|resolve_externals/ });
sink('go', 'xxe', { call: /^(libxml2\.ParseString|xmlparser\.Parse)$/, args: [0], argHas: /XMLParseNoEnt|NoEnt/ });

// Unsafe deserialization
sink('js', 'deser', { call: /^(serialize\.unserialize|unserialize|nodeSerialize\.unserialize|funcster\.deepDeserialize|cryo\.parse|Cryo\.parse)$/, args: [0] });
sink('py', 'deser', { call: /^(pickle\.(loads|load|Unpickler)|cPickle\.(loads|load)|_pickle\.(loads|load)|dill\.(loads|load)|marshal\.(loads|load)|shelve\.open|jsonpickle\.decode|joblib\.load|torch\.load|numpy\.load|np\.load|pandas\.read_pickle|pd\.read_pickle)$/, args: [0], argLacks: /weights_only\s*=\s*True|allow_pickle\s*=\s*False/ });
sink('py', 'deser', { call: /^(yaml\.load|yaml\.load_all|yaml\.unsafe_load|yaml\.full_load|ruamel\.yaml\.load)$/, args: [0], argLacks: /SafeLoader|CSafeLoader|BaseLoader|safe_load/ });
sink('java', 'deser', { call: /^(ObjectInputStream|XMLDecoder|java\.beans\.XMLDecoder|HessianInput|Hessian2Input|BurlapInput|ObjectInputStreamWithLoader)$/, args: [0] });
sink('java', 'deser', { method: /^(fromXML|load|loadAs|loadAll|deserialize|readObject)$/, recv: /(xstream|xStream|XStream\(\)|yaml|Yaml\(\)|kryo|SerializationUtils)$/i, args: [0], fileLacks: /SafeConstructor|allowTypes|addPermission/ });
sink('java', 'deser', { method: /^(readValue|parseObject|parse)$/, recv: /(mapper|objectMapper|JSON|JSONObject|fastjson)$/i, args: [0], fileHas: /enableDefaultTyping|activateDefaultTyping|DefaultTyping\.|setAutoTypeSupport\(\s*true/ });
sink('cs', 'deser', { method: /^(Deserialize|UnsafeDeserialize|UnsafeDeserializeMethodResponse|ReadObject)$/, recv: /(BinaryFormatter\(\)|formatter|bf|binaryFormatter|SoapFormatter\(\)|LosFormatter\(\)|los|NetDataContractSerializer\(\)|ObjectStateFormatter\(\))$/i, args: [0] });
sink('cs', 'deser', { method: /^(DeserializeObject|Deserialize)$/, recv: /(JsonConvert|serializer|JavaScriptSerializer\(\)|_serializer)$/, args: [0], fileHas: /TypeNameHandling\s*\.\s*(All|Auto|Objects|Arrays)|SimpleTypeResolver/ });
sink('php', 'deser', { call: /^(unserialize|maybe_unserialize|yaml_parse|igbinary_unserialize)$/, args: [0], argLacks: /allowed_classes['"]?\s*=>\s*false/ });
sink('rb', 'deser', { call: /^(Marshal\.(load|restore)|YAML\.(load|unsafe_load|load_documents)|Psych\.(load|unsafe_load)|Oj\.(load|object_load)|Ox\.parse_obj|JSON\.load|Hash\.from_xml)$/, args: [0], argLacks: /permitted_classes|mode:\s*:strict|safe/ });

// Log injection
const LOG_RECV = /^(log|logger|LOG|LOGGER|Log|_log|_logger|this\.logger|this\.log|self\.logger|self\.log|logging|Logger|slog|zap|zerolog|logrus|winston|pino|bunyan|log4js|console|Rails\.logger|this\._logger|getLogger\(\)|LoggerFactory\.getLogger\(\)|logging\.getLogger\(\)|app\.logger|current_app\.logger|klog|glog)$/;
sink('js', 'log', { method: /^(info|warn|warning|error|debug|trace|fatal|log|verbose|silly)$/, recv: LOG_RECV, args: 'all', notRecv: /^console$/ });
sink('py', 'log', { method: /^(info|warning|warn|error|debug|critical|exception|log|fatal)$/, recv: LOG_RECV, args: 'all' });
sink('java', 'log', { method: /^(info|warn|error|debug|trace|fatal|log|severe|warning|fine|finer|finest|config)$/, recv: LOG_RECV, args: 'all' });
sink('cs', 'log', { method: /^(LogInformation|LogWarning|LogError|LogDebug|LogTrace|LogCritical|Log|Info|Warn|Error|Debug|Fatal|Trace|Information|Warning)$/, recv: /^(_logger|logger|_log|log|Log|Logger|_Logger|this\._logger|Trace|Debug)$/, args: 'all' });
sink('php', 'log', { call: /^(error_log|syslog|trigger_error)$/, args: 'all' });
sink('php', 'log', { method: /^(info|warning|error|debug|critical|alert|emergency|notice|log)$/, recv: /\$(log|logger|this\.logger|this\.log)$|^(Log|logger\(\))$/, args: 'all' });
sink('go', 'log', { call: /^(log\.(Print|Printf|Println|Fatal|Fatalf|Fatalln|Panic|Panicf|Panicln)|slog\.(Info|Warn|Error|Debug))$/, args: 'all' });
sink('go', 'log', { method: /^(Info|Infof|Warn|Warnf|Error|Errorf|Debug|Debugf|Print|Printf|Println|Infow|Errorw)$/, recv: /^(log|logger|l|s\.log|s\.logger|h\.logger|zap\.S\(\)|zap\.L\(\)|logrus|sugar|slog)$/, args: 'all' });
sink('rb', 'log', { method: /^(info|warn|error|debug|fatal|unknown)$/, recv: /^(logger|Rails\.logger|log|@logger|LOGGER)$/, args: 'all' });

// HTTP header injection / response splitting
sink('js', 'header', { method: /^(setHeader|set|header|append|writeHead|cookie)$/, recv: /^(res|response|ctx|reply|ctx\.res|this\.res)$/, args: [1], argLacks: /["']location["']/i });
sink('js', 'header', { method: /^(set|append)$/, recv: /\.headers$|^headers$/, args: [1] });
sink('py', 'header', { assign: /^(response|resp|res|r|self\.response)\.headers\[\]$|^(response|resp|res|r)\[\]$/ });
sink('py', 'header', { method: /^(set_header|add_header|set_cookie|setdefault)$/, recv: /^(self|response|resp|res|r|response\.headers|resp\.headers)$/, args: [1] });
sink('py', 'header', { method: /^(add|__setitem__)$/, recv: /\.headers$/, args: [1] });
sink('java', 'header', { method: /^(setHeader|addHeader|setDateHeader|setIntHeader)$/, args: [1], argLacks: /"Location"/i });
sink('java', 'header', { call: /^(Cookie|javax\.servlet\.http\.Cookie|jakarta\.servlet\.http\.Cookie)$/, args: [1] });
sink('java', 'header', { method: /^(header)$/, recv: /(ResponseEntity\.ok\(\)|ResponseEntity\.status\(\)|builder|ok\(\)|Response\.ok\(\)|Response\.status\(\))$/, args: [1] });
sink('cs', 'header', { method: /^(Add|Append|AppendHeader|AddHeader|Set|TryAddWithoutValidation)$/, recv: /^(Response\.Headers|HttpContext\.Response\.Headers|Response|context\.Response\.Headers|Response\.Cookies|HttpContext\.Response\.Cookies)$/, args: [1] });
sink('cs', 'header', { assign: /^(Response|HttpContext\.Response)\.Headers\[\]$/ });
sink('php', 'header', { call: /^(header|setcookie|setrawcookie|header_register_callback)$/, args: 'all', argLacks: /Location\s*:/i });
sink('go', 'header', { method: /^(Set|Add)$/, recv: /^(w|rw|res|writer)\.Header\(\)$|\.Header\(\)$/, args: [1] });
sink('go', 'header', { method: /^(Header|SetCookie)$/, recv: /^(c|ctx)$/, args: [1] });
sink('go', 'header', { call: /^http\.SetCookie$/, args: [1] });
sink('rb', 'header', { assign: /^(response\.headers|headers|response)\[\]$/ });
sink('rb', 'header', { assign: /^cookies\[\]$/ });

// Regex injection (ReDoS)
sink('js', 'regex', { call: /^(RegExp|new RegExp)$/, args: [0] });
sink('py', 'regex', { call: /^(re\.(compile|match|search|fullmatch|findall|finditer|sub|subn|split)|regex\.(compile|match|search|sub|findall))$/, args: [0], kw: ['pattern'] });
sink('java', 'regex', { call: /^(Pattern\.compile|Pattern\.matches)$/, args: [0] });
sink('java', 'regex', { method: /^(matches|replaceAll|replaceFirst|split)$/, args: [0], notRecv: /^(Pattern\.compile\(\)|\w+Pattern|pattern|regex|PATTERN|\w+_PATTERN)$/ });
sink('java', 'regex', { call: /^(Regex|toRegex|Regex\.fromLiteral_unsafe)$/, args: [0] });
sink('java', 'regex', { method: /^toRegex$/, args: 'recv' });
sink('cs', 'regex', { call: /^(Regex)$/, args: [0], newOnly: true });
sink('cs', 'regex', { call: /^Regex\.(IsMatch|Match|Matches|Replace|Split)$/, args: [1] });
sink('php', 'regex', { call: /^(preg_match|preg_match_all|preg_replace|preg_replace_callback|preg_split|preg_grep|mb_ereg|mb_eregi|ereg|eregi)$/, args: [0] });
sink('go', 'regex', { call: /^regexp\.(Compile|MustCompile|MatchString|Match|CompilePOSIX|MustCompilePOSIX)$/, args: [0] });
sink('rb', 'regex', { call: /^(Regexp\.new|Regexp\.compile|Regexp\.union)$/, args: [0] });
sink('rb', 'regex', { regexLiteral: true });

// Server-side template injection
sink('js', 'ssti', { call: /^(ejs\.render|ejs\.compile|pug\.render|pug\.compile|jade\.render|jade\.compile|handlebars\.compile|Handlebars\.compile|hbs\.compile|_\.template|lodash\.template|nunjucks\.renderString|nunjucks\.compile|mustache\.render|Mustache\.render|dot\.template|doT\.template|twig|Twig\.twig|swig\.render|swig\.compile|eta\.render|liquid\.parseAndRender|engine\.parseAndRender|velocityjs\.render|Velocity\.render|template)$/, args: [0] });
sink('js', 'ssti', { method: /^(renderString|parseAndRender)$/, args: [0] });
sink('py', 'ssti', { call: /^(render_template_string|flask\.render_template_string|jinja2\.Template|Template|Environment\(\)\.from_string|jinja2\.Environment\(\)\.from_string|mako\.template\.Template|django\.template\.Template|Engine\(\)\.from_string|tornado\.template\.Template|chevron\.render|pystache\.render)$/, args: [0], kw: ['source', 'text'] });
sink('py', 'ssti', { method: /^from_string$/, recv: /(env|environment|jinja_env|engine|templates|Environment\(\)|SandboxedEnvironment_unsafe)$/i, args: [0] });
sink('java', 'ssti', { method: /^(evaluate|mergeTemplate)$/, recv: /(Velocity|velocity|ve|engine|velocityEngine)$/i, args: [3] });
sink('java', 'ssti', { call: /^(Template|freemarker\.template\.Template)$/, args: [1, 2], newOnly: true });
sink('java', 'ssti', { method: /^(process)$/, recv: /(templateEngine|engine|thymeleaf|springTemplateEngine)$/i, args: [0] });
sink('java', 'ssti', { method: /^(compile|compileInline|execute)$/, recv: /(handlebars|mustache|mustacheFactory|pebble|jinjava|engine)$/i, args: [0] });
sink('java', 'ssti', { method: /^render$/, recv: /(jinjava|Jinjava\(\))$/i, args: [0] });
sink('cs', 'ssti', { call: /^(Razor\.Parse|Engine\.Razor\.RunCompile|Engine\.Razor\.Compile|RazorEngine\.Razor\.Parse|Template\.Parse|Handlebars\.Compile|Scriban\.Template\.Parse)$/, args: [0] });
sink('cs', 'ssti', { method: /^(RunCompile|Compile|CompileRenderStringAsync|CompileRenderAsync|Parse)$/, recv: /(Razor|razor|engine|_engine|razorEngine|Engine\.Razor|Template|Handlebars)$/, args: [0] });
sink('php', 'ssti', { method: /^(createTemplate|render|fetch|display|renderString|loadTemplate)$/, recv: /\$(twig|smarty|tpl|blade|mustache|this\.twig|engine|m|latte|env)$/i, args: [0] });
sink('php', 'ssti', { call: /^(Blade::render|Blade\.render|Twig\\Environment|eval_template)$/, args: [0] });
sink('go', 'ssti', { method: /^Parse$/, recv: /(template\.New\(\)|New\(\)|tmpl|t|tpl|template\.Must\(\)|htmltemplate\.New\(\)|texttemplate\.New\(\))$/, args: [0] });
sink('rb', 'ssti', { call: /^(ERB\.new|Erubi::Engine\.new|Erubis::Eruby\.new|Liquid::Template\.parse|Slim::Template\.new|Haml::Engine\.new|Tilt::ERBTemplate\.new|Mustache\.render|Haml::Template\.new|ERB\.new\(\)\.result)$/, args: [0] });

// Insecure reflection
sink('js', 'reflection', { dynamicCall: true, label: 'dynamic method call' });
sink('py', 'reflection', { call: /^(importlib\.import_module|__import__|globals\(\)\.get|locals\(\)\.get|importlib\.__import__|import_module)$/, args: [0] });
sink('py', 'reflection', { call: /^getattr$/, args: [1] });
sink('java', 'reflection', { call: /^(Class\.forName|ClassLoader\.loadClass|Thread\.currentThread\(\)\.getContextClassLoader\(\)\.loadClass|ClassUtils\.getClass|ReflectionUtils\.findMethod)$/, args: [0] });
sink('java', 'reflection', { method: /^(getMethod|getDeclaredMethod|getField|getDeclaredField|loadClass|forName|getConstructor_unchecked)$/, args: [0] });
sink('cs', 'reflection', { call: /^(Type\.GetType|Assembly\.Load|Assembly\.LoadFrom|Assembly\.LoadFile|Activator\.CreateInstance|AppDomain\.CurrentDomain\.CreateInstance|Activator\.CreateInstanceFrom)$/, args: 'all' });
sink('cs', 'reflection', { method: /^(GetMethod|InvokeMember|GetProperty|GetField|CreateInstance)$/, recv: /./, args: [0] });
sink('php', 'reflection', { call: /^(call_user_func|call_user_func_array|forward_static_call|forward_static_call_array|ReflectionClass|ReflectionMethod|ReflectionFunction|constant|class_exists)$/, args: [0] });
sink('php', 'reflection', { dynamicCall: true, label: 'variable function' });
sink('go', 'reflection', { method: /^(MethodByName|FieldByName)$/, args: [0] });
sink('rb', 'reflection', { method: /^(send|__send__|public_send|const_get|instance_variable_get|instance_variable_set|method|try|class_variable_get|define_method)$/, args: [0] });
sink('rb', 'reflection', { method: /^(constantize|safe_constantize)$/, args: 'recv' });
sink('rb', 'reflection', { call: /^(Object\.const_get|Kernel\.const_get|Module\.const_get)$/, args: [0] });

// Prototype pollution (JavaScript)
sink('js', 'proto', { protoAssign: true, label: 'computed property write' });
sink('js', 'proto', { call: /^(_\.merge|_\.mergeWith|_\.defaultsDeep|lodash\.merge|lodash\.mergeWith|lodash\.defaultsDeep|merge|deepmerge|deepMerge|extend|\$\.extend|jQuery\.extend|Hoek\.merge|hoek\.merge|mixin|assignDeep|defaultsDeep|deepExtend|objectPath\.set|dotProp\.set|dottie\.set)$/, args: 'rest1' });
sink('js', 'proto', { call: /^(_\.set|_\.setWith|_\.zipObjectDeep|lodash\.set|lodash\.setWith|setValue|set|setPath|objectPath\.set|dotProp\.set|dset|setIn)$/, args: [1] });

// ---------------------------------------------------------------- sanitizers
// all vulnerability kinds: numeric / boolean conversion
san('js', ALL, { call: /^(parseInt|parseFloat|Number|Boolean|Math\.\w+|Number\.parseInt|Number\.parseFloat|BigInt|Date\.parse|isNaN|uuid\.validate|validator\.toInt|validator\.toFloat|validator\.toBoolean|_\.toNumber|_\.toInteger|parseBool|toNumber|crypto\.createHash\(\)\.update\(\)\.digest|hash)$/ });
san('js', ALL, { method: /^(digest|getTime|valueOf|toFixed|length|indexOf|charCodeAt)$/ });
san('js', ALL, { call: /^(Buffer\.byteLength|Date\.now|crypto\.randomUUID|uuid\.v4|uuidv4)$/ });
san('js', ['xss', 'header'], { call: /^JSON\.stringify$/ });
san('js', ['xss', 'redirect', 'header', 'sqli', 'path', 'cmdi', 'ldap', 'xpath', 'log'], { call: /^(encodeURIComponent|encodeURI|escape)$/ });
san('js', ['xss'], { call: /^(escapeHtml|escapeHTML|htmlEscape|_\.escape|lodash\.escape|he\.encode|he\.escape|validator\.escape|DOMPurify\.sanitize|sanitizeHtml|sanitize-html|xss|xssFilters\.\w+|filterXSS|encodeHTML|entities\.encode|entities\.encodeHTML|htmlspecialchars|escape-html|Handlebars\.escapeExpression|sanitize|purify\.sanitize|encode|textContent)$/ });
san('js', ['xss'], { method: /^(escape|escapeHTML|sanitize|encodeHTML|text)$/ });
san('js', ['sqli'], { call: /^(mysql\.escape|connection\.escape|pool\.escape|db\.escape|sqlstring\.escape|SqlString\.escape|pg\.escapeLiteral|client\.escapeLiteral|escapeLiteral|escapeIdentifier|mysql\.escapeId|format\.literal|pgFormat|knex\.ref|Prisma\.sql|sql)$/ });
san('js', ['sqli'], { method: /^(escape|escapeId|escapeLiteral|escapeIdentifier)$/ });
san('js', ['cmdi'], { call: /^(shellescape|shellEscape|shell-quote\.quote|shellQuote\.quote|quote|escapeShellArg|shlex\.quote)$/ });
san('js', ['path'], { call: /^(path\.basename|basename|sanitizeFilename|sanitize-filename|filenamify)$/ });
san('js', ['regex'], { call: /^(_\.escapeRegExp|lodash\.escapeRegExp|escapeRegExp|escapeRegex|escapeStringRegexp|RegExp\.escape|regexEscape|escape-string-regexp)$/ });
san('js', ['nosqli'], { call: /^(String|mongoSanitize|mongo-sanitize|sanitize|ObjectId|mongoose\.Types\.ObjectId|new ObjectId|sanitizeFilter|mongoose\.sanitizeFilter|validator\.escape|JSON\.stringify)$/ });
san('js', ['nosqli'], { method: /^(toString)$/ });
san('js', ['log', 'header'], { method: /^(replace|replaceAll)$/, argHas: /\\r|\\n|\[\^\\w|\\s|\\x0a|\\u000a/ });
san('js', ['proto'], { call: /^(Object\.create\(null\)|Map|new Map)$/ });
san('js', ['ssrf', 'redirect'], { call: /^(new URL\(\)\.pathname|url\.parse\(\)\.pathname)$/ });
san('js', ['ldap'], { call: /^(ldapEscape\.filter|ldapEscape\.dn|escapeLdap|ldapjs\.escape|escapeLDAPFilter|parseFilter_safe)$/ });

san('py', ALL, { call: /^(int|float|bool|len|abs|round|uuid\.UUID|UUID|decimal\.Decimal|Decimal|datetime\.\w+|hash|hashlib\.\w+|ord|complex)$/ });
san('py', ALL, { method: /^(hexdigest|digest|isdigit|isalnum|isalpha|isnumeric)$/ });
san('py', ['xss'], { call: /^(html\.escape|cgi\.escape|escape|markupsafe\.escape|flask\.escape|bleach\.clean|bleach\.linkify|django\.utils\.html\.escape|conditional_escape|xml\.sax\.saxutils\.escape|saxutils\.escape|strip_tags|nh3\.clean|quoteattr|render_template|jsonify|json\.dumps|escape_html)$/ });
san('py', ['xss', 'redirect', 'header', 'ssrf', 'path', 'log'], { call: /^(urllib\.parse\.quote|urllib\.parse\.quote_plus|quote|quote_plus|urlencode|urllib\.parse\.urlencode|url_quote)$/ });
san('py', ['cmdi'], { call: /^(shlex\.quote|pipes\.quote|quote|shlex\.split)$/ });
san('py', ['path'], { call: /^(os\.path\.basename|basename|secure_filename|werkzeug\.utils\.secure_filename|safe_join|werkzeug\.security\.safe_join|send_from_directory|flask\.safe_join|get_valid_filename|PurePath\(\)\.name|pathlib\.Path\(\)\.name)$/ });
san('py', ['path'], { method: /^name$/ });
san('py', ['regex'], { call: /^(re\.escape|regex\.escape|fnmatch\.translate_escaped)$/ });
san('py', ['ldap'], { call: /^(escape_filter_chars|ldap\.filter\.escape_filter_chars|escape_rdn|ldap3\.utils\.conv\.escape_filter_chars|escape_dn_chars|ldap\.dn\.escape_dn_chars)$/ });
san('py', ['sqli'], { call: /^(psycopg2\.sql\.Literal|sql\.Literal|sql\.Identifier|psycopg2\.extensions\.adapt|adapt|escape_string|pymysql\.converters\.escape_string|MySQLdb\.escape_string|connection\.escape|conn\.escape|sqlalchemy\.bindparam|bindparam)$/ });
san('py', ['log', 'header'], { method: /^(replace|strip|translate)$/, argHas: /\\r|\\n/ });
san('py', ['nosqli'], { call: /^(str|ObjectId|bson\.ObjectId|bson\.objectid\.ObjectId)$/ });
san('py', ['xpath'], { call: /^(xpath_escape|escape_xpath)$/ });

san('java', ALL, { call: /^(Integer\.parseInt|Integer\.valueOf|Long\.parseLong|Long\.valueOf|Double\.parseDouble|Double\.valueOf|Float\.parseFloat|Short\.parseShort|Byte\.parseByte|Boolean\.parseBoolean|Boolean\.valueOf|UUID\.fromString|UUID\.nameUUIDFromBytes|BigDecimal|BigInteger|LocalDate\.parse|Instant\.parse|NumberUtils\.toInt|NumberUtils\.toLong|NumberUtils\.createInteger|Math\.\w+|Objects\.hash|String\.valueOf_num|DigestUtils\.\w+|Base64\.getEncoder\(\)\.encodeToString|toInt|toLong|toIntOrNull|toLongOrNull|toDouble|toBoolean)$/ });
san('java', ALL, { method: /^(hashCode|length|size|toInt|toLong|toIntOrNull|toLongOrNull|toDouble|toDoubleOrNull|toBoolean|toBooleanStrict|digest|isEmpty|isBlank|indexOf|compareTo|equals|equalsIgnoreCase|count)$/ });
san('java', ['xss'], { call: /^(Encode\.forHtml|Encode\.forHtmlContent|Encode\.forHtmlAttribute|Encode\.forJavaScript|Encode\.forUriComponent|StringEscapeUtils\.escapeHtml4|StringEscapeUtils\.escapeHtml3|StringEscapeUtils\.escapeHtml|StringEscapeUtils\.escapeXml|StringEscapeUtils\.escapeXml10|StringEscapeUtils\.escapeXml11|StringEscapeUtils\.escapeEcmaScript|HtmlUtils\.htmlEscape|HtmlUtils\.htmlEscapeDecimal|HtmlUtils\.htmlEscapeHex|ESAPI\.encoder\(\)\.encodeForHTML|ESAPI\.encoder\(\)\.encodeForHTMLAttribute|ESAPI\.encoder\(\)\.encodeForJavaScript|Jsoup\.clean|JavaScriptUtils\.javaScriptEscape|Sanitizers\.\w+\.sanitize|PolicyFactory\.sanitize|policy\.sanitize|HtmlEscapers\.htmlEscaper\(\)\.escape|XmlEscapers\.xmlContentEscaper\(\)\.escape|escapeHtml)$/ });
san('java', ['xss'], { method: /^(sanitize|escapeHtml|encodeForHTML|forHtml|htmlEscape)$/ });
san('java', ['sqli'], { call: /^(ESAPI\.encoder\(\)\.encodeForSQL|StringEscapeUtils\.escapeSql|DSL\.val|DSL\.inline|DSL\.param)$/ });
san('java', ['cmdi'], { call: /^(ESAPI\.encoder\(\)\.encodeForOS|StringEscapeUtils\.escapeJava_shell)$/ });
san('java', ['path'], { call: /^(FilenameUtils\.getName|FilenameUtils\.getBaseName|FilenameUtils\.normalize_checked|Paths\.get\(\)\.getFileName|new File\(\)\.getName|ESAPI\.validator\(\)\.getValidFileName)$/ });
san('java', ['path'], { method: /^(getFileName|getName)$/ });
san('java', ['regex'], { call: /^(Pattern\.quote|Regex\.escape|Matcher\.quoteReplacement)$/ });
san('java', ['ldap'], { call: /^(LdapEncoder\.filterEncode|LdapEncoder\.nameEncode|Encode\.forLdap|ESAPI\.encoder\(\)\.encodeForLDAP|ESAPI\.encoder\(\)\.encodeForDN|LdapNameBuilder|Filter\.encodeValue|escapeLDAPSearchFilter|LdapUtils\.escape)$/ });
san('java', ['xpath'], { call: /^(ESAPI\.encoder\(\)\.encodeForXPath|Encode\.forXml|escapeXPath)$/ });
san('java', ['redirect', 'ssrf', 'header', 'xss', 'log'], { call: /^(URLEncoder\.encode|Encode\.forUriComponent|UriUtils\.encode|UriUtils\.encodePath|UriUtils\.encodeQueryParam|UriEncoder\.encode|ESAPI\.encoder\(\)\.encodeForURL)$/ });
san('java', ['log', 'header'], { method: /^(replace|replaceAll)$/, argHas: /\\\\r|\\\\n|\\r|\\n|\[\^/ });
san('java', ['log'], { call: /^(Encode\.forJava|StringEscapeUtils\.escapeJava|ESAPI\.encoder\(\)\.encodeForHTML)$/ });

san('cs', ALL, { call: /^(int\.Parse|int\.TryParse|Int32\.Parse|Int64\.Parse|long\.Parse|double\.Parse|decimal\.Parse|Guid\.Parse|Guid\.TryParse|Convert\.ToInt32|Convert\.ToInt64|Convert\.ToDouble|Convert\.ToBoolean|Convert\.ToDecimal|bool\.Parse|DateTime\.Parse|Math\.\w+)$/ });
san('cs', ['xss'], { call: /^(HttpUtility\.HtmlEncode|WebUtility\.HtmlEncode|HtmlEncoder\.Default\.Encode|HttpUtility\.HtmlAttributeEncode|Server\.HtmlEncode|AntiXssEncoder\.HtmlEncode|Encoder\.HtmlEncode|JavaScriptEncoder\.Default\.Encode|HttpUtility\.JavaScriptStringEncode|Sanitizer\.GetSafeHtml|HtmlSanitizer\(\)\.Sanitize|_htmlEncoder\.Encode|SecurityElement\.Escape)$/ });
san('cs', ['xss'], { method: /^(Sanitize|HtmlEncode|Encode)$/ });
san('cs', ['xss', 'redirect', 'ssrf', 'header', 'log'], { call: /^(Uri\.EscapeDataString|HttpUtility\.UrlEncode|WebUtility\.UrlEncode|UrlEncoder\.Default\.Encode|Uri\.EscapeUriString)$/ });
san('cs', ['path'], { call: /^(Path\.GetFileName|Path\.GetFileNameWithoutExtension|Path\.GetExtension)$/ });
san('cs', ['regex'], { call: /^(Regex\.Escape)$/ });
san('cs', ['ldap'], { call: /^(Encoder\.LdapFilterEncode|Encoder\.LdapDistinguishedNameEncode|LdapFilterEncode|AntiXssEncoder\.LdapFilterEncode)$/ });
san('cs', ['redirect'], { call: /^(LocalRedirect|Url\.IsLocalUrl_s)$/ });
san('cs', ['log', 'header'], { method: /^(Replace)$/, argHas: /\\r|\\n|Environment\.NewLine/ });

san('php', ALL, { call: /^(intval|floatval|boolval|abs|is_numeric_val|ctype_digit_val|count|strlen|md5|sha1|hash|crc32|uniqid|bin2hex|settype_int|filter_var_int|max|min|round|floor|ceil)$/ });
san('php', ALL, { call: /^filter_var$/, argHas: /FILTER_VALIDATE_(INT|FLOAT|BOOLEAN|BOOL|EMAIL|IP)|FILTER_SANITIZE_NUMBER_(INT|FLOAT)/ });
san('php', ALL, { call: /^filter_input$/, argHas: /FILTER_VALIDATE_(INT|FLOAT|BOOLEAN|BOOL)|FILTER_SANITIZE_NUMBER_(INT|FLOAT)/ });
san('php', ['xss'], { call: /^(htmlspecialchars|htmlentities|strip_tags|esc_html|esc_attr|esc_js|esc_textarea|wp_kses|wp_kses_post|e|Html::escape|Html\.escape|HTMLPurifier\(\)\.purify|htmlpurifier|twig_escape_filter|json_encode)$/ });
san('php', ['xss'], { method: /^(purify|escape|clean)$/ });
san('php', ['xss', 'redirect', 'header', 'ssrf', 'path', 'log'], { call: /^(urlencode|rawurlencode|http_build_query|esc_url|esc_url_raw)$/ });
san('php', ['cmdi'], { call: /^(escapeshellarg|escapeshellcmd)$/ });
san('php', ['path'], { call: /^(basename|pathinfo|sanitize_file_name)$/ });
san('php', ['sqli'], { call: /^(mysqli_real_escape_string|mysql_real_escape_string|mysql_escape_string|pg_escape_string|pg_escape_literal|pg_escape_identifier|sqlite_escape_string|esc_sql|addslashes|SQLite3::escapeString|db2_escape_string)$/ });
san('php', ['sqli'], { method: /^(quote|real_escape_string|escape_string|escape|prepare_safe|esc_like)$/ });
san('php', ['regex'], { call: /^(preg_quote)$/ });
san('php', ['ldap'], { call: /^(ldap_escape)$/ });
san('php', ['log', 'header'], { call: /^(str_replace|preg_replace|strtr)$/, argHas: /\\r|\\n|PHP_EOL|"\\r\\n"/ });

san('go', ALL, { call: /^(strconv\.(Atoi|ParseInt|ParseUint|ParseFloat|ParseBool)|uuid\.Parse|uuid\.MustParse|len|time\.Parse|int|int64|float64|sha256\.Sum256|md5\.Sum|hex\.EncodeToString)$/ });
san('go', ['xss'], { call: /^(html\.EscapeString|template\.HTMLEscapeString|template\.JSEscapeString|template\.HTMLEscaper|url\.QueryEscape|bluemonday\.\w+\(\)\.Sanitize|p\.Sanitize|policy\.Sanitize|json\.Marshal|template\.HTMLEscape)$/ });
san('go', ['xss'], { method: /^(Sanitize|SanitizeBytes)$/ });
san('go', ['xss', 'redirect', 'ssrf', 'header', 'path', 'log', 'cmdi'], { call: /^(url\.QueryEscape|url\.PathEscape)$/ });
san('go', ['path'], { call: /^(filepath\.Base|path\.Base)$/ });
san('go', ['regex'], { call: /^(regexp\.QuoteMeta)$/ });
san('go', ['ldap'], { call: /^(ldap\.EscapeFilter|ldap\.EscapeDN)$/ });
san('go', ['log', 'header'], { call: /^(strings\.ReplaceAll|strings\.Replace|strings\.NewReplacer\(\)\.Replace)$/, argHas: /\\r|\\n/ });
san('go', ['log', 'header'], { method: /^Replace$/, recv: /Replacer|replacer/, argHas: /./ });
san('go', ['cmdi'], { call: /^(shellescape\.Quote|shellquote\.Join)$/ });

san('rb', ALL, { method: /^(to_i|to_f|to_r|to_c|length|size|count|hash|hexdigest|digest|zero\?|positive\?|negative\?|to_sym_safe|nil\?|empty\?|blank\?|present\?|include\?|start_with\?|end_with\?)$/ });
san('rb', ALL, { call: /^(Integer|Float|Rational|Digest::\w+\.hexdigest|Digest\.\w+\.hexdigest|SecureRandom\.\w+)$/ });
san('rb', ['xss'], { call: /^(h|html_escape|ERB::Util\.html_escape|ERB::Util\.h|CGI\.escapeHTML|CGI\.escape_html|Rack::Utils\.escape_html|sanitize|strip_tags|escape_javascript|j|json_escape|ERB\.Util\.html_escape|CGI\.escapeHTML|Loofah\.fragment\(\)\.scrub!|simple_format|content_tag|link_to|to_json)$/ });
san('rb', ['xss', 'redirect', 'ssrf', 'header', 'path', 'log', 'cmdi'], { call: /^(CGI\.escape|URI\.encode_www_form_component|URI\.encode_www_form|ERB::Util\.url_encode|u|url_encode|Rack::Utils\.escape|URI\.encode_uri_component|CGI\.escape)$/ });
san('rb', ['cmdi'], { call: /^(Shellwords\.escape|Shellwords\.shellescape|shellescape|Shellwords\.join|Shellwords\.shelljoin)$/ });
san('rb', ['cmdi'], { method: /^(shellescape)$/ });
san('rb', ['path'], { call: /^(File\.basename|Pathname\.new\(\)\.basename|ActiveStorage::Filename\.new\(\)\.sanitized|sanitize_filename)$/ });
san('rb', ['path'], { method: /^(basename)$/ });
san('rb', ['regex'], { call: /^(Regexp\.escape|Regexp\.quote)$/ });
san('rb', ['sqli'], { call: /^(ActiveRecord::Base\.sanitize_sql|sanitize_sql|sanitize_sql_array|sanitize_sql_like|ActiveRecord::Base\.connection\.quote|connection\.quote|quote|sanitize_sql_for_conditions|Arel\.sql_safe)$/ });
san('rb', ['sqli'], { method: /^(quote|sanitize_sql|sanitize_sql_array)$/ });
san('rb', ['ldap'], { call: /^(Net::LDAP::Filter\.escape|Net\.LDAP\.Filter\.escape)$/ });
san('rb', ['log', 'header'], { method: /^(gsub|tr|delete|gsub!|tr!|delete!)$/, argHas: /\\r|\\n/ });
san('rb', ['reflection'], { method: /^(to_sym_whitelist)$/ });

// ---------------------------------------------------------------- guards (conditions)
const PATHLIKE = ['path', 'ssrf', 'redirect'];
guard('js', PATHLIKE, { method: /^(startsWith|startsWithIgnoreCase)$/, check: 'recv' });
guard('js', ALL, { method: /^(includes|has|indexOf|contains|test|some|find|hasOwnProperty_allow)$/, recv: /^[A-Z_][A-Z0-9_]*$|allow|white|valid|safe|permit|known|supported|accepted|enum|options|choices|^Object\.values\(\)$|^\[\]|^\/.*\/$/i, check: 0 });
guard('js', ALL, { method: /^test$/, check: 0, recv: /^\/\^.*\$\/$/ });
guard('js', ALL, { call: /^(validator\.\w+|isValid\w*|validate\w*|is\w*(Valid|Safe|Allowed|Whitelisted)\w*|Number\.isInteger|Number\.isSafeInteger|Number\.isFinite|isFinite|isUUID|uuidValidate|isSafePath|isAllowed\w*|isLocalUrl|isRelativeUrl|isSameOrigin)$/, check: 'all' });
guard('js', ['proto'], { text: /__proto__|['"]constructor['"]|['"]prototype['"]|hasOwnProperty|Object\.prototype\.hasOwnProperty|Object\.hasOwn/ });
guard('py', PATHLIKE, { method: /^(startswith)$/, check: 'recv' });
guard('py', PATHLIKE, { call: /^(os\.path\.commonpath|os\.path\.commonprefix)$/, check: 'all' });
guard('py', PATHLIKE, { method: /^(is_relative_to)$/, check: 'recv' });
guard('py', ALL, { method: /^(isdigit|isnumeric|isdecimal|isalnum|isalpha|isidentifier)$/, check: 'recv' });
guard('py', ALL, { call: /^(re\.(fullmatch|match)|regex\.(fullmatch|match))$/, check: 1, argHas: /^\S*["']\^|\\A|fullmatch|\$["']/ });
guard('py', ALL, { method: /^(fullmatch|match)$/, check: 0, recv: /PATTERN|_RE$|_REGEX$|pattern|regex|re\.compile\(\)/i });
guard('py', ALL, { call: /^(isinstance)$/, check: 0, argHas: /\b(int|float|bool|UUID)\b/ });
guard('py', ALL, { inOp: true, rhs: /^[A-Z_][A-Z0-9_]*$|allow|white|valid|safe|permit|known|supported|choices|^\[|^\(|^\{/i });
guard('py', ALL, { call: /^(is_valid\w*|validate\w*|is_safe\w*|is_allowed\w*|url_has_allowed_host_and_scheme|is_safe_url|validators\.\w+)$/, check: 'all' });
guard('java', PATHLIKE, { method: /^(startsWith)$/, check: 'recv' });
guard('java', ALL, { method: /^(contains|containsKey|matches|isValid|containsValue)$/, recv: /^[A-Z_][A-Z0-9_]*$|allow|white|valid|safe|permit|known|supported|accepted|^Set\.of\(\)|^List\.of\(\)|^Arrays\.asList\(\)|Pattern|PATTERN|_RE$|matcher/i, check: 0 });
guard('java', ALL, { method: /^(matches)$/, check: 'recv', argHas: /"\^?\[[^\]]*\][*+]\$?"|"\\\\[dw][+*]"|"\^.*\$"/ });
guard('java', ALL, { call: /^(StringUtils\.isNumeric|StringUtils\.isAlphanumeric|StringUtils\.isAlpha|NumberUtils\.isDigits|NumberUtils\.isCreatable|isValid\w*|validate\w*|is\w*(Valid|Safe|Allowed)\w*|InternetDomainName\.isValid|UrlValidator\(\)\.isValid|EmailValidator\.\w+\(\)\.isValid)$/, check: 'all' });
guard('java', ALL, { method: /^(isValid|matches)$/, recv: /Validator|validator|PATTERN|Pattern|matcher\(\)/, check: 0 });
guard('cs', PATHLIKE, { method: /^(StartsWith)$/, check: 'recv' });
guard('cs', ['redirect'], { call: /^(Url\.IsLocalUrl|IsLocalUrl)$/, check: 'all' });
guard('cs', ALL, { method: /^(Contains|ContainsKey|IsMatch|Any)$/, recv: /^[A-Z_][A-Z0-9_]*$|allow|white|valid|safe|permit|known|supported|_allowed|Allowed|Regex/i, check: 0 });
guard('cs', ALL, { call: /^(Regex\.IsMatch)$/, check: 0, argHas: /"\^.*\$"/ });
guard('cs', ALL, { call: /^(int\.TryParse|long\.TryParse|Guid\.TryParse|Uri\.IsWellFormedUriString|IsValid\w*|Validate\w*)$/, check: 'all' });
guard('php', PATHLIKE, { call: /^(str_starts_with|strpos|stripos|strncmp)$/, check: 0 });
guard('php', ALL, { call: /^(in_array|array_key_exists|array_search|isset_allow)$/, check: 0 });
guard('php', ALL, { call: /^(ctype_digit|ctype_alnum|ctype_alpha|is_numeric|is_int|filter_var|is_valid\w*|validate\w*|wp_validate_redirect)$/, check: 0 });
guard('php', ALL, { call: /^(preg_match)$/, check: 1, argHas: /["']\/\^|\\A|\$\/[a-z]*["']/ });
guard('go', PATHLIKE, { call: /^(strings\.HasPrefix|filepath\.HasPrefix)$/, check: 0 });
guard('go', PATHLIKE, { call: /^(filepath\.Rel|filepath\.IsLocal)$/, check: 'all' });
guard('go', ALL, { call: /^(regexp\.MatchString|slices\.Contains|contains|isValid\w*|validate\w*|IsValid\w*|Validate\w*)$/, check: 'all' });
guard('go', ALL, { method: /^(MatchString|Match)$/, recv: /Regex|regex|re|Re|pattern|valid/i, check: 0 });
guard('go', ALL, { indexAllow: /^[A-Z_][A-Za-z0-9_]*$|allow|white|valid|safe|permit|known/i });
guard('rb', PATHLIKE, { method: /^(start_with\?)$/, check: 'recv' });
guard('rb', ALL, { method: /^(include\?|key\?|has_key\?|member\?|match\?|match)$/, recv: /^[A-Z_][A-Z0-9_]*$|allow|white|valid|safe|permit|known|supported|^%w|^\[\]/i, check: 0 });
guard('rb', ALL, { text: /=~\s*\/\\A|\.match\?\(\/\\A|\\z\// });
guard('rb', ALL, { call: /^(valid\w*\?|is_valid\w*|validate\w*|Integer)$/, check: 'all' });

// ---------------------------------------------------------------- propagators
prop('js', { method: /^(push|unshift|add|set|append|concat_into)$/, from: 'all', to: 'recv' });
prop('js', { call: /^Object\.assign$/, from: 'rest1', to: 0 });
prop('py', { method: /^(append|extend|add|update|insert|write|setdefault|appendleft)$/, from: 'all', to: 'recv' });
prop('java', { method: /^(append|add|addAll|put|putAll|insert|offer|push|set|setString|write|print|addElement)$/, from: 'all', to: 'recv', notRecv: /(getWriter\(\)|out|response|resp|log|logger)$/ });
prop('java', { method: /^(getBytes|toCharArray|toString|toByteArray|stream|iterator|next|get|getValue|getKey|entrySet|values|keySet|orElse|orElseGet|orElseThrow|join)$/, from: 'recv', to: 'ret' });
prop('cs', { method: /^(Append|AppendLine|AppendFormat|Add|AddRange|Insert|Push|Enqueue|Write|WriteLine)$/, from: 'all', to: 'recv', notRecv: /(Response|Console|_logger|logger|writer)$/ });
prop('php', { call: /^(array_push|array_unshift)$/, from: 'rest1', to: 0 });
prop('php', { call: /^(parse_str|extract|preg_match|preg_match_all|sscanf)$/, from: 0, to: 'last' });
prop('go', { method: /^(Decode|Unmarshal|Scan|ReadJSON|BindJSON)$/, from: 'recv', to: 0 });
prop('go', { call: /^(json\.Unmarshal|xml\.Unmarshal|yaml\.Unmarshal|proto\.Unmarshal|gob\.NewDecoder\(\)\.Decode|io\.ReadFull|mapstructure\.Decode|copy)$/, from: 0, to: 1 });
prop('go', { call: /^(fmt\.Sscanf|fmt\.Sscan)$/, from: 0, to: 'rest2' });
prop('go', { method: /^(WriteString|Write|WriteByte|WriteRune)$/, recv: /^(sb|b|buf|builder|buffer|sql|query|q|cmd|s)$/, from: 'all', to: 'recv' });
prop('rb', { method: /^(push|append|concat|unshift|insert|merge!|update|store|<<)$/, from: 'all', to: 'recv' });

// ---------------------------------------------------------------- export
function toJSONModel(entry) {
  const out = {};
  for (const [k, v] of Object.entries(entry)) {
    if (v instanceof RegExp) out[k] = v.flags ? { re: v.source, flags: v.flags } : v.source;
    else if (Array.isArray(v)) out[k] = v.slice();
    else if (v && typeof v === 'object') out[k] = JSON.parse(JSON.stringify(v));
    else out[k] = v;
  }
  return out;
}

function defaultModels() {
  return M.map(toJSONModel);
}

module.exports = { defaultModels, NUM_TYPES: NUM_TYPES.source };
