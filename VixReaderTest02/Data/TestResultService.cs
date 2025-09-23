using Microsoft.Data.Sqlite;

namespace VixReaderTest01.Data
{
    public class TestResultService
    {
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

            // 테이블이 존재하지 않을 경우 생성 (ID와 CREATE_DATE 컬럼 포함)
            string createTableQuery = @"
                CREATE TABLE IF NOT EXISTS TestResults (
                    ID INTEGER PRIMARY KEY AUTOINCREMENT,
                    CREATE_DATE DATETIME DEFAULT CURRENT_TIMESTAMP,
                    IP_ADDRESS TEXT,
                    SERIAL TEXT,
                    VERSION TEXT,
                    REBOOT TEXT,
                    BIST TEXT,
                    BLE TEXT,
                    NFC TEXT,
                    LFID TEXT,
                    AUXIN TEXT,
                    SENSOR TEXT,
                    LOCK TEXT,
                    BUTTON TEXT,
                    LED TEXT,
                    BUZZER TEXT,
                    TAMPER TEXT,
                    DEFAULT_STATE TEXT,
                    CLEAR_SETTING TEXT,
                    MAC TEXT,
                    ERROR_MESSAGE TEXT
                );";

            using var command = new SqliteCommand(createTableQuery, connection);
            command.ExecuteNonQuery();

            // 기존 테이블에 누락된 컬럼 추가
            AddMissingColumns(connection);
        }

        private void AddMissingColumns(SqliteConnection connection)
        {
            try
            {
                // 필수 컬럼 목록 (NETWORK 제거, MAC 추가)
                var requiredColumns = new Dictionary<string, string>
                {
                    { "ID", "INTEGER PRIMARY KEY AUTOINCREMENT" },
                    { "CREATE_DATE", "DATETIME DEFAULT CURRENT_TIMESTAMP" },
                    { "IP_ADDRESS", "TEXT" },
                    { "SERIAL", "TEXT" },
                    { "VERSION", "TEXT" },
                    { "REBOOT", "TEXT" },
                    { "BIST", "TEXT" },
                    { "BLE", "TEXT" },
                    { "NFC", "TEXT" },
                    { "LFID", "TEXT" },
                    { "AUXIN", "TEXT" },
                    { "SENSOR", "TEXT" },
                    { "LOCK", "TEXT" },
                    { "BUTTON", "TEXT" },
                    { "LED", "TEXT" },
                    { "BUZZER", "TEXT" },
                    { "TAMPER", "TEXT" },
                    { "DEFAULT_STATE", "TEXT" },
                    { "CLEAR_SETTING", "TEXT" },
                    { "MAC", "TEXT" },
                    { "ERROR_MESSAGE", "TEXT" }
                };

                // 현재 테이블의 컬럼 정보 가져오기
                string getColumnsQuery = "PRAGMA table_info(TestResults);";
                using var getColumnsCommand = new SqliteCommand(getColumnsQuery, connection);
                using var reader = getColumnsCommand.ExecuteReader();
                
                var existingColumns = new HashSet<string>();
                while (reader.Read())
                {
                    existingColumns.Add(reader["name"].ToString() ?? "");
                }
                reader.Close();

                // 누락된 컬럼 추가 (ID와 PRIMARY KEY는 ALTER TABLE로 추가 불가능하므로 제외)
                foreach (var column in requiredColumns)
                {
                    if (!existingColumns.Contains(column.Key) && column.Key != "ID")
                    {
                        string addColumnQuery = $"ALTER TABLE TestResults ADD COLUMN [{column.Key}] {column.Value};";
                        using var addColumnCommand = new SqliteCommand(addColumnQuery, connection);
                        addColumnCommand.ExecuteNonQuery();
                        Console.WriteLine($"컬럼 추가됨: {column.Key}");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"컬럼 추가 오류: {ex.Message}");
                // 컬럼 추가 실패는 치명적이지 않으므로 예외를 다시 던지지 않음
            }
        }

        public async Task<int> CreateNewTestSessionAsync(string ipAddress)
        {
            using var connection = new SqliteConnection(_connectionString);
            await connection.OpenAsync();

            // 현재 시간을 명시적으로 지정
            string currentTime = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");

            // 새로운 테스트 세션 레코드 생성 (현재 시간을 명시적으로 설정)
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

        public async Task<string> ExportToCsvAsync(string filePath, DateTime? startDate = null, DateTime? endDate = null)
        {
            try
            {
                using var connection = new SqliteConnection(_connectionString);
                await connection.OpenAsync();

                string query = "SELECT * FROM TestResults";
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

                // CSV 헤더 작성 (ID와 CREATE_DATE 포함)
                await writer.WriteLineAsync("ID,생성일시,IP주소,시리얼번호,펌웨어버전,Reboot,BIST,BLE,NFC,LFID,AUXIN,Sensor,Lock,Button,LED,Buzzer,Tamper,Default,Clear Setting,MAC");

                // 데이터 작성
                while (await reader.ReadAsync())
                {
                    var values = new List<string>();
                    for (int i = 0; i < reader.FieldCount; i++)
                    {
                        var value = reader.GetValue(i)?.ToString() ?? "";
                        // CSV에서 쉼표와 따옴표 처리
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
                return $"CSV 내보내기 실패: {ex.Message}";
            }
        }
    }
}