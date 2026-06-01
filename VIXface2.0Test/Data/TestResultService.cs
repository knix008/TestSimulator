using Microsoft.Data.Sqlite;

namespace VIXFaceTest.Data
{
    public class TestResultService
    {
        /// <summary>CSV보내기 및 UPDATE에 사용하는 컬럼 순서 (DB 물리 순서와 무관하게 이름으로 매핑)</summary>
        public static readonly string[] ExportColumnNames =
        {
            "ID",
            "CREATE_DATE",
            "IP_ADDRESS",
            "SERIAL",
            "VERSION",
            "BIST",
            "BLE",
            "NFC",
            "WIEGAND",
            "WIFI",
            "CAMERA",
            "LOCK",
            "TAMPER",
            "DEFAULT_STATE",
            "NETWORK",
            "MAC",
            "ERROR_MESSAGE"
        };

        private readonly string _connectionString;

        public TestResultService()
        {
            _connectionString = "Data Source=test_results.db";
            InitializeDatabase();
        }

        private void InitializeDatabase()
        {
            using var connection = new SqliteConnection(_connectionString);
            connection.Open();

            string createTableQuery = @"
                CREATE TABLE IF NOT EXISTS TestResults (
                    ID INTEGER PRIMARY KEY AUTOINCREMENT,
                    CREATE_DATE DATETIME DEFAULT CURRENT_TIMESTAMP,
                    IP_ADDRESS TEXT,
                    SERIAL TEXT,
                    VERSION TEXT,
                    BIST TEXT,
                    BLE TEXT,
                    NFC TEXT,
                    WIEGAND TEXT,
                    WIFI TEXT,
                    CAMERA TEXT,
                    LOCK TEXT,
                    TAMPER TEXT,
                    DEFAULT_STATE TEXT,
                    NETWORK TEXT,
                    MAC TEXT,
                    ERROR_MESSAGE TEXT
                );";

            using var command = new SqliteCommand(createTableQuery, connection);
            command.ExecuteNonQuery();

            AddMissingColumns(connection);
        }

