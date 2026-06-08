using System.Net.NetworkInformation;
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
                _simulator.LogMessage($"AT command: {command}");
                _simulator.UpdateLastCommandTime();

                var upperCommand = command.ToUpper().Trim();

                return upperCommand switch
                {
                    "AT" => ProcessBasicAtCommand(),
                    "AT+TEST=BEGIN" => ProcessTestBeginCommand(),
                    "AT+TEST=END" => ProcessTestEndCommand(),
                    "AT+TEST=VERSION" => ProcessVersionQueryCommand(),
                    "AT+VER?" => ProcessVersionQueryCommand(),
                    "AT+TEST=DEFAULT" => ProcessSimpleTestCommand("DEFAULT"),
                    "AT+TEST=BIST" => ProcessSimpleTestCommand("BIST"),
                    "AT+TEST=CAMERA" => ProcessSimpleTestCommand("CAMERA"),
                    "AT+TEST=WIFI" => ProcessSimpleTestCommand("WIFI"),
                    "AT+TEST=BLE" => ProcessSimpleTestCommand("BLE"),
                    "AT+TEST=WIEGAND" => ProcessSimpleTestCommand("WIEGAND"),
                    "AT+TEST=NFC" => ProcessSimpleTestCommand("NFC"),
                    "AT+TEST=LOCK" => ProcessSimpleTestCommand("LOCK"),
                    "AT+TEST=TAMPER" => ProcessSimpleTestCommand("TAMPER"),
                    "AT+TEST=NETWORK" => ProcessNetworkCommand(),
                    "AT+SERIAL?" => ProcessSerialQueryCommand(),
                    _ when upperCommand.StartsWith("AT+SERIAL=") => ProcessSerialSetCommand(command),
                    _ when upperCommand.StartsWith("AT+") => CreateAtErrorResponse($"Unknown AT command: {command}"),
                    _ => CreateAtErrorResponse("Invalid AT command format")
                };
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"AT command error: {ex.Message}");
                return CreateAtErrorResponse($"AT command error: {ex.Message}");
            }
        }

        public string ProcessTlsRequest(string requestData)
        {
            try
            {
                JsonDocument requestDoc;
                try
                {
                    requestDoc = JsonDocument.Parse(requestData);
                }
                catch (JsonException)
                {
                    return CreateTlsErrorResponse("Invalid JSON format");
                }

                if (!requestDoc.RootElement.TryGetProperty("action", out var actionElement))
                {
                    return CreateTlsErrorResponse("Missing action field");
                }

                var action = actionElement.GetString();
                _simulator.LogMessage($"TLS request: {action}");

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
                _simulator.LogMessage($"TLS request error: {ex.Message}");
                return CreateTlsErrorResponse($"Internal error: {ex.Message}");
            }
        }

        private string ProcessBasicAtCommand()
        {
            _simulator.SetConnected(true);
            _simulator.LogMessage("Basic AT command - connection established");
            return "OK\r\n";
        }

        private string ProcessTestBeginCommand()
        {
            if (!_simulator.IsConnected)
            {
                _simulator.LogMessage("Test begin failed - connect with AT first");
                return "ERROR: Send 'AT' command to establish connection first.\r\n";
            }

            _simulator.SetTestModeEnabled(true);
            _simulator.LogMessage("Test mode enabled");
            return "OK\r\nTEST MODE ENABLED\r\n";
        }

        private string ProcessTestEndCommand()
        {
            _simulator.SetTestModeEnabled(false);
            _simulator.LogMessage("Test mode disabled");
            return "OK\r\nTEST MODE DISABLED\r\n";
        }

        private string ProcessVersionQueryCommand()
        {
            if (!EnsureConnectedAndTestMode("Firmware version"))
                return "FAIL\r\n";

            try
            {
                const string firmwareVersion = "VER1.0.1";
                _simulator.LogMessage($"Firmware version: {firmwareVersion}");
                return $"{firmwareVersion}\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"Firmware version error: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessSerialQueryCommand()
        {
            if (!EnsureConnectedAndTestMode("Serial query"))
                return "FAIL\r\n";

            try
            {
                if (string.IsNullOrWhiteSpace(_simulator.DeviceSerialNumber))
                {
                    _simulator.LogMessage("Serial query failed - serial number not set");
                    return "FAIL\r\n";
                }

                _simulator.LogMessage($"Serial query: {_simulator.DeviceSerialNumber}");
                return $"{_simulator.DeviceSerialNumber}\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"Serial query error: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessSerialSetCommand(string command)
        {
            if (!EnsureConnectedAndTestMode("Serial set"))
                return "FAIL\r\n";

            try
            {
                var serialNumberPart = command.Substring(10);

                if (string.IsNullOrWhiteSpace(serialNumberPart))
                {
                    _simulator.LogMessage("Serial set failed - empty serial number");
                    return "FAIL\r\n";
                }

                if (!Regex.IsMatch(serialNumberPart, @"^[A-Za-z0-9\-]{1,20}$"))
                {
                    _simulator.LogMessage($"Serial set failed - invalid format: {serialNumberPart}");
                    return "FAIL\r\n";
                }

                var oldSerialNumber = _simulator.DeviceSerialNumber;
                _simulator.SetDeviceSerialNumber(serialNumberPart);
                _simulator.LogMessage($"Serial updated: {oldSerialNumber} -> {_simulator.DeviceSerialNumber}");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"Serial set error: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessSimpleTestCommand(string testName)
        {
            if (!EnsureConnectedAndTestMode(testName))
                return "FAIL\r\n";

            try
            {
                _simulator.LogMessage($"{testName} test completed");
                return "OK\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"{testName} test error: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private string ProcessNetworkCommand()
        {
            if (!EnsureConnectedAndTestMode("Network"))
                return "FAIL\r\n";

            try
            {
                _simulator.LogMessage("Network test completed - status UP");
                return "UP\r\n";
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"Network test error: {ex.Message}");
                return "FAIL\r\n";
            }
        }

        private bool EnsureConnectedAndTestMode(string operationName)
        {
            if (!_simulator.IsConnected)
            {
                _simulator.LogMessage($"{operationName} failed - not connected");
                return false;
            }

            if (!_simulator.IsTestModeEnabled)
            {
                _simulator.LogMessage($"{operationName} failed - test mode not enabled");
                return false;
            }

            return true;
        }

        private string ProcessSetSerialNumberTls(JsonDocument requestDoc)
        {
            try
            {
                if (requestDoc.RootElement.TryGetProperty("serialNumber", out var serialElement) ||
                    requestDoc.RootElement.TryGetProperty("serial_number", out serialElement) ||
                    requestDoc.RootElement.TryGetProperty("SerialNumber", out serialElement))
                {
                    var newSerialNumber = serialElement.GetString();
                    if (string.IsNullOrWhiteSpace(newSerialNumber))
                    {
                        return CreateTlsErrorResponse("Serial number cannot be empty");
                    }

                    if (!Regex.IsMatch(newSerialNumber, @"^[A-Za-z0-9\-]{1,20}$"))
                    {
                        return CreateTlsErrorResponse("Invalid serial number format");
                    }

                    _simulator.SetDeviceSerialNumber(newSerialNumber);
                    _simulator.LogMessage($"Serial updated: {_simulator.DeviceSerialNumber}");

                    var response = new
                    {
                        success = true,
                        message = "Serial number updated successfully",
                        serialNumber = _simulator.DeviceSerialNumber,
                        timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
                    };

                    return CreateTlsResponse(JsonSerializer.Serialize(response, new JsonSerializerOptions { WriteIndented = true }));
                }

                return CreateTlsErrorResponse("Serial number field not found");
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"Serial set error: {ex.Message}");
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

                _simulator.LogMessage($"Serial query complete: {_simulator.DeviceSerialNumber}");
                return JsonSerializer.Serialize(serialInfo, new JsonSerializerOptions { WriteIndented = true });
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"Serial query error: {ex.Message}");
                return JsonSerializer.Serialize(new { error = $"Serial query error: {ex.Message}" });
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

                _simulator.LogMessage("MAC address info generated");
                return JsonSerializer.Serialize(macInfo, new JsonSerializerOptions { WriteIndented = true });
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"MAC address error: {ex.Message}");
                return JsonSerializer.Serialize(new { error = $"MAC address error: {ex.Message}" });
            }
        }

        private object[] GetAllNetworkInterfaces()
        {
            try
            {
                return NetworkInterface.GetAllNetworkInterfaces()
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
            }
            catch (Exception ex)
            {
                _simulator.LogMessage($"Network interface error: {ex.Message}");
                return new[] { new { error = ex.Message } };
            }
        }

        private string GetMacAddress()
        {
            try
            {
                foreach (var networkInterface in NetworkInterface.GetAllNetworkInterfaces())
                {
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
                _simulator.LogMessage($"MAC address error: {ex.Message}");
                return "MAC Address error";
            }
        }
    }
}
