using System.Net.NetworkInformation;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace VIXfaceSimulator
{
    public class ProcessCommand
    {
        private readonly VIXfaceSimulator _simulator;

        public ProcessCommand(VIXfaceSimulator simulator)
        {
            _simulator = simulator;
        }

        public string ProcessAtCommand(string command)
        {
            try
            {
                _simulator.LogMessage($"AT ????? ???: {command}");
                
                _simulator.UpdateLastCommandTime();

                // ????? ?????? ???? ???? ???
                var upperCommand = command.ToUpper().Trim();

                // AT ????? ???
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
                    _ when upperCommand.StartsWith("AT+") => CreateAtErrorResponse($"?? ?? ???? AT ?????: {command}"),
                    _ => CreateAtErrorResponse("????? AT ????? ????")
                };
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"AT ????? ??? ????: {ex.Message}");
                return CreateAtErrorResponse($"AT ????? ??? ????: {ex.Message}");
            }
        }

        public string ProcessTlsRequest(string requestData)
        {
            try
            {
                // JSON ??? ???
                JsonDocument requestDoc;
                try
                {
                    requestDoc = JsonDocument.Parse(requestData);
                }
                catch (JsonException)
                {
                    return CreateTlsErrorResponse("Invalid JSON format");
                }

                // ??? ??? ???
                if (!requestDoc.RootElement.TryGetProperty("action", out var actionElement))
                {
                    return CreateTlsErrorResponse("Missing action field");
                }

                var action = actionElement.GetString();
                _simulator.LogMessage($"TLS ??? ???: {action}");

                // ???? ???
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
                _simulator.LogMessage($"TLS ??? ??? ????: {ex.Message}");
                return CreateTlsErrorResponse($"Internal error: {ex.Message}");
            }
        }

        private string ProcessBasicAtCommand()
        {
            _simulator.SetConnected(true);
            
            _simulator.LogMessage("?? AT ????? ??? - ???? ??????");
            return "OK\r\n";
        }

        private string ProcessTestBeginCommand()
        {
            if (!_simulator.IsConnected)
            {
                _simulator.LogMessage("???? ???? ???? - ???? AT ?????? ??????? ??");
                return "ERROR: ???? 'AT' ?????? ?????? ?????????\r\n";
            }
            
            _simulator.SetTestModeEnabled(true);
            _simulator.LogMessage("???? ??? ??????");
            
            return "OK\r\nTEST MODE ENABLED\r\n";
        }

        private string ProcessTestEndCommand()
        {
            _simulator.SetTestModeEnabled(false);
            
            _simulator.LogMessage("???? ??? ????????");
            return "OK\r\nTEST MODE DISABLED\r\n";
        }

        private string ProcessVersionQueryCommand()
        {
            try
            {
                // ???? ???? ???
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("????? ???? ??? ???? - ??????? ????");
                    return "FAIL\r\n";
                }

                // ???? ??? ???
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("????? ???? ??? ???? - ???? ??? ???????? ????");
                    return "FAIL\r\n";
                }

                const string firmwareVersion = "VER1.0.1";
                _simulator.LogMessage($"????? ???? ??? ????: {firmwareVersion}");
                return $"{firmwareVersion}\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"????? ???? ??? ????: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessStatusCommand()
        {
            // ???? ???? ???
            if (!_simulator.IsConnected)
            {
                _simulator.LogMessage("???? ??? ???? - ??????? ????");
                return "FAIL\r\n";
            }

            // ???? ??? ???
            if (!_simulator.IsTestModeEnabled)
            {
                _simulator.LogMessage("???? ??? ???? - ???? ??? ???????? ????");
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
                // ???? ???? ???
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("?©ª??? ??? ??? ???? - ??????? ????");
                    return "FAIL\r\n";
                }

                // ???? ??? ???
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("?©ª??? ??? ??? ???? - ???? ??? ???????? ????");
                    return "FAIL\r\n";
                }

                // ?©ª??? ????? ??????? ???
                if (string.IsNullOrWhiteSpace(_simulator.DeviceSerialNumber))
                {
                    _simulator.LogMessage("?©ª??? ??? ??? ???? - ?©ª??? ????? ???????? ????");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage($"?©ª??? ??? ??? ????: {_simulator.DeviceSerialNumber}");
                return $"{_simulator.DeviceSerialNumber}\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"?©ª??? ??? ??? ????: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessSerialSetCommand(string command)
        {
            try
            {
                // ???? ???? ???
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("?©ª??? ??? ???? ???? - ??????? ????");
                    return "FAIL\r\n";
                }

                // ???? ??? ???
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("?©ª??? ??? ???? ???? - ???? ??? ???????? ????");
                    return "FAIL\r\n";
                }

                // "AT+SERIAL=" ?¥ê??? ??????? ?©ª??? ??? ????
                var serialNumberPart = command.Substring(10); // "AT+SERIAL=" ????? 10
                
                if (string.IsNullOrWhiteSpace(serialNumberPart))
                {
                    _simulator.LogMessage("?©ª??? ??? ???? ???? - ?? ?©ª??? ???");
                    return "FAIL\r\n";
                }

                // ?©ª??? ??? ???? (??????? ?????¢¬? ???, ??? 20??)
                if (!Regex.IsMatch(serialNumberPart, @"^[A-Za-z0-9\-]{1,20}$"))
                {
                    _simulator.LogMessage($"?©ª??? ??? ???? ???? - ????? ????: {serialNumberPart}");
                    return "FAIL\r\n";
                }

                // ?©ª??? ??? ???????
                var oldSerialNumber = _simulator.DeviceSerialNumber;
                _simulator.SetDeviceSerialNumber(serialNumberPart);
                
                _simulator.LogMessage($"?©ª??? ????? ?????????: {oldSerialNumber} -> {_simulator.DeviceSerialNumber}");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"?©ª??? ??? ???? ????: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessClearCommand()
        {
            try
            {
                // ???? ???? ???
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("CLEAR ???? ???? - ??????? ????");
                    return "FAIL\r\n";
                }

                // ???? ??? ???
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("CLEAR ???? ???? - ???? ??? ???????? ????");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("CLEAR ???? ??? ???");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"CLEAR ???? ??? ????: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessRebootCommand()
        {
            try
            {
                // ???? ???? ???
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("REBOOT ???? ???? - ??????? ????");
                    return "FAIL\r\n";
                }

                // ???? ??? ???
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("REBOOT ???? ???? - ???? ??? ???????? ????");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("REBOOT ???? ??? ???");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"REBOOT ???? ??? ????: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessDefButtonCommand()
        {
            try
            {
                // ???? ???? ???
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("DEFBUTTON ???? ???? - ??????? ????");
                    return "FAIL\r\n";
                }

                // ???? ??? ???
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("DEFBUTTON ???? ???? - ???? ??? ???????? ????");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("DEFBUTTON ???? ??? ???");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"DEFBUTTON ???? ??? ????: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessBistCommand()
        {
            try
            {
                // ???? ???? ???
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("BIST ???? ???? - ??????? ????");
                    return "FAIL\r\n";
                }

                // ???? ??? ???
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("BIST ???? ???? - ???? ??? ???????? ????");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("BIST ???? ??? ???");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"BIST ???? ??? ????: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessBleCommand()
        {
            try
            {
                // ???? ???? ???
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("BLE ???? ???? - ??????? ????");
                    return "FAIL\r\n";
                }

                // ???? ??? ???
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("BLE ???? ???? - ???? ??? ???????? ????");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("BLE ???? ??? ???");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"BLE ???? ??? ????: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessNfcCommand()
        {
            try
            {
                // ???? ???? ???
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("NFC ???? ???? - ??????? ????");
                    return "FAIL\r\n";
                }

                // ???? ??? ???
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("NFC ???? ???? - ???? ??? ???????? ????");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("NFC ???? ??? ???");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"NFC ???? ??? ????: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessLfidCommand()
        {
            try
            {
                // ???? ???? ???
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("LFID ???? ???? - ??????? ????");
                    return "FAIL\r\n";
                }

                // ???? ??? ???
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("LFID ???? ???? - ???? ??? ???????? ????");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("LFID ???? ??? ???");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"LFID ???? ??? ????: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessAuxInCommand()
        {
            try
            {
                // ???? ???? ???
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("AUXIN ???? ???? - ??????? ????");
                    return "FAIL\r\n";
                }

                // ???? ??? ???
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("AUXIN ???? ???? - ???? ??? ???????? ????");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("AUXIN ???? ??? ???");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"AUXIN ???? ??? ????: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessSensorCommand()
        {
            try
            {
                // ???? ???? ???
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("SENSOR ???? ???? - ??????? ????");
                    return "FAIL\r\n";
                }

                // ???? ??? ???
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("SENSOR ???? ???? - ???? ??? ???????? ????");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("SENSOR ???? ??? ???");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"SENSOR ???? ??? ????: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessLockCommand()
        {
            try
            {
                // ???? ???? ???
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("LOCK ???? ???? - ??????? ????");
                    return "FAIL\r\n";
                }

                // ???? ??? ???
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("LOCK ???? ???? - ???? ??? ???????? ????");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("LOCK ???? ??? ???");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"LOCK ???? ??? ????: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessButtonCommand()
        {
            try
            {
                // ???? ???? ???
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("BUTTON ???? ???? - ??????? ????");
                    return "FAIL\r\n";
                }

                // ???? ??? ???
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("BUTTON ???? ???? - ???? ??? ???????? ????");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("BUTTON ???? ??? ???");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"BUTTON ???? ??? ????: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessLedCommand()
        {
            try
            {
                // ???? ???? ???
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("LED ???? ???? - ??????? ????");
                    return "FAIL\r\n";
                }

                // ???? ??? ???
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("LED ???? ???? - ???? ??? ???????? ????");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("LED ???? ??? ???");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"LED ???? ??? ????: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessBuzzerCommand()
        {
            try
            {
                // ???? ???? ???
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("BUZZER ???? ???? - ??????? ????");
                    return "FAIL\r\n";
                }

                // ???? ??? ???
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("BUZZER ???? ???? - ???? ??? ???????? ????");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("BUZZER ???? ??? ???");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"BUZZER ???? ??? ????: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessTamperCommand()
        {
            try
            {
                // ???? ???? ???
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("TAMPER ???? ???? - ??????? ????");
                    return "FAIL\r\n";
                }

                // ???? ??? ???
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("TAMPER ???? ???? - ???? ??? ???????? ????");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("TAMPER ???? ??? ???");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"TAMPER ???? ??? ????: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessNetworkCommand()
        {
            try
            {
                // ???? ???? ???
                if (!_simulator.IsConnected)
                {
                    _simulator.LogMessage("NETWORK ???? ???? - ??????? ????");
                    return "FAIL\r\n";
                }

                // ???? ??? ???
                if (!_simulator.IsTestModeEnabled)
                {
                    _simulator.LogMessage("NETWORK ???? ???? - ???? ??? ???????? ????");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage("NETWORK ???? ??? ??? - ?????? ???? UP");
                return "UP\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"NETWORK ???? ??? ????: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessSetSerialNumberTls(JsonDocument requestDoc)
        {
            try
            {
                // ?©ª??? ??? ????
                if (requestDoc.RootElement.TryGetProperty("serialNumber", out var serialElement) ||
                    requestDoc.RootElement.TryGetProperty("serial_number", out serialElement) ||
                    requestDoc.RootElement.TryGetProperty("SerialNumber", out serialElement))
                {
                    var newSerialNumber = serialElement.GetString();
                    if (string.IsNullOrWhiteSpace(newSerialNumber))
                    {
                        return CreateTlsErrorResponse("Serial number cannot be empty");
                    }

                    // ?©ª??? ??? ???? (??????? ?????¢¬? ???, ??? 20??)
                    if (!Regex.IsMatch(newSerialNumber, @"^[A-Za-z0-9\-]{1,20}$"))
                    {
                        return CreateTlsErrorResponse("Invalid serial number format");
                    }

                    _simulator.SetDeviceSerialNumber(newSerialNumber);
                    _simulator.LogMessage($"?©ª??? ????? ?????????: {_simulator.DeviceSerialNumber}");

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
                _simulator.LogMessage($"?©ª??? ??? ???? ????: {ex.Message}");
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

                _simulator.LogMessage($"?©ª??? ??? ??? ???: {_simulator.DeviceSerialNumber}");
                return JsonSerializer.Serialize(serialInfo, new JsonSerializerOptions 
                { 
                    WriteIndented = true 
                });
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"?©ª??? ??? ??? ????: {ex.Message}");
                return JsonSerializer.Serialize(new { error = $"?©ª??? ??? ??? ????: {ex.Message}" });
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
                
                _simulator.LogMessage("MAC ??? ???? ???? ???");
                return JsonSerializer.Serialize(macInfo, new JsonSerializerOptions 
                { 
                    WriteIndented = true 
                });
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"MAC ??? ???? ????: {ex.Message}");
                return JsonSerializer.Serialize(new { error = $"MAC ??? ????: {ex.Message}" });
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
                _simulator.LogMessage($"?????? ????????? ???? ????: {ex.Message}");
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
                    // ?????? ????? ??? WiFi ????????? ???
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
                _simulator.LogMessage($"MAC ??? ???? ????: {ex.Message}");
                return "MAC Address error";
            }
        }
    }
}