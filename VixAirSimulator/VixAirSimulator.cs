using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Management;
using System.Net.NetworkInformation;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace VixAirSimulator
{
    public partial class VixAirSimulator : Form
    {
        private TcpListener? _sslServer;
        private X509Certificate2? _serverCertificate;
        private bool _isServerRunning = false;
        private readonly object _logLock = new object();
        private readonly CancellationTokenSource _cancellationTokenSource = new CancellationTokenSource();
        private string _deviceSerialNumber = "VS001234567"; // 기본 시리얼 번호

        public VixAirSimulator()
        {
            InitializeComponent();
            InitializeServer();
        }

        private void InitializeServer()
        {
            try
            {
                // SSL 인증서 생성 (개발용 자체 서명 인증서)
                _serverCertificate = CreateSelfSignedCertificate();
                
                // TCP 리스너 초기화 (포트 8443 사용)
                _sslServer = new TcpListener(IPAddress.Any, 8443);
                
                LogMessage("SSL 서버가 초기화되었습니다.");
            }
            catch (Exception ex)
            {
                LogMessage($"서버 초기화 오류: {ex.Message}");
            }
        }

        private X509Certificate2 CreateSelfSignedCertificate()
        {
            // 개발용 자체 서명 인증서 생성
            // 실제 운영환경에서는 유효한 SSL 인증서를 사용해야 합니다
            using (var rsa = System.Security.Cryptography.RSA.Create(2048))
            {
                var req = new System.Security.Cryptography.X509Certificates.CertificateRequest(
                    "CN=localhost", rsa, System.Security.Cryptography.HashAlgorithmName.SHA256,
                    System.Security.Cryptography.RSASignaturePadding.Pkcs1);

                var cert = req.CreateSelfSigned(DateTimeOffset.Now, DateTimeOffset.Now.AddYears(1));
                return new X509Certificate2(cert.Export(X509ContentType.Pfx), (string?)null, X509KeyStorageFlags.Exportable);
            }
        }

        public async Task StartServerAsync()
        {
            if (_isServerRunning || _sslServer == null || _serverCertificate == null)
                return;

            try
            {
                _sslServer.Start();
                _isServerRunning = true;
                LogMessage("SSL 서버가 포트 8443에서 시작되었습니다.");

                while (_isServerRunning && !_cancellationTokenSource.Token.IsCancellationRequested)
                {
                    var tcpClient = await _sslServer.AcceptTcpClientAsync();
                    LogMessage($"클라이언트 연결됨: {tcpClient.Client.RemoteEndPoint}");

                    // 각 클라이언트를 별도 작업으로 처리
                    _ = Task.Run(() => HandleClientAsync(tcpClient, _cancellationTokenSource.Token));
                }
            }
            catch (ObjectDisposedException)
            {
                // 서버가 정상적으로 종료된 경우
            }
            catch (Exception ex)
            {
                LogMessage($"서버 오류: {ex.Message}");
            }
        }

        private async Task HandleClientAsync(TcpClient tcpClient, CancellationToken cancellationToken)
        {
            SslStream? sslStream = null;
            try
            {
                if (cancellationToken.IsCancellationRequested)
                    return;

                sslStream = new SslStream(tcpClient.GetStream());
                
                // SSL 핸드셰이크 수행
                await sslStream.AuthenticateAsServerAsync(_serverCertificate);
                LogMessage("SSL 핸드셰이크 완료");

                // 클라이언트로부터 HTTP 요청 읽기
                var buffer = new byte[4096];
                var bytesRead = await sslStream.ReadAsync(buffer, 0, buffer.Length, cancellationToken);
                
                if (bytesRead > 0 && !cancellationToken.IsCancellationRequested)
                {
                    var httpRequest = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                    LogMessage($"수신된 HTTP 요청:\n{httpRequest}");

                    // HTTP 요청 처리
                    string httpResponse = ProcessHttpRequest(httpRequest);
                    var responseBytes = Encoding.UTF8.GetBytes(httpResponse);
                    await sslStream.WriteAsync(responseBytes, 0, responseBytes.Length, cancellationToken);
                    await sslStream.FlushAsync(cancellationToken);
                    
                    LogMessage("HTTP 응답 전송 완료");
                }
            }
            catch (OperationCanceledException)
            {
                // 취소된 경우 - 정상적인 종료
            }
            catch (Exception ex)
            {
                LogMessage($"클라이언트 처리 오류: {ex.Message}");
            }
            finally
            {
                sslStream?.Close();
                tcpClient.Close();
                LogMessage("클라이언트 연결 종료됨");
            }
        }

        private string ProcessHttpRequest(string httpRequest)
        {
            try
            {
                // HTTP 요청 라인 파싱
                var lines = httpRequest.Split('\n');
                if (lines.Length == 0) return CreateHttpErrorResponse(400, "Bad Request");

                var requestLine = lines[0].Trim();
                var requestParts = requestLine.Split(' ');
                if (requestParts.Length < 2) return CreateHttpErrorResponse(400, "Bad Request");

                var method = requestParts[0];
                var path = requestParts[1];

                LogMessage($"HTTP 요청 처리: {method} {path}");

                // 라우팅 처리
                return (method, path) switch
                {
                    ("GET", "/api/v1/system/cpuinfo") => CreateHttpResponse(GetRealCpuInfo()),
                    ("GET", "/api/v1/system/getmacaddress") => CreateHttpResponse(GetRealMacAddressInfo()),
                    ("GET", "/api/v1/system/getserialnumber") => CreateHttpResponse(GetSerialNumber()),
                    ("GET", "/api/v1/system/serialnumber") => CreateHttpResponse(GetSerialNumber()),
                    ("POST", "/api/v1/system/setserialnumber") => ProcessSetSerialNumber(httpRequest),
                    ("PUT", "/api/v1/system/setserialnumber") => ProcessSetSerialNumber(httpRequest),
                    ("POST", "/api/v1/system/serialnumber") => ProcessSetSerialNumber(httpRequest),
                    ("PUT", "/api/v1/system/serialnumber") => ProcessSetSerialNumber(httpRequest),
                    _ when method != "GET" && method != "POST" && method != "PUT" => CreateHttpErrorResponse(405, "Method Not Allowed"),
                    _ => CreateHttpErrorResponse(404, "Not Found")
                };
            }
            catch (Exception ex)
            {
                LogMessage($"HTTP 요청 처리 오류: {ex.Message}");
                return CreateHttpErrorResponse(500, "Internal Server Error");
            }
        }

        private string ProcessSetSerialNumber(string httpRequest)
        {
            try
            {
                // HTTP 요청에서 본문 추출
                var bodyStartIndex = httpRequest.IndexOf("\r\n\r\n");
                if (bodyStartIndex == -1)
                {
                    return CreateHttpErrorResponse(400, "Bad Request - No body found");
                }

                var body = httpRequest.Substring(bodyStartIndex + 4);
                LogMessage($"요청 본문: {body}");

                // JSON 본문 파싱
                JsonDocument jsonDoc;
                try
                {
                    jsonDoc = JsonDocument.Parse(body);
                }
                catch (JsonException)
                {
                    return CreateHttpErrorResponse(400, "Bad Request - Invalid JSON");
                }

                // 시리얼 번호 추출
                if (jsonDoc.RootElement.TryGetProperty("serialNumber", out var serialElement) ||
                    jsonDoc.RootElement.TryGetProperty("serial_number", out serialElement) ||
                    jsonDoc.RootElement.TryGetProperty("SerialNumber", out serialElement))
                {
                    var newSerialNumber = serialElement.GetString();
                    if (string.IsNullOrWhiteSpace(newSerialNumber))
                    {
                        return CreateHttpErrorResponse(400, "Bad Request - Serial number cannot be empty");
                    }

                    // 시리얼 번호 검증 (영숫자와 하이픈만 허용, 최대 20자)
                    if (!Regex.IsMatch(newSerialNumber, @"^[A-Za-z0-9\-]{1,20}$"))
                    {
                        return CreateHttpErrorResponse(400, "Bad Request - Invalid serial number format");
                    }

                    _deviceSerialNumber = newSerialNumber;
                    LogMessage($"시리얼 번호가 업데이트됨: {_deviceSerialNumber}");

                    return CreateHttpResponse(JsonSerializer.Serialize(new 
                    { 
                        success = true,
                        message = "Serial number updated successfully",
                        serialNumber = _deviceSerialNumber,
                        timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
                    }, new JsonSerializerOptions { WriteIndented = true }));
                }
                else
                {
                    return CreateHttpErrorResponse(400, "Bad Request - Serial number field not found");
                }
            }
            catch (Exception ex)
            {
                LogMessage($"시리얼 번호 설정 오류: {ex.Message}");
                return CreateHttpErrorResponse(500, $"Internal Server Error - {ex.Message}");
            }
        }

        private string GetSerialNumber()
        {
            try
            {
                var serialInfo = new
                {
                    serialNumber = _deviceSerialNumber,
                    deviceId = Environment.MachineName,
                    timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
                };

                LogMessage($"시리얼 번호 조회 완료: {_deviceSerialNumber}");
                return JsonSerializer.Serialize(serialInfo, new JsonSerializerOptions 
                { 
                    WriteIndented = true 
                });
            }
            catch (Exception ex)
            {
                LogMessage($"시리얼 번호 조회 오류: {ex.Message}");
                return JsonSerializer.Serialize(new { error = $"시리얼 번호 조회 오류: {ex.Message}" });
            }
        }

        private string CreateHttpResponse(string jsonContent, int statusCode = 200)
        {
            string statusText = statusCode == 200 ? "OK" : "Error";
            var contentBytes = Encoding.UTF8.GetBytes(jsonContent);
            
            return $"HTTP/1.1 {statusCode} {statusText}\r\n" +
                   $"Content-Type: application/json; charset=utf-8\r\n" +
                   $"Content-Length: {contentBytes.Length}\r\n" +
                   $"Connection: close\r\n" +
                   $"Server: VixAirSimulator/1.0\r\n" +
                   $"Access-Control-Allow-Origin: *\r\n" +
                   $"Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS\r\n" +
                   $"Access-Control-Allow-Headers: Content-Type\r\n" +
                   $"Date: {DateTime.UtcNow:R}\r\n\r\n" +
                   jsonContent;
        }

        private string CreateHttpErrorResponse(int statusCode, string statusText)
        {
            var errorResponse = JsonSerializer.Serialize(new 
            { 
                error = statusText, 
                code = statusCode,
                timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
            });
            
            return CreateHttpResponse(errorResponse, statusCode);
        }

        private string GetRealCpuInfo()
        {
            try
            {
                var cpuInfo = GetCpuInfo();
                var result = new { cpu = cpuInfo };
                
                LogMessage("CPU 정보 생성 완료");
                return JsonSerializer.Serialize(result, new JsonSerializerOptions 
                { 
                    WriteIndented = true 
                });
            }
            catch (Exception ex)
            {
                LogMessage($"CPU 정보 수집 오류: {ex.Message}");
                return JsonSerializer.Serialize(new { error = $"CPU 정보 오류: {ex.Message}" });
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
                
                LogMessage("MAC 주소 정보 생성 완료");
                return JsonSerializer.Serialize(macInfo, new JsonSerializerOptions 
                { 
                    WriteIndented = true 
                });
            }
            catch (Exception ex)
            {
                LogMessage($"MAC 주소 수집 오류: {ex.Message}");
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
                LogMessage($"네트워크 인터페이스 수집 오류: {ex.Message}");
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
                LogMessage($"MAC 주소 수집 오류: {ex.Message}");
                return "MAC Address error";
            }
        }

        private object GetCpuInfo()
        {
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT * FROM Win32_Processor"))
                {
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        return new
                        {
                            Name = obj["Name"]?.ToString() ?? "Unknown",
                            Manufacturer = obj["Manufacturer"]?.ToString() ?? "Unknown",
                            MaxClockSpeed = obj["MaxClockSpeed"]?.ToString() ?? "Unknown",
                            NumberOfCores = obj["NumberOfCores"]?.ToString() ?? "Unknown",
                            NumberOfLogicalProcessors = obj["NumberOfLogicalProcessors"]?.ToString() ?? "Unknown",
                            Architecture = obj["Architecture"]?.ToString() ?? "Unknown",
                            ProcessorId = obj["ProcessorId"]?.ToString() ?? "Unknown"
                        };
                    }
                }
                return new { Error = "CPU 정보를 찾을 수 없습니다" };
            }
            catch (Exception ex)
            {
                LogMessage($"CPU 정보 수집 오류: {ex.Message}");
                return new { Error = $"CPU 정보 오류: {ex.Message}" };
            }
        }

        public void StopServer()
        {
            if (!_isServerRunning) return;

            try
            {
                _isServerRunning = false;
                _cancellationTokenSource.Cancel();
                _sslServer?.Stop();
                LogMessage("SSL 서버가 중지되었습니다.");
            }
            catch (Exception ex)
            {
                LogMessage($"서버 중지 오류: {ex.Message}");
            }
        }

        private void LogMessage(string message)
        {
            // 폼이 dispose되었거나 취소 요청이 있으면 로그 메시지를 무시
            if (_cancellationTokenSource.Token.IsCancellationRequested || IsDisposed)
                return;

            try
            {
                var logEntry = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}";
                
                // UI 스레드에서 텍스트박스 업데이트
                if (LogTextBox.InvokeRequired)
                {
                    LogTextBox.Invoke(new Action(() => UpdateTextBox(logEntry)));
                }
                else
                {
                    UpdateTextBox(logEntry);
                }
            }
            catch (ObjectDisposedException)
            {
                // TextBox가 dispose된 경우 무시
            }
            catch (InvalidOperationException)
            {
                // Invoke 호출 시 control이 dispose된 경우 무시
            }
        }

        private void UpdateTextBox(string logEntry)
        {
            // TextBox가 dispose되었는지 확인
            if (LogTextBox.IsDisposed)
                return;

            lock (_logLock)
            {
                try
                {
                    LogTextBox.AppendText(logEntry + Environment.NewLine);
                    LogTextBox.SelectionStart = LogTextBox.Text.Length;
                    LogTextBox.ScrollToCaret();
                }
                catch (ObjectDisposedException)
                {
                    // TextBox가 dispose된 경우 무시
                }
            }
        }

        protected override async void OnLoad(EventArgs e)
        {
            base.OnLoad(e);
            // 폼이 로드되면 서버 시작
            await StartServerAsync();
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            StopServer();
            _serverCertificate?.Dispose();
            _cancellationTokenSource?.Dispose();
            base.OnFormClosed(e);
        }

        private void VixAirServerLabel_Click(object sender, EventArgs e)
        {

        }
    }
}
