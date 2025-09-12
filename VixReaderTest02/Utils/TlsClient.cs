using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using System.Text;

namespace VixReaderTest01.Utils
{
    public class TlsClient : IDisposable
    {
        private readonly string _serverAddress;
        private readonly int _port;
        private readonly TextBox _logTextBox;
        private TcpClient? _tcpClient;
        private SslStream? _sslStream;
        private bool _disposed = false;
        
        // 🔧 연결 상태 확인을 위한 콜백 함수 추가
        private readonly Func<bool>? _isConnectedCallback;
        
        // 연결 상태를 추적하는 속성 (실제 TCP/TLS 연결 상태 + Main의 연결 상태)
        public bool IsConnected => (_isConnectedCallback?.Invoke() ?? false) && 
                                  _tcpClient?.Connected == true && 
                                  _sslStream != null && 
                                  _sslStream.CanWrite;

        // 🔧 물리적 연결 상태만 확인하는 속성 (Main 상태와 무관)
        public bool IsPhysicallyConnected => _tcpClient?.Connected == true && 
                                           _sslStream != null && 
                                           _sslStream.CanWrite;

        public TlsClient(string serverAddress, int port, TextBox logTextBox, Func<bool>? isConnectedCallback = null)
        {
            _serverAddress = serverAddress;
            _port = port;
            _logTextBox = logTextBox;
            _isConnectedCallback = isConnectedCallback;
        }

        // 🔧 Connect 버튼 전용 연결 메서드 - "AT" 및 "AT+TEST=BEGIN" 명령 포함
        public async Task ConnectAsync()
        {
            try
            {
                Logger.LogMessage(_logTextBox, $"TLS 연결 시도 중... ({_serverAddress}:{_port})");

                // 🔧 이미 연결되어 있으면 기존 연결 정리
                if (IsPhysicallyConnected)
                {
                    Logger.LogMessage(_logTextBox, "기존 연결이 감지되어 먼저 해제합니다.");
                    await DisconnectAsync();
                }

                // TCP 연결 생성
                _tcpClient = new TcpClient();
                await _tcpClient.ConnectAsync(_serverAddress, _port);
                Logger.LogMessage(_logTextBox, "TCP 연결 성공");

                // SSL/TLS 스트림 생성
                _sslStream = new SslStream(
                    _tcpClient.GetStream(),
                    false,
                    ValidateServerCertificate, // 인증서 검증 콜백
                    null
                );

                // TLS 핸드셰이크 수행
                Logger.LogMessage(_logTextBox, "TLS 핸드셰이크 시작...");
                await _sslStream.AuthenticateAsClientAsync(
                    _serverAddress,
                    null, // 클라이언트 인증서 없음
                    SslProtocols.Tls12 | SslProtocols.Tls13, // TLS 1.2/1.3 지원
                    false // 인증서 해지 확인 비활성화
                );

                Logger.LogMessage(_logTextBox, $"TLS 연결 성공!");
                Logger.LogMessage(_logTextBox, $"TLS 프로토콜: {_sslStream.SslProtocol}");
                Logger.LogMessage(_logTextBox, $"암호화 알고리즘: {_sslStream.CipherAlgorithm}");
                Logger.LogMessage(_logTextBox, $"해시 알고리즘: {_sslStream.HashAlgorithm}");
                
                if (_sslStream.RemoteCertificate != null)
                {
                    var cert = new X509Certificate2(_sslStream.RemoteCertificate);
                    Logger.LogMessage(_logTextBox, $"서버 인증서 주체: {cert.Subject}");
                    Logger.LogMessage(_logTextBox, $"서버 인증서 발급자: {cert.Issuer}");
                }

                // 🔧 1단계: "AT" 명령으로 연결 확인
                Logger.LogMessage(_logTextBox, "AT 명령 전송...");
                string atResponse = await SendRawCommandAsync("AT");

                // AT 응답 확인 - "OK" 응답이 있어야 성공으로 판단
                bool isAtSuccess = !string.IsNullOrEmpty(atResponse) && 
                                  (atResponse.Contains("OK") || atResponse.Contains("200") || atResponse.Contains("ok"));
                
                if (!isAtSuccess)
                {
                    Logger.LogMessage(_logTextBox, $"❌ AT 명령 실패: 올바른 응답 없음 ('{atResponse}')");
                    throw new InvalidOperationException($"AT 명령 실패: 서버에서 올바른 응답을 받지 못했습니다. 응답: '{atResponse}'");
                }
                
                Logger.LogMessage(_logTextBox, "✅ AT 명령 성공");
                
                // 🔧 2단계: "AT+TEST=BEGIN" 명령으로 테스트 모드 진입
                Logger.LogMessage(_logTextBox, "테스트 모드 진입...");
                
                await Task.Delay(1000);
                
                string testBeginResponse = await SendRawCommandAsync("AT+TEST=BEGIN");
                
                // 테스트 모드 진입 확인
                if (string.IsNullOrEmpty(testBeginResponse))
                {
                    Logger.LogMessage(_logTextBox, "⚠️ 테스트 모드 응답 없음");
                }
                else if (testBeginResponse.Contains("OK") || testBeginResponse.Contains("BEGIN") || testBeginResponse.Contains("ok"))
                {
                    Logger.LogMessage(_logTextBox, "✅ 테스트 모드 진입 성공");
                }
                else
                {
                    Logger.LogMessage(_logTextBox, $"❓ 테스트 모드 결과 불확실: '{testBeginResponse}'");
                }
                
                Logger.LogMessage(_logTextBox, "TLS 연결 및 테스트 설정 완료");
            }
            catch (Exception ex)
            {
                Logger.LogMessage(_logTextBox, $"TLS 연결 실패: {ex.Message}");
                await DisconnectAsync();
                throw;
            }
        }

