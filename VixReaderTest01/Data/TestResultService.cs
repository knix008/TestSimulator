using Microsoft.Data.Sqlite;
using System.Data;
using System.Text;

namespace VixReaderTest01.Data
{
    public class TestResultService
    {
        private readonly string _connectionString;
        private readonly string _databasePath;

        public TestResultService()
        {
            // 데이터베이스 파일을 실행 폴더에 저장
            _databasePath = Path.Combine(Application.StartupPath, "TestResults.db");
            _connectionString = $"Data Source={_databasePath}";
            
            // 데이터베이스 초기화
            InitializeDatabase();
        }

        private void InitializeDatabase()
        {
            try
            {
                using var connection = new SqliteConnection(_connectionString);
                connection.Open();

                // 테스트 결과 테이블 생성
                string createTableQuery = @"
                    CREATE TABLE IF NOT EXISTS TestResults (
                        Id INTEGER PRIMARY KEY AUTOINCREMENT,
                        TestDate DATETIME DEFAULT CURRENT_TIMESTAMP,
                        SessionId TEXT NOT NULL,
                        DeviceIP TEXT,
                        
                        -- 시스템 정보 테스트들
                        GetCpuInfo TEXT CHECK(GetCpuInfo IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN',
                        GetMacAddress TEXT CHECK(GetMacAddress IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN',
                        GetSerialNumber TEXT CHECK(GetSerialNumber IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN',
                        SetSerialNumber TEXT CHECK(SetSerialNumber IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN',
                        GetFirmwareVersion TEXT CHECK(GetFirmwareVersion IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN',
                        SetFirmwareVersion TEXT CHECK(SetFirmwareVersion IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN',
                        
                        -- 제어 명령 테스트들
                        ClearSetting TEXT CHECK(ClearSetting IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN',
                        RebootDevice TEXT CHECK(RebootDevice IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN',
                        SetDefaultState TEXT CHECK(SetDefaultState IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN',
                        
                        -- 하드웨어 테스트들
                        SelfTest TEXT CHECK(SelfTest IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN',
                        BleTest TEXT CHECK(BleTest IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN',
                        NfcTest TEXT CHECK(NfcTest IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN',
                        LfidTest TEXT CHECK(LfidTest IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN',
                        AuxInTest TEXT CHECK(AuxInTest IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN',
                        SensorTest TEXT CHECK(SensorTest IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN',
                        DoorLockTest TEXT CHECK(DoorLockTest IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN',
                        DoorButtonTest TEXT CHECK(DoorButtonTest IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN',
                        LedTest TEXT CHECK(LedTest IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN',
                        BuzzerTest TEXT CHECK(BuzzerTest IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN',
                        TamperTest TEXT CHECK(TamperTest IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN',
                        NetworkLinkTest TEXT CHECK(NetworkLinkTest IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN',
                        
                        -- 추가 정보
                        ErrorMessage TEXT
                    );
                ";

                using var command = new SqliteCommand(createTableQuery, connection);
                command.ExecuteNonQuery();
                
                // 기존 테이블에 누락된 컬럼 추가
                AddMissingColumns(connection);
                
                Console.WriteLine($"데이터베이스 초기화 완료: {_databasePath}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"데이터베이스 초기화 오류: {ex.Message}");
                throw;
            }
        }

        private void AddMissingColumns(SqliteConnection connection)
        {
            try
            {
                // 필요한 모든 컬럼 목록
                var requiredColumns = new Dictionary<string, string>
                {
                    { "ClearSetting", "TEXT CHECK(ClearSetting IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN'" },
                    { "RebootDevice", "TEXT CHECK(RebootDevice IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN'" },
                    { "SetDefaultState", "TEXT CHECK(SetDefaultState IN ('PASS', 'FAIL', 'NOT_RUN', 'CANCELLED')) DEFAULT 'NOT_RUN'" }
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

                // 누락된 컬럼 추가
                foreach (var column in requiredColumns)
                {
                    if (!existingColumns.Contains(column.Key))
                    {
                        string addColumnQuery = $"ALTER TABLE TestResults ADD COLUMN {column.Key} {column.Value};";
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

        public async Task<int> CreateNewTestSessionAsync(string deviceIP)
        {
            try
            {
                string sessionId = Guid.NewGuid().ToString();
                
                using var connection = new SqliteConnection(_connectionString);
                await connection.OpenAsync();

                string insertQuery = @"
                    INSERT INTO TestResults (SessionId, DeviceIP) 
                    VALUES (@sessionId, @deviceIP);
                    SELECT last_insert_rowid();
                ";

                using var command = new SqliteCommand(insertQuery, connection);
                command.Parameters.AddWithValue("@sessionId", sessionId);
                command.Parameters.AddWithValue("@deviceIP", deviceIP);

                var result = await command.ExecuteScalarAsync();
                return Convert.ToInt32(result);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"테스트 세션 생성 오류: {ex.Message}");
                throw;
            }
        }

        public async Task UpdateTestResultAsync(int sessionId, string testName, string result, string errorMessage = "")
        {
            try
            {
                // 테스트 이름을 데이터베이스 컬럼명으로 매핑
                string columnName = MapTestNameToColumn(testName);
                if (string.IsNullOrEmpty(columnName))
                {
                    Console.WriteLine($"알 수 없는 테스트 이름: {testName}");
                    return;
                }

                using var connection = new SqliteConnection(_connectionString);
                await connection.OpenAsync();

                string updateQuery = $@"
                    UPDATE TestResults 
                    SET {columnName} = @result,
                        ErrorMessage = @errorMessage
                    WHERE Id = @sessionId;
                ";

                using var command = new SqliteCommand(updateQuery, connection);
                command.Parameters.AddWithValue("@result", result);
                command.Parameters.AddWithValue("@errorMessage", errorMessage ?? "");
                command.Parameters.AddWithValue("@sessionId", sessionId);

                int rowsAffected = await command.ExecuteNonQueryAsync();
                if (rowsAffected == 0)
                {
                    Console.WriteLine($"테스트 결과 업데이트 실패: 세션 ID {sessionId}를 찾을 수 없습니다.");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"테스트 결과 업데이트 오류: {ex.Message}");
                throw;
            }
        }

        private string MapTestNameToColumn(string testName)
        {
            return testName switch
            {
                "Get CPU Info" => "GetCpuInfo",
                "Get Mac Address" => "GetMacAddress",
                "Get Serial Number" => "GetSerialNumber",
                "Set Serial Number" => "SetSerialNumber",
                "Get Firmware Version" => "GetFirmwareVersion",
                "Set Firmware Version" => "SetFirmwareVersion",
                "Clear Settings" => "ClearSetting",
                "Device Reboot" => "RebootDevice",
                "Set Default State" => "SetDefaultState",
                "Self Test" => "SelfTest",
                "BLE Test" => "BleTest",
                "NFC Test" => "NfcTest",
                "LFID Test" => "LfidTest",
                "AUX In Test" => "AuxInTest",
                "Sensor Test" => "SensorTest",
                "Door Lock Test" => "DoorLockTest",
                "Door Button Test" => "DoorButtonTest",
                "LED Test" => "LedTest",
                "Buzzer Test" => "BuzzerTest",
                "Tamper Test" => "TamperTest",
                "Network Link Check" => "NetworkLinkTest",
                _ => ""
            };
        }

        public async Task<DataTable> GetTestResultsAsync(int? sessionId = null, DateTime? startDate = null, DateTime? endDate = null)
        {
            try
            {
                using var connection = new SqliteConnection(_connectionString);
                await connection.OpenAsync();

                string selectQuery = "SELECT * FROM TestResults WHERE 1=1";
                
                if (sessionId.HasValue)
                    selectQuery += " AND Id = @sessionId";
                    
                if (startDate.HasValue)
                    selectQuery += " AND TestDate >= @startDate";
                    
                if (endDate.HasValue)
                    selectQuery += " AND TestDate <= @endDate";
                    
                selectQuery += " ORDER BY TestDate DESC";

                using var command = new SqliteCommand(selectQuery, connection);
                
                if (sessionId.HasValue)
                    command.Parameters.AddWithValue("@sessionId", sessionId.Value);
                    
                if (startDate.HasValue)
                    command.Parameters.AddWithValue("@startDate", startDate.Value);
                    
                if (endDate.HasValue)
                    command.Parameters.AddWithValue("@endDate", endDate.Value);

                using var adapter = new SqliteDataAdapter(command);
                var dataTable = new DataTable();
                adapter.Fill(dataTable);

                return dataTable;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"테스트 결과 조회 오류: {ex.Message}");
                throw;
            }
        }

        public async Task<bool> DeleteTestResultsAsync(int sessionId)
        {
            try
            {
                using var connection = new SqliteConnection(_connectionString);
                await connection.OpenAsync();

                string deleteQuery = "DELETE FROM TestResults WHERE Id = @sessionId";
                
                using var command = new SqliteCommand(deleteQuery, connection);
                command.Parameters.AddWithValue("@sessionId", sessionId);
                
                int rowsAffected = await command.ExecuteNonQueryAsync();
                return rowsAffected > 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"테스트 결과 삭제 오류: {ex.Message}");
                throw;
            }
        }

        public async Task<string> ExportToCsvAsync(string filePath, DateTime? startDate = null, DateTime? endDate = null)
        {
            try
            {
                var dataTable = await GetTestResultsAsync(null, startDate, endDate);
                
                if (dataTable.Rows.Count == 0)
                {
                    return "내보낼 데이터가 없습니다.";
                }

                var csv = new StringBuilder();
                
                // CSV 헤더 생성 (한글 컬럼명으로)
                var headers = new List<string>
                {
                    "세션 ID", "테스트 날짜", "장치 IP", 
                    "CPU 정보 조회", "MAC 주소 조회", "시리얼 번호 조회", "시리얼 번호 설정",
                    "펌웨어 버전 조회", "펌웨어 버전 설정", "설정 초기화", "장치 재부팅", "기본 상태 설정",
                    "자가 진단", "BLE 테스트", "NFC 테스트", "LFID 테스트", "AUX In 테스트", "센서 테스트",
                    "도어락 테스트", "도어 버튼 테스트", "LED 테스트", "부저 테스트", "탬퍼 테스트", "네트워크 링크 테스트",
                    "오류 메시지"
                };
                
                csv.AppendLine(string.Join(",", headers.Select(EscapeCsvField)));

                // 데이터 행 추가
                foreach (DataRow row in dataTable.Rows)
                {
                    var values = new List<string>
                    {
                        row["Id"].ToString() ?? "",
                        row["TestDate"].ToString() ?? "",
                        row["DeviceIP"].ToString() ?? "",
                        row["GetCpuInfo"].ToString() ?? "NOT_RUN",
                        row["GetMacAddress"].ToString() ?? "NOT_RUN",
                        row["GetSerialNumber"].ToString() ?? "NOT_RUN",
                        row["SetSerialNumber"].ToString() ?? "NOT_RUN",
                        row["GetFirmwareVersion"].ToString() ?? "NOT_RUN",
                        row["SetFirmwareVersion"].ToString() ?? "NOT_RUN",
                        row["ClearSetting"].ToString() ?? "NOT_RUN",
                        row["RebootDevice"].ToString() ?? "NOT_RUN",
                        row["SetDefaultState"].ToString() ?? "NOT_RUN",
                        row["SelfTest"].ToString() ?? "NOT_RUN",
                        row["BleTest"].ToString() ?? "NOT_RUN",
                        row["NfcTest"].ToString() ?? "NOT_RUN",
                        row["LfidTest"].ToString() ?? "NOT_RUN",
                        row["AuxInTest"].ToString() ?? "NOT_RUN",
                        row["SensorTest"].ToString() ?? "NOT_RUN",
                        row["DoorLockTest"].ToString() ?? "NOT_RUN",
                        row["DoorButtonTest"].ToString() ?? "NOT_RUN",
                        row["LedTest"].ToString() ?? "NOT_RUN",
                        row["BuzzerTest"].ToString() ?? "NOT_RUN",
                        row["TamperTest"].ToString() ?? "NOT_RUN",
                        row["NetworkLinkTest"].ToString() ?? "NOT_RUN",
                        row["ErrorMessage"].ToString() ?? ""
                    };

                    csv.AppendLine(string.Join(",", values.Select(EscapeCsvField)));
                }

                // UTF-8 with BOM으로 저장 (Excel에서 한글 깨짐 방지)
                await File.WriteAllTextAsync(filePath, csv.ToString(), new UTF8Encoding(true));
                
                return $"CSV 파일이 성공적으로 생성되었습니다.\n파일 위치: {filePath}\n총 {dataTable.Rows.Count}건의 레코드가 내보내졌습니다.";
            }
            catch (Exception ex)
            {
                Console.WriteLine($"CSV 내보내기 오류: {ex.Message}");
                return $"CSV 내보내기 실패: {ex.Message}";
            }
        }

        private static string EscapeCsvField(string field)
        {
            if (string.IsNullOrEmpty(field))
                return "";

            // 쉼표, 따옴표, 줄바꿈이 포함된 경우 따옴표로 감싸고 내부 따옴표는 이스케이프
            if (field.Contains(',') || field.Contains('"') || field.Contains('\n') || field.Contains('\r'))
            {
                return $"\"{field.Replace("\"", "\"\"")}\"";
            }

            return field;
        }

        public string GetDatabasePath()
        {
            return _databasePath;
        }
    }
}