        private void AddMissingColumns(SqliteConnection connection)
        {
            try
            {
                var requiredColumns = ExportColumnNames
                    .Where(c => !string.Equals(c, "ID", StringComparison.OrdinalIgnoreCase))
                    .ToDictionary(c => c, _ => "TEXT", StringComparer.OrdinalIgnoreCase);

                string getColumnsQuery = "PRAGMA table_info(TestResults);";
                using var getColumnsCommand = new SqliteCommand(getColumnsQuery, connection);
                using var reader = getColumnsCommand.ExecuteReader();

                var existingColumns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                while (reader.Read())
                {
                    existingColumns.Add(reader["name"].ToString() ?? "");
                }
                reader.Close();

                foreach (var column in requiredColumns)
                {
                    if (!existingColumns.Contains(column.Key))
                    {
                        string addColumnQuery = $"ALTER TABLE TestResults ADD COLUMN [{column.Key}] {column.Value};";
                        using var addColumnCommand = new SqliteCommand(addColumnQuery, connection);
                        addColumnCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"컬럼 추가 오류: {ex.Message}");
            }
        }

        public async Task<int> CreateNewTestSessionAsync(string ipAddress)
        {
            using var connection = new SqliteConnection(_connectionString);
            await connection.OpenAsync();

            string currentTime = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");

            string insertQuery = @"
                INSERT INTO TestResults (IP_ADDRESS, CREATE_DATE) 
                VALUES (@ipAddress, @createDate);
                SELECT last_insert_rowid();";

            using var command = new SqliteCommand(insertQuery, connection);
            command.Parameters.AddWithValue("@ipAddress", ipAddress);
            command.Parameters.AddWithValue("@createDate", currentTime);

            var result = await command.ExecuteScalarAsync();
            return Convert.ToInt32(result);
        }

        public async Task UpdateTestResultAsync(int sessionId, string columnName, string value, string errorMessage = "")
        {
            if (!ExportColumnNames.Contains(columnName, StringComparer.OrdinalIgnoreCase) ||
                string.Equals(columnName, "ID", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(columnName, "CREATE_DATE", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(columnName, "IP_ADDRESS", StringComparison.OrdinalIgnoreCase))
            {
                throw new ArgumentException($"지원하지 않는 결과 컬럼: {columnName}");
            }

            using var connection = new SqliteConnection(_connectionString);
            await connection.OpenAsync();

            string updateQuery = $@"
                UPDATE TestResults 
                SET [{columnName}] = @value, ERROR_MESSAGE = @errorMessage 
                WHERE ID = @sessionId";

            using var command = new SqliteCommand(updateQuery, connection);
            command.Parameters.AddWithValue("@value", value);
            command.Parameters.AddWithValue("@errorMessage", errorMessage ?? "");
            command.Parameters.AddWithValue("@sessionId", sessionId);

            await command.ExecuteNonQueryAsync();
        }

        public async Task<int> ResetDatabaseAsync()
        {
            using var connection = new SqliteConnection(_connectionString);
            await connection.OpenAsync();

            int deletedRows = 0;
            try
            {
                using var countCommand = new SqliteCommand("SELECT COUNT(*) FROM TestResults", connection);
                var countResult = await countCommand.ExecuteScalarAsync();
                deletedRows = Convert.ToInt32(countResult);
            }
            catch (SqliteException)
            {
                deletedRows = 0;
            }

            using (var dropCommand = new SqliteCommand("DROP TABLE IF EXISTS TestResults", connection))
            {
                await dropCommand.ExecuteNonQueryAsync();
            }

            using (var createCommand = new SqliteCommand(
                """
                CREATE TABLE TestResults (
                    ID INTEGER PRIMARY KEY AUTOINCREMENT,
                    CREATE_DATE DATETIME DEFAULT CURRENT_TIMESTAMP,
                    IP_ADDRESS TEXT,
                    SERIAL TEXT,
                    VERSION TEXT,
                    BIST TEXT,
                    BLE TEXT,
                    NFC TEXT,
                    WIEGAND TEXT,
                    WIFI TEXT,
                    CAMERA TEXT,
                    LOCK TEXT,
                    TAMPER TEXT,
                    DEFAULT_STATE TEXT,
                    NETWORK TEXT,
                    MAC TEXT,
                    ERROR_MESSAGE TEXT
                );
                """, connection))
            {
                await createCommand.ExecuteNonQueryAsync();
            }

            return deletedRows;
        }

        public async Task<string> ExportToCsvAsync(string filePath, DateTime? startDate = null, DateTime? endDate = null)
        {
            try
            {
                using var connection = new SqliteConnection(_connectionString);
                await connection.OpenAsync();

                string selectColumns = string.Join(", ",
                    ExportColumnNames.Select(c => $"[{c}]"));

                string query = $"SELECT {selectColumns} FROM TestResults";
                var parameters = new List<SqliteParameter>();

                if (startDate.HasValue && endDate.HasValue)
                {
                    query += " WHERE CREATE_DATE BETWEEN @startDate AND @endDate";
                    parameters.Add(new SqliteParameter("@startDate", startDate.Value.ToString("yyyy-MM-dd 00:00:00")));
                    parameters.Add(new SqliteParameter("@endDate", endDate.Value.ToString("yyyy-MM-dd 23:59:59")));
                }

                query += " ORDER BY CREATE_DATE DESC";

                using var command = new SqliteCommand(query, connection);
                command.Parameters.AddRange(parameters.ToArray());

                using var reader = await command.ExecuteReaderAsync();
                using var writer = new StreamWriter(filePath, false, System.Text.Encoding.UTF8);

                await writer.WriteLineAsync(string.Join(",", ExportColumnNames));

                while (await reader.ReadAsync())
                {
                    var values = new List<string>(ExportColumnNames.Length);
                    for (int i = 0; i < ExportColumnNames.Length; i++)
                    {
                        var value = reader.IsDBNull(i) ? "" : reader.GetValue(i)?.ToString() ?? "";
                        if (value.Contains(',') || value.Contains('"') || value.Contains('\n'))
                        {
                            value = "\"" + value.Replace("\"", "\"\"") + "\"";
                        }
                        values.Add(value);
                    }
                    await writer.WriteLineAsync(string.Join(",", values));
                }

                return $"CSV 파일이 성공적으로 생성되었습니다.\n경로: {filePath}";
            }
            catch (Exception ex)
            {
                return $"CSV 생성 실패: {ex.Message}";
            }
        }
    }
}
