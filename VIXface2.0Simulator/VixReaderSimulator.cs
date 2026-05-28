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
    public partial class VixReaderSimulator : Form
    {
        private TcpListener? _sslServer;
        private X509Certificate2? _serverCertificate;
        private bool _isServerRunning = false;
        private readonly object _logLock = new object();
        private readonly CancellationTokenSource _cancellationTokenSource = new CancellationTokenSource();
        private string _deviceSerialNumber = "MYWWXXXXX"; // 기본 시리얼 번호
        
        // 전역 상태 관리 (clientEndpoint 의존성 제거)
        private bool _isConnected = false;
        private bool _isTestModeEnabled = false;
        private DateTime _lastCommandTime = DateTime.Now;

        // 명령어 처리기
        private readonly ProcessCommand _commandProcessor;

        public VixReaderSimulator()
        {
            InitializeComponent();
            _commandProcessor = new ProcessCommand(this);
            InitializeServer();
        }

        // ProcessCommand 클래스에서 접근할 수 있도록 속성들을 public으로 노출
        public bool IsConnected => _isConnected;
        public bool IsTestModeEnabled => _isTestModeEnabled;
        public DateTime LastCommandTime => _lastCommandTime;
        public string DeviceSerialNumber => _deviceSerialNumber;

        public void SetConnected(bool connected) => _isConnected = connected;
        public void SetTestModeEnabled(bool enabled) => _isTestModeEnabled = enabled;
        public void SetDeviceSerialNumber(string serialNumber) => _deviceSerialNumber = serialNumber;
        public void UpdateLastCommandTime() => _lastCommandTime = DateTime.Now;

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
            {
                LogMessage("서버를 시작할 수 없습니다. SSL 서버 또는 인증서가 초기화되지 않았습니다.");
                return;
            }

            try
            {
                _sslServer.Start();
                _isServerRunning = true;
                LogMessage("SSL 서버가 포트 8443에서 시작되었습니다.");

                while (_isServerRunning && !_cancellationTokenSource.Token.IsCancellationRequested)
                {
                    var tcpClient = await _sslServer.AcceptTcpClientAsync();
                    var clientEndpoint = tcpClient.Client.RemoteEndPoint?.ToString() ?? "Unknown";
                    LogMessage($"클라이언트 연결됨: {clientEndpoint}");

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
            var clientEndpoint = tcpClient.Client.RemoteEndPoint?.ToString() ?? "Unknown";
            
            try
            {
                if (cancellationToken.IsCancellationRequested)
                    return;

                // 서버 인증서가 null인 경우 처리
                if (_serverCertificate == null)
                {
                    LogMessage("서버 인증서가 초기화되지 않았습니다.");
                    return;
                }

                sslStream = new SslStream(tcpClient.GetStream());
                
                // SSL 핸드셰이크 수행 (이제 _serverCertificate가 null이 아님이 보장됨)
                await sslStream.AuthenticateAsServerAsync(_serverCertificate);
                LogMessage("TLS 핸드셰이크 완료");

                // 연속적으로 명령어를 처리하는 루프
                while (!cancellationToken.IsCancellationRequested && tcpClient.Connected)
                {
                    var buffer = new byte[4096];
                    var bytesRead = await sslStream.ReadAsync(buffer, 0, buffer.Length, cancellationToken);
                    
                    if (bytesRead > 0)
                    {
                        var requestData = Encoding.UTF8.GetString(buffer, 0, bytesRead).Trim();
                        LogMessage($"[{clientEndpoint}] 수신된 요청: {requestData}");

                        string response;
                        
                        // AT 명령어인지 JSON 요청인지 구분
                        if (requestData.StartsWith("AT", StringComparison.OrdinalIgnoreCase))
                        {
                            response = _commandProcessor.ProcessAtCommand(requestData);
                        }
                        else
                        {
                            // 첫 연결에서 AT 명령어가 아닌 요청을 받은 경우
                            if (!_isConnected)
                            {
                                response = "ERROR: 첫 연결에서는 반드시 'AT' 명령어로 시작해야 합니다.\r\n";
                                LogMessage($"[{clientEndpoint}] 첫 연결에서 잘못된 요청 수신: {requestData}");
                            }
                            // 기존 JSON 요청 처리 (테스트 모드가 활성화된 경우에만)
                            else if (_isTestModeEnabled)
                            {
                                response = _commandProcessor.ProcessTlsRequest(requestData);
                            }
                            else
                            {
                                response = "ERROR: 테스트 모드가 활성화되지 않았습니다. 먼저 'AT+TEST=BEGIN'를 전송하세요.\r\n";
                            }
                        }

                        var responseBytes = Encoding.UTF8.GetBytes(response);
                        await sslStream.WriteAsync(responseBytes, 0, responseBytes.Length, cancellationToken);
                        await sslStream.FlushAsync(cancellationToken);
                        
                        LogMessage($"[{clientEndpoint}] 응답 전송 완료");
                    }
                    else
                    {
                        // 클라이언트가 연결을 종료한 경우
                        break;
                    }
                }
            }
            catch (OperationCanceledException)
            {
                // 취소된 경우 - 정상적인 종료
            }
            catch (Exception ex)
            {
                LogMessage($"[{clientEndpoint}] 클라이언트 처리 오류: {ex.Message}");
            }
            finally
            {
                sslStream?.Close();
                tcpClient.Close();
                LogMessage($"[{clientEndpoint}] 클라이언트 연결 종료됨");
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
                
                // 전역 상태 초기화
                _isConnected = false;
                _isTestModeEnabled = false;
                
                LogMessage("SSL 서버가 중지되었습니다.");
            }
            catch (Exception ex)
            {
                LogMessage($"서버 중지 오류: {ex.Message}");
            }
        }

        public void LogMessage(string message)
        {
            // 폼이 dispose되었는지 먼저 확인
            if (IsDisposed)
                return;

            // CancellationTokenSource의 상태를 안전하게 확인
            try
            {
                if (_cancellationTokenSource?.Token.IsCancellationRequested == true)
                    return;
            }
            catch (ObjectDisposedException)
            {
                // CancellationTokenSource가 이미 dispose된 경우 로깅 중단
                return;
            }

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
    }
}
