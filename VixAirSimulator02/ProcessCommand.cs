using System.Net.NetworkInformation;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace VixAirSimulator
{
    public class ProcessCommand
    {
        private readonly VixReaderSimulator _simulator;

        public ProcessCommand(VixReaderSimulator simulator)
        {
            _simulator = simulator;
        }

        public string ProcessAtCommand(string command)
        {
            try
            {
                _simulator.LogMessage($"AT 명령어 처리: {command}");
                
                _simulator.UpdateLastCommandTime();

                // 명령어를 대소문자 구분 없이 처리
                var upperCommand = command.ToUpper().Trim();

                // AT 명령어 처리
                return upperCommand switch
                {
                    "AT" => ProcessBasicAtCommand(),
                    "AT+TEST=BEGIN" => ProcessTestBeginCommand(),
                    "AT+TEST=END" => ProcessTestEndCommand(),
                    "AT+TEST=VERSION" => ProcessVersionQueryCommand(),
                    "AT+TEST=DEFBUTTON" => ProcessDefButtonCommand(),
                    "AT+TEST=BIST" => ProcessBistCommand(),
                    "AT+TEST=BLE" => ProcessBleCommand(),
                    "AT+TEST=NFC" => ProcessNfcCommand(),
                    "AT+TEST=LFID" => ProcessLfidCommand(),
                    "AT+TEST=AUXIN" => ProcessAuxInCommand(),
                    "AT+TEST=SENSOR" => ProcessSensorCommand(),
                    "AT+TEST=LOCK" => ProcessLockCommand(),
                    "AT+TEST=BUTTON" => ProcessButtonCommand(),
                    "AT+TEST=LED" => ProcessLedCommand(),
                    "AT+TEST=BUZZER" => ProcessBuzzerCommand(),
                    "AT+TEST=TAMPER" => ProcessTamperCommand(),
                    "AT+TEST=NETWORK" => ProcessNetworkCommand(),
                    "AT+STATUS" => ProcessStatusCommand(),
                    "AT+SERIAL?" => ProcessSerialQueryCommand(),
                    "AT+VER?" => ProcessVersionQueryCommand(),
                    "AT+CLEAR" => ProcessClearCommand(),
                    "AT+REBOOT" => ProcessRebootCommand(),
                    _ when upperCommand.StartsWith("AT+SERIAL=") => ProcessSerialSetCommand(command),
                    _ when upperCommand.StartsWith("AT+") => CreateAtErrorResponse($"알 수 없는 AT 명령어: {command}"),
                    _ => CreateAtErrorResponse("잘못된 AT 명령어 형식")
                };
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"AT 명령어 처리 오류: {ex.Message}");
                return CreateAtErrorResponse($"AT 명령어 처리 오류: {ex.Message}");
            }
        }

        public string ProcessTlsRequest(string requestData)
        {
            try
            {
                // JSON 요청 파싱
                JsonDocument requestDoc;
                try
                {
                    requestDoc = JsonDocument.Parse(requestData);
                }
                catch (JsonException)
                {
                    return CreateTlsErrorResponse("Invalid JSON format");
                }

                // 요청 타입 확인
                if (!requestDoc.RootElement.TryGetProperty("action", out var actionElement))
                {
                    return CreateTlsErrorResponse("Missing action field");
                }

                var action = actionElement.GetString();
                _simulator.LogMessage($"TLS 요청 처리: {action}");

                // 액션별 처리
                return action switch
                {
                    "getMacAddress" => CreateTlsResponse(GetRealMacAddressInfo()),
                    "getSerialNumber" => CreateTlsResponse(GetSerialNumber()),
                    "setSerialNumber" => ProcessSetSerialNumberTls(requestDoc),
                    _ => CreateTlsErrorResponse("Unknown action")
                };
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"TLS 요청 처리 오류: {ex.Message}");
                return CreateTlsErrorResponse($"Internal error: {ex.Message}");
            }
        }

        private string ProcessBasicAtCommand()
        {
            _simulator.SetConnected(true);
            
            _simulator.LogMessage("기본 AT 명령어 처리 - 연결 설정됨");
            return "OK\r\n";
        }

        private string ProcessTestBeginCommand()
        {
            if (!_simulator.IsConnected)
            {
                _simulator.LogMessage("테스트 시작 실패 - 먼저 AT 명령어로 연결해야 함");
                return "ERROR: 먼저 'AT' 명령어로 연결을 설정하세요\r\n";
            }
            
            _simulator.SetTestModeEnabled(true);
            _simulator.LogMessage("테스트 모드 활성화됨");
            
            return "OK\r\nTEST MODE ENABLED\r\n";
        }

        private string ProcessTestEndCommand()
        {
            _simulator.SetTestModeEnabled(false);
            
            _simulator.LogMessage("테스트 모드 비활성화됨");
            return "OK\r\nTEST MODE DISABLED\r\n";
        }

        private string ProcessVersionQueryCommand()
        {
            try
            {
                // 연결 상태 확인
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("펌웨어 버전 조회 실패 - 연결되지 않음");
                    return "FAIL\r\n";
                }

                // 테스트 모드 확인
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("펌웨어 버전 조회 실패 - 테스트 모드가 활성화되지 않음");
                    return "FAIL\r\n";
                }

                const string firmwareVersion = "VER1.0.1";
                _simulator.LogMessage($"펌웨어 버전 조회 성공: {firmwareVersion}");
                return $"{firmwareVersion}\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"펌웨어 버전 조회 오류: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessStatusCommand()
        {
            // 연결 상태 확인
            if (!_simulator.IsConnected)
            {
                _simulator.LogMessage("상태 조회 실패 - 연결되지 않음");
                return "FAIL\r\n";
            }

            // 테스트 모드 확인
            if (!_simulator.IsTestModeEnabled)
            {
                _simulator.LogMessage("상태 조회 실패 - 테스트 모드가 활성화되지 않음");
                return "FAIL\r\n";
            }

            var status = new StringBuilder();
            status.AppendLine("OK");
            status.AppendLine($"CONNECTED: {_simulator.IsConnected}");
            status.AppendLine($"TEST_MODE: {_simulator.IsTestModeEnabled}");
            status.AppendLine($"SERIAL_NUMBER: {_simulator.DeviceSerialNumber}");
            status.AppendLine($"LAST_COMMAND: {_simulator.LastCommandTime:yyyy-MM-dd HH:mm:ss}");
            
            return status.ToString();
        }

        private string ProcessSerialQueryCommand()
        {
            try
            {
                // 연결 상태 확인
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("시리얼 번호 조회 실패 - 연결되지 않음");
                    return "FAIL\r\n";
                }

                // 테스트 모드 확인
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("시리얼 번호 조회 실패 - 테스트 모드가 활성화되지 않음");
                    return "FAIL\r\n";
                }

                // 시리얼 번호가 유효한지 확인
                if (string.IsNullOrWhiteSpace(_simulator.DeviceSerialNumber))
                {
                    _simulator.LogMessage("시리얼 번호 조회 실패 - 시리얼 번호가 설정되지 않음");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage($"시리얼 번호 조회 성공: {_simulator.DeviceSerialNumber}");
                return $"{_simulator.DeviceSerialNumber}\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"시리얼 번호 조회 오류: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessSerialSetCommand(string command)
        {
            try
            {
                // 연결 상태 확인
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("시리얼 번호 설정 실패 - 연결되지 않음");
                    return "FAIL\r\n";
                }

                // 테스트 모드 확인
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("시리얼 번호 설정 실패 - 테스트 모드가 활성화되지 않음");
                    return "FAIL\r\n";
                }

                // "AT+SERIAL=" 부분을 제거하고 시리얼 번호 추출
                var serialNumberPart = command.Substring(10); // "AT+SERIAL=" 길이는 10
                
                if (string.IsNullOrWhiteSpace(serialNumberPart))
                {
                    _simulator.LogMessage("시리얼 번호 설정 실패 - 빈 시리얼 번호");
                    return "FAIL\r\n";
                }

                // 시리얼 번호 검증 (영숫자와 하이픈만 허용, 최대 20자)
                if (!Regex.IsMatch(serialNumberPart, @"^[A-Za-z0-9\-]{1,20}$"))
                {
                    _simulator.LogMessage($"시리얼 번호 설정 실패 - 잘못된 형식: {serialNumberPart}");
                    return "FAIL\r\n";
                }

                // 시리얼 번호 업데이트
                var oldSerialNumber = _simulator.DeviceSerialNumber;
                _simulator.SetDeviceSerialNumber(serialNumberPart);
                
                _simulator.LogMessage($"시리얼 번호가 업데이트됨: {oldSerialNumber} -> {_simulator.DeviceSerialNumber}");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"시리얼 번호 설정 오류: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessClearCommand()
        {
            try
            {
                // 연결 상태 확인
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("CLEAR 명령 실패 - 연결되지 않음");
                    return "FAIL\r\n";
                }

                // 테스트 모드 확인
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("CLEAR 명령 실패 - 테스트 모드가 활성화되지 않음");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("CLEAR 명령 처리 완료");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"CLEAR 명령 처리 오류: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessRebootCommand()
        {
            try
            {
                // 연결 상태 확인
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("REBOOT 명령 실패 - 연결되지 않음");
                    return "FAIL\r\n";
                }

                // 테스트 모드 확인
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("REBOOT 명령 실패 - 테스트 모드가 활성화되지 않음");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("REBOOT 명령 처리 완료");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"REBOOT 명령 처리 오류: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessDefButtonCommand()
        {
            try
            {
                // 연결 상태 확인
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("DEFBUTTON 명령 실패 - 연결되지 않음");
                    return "FAIL\r\n";
                }

                // 테스트 모드 확인
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("DEFBUTTON 명령 실패 - 테스트 모드가 활성화되지 않음");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("DEFBUTTON 명령 처리 완료");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"DEFBUTTON 명령 처리 오류: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessBistCommand()
        {
            try
            {
                // 연결 상태 확인
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("BIST 명령 실패 - 연결되지 않음");
                    return "FAIL\r\n";
                }

                // 테스트 모드 확인
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("BIST 명령 실패 - 테스트 모드가 활성화되지 않음");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("BIST 명령 처리 완료");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"BIST 명령 처리 오류: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessBleCommand()
        {
            try
            {
                // 연결 상태 확인
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("BLE 명령 실패 - 연결되지 않음");
                    return "FAIL\r\n";
                }

                // 테스트 모드 확인
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("BLE 명령 실패 - 테스트 모드가 활성화되지 않음");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("BLE 명령 처리 완료");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"BLE 명령 처리 오류: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessNfcCommand()
        {
            try
            {
                // 연결 상태 확인
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("NFC 명령 실패 - 연결되지 않음");
                    return "FAIL\r\n";
                }

                // 테스트 모드 확인
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("NFC 명령 실패 - 테스트 모드가 활성화되지 않음");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("NFC 명령 처리 완료");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"NFC 명령 처리 오류: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessLfidCommand()
        {
            try
            {
                // 연결 상태 확인
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("LFID 명령 실패 - 연결되지 않음");
                    return "FAIL\r\n";
                }

                // 테스트 모드 확인
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("LFID 명령 실패 - 테스트 모드가 활성화되지 않음");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("LFID 명령 처리 완료");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"LFID 명령 처리 오류: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessAuxInCommand()
        {
            try
            {
                // 연결 상태 확인
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("AUXIN 명령 실패 - 연결되지 않음");
                    return "FAIL\r\n";
                }

                // 테스트 모드 확인
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("AUXIN 명령 실패 - 테스트 모드가 활성화되지 않음");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("AUXIN 명령 처리 완료");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"AUXIN 명령 처리 오류: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessSensorCommand()
        {
            try
            {
                // 연결 상태 확인
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("SENSOR 명령 실패 - 연결되지 않음");
                    return "FAIL\r\n";
                }

                // 테스트 모드 확인
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("SENSOR 명령 실패 - 테스트 모드가 활성화되지 않음");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("SENSOR 명령 처리 완료");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"SENSOR 명령 처리 오류: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessLockCommand()
        {
            try
            {
                // 연결 상태 확인
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("LOCK 명령 실패 - 연결되지 않음");
                    return "FAIL\r\n";
                }

                // 테스트 모드 확인
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("LOCK 명령 실패 - 테스트 모드가 활성화되지 않음");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("LOCK 명령 처리 완료");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"LOCK 명령 처리 오류: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessButtonCommand()
        {
            try
            {
                // 연결 상태 확인
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("BUTTON 명령 실패 - 연결되지 않음");
                    return "FAIL\r\n";
                }

                // 테스트 모드 확인
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("BUTTON 명령 실패 - 테스트 모드가 활성화되지 않음");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("BUTTON 명령 처리 완료");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"BUTTON 명령 처리 오류: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessLedCommand()
        {
            try
            {
                // 연결 상태 확인
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("LED 명령 실패 - 연결되지 않음");
                    return "FAIL\r\n";
                }

                // 테스트 모드 확인
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("LED 명령 실패 - 테스트 모드가 활성화되지 않음");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("LED 명령 처리 완료");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"LED 명령 처리 오류: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessBuzzerCommand()
        {
            try
            {
                // 연결 상태 확인
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("BUZZER 명령 실패 - 연결되지 않음");
                    return "FAIL\r\n";
                }

                // 테스트 모드 확인
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("BUZZER 명령 실패 - 테스트 모드가 활성화되지 않음");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("BUZZER 명령 처리 완료");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"BUZZER 명령 처리 오류: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessTamperCommand()
        {
            try
            {
                // 연결 상태 확인
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("TAMPER 명령 실패 - 연결되지 않음");
                    return "FAIL\r\n";
                }

                // 테스트 모드 확인
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("TAMPER 명령 실패 - 테스트 모드가 활성화되지 않음");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("TAMPER 명령 처리 완료");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"TAMPER 명령 처리 오류: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessNetworkCommand()
        {
            try
            {
                // 연결 상태 확인
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("NETWORK 명령 실패 - 연결되지 않음");
                    return "FAIL\r\n";
                }

                // 테스트 모드 확인
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("NETWORK 명령 실패 - 테스트 모드가 활성화되지 않음");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("NETWORK 명령 처리 완료 - 네트워크 상태 UP");
                return "UP\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"NETWORK 명령 처리 오류: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessSetSerialNumberTls(JsonDocument requestDoc)
        {
            try
            {
                // 시리얼 번호 추출
                if (requestDoc.RootElement.TryGetProperty("serialNumber", out var serialElement) ||
                    requestDoc.RootElement.TryGetProperty("serial_number", out serialElement) ||
                    requestDoc.RootElement.TryGetProperty("SerialNumber", out serialElement))
                {
                    var newSerialNumber = serialElement.GetString();
                    if (string.IsNullOrWhiteSpace(newSerialNumber))
                    {
                        return CreateTlsErrorResponse("Serial number cannot be empty");
                    }

                    // 시리얼 번호 검증 (영숫자와 하이픈만 허용, 최대 20자)
                    if (!Regex.IsMatch(newSerialNumber, @"^[A-Za-z0-9\-]{1,20}$"))
                    {
                        return CreateTlsErrorResponse("Invalid serial number format");
                    }

                    _simulator.SetDeviceSerialNumber(newSerialNumber);
                    _simulator.LogMessage($"시리얼 번호가 업데이트됨: {_simulator.DeviceSerialNumber}");

                    var response = new
                    {
                        success = true,
                        message = "Serial number updated successfully",
                        serialNumber = _simulator.DeviceSerialNumber,
                        timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
                    };

                    return CreateTlsResponse(JsonSerializer.Serialize(response, new JsonSerializerOptions { WriteIndented = true }));
                }
                else
                {
                    return CreateTlsErrorResponse("Serial number field not found");
                }
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"시리얼 번호 설정 오류: {ex.Message}");
                return CreateTlsErrorResponse($"Serial number update error: {ex.Message}");
            }
        }

        private string CreateAtErrorResponse(string errorMessage)
        {
            return $"ERROR: {errorMessage}\r\n";
        }

        private string CreateTlsResponse(string jsonContent)
        {
            var response = new
            {
                status = "OK",
                data = JsonSerializer.Deserialize<object>(jsonContent),
                timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
            };

            return JsonSerializer.Serialize(response, new JsonSerializerOptions { WriteIndented = true });
        }

        private string CreateTlsErrorResponse(string errorMessage)
        {
            var errorResponse = new
            {
                status = "FAIL",
                error = errorMessage,
                timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
            };

            return JsonSerializer.Serialize(errorResponse, new JsonSerializerOptions { WriteIndented = true });
        }

        private string GetSerialNumber()
        {
            try
            {
                var serialInfo = new
                {
                    serialNumber = _simulator.DeviceSerialNumber,
                    deviceId = Environment.MachineName,
                    timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
                };

                _simulator.LogMessage($"시리얼 번호 조회 완료: {_simulator.DeviceSerialNumber}");
                return JsonSerializer.Serialize(serialInfo, new JsonSerializerOptions 
                { 
                    WriteIndented = true 
                });
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"시리얼 번호 조회 오류: {ex.Message}");
                return JsonSerializer.Serialize(new { error = $"시리얼 번호 조회 오류: {ex.Message}" });
            }
        }

        private string GetRealMacAddressInfo()
        {
            try
            {
                var macInfo = new
                {
                    MacAddress = GetMacAddress(),
                    NetworkInterfaces = GetAllNetworkInterfaces(),
                    Timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
                };
                
                _simulator.LogMessage("MAC 주소 정보 생성 완료");
                return JsonSerializer.Serialize(macInfo, new JsonSerializerOptions 
                { 
                    WriteIndented = true 
                });
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"MAC 주소 수집 오류: {ex.Message}");
                return JsonSerializer.Serialize(new { error = $"MAC 주소 오류: {ex.Message}" });
            }
        }

        private object[] GetAllNetworkInterfaces()
        {
            try
            {
                var interfaces = NetworkInterface.GetAllNetworkInterfaces()
                    .Where(ni => ni.OperationalStatus == OperationalStatus.Up)
                    .Select(ni => new
                    {
                        Name = ni.Name,
                        Type = ni.NetworkInterfaceType.ToString(),
                        MacAddress = ni.GetPhysicalAddress().ToString(),
                        Speed = ni.Speed,
                        Status = ni.OperationalStatus.ToString()
                    })
                    .ToArray();

                return interfaces;
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"네트워크 인터페이스 수집 오류: {ex.Message}");
                return new[] { new { error = ex.Message } };
            }
        }
        
        private string GetMacAddress()
        {
            try
            {
                var networkInterfaces = NetworkInterface.GetAllNetworkInterfaces();
                foreach (var networkInterface in networkInterfaces)
                {
                    // 활성화된 이더넷 또는 WiFi 인터페이스 찾기
                    if (networkInterface.OperationalStatus == OperationalStatus.Up &&
                        (networkInterface.NetworkInterfaceType == NetworkInterfaceType.Ethernet ||
                         networkInterface.NetworkInterfaceType == NetworkInterfaceType.Wireless80211))
                    {
                        return networkInterface.GetPhysicalAddress().ToString();
                    }
                }
                return "MAC Address not found";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"MAC 주소 수집 오류: {ex.Message}");
                return "MAC Address error";
            }
        }
    }
}