        // 🔧 일반 AT 명령 전송 - 연결된 상태에서만 사용 (다른 버튼들용)
        public async Task<string> SendAtCommandAsync(string atCommand)
        {
            try
            {
                Logger.LogMessage(_logTextBox, $"AT 명령 전송 요청: {atCommand}");

                // 🔧 연결 상태 확인 - Main의 _isConnected 상태를 포함하여 검증
                if (!IsConnected)
                {
                    string errorMessage = "장치에 연결되지 않았습니다. Connect 버튼을 클릭하여 먼저 연결해주세요.";
                    Logger.LogMessage(_logTextBox, $"❌ {errorMessage}");
                    Logger.LogMessage(_logTextBox, $"연결 상태 디버그: Main._isConnected={_isConnectedCallback?.Invoke()}, TCP.Connected={_tcpClient?.Connected}, SSL.CanWrite={_sslStream?.CanWrite}");
                    
                    // 🔧 사용자에게 연결 필요 알림 팝업 표시
                    ShowConnectionRequiredPopup();
                    
                    throw new InvalidOperationException(errorMessage);
                }

                // 🔧 물리적 연결 상태 확인
                if (!IsPhysicallyConnected)
                {
                    string errorMessage = "물리적 연결이 끊어졌습니다. Connect 버튼을 클릭하여 다시 연결해주세요.";
                    Logger.LogMessage(_logTextBox, $"❌ {errorMessage}");
                    
                    // 🔧 사용자에게 재연결 필요 알림 팝업 표시
                    ShowReconnectionRequiredPopup();
                    
                    throw new InvalidOperationException(errorMessage);
                }

                return await SendRawCommandAsync(atCommand);
            }
            catch (InvalidOperationException ex) when (ex.Message.Contains("연결되지 않았습니다") || ex.Message.Contains("물리적 연결이 끊어졌습니다"))
            {
                // 연결 관련 예외는 그대로 재던져서 상위에서 처리하도록 함
                Logger.LogMessage(_logTextBox, $"❌ 연결 상태 오류: {ex.Message}");
                throw;
            }
            catch (Exception ex)
            {
                Logger.LogMessage(_logTextBox, $"AT 명령 실패: {ex.Message}");
                throw;
            }
        }

        // 🔧 연결 필요 알림 팝업 표시 메서드
        private void ShowConnectionRequiredPopup()
        {
            try
            {
                // UI 스레드에서 실행되도록 보장
                if (_logTextBox.InvokeRequired)
                {
                    _logTextBox.Invoke(() => ShowConnectionRequiredPopup());
                    return;
                }

                MessageBox.Show(
                    "장치에 연결되지 않았습니다.\n\n" +
                    "🔌 Connect 버튼을 클릭하여 먼저 장치에 연결해주세요.\n\n" +
                    "연결 절차:\n" +
                    "1. 상단의 'Connect' 버튼 클릭\n" +
                    "2. 연결 성공 후 원하는 기능 사용\n\n" +
                    "💡 연결이 완료되면 TestResult 버튼이 '연결됨' 상태로 변경됩니다.",
                    "연결 필요",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
            }
            catch (Exception ex)
            {
                // 팝업 표시 중 오류가 발생해도 로그만 남기고 계속 진행
                Logger.LogMessage(_logTextBox, $"연결 필요 팝업 표시 중 오류: {ex.Message}");
            }
        }

        // 🔧 재연결 필요 알림 팝업 표시 메서드
        private void ShowReconnectionRequiredPopup()
        {
            try
            {
                // UI 스레드에서 실행되도록 보장
                if (_logTextBox.InvokeRequired)
                {
                    _logTextBox.Invoke(() => ShowReconnectionRequiredPopup());
                    return;
                }

                MessageBox.Show(
                    "물리적 연결이 끊어졌습니다.\n\n" +
                    "🔄 Connect 버튼을 클릭하여 다시 연결해주세요.\n\n" +
                    "가능한 원인:\n" +
                    "• 네트워크 연결 불안정\n" +
                    "• 서버가 연결을 종료함\n" +
                    "• 장치가 재부팅됨\n" +
                    "• 타임아웃 발생\n\n" +
                    "💡 Connect 버튼을 다시 클릭하여 연결을 복구하세요.",
                    "재연결 필요",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Exclamation
                );
            }
            catch (Exception ex)
            {
                // 팝업 표시 중 오류가 발생해도 로그만 남기고 계속 진행
                Logger.LogMessage(_logTextBox, $"재연결 필요 팝업 표시 중 오류: {ex.Message}");
            }
        }

        // 🔧 실제 AT 명령 전송 로직 (내부 메서드)
        private async Task<string> SendRawCommandAsync(string atCommand)
        {
            try
            {
                // _sslStream이 null이 아님을 보장
                if (_sslStream == null)
                {
                    throw new InvalidOperationException("TLS 스트림이 초기화되지 않았습니다.");
                }

                // AT 명령 전송
                Logger.LogMessage(_logTextBox, $"AT 명령 '{atCommand}' 전송 중...");
                byte[] commandBytes = Encoding.UTF8.GetBytes(atCommand + "\r\n");
                await _sslStream.WriteAsync(commandBytes, 0, commandBytes.Length);
                await _sslStream.FlushAsync();
                Logger.LogMessage(_logTextBox, $"AT 명령 전송 완료");

                // 서버 응답 수신 - "OK\r\n", "FAIL\r\n" 또는 시리얼 번호 문자열 형태의 응답을 기대
                return await ReadResponseAsync();
            }
            catch (Exception ex)
            {
                Logger.LogMessage(_logTextBox, $"AT 명령 전송 실패: {ex.Message}");
                throw;
            }
        }

        private async Task<string> ReadResponseAsync()
        {
            try
            {
                Logger.LogMessage(_logTextBox, "서버 응답 대기 중...");

                // _sslStream null 체크 추가
                if (_sslStream == null)
                {
                    throw new InvalidOperationException("TLS 스트림이 초기화되지 않았습니다.");
                }

                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
                StringBuilder responseBuilder = new StringBuilder();
                byte[] buffer = new byte[1024];

                var stream = _sslStream;
                int consecutiveEmptyReads = 0;

                while (!cts.Token.IsCancellationRequested)
                {
                    if (stream.CanRead)
                    {
                        int bytesRead = await stream.ReadAsync(buffer, 0, buffer.Length, cts.Token);
                        if (bytesRead > 0)
                        {
                            consecutiveEmptyReads = 0; // 데이터를 받으면 카운터 리셋
                            string chunk = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                            responseBuilder.Append(chunk);

                            // 로그에 표시할 때 \r\n 문자를 제거하여 보기 좋게 만듦
                            string cleanChunk = chunk.Replace("\r\n", "").Replace("\r", "").Replace("\n", "");
                            Logger.LogMessage(_logTextBox, $"수신된 데이터: '{cleanChunk}' ({bytesRead} bytes)");

                            // 현재까지 받은 응답 확인
                            string currentResponse = responseBuilder.ToString();

                            // 응답 완료 조건 확인
                            if (IsResponseComplete(currentResponse))
                            {
                                // 완전한 응답 로그에서도 \r\n 제거
                                string cleanResponse = currentResponse.Replace("\r\n", "").Replace("\r", "").Replace("\n", "");
                                Logger.LogMessage(_logTextBox, $"완전한 응답 수신됨: '{cleanResponse}'");
                                break;
                            }
                        }
                        else
                        {
                            consecutiveEmptyReads++;
                            // 연속으로 빈 읽기가 5번 이상 발생하면 응답이 완료된 것으로 판단
                            if (consecutiveEmptyReads >= 5 && responseBuilder.Length > 0)
                            {
                                Logger.LogMessage(_logTextBox, $"연속 빈 읽기 감지, 응답 완료로 판단: {consecutiveEmptyReads}회");
                                break;
                            }
                            await Task.Delay(100, cts.Token);
                        }
                    }
                    else
                    {
                        await Task.Delay(50, cts.Token);
                    }
                }

                string finalResponse = responseBuilder.ToString();
                // 최종 응답 로그에서도 \r\n 제거
                string cleanFinalResponse = finalResponse.Replace("\r\n", "").Replace("\r", "").Replace("\n", "");
                Logger.LogMessage(_logTextBox, $"최종 수신 응답: '{cleanFinalResponse}' (길이: {finalResponse.Length})");

                if (string.IsNullOrEmpty(finalResponse))
                {
                    throw new TimeoutException("서버 응답 타임아웃: 응답을 받지 못했습니다");
                }

                return finalResponse.Trim();
            }
            catch (OperationCanceledException)
            {
                Logger.LogMessage(_logTextBox, "응답 읽기 타임아웃");
                throw new TimeoutException("서버 응답 타임아웃: 응답을 받지 못했습니다");
            }
            catch (Exception ex)
            {
                Logger.LogMessage(_logTextBox, $"응답 읽기 실패: {ex.Message}");
                throw;
            }
        }

        private bool IsResponseComplete(string response)
        {
            Logger.LogMessage(_logTextBox, $"응답 완료 확인: '{response.Replace("\r", "\\r").Replace("\n", "\\n")}'");

            // 빈 응답은 미완료
            if (string.IsNullOrWhiteSpace(response))
            {
                return false;
            }

            // OK/FAIL 응답 확인 (명확한 종료 신호)
            if (response.Contains("OK\r\n") || 
                response.Contains("OK\n") || 
                response.TrimEnd().EndsWith("OK") ||
                response.Contains("FAIL\r\n") ||
                response.Contains("FAIL\n") ||
                response.TrimEnd().EndsWith("FAIL"))
            {
                Logger.LogMessage(_logTextBox, "OK/FAIL 응답 감지됨");
                return true;
            }

            // 개행 문자가 포함된 경우 (시리얼 번호나 기타 데이터 응답)
            if (response.Contains("\r\n") || response.Contains("\n"))
            {
                string trimmed = response.Trim();
                if (trimmed.Length >= 1) // 최소 1자 이상
                {
                    // 개행으로 끝나는 경우 완료된 것으로 판단
                    string[] lines = trimmed.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                    if (lines.Length > 0 && !string.IsNullOrWhiteSpace(lines[0]))
                    {
                        Logger.LogMessage(_logTextBox, $"개행 포함 응답 감지됨: '{lines[0]}'");
                        return true;
                    }
                }
            }

            // 응답이 특정 길이 이상이고 더 이상 데이터가 오지 않는 것 같으면 완료로 판단
            if (response.Length >= 3 && !response.Contains("OK") && !response.Contains("FAIL"))
            {
                // 시리얼 번호 같은 짧은 응답도 처리할 수 있도록 조건 완화
                string trimmed = response.Trim();
                if (trimmed.Length >= 3)
                {
                    Logger.LogMessage(_logTextBox, $"일반 응답 감지됨 (길이 {trimmed.Length}): '{trimmed}'");
                    // 추가 데이터 대기 시간을 줄여서 빠르게 처리
                    return true;
                }
            }

            Logger.LogMessage(_logTextBox, "응답 미완료로 판단");
            return false;
        }

        private bool ValidateServerCertificate(
            object sender,
            X509Certificate? certificate,
            X509Chain? chain,
            SslPolicyErrors sslPolicyErrors)
        {
            // 테스트 환경에서는 모든 인증서를 허용 (프로덕션에서는 적절한 검증 필요)
            if (sslPolicyErrors == SslPolicyErrors.None)
            {
                Logger.LogMessage(_logTextBox, "서버 인증서 검증 성공");
                return true;
            }

            Logger.LogMessage(_logTextBox, $"서버 인증서 검증 경고: {sslPolicyErrors}");
            
            // 자체 서명 인증서나 이름 불일치 등을 허용
            if (sslPolicyErrors.HasFlag(SslPolicyErrors.RemoteCertificateNameMismatch) ||
                sslPolicyErrors.HasFlag(SslPolicyErrors.RemoteCertificateChainErrors))
            {
                Logger.LogMessage(_logTextBox, "테스트 환경이므로 인증서 오류를 무시합니다");
                return true;
            }

            return false;
        }

        public async Task DisconnectAsync()
        {
            try
            {
                if (_sslStream != null)
                {
                    await _sslStream.DisposeAsync();
                    _sslStream = null;
                }

                if (_tcpClient != null)
                {
                    _tcpClient.Close();
                    _tcpClient.Dispose();
                    _tcpClient = null;
                }

                Logger.LogMessage(_logTextBox, "TLS 연결 해제 완료");
            }
            catch (Exception ex)
            {
                Logger.LogMessage(_logTextBox, $"TLS 연결 해제 중 오류: {ex.Message}");
            }
        }

        public void Dispose()
        {
            Dispose(true);
            GC.SuppressFinalize(this);
        }

        protected virtual void Dispose(bool disposing)
        {
            if (!_disposed)
            {
                if (disposing)
                {
                    DisconnectAsync().Wait();
                }
                _disposed = true;
            }
        }
    }
}