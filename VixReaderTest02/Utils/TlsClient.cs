using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using System.Text;

namespace VixReaderTest01.Utils
{
    public class TlsClient : IDisposable
    {
        private string _serverAddress;  // 🔧 readonly 제거
        private readonly int _port;
        private readonly TextBox _logTextBox;
        private TcpClient? _tcpClient;
        private SslStream? _sslStream;
        private bool _disposed = false;
        
        // 🔧 연결 상태 확인을 위한 콜백 함수 추가
        private readonly Func<bool>? _isConnectedCallback;
        
        // 🔧 타임아웃 설정 추가
        private readonly int _defaultConnectionTimeoutSeconds = 30;
        private readonly int _defaultCommandTimeoutSeconds = 15;
        
        // 연결 상태를 추적하는 속성 (실제 TCP/TLS 연결 상태 + Main의 연결 상태)
        public bool IsConnected => (_isConnectedCallback?.Invoke() ?? false) && 
                                  _tcpClient?.Connected == true && 
                                  _sslStream != null && 
                                  _sslStream.CanWrite;

        // 🔧 물리적 연결 상태만 확인하는 속성 (Main 상태와 무관)
        public bool IsPhysicallyConnected => _tcpClient?.Connected == true && 
                                           _sslStream != null && 
                                           _sslStream.CanWrite;

        // 🔧 현재 서버 주소 속성 추가
        public string ServerAddress => _serverAddress;

        public TlsClient(string serverAddress, int port, TextBox logTextBox, Func<bool>? isConnectedCallback = null)
        {
            _serverAddress = serverAddress;
            _port = port;
            _logTextBox = logTextBox;
            _isConnectedCallback = isConnectedCallback;
        }

        // 🔧 서버 주소 업데이트 메서드 추가 (연결 없이 주소만 변경)
        public void UpdateServerAddress(string newServerAddress)
        {
            _serverAddress = newServerAddress;
            // 🔧 로그 출력하지 않음 - Connect 버튼이 눌렸을 때만 연결 시도
        }

        // 🔧 Connect 버튼 전용 연결 메서드 - 타임아웃 지원 추가
        public async Task ConnectAsync(int timeoutSeconds = 0)
        {
            // 기본 타임아웃 설정
            int actualTimeout = timeoutSeconds > 0 ? timeoutSeconds : _defaultConnectionTimeoutSeconds;
            
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(actualTimeout));
            
            try
            {
                Logger.LogMessage(_logTextBox, $"TLS 연결 시도 중... ({_serverAddress}:{_port}, 타임아웃: {actualTimeout}초)");

                // 🔧 이미 연결되어 있으면 기존 연결 정리
                if (IsPhysicallyConnected)
                {
                    Logger.LogMessage(_logTextBox, "기존 연결이 감지되어 먼저 해제합니다.");
                    await DisconnectAsync();
                }

                // 🔧 TCP 연결 생성 - 타임아웃 적용
                _tcpClient = new TcpClient();
                _tcpClient.ReceiveTimeout = actualTimeout * 1000; // 밀리초 단위
                _tcpClient.SendTimeout = actualTimeout * 1000;
                
                var connectTask = _tcpClient.ConnectAsync(_serverAddress, _port);
                var timeoutTask = Task.Delay(TimeSpan.FromSeconds(actualTimeout), cts.Token);
                
                var completedTask = await Task.WhenAny(connectTask, timeoutTask);
                
                if (completedTask == timeoutTask)
                {
                    Logger.LogMessage(_logTextBox, $"❌ TCP 연결 타임아웃 ({actualTimeout}초)");
                    throw new TimeoutException($"TCP 연결이 {actualTimeout}초 내에 완료되지 않았습니다.");
                }
                
                await connectTask; // 연결 작업 완료 확인
                Logger.LogMessage(_logTextBox, "TCP 연결 성공");

                // 🔧 SSL/TLS 스트림 생성 - 타임아웃 적용
                _sslStream = new SslStream(
                    _tcpClient.GetStream(),
                    false,
                    ValidateServerCertificate,
                    null
                );

                // 🔧 TLS 핸드셰이크 수행 - 타임아웃 적용
                Logger.LogMessage(_logTextBox, "TLS 핸드셰이크 시작...");
                
                var authTask = _sslStream.AuthenticateAsClientAsync(
                    _serverAddress,
                    null,
                    SslProtocols.Tls12 | SslProtocols.Tls13,
                    false
                );
                
                var authTimeoutTask = Task.Delay(TimeSpan.FromSeconds(actualTimeout), cts.Token);
                var authCompletedTask = await Task.WhenAny(authTask, authTimeoutTask);
                
                if (authCompletedTask == authTimeoutTask)
                {
                    Logger.LogMessage(_logTextBox, $"❌ TLS 핸드셰이크 타임아웃 ({actualTimeout}초)");
                    throw new TimeoutException($"TLS 핸드셰이크가 {actualTimeout}초 내에 완료되지 않았습니다.");
                }
                
                await authTask; // 핸드셰이크 작업 완료 확인

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

                // 🔧 1단계: "AT" 명령으로 연결 확인 - 타임아웃 적용
                Logger.LogMessage(_logTextBox, "AT 명령 전송...");
                string atResponse = await SendRawCommandAsync("AT", cts.Token);

                // AT 응답 확인
                bool isAtSuccess = !string.IsNullOrEmpty(atResponse) && 
                                  (atResponse.Contains("OK") || atResponse.Contains("200") || atResponse.Contains("ok"));
                
                if (!isAtSuccess)
                {
                    Logger.LogMessage(_logTextBox, $"❌ AT 명령 실패: 올바른 응답 없음 ('{atResponse}')");
                    throw new InvalidOperationException($"AT 명령 실패: 서버에서 올바른 응답을 받지 못했습니다. 응답: '{atResponse}'");
                }
                
                Logger.LogMessage(_logTextBox, "✅ AT 명령 성공");
                
                // 🔧 2단계: "AT+TEST=BEGIN" 명령으로 테스트 모드 진입 - 타임아웃 적용
                Logger.LogMessage(_logTextBox, "테스트 모드 진입...");
                
                await Task.Delay(1000, cts.Token);
                
                string testBeginResponse = await SendRawCommandAsync("AT+TEST=BEGIN", cts.Token);
                
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
            catch (OperationCanceledException) when (cts.Token.IsCancellationRequested)
            {
                Logger.LogMessage(_logTextBox, $"❌ 연결 작업 타임아웃 ({actualTimeout}초)");
                await DisconnectAsync();
                throw new TimeoutException($"연결 작업이 {actualTimeout}초 내에 완료되지 않았습니다.");
            }
            catch (TimeoutException)
            {
                Logger.LogMessage(_logTextBox, $"❌ 연결 타임아웃");
                await DisconnectAsync();
                throw;
            }
            catch (Exception ex)
            {
                Logger.LogMessage(_logTextBox, $"TLS 연결 실패: {ex.Message}");
                
                // 🔧 팝업 표시 제거 - 로그만 출력
                await DisconnectAsync();
                throw;
            }
        }

        // 🔧 일반 AT 명령 전송 - 타임아웃 지원 추가
        public async Task<string> SendAtCommandAsync(string atCommand, int timeoutSeconds = 0)
        {
            // 기본 타임아웃 설정
            int actualTimeout = timeoutSeconds > 0 ? timeoutSeconds : _defaultCommandTimeoutSeconds;
            
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(actualTimeout));
            
            try
            {
                Logger.LogMessage(_logTextBox, $"AT 명령 전송 요청: {atCommand} (타임아웃: {actualTimeout}초)");

                // 🔧 연결 상태 확인 - Main의 _isConnected 상태를 포함하여 검증
                if (!IsConnected)
                {
                    string errorMessage = "장치에 연결되지 않았습니다. Connect 버튼을 클릭하여 먼저 연결해주세요.";
                    Logger.LogMessage(_logTextBox, $"❌ {errorMessage}");
                    Logger.LogMessage(_logTextBox, $"연결 상태 디버그: Main._isConnected={_isConnectedCallback?.Invoke()}, TCP.Connected={_tcpClient?.Connected}, SSL.CanWrite={_sslStream?.CanWrite}");
                    
                    // 🔧 팝업 표시 제거 - 로그만 출력
                    throw new InvalidOperationException(errorMessage);
                }

                // 🔧 물리적 연결 상태 확인
                if (!IsPhysicallyConnected)
                {
                    string errorMessage = "물리적 연결이 끊어졌습니다. Connect 버튼을 클릭하여 다시 연결해주세요.";
                    Logger.LogMessage(_logTextBox, $"❌ {errorMessage}");
                    
                    // 🔧 팝업 표시 제거 - 로그만 출력
                    throw new InvalidOperationException(errorMessage);
                }

                return await SendRawCommandAsync(atCommand, cts.Token);
            }
            catch (OperationCanceledException) when (cts.Token.IsCancellationRequested)
            {
                Logger.LogMessage(_logTextBox, $"❌ AT 명령 타임아웃 ({actualTimeout}초): {atCommand}");
                throw new TimeoutException($"AT 명령 '{atCommand}'이 {actualTimeout}초 내에 완료되지 않았습니다.");
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

        // 🔧 실제 AT 명령 전송 로직 (내부 메서드) - 타임아웃 지원 추가
        private async Task<string> SendRawCommandAsync(string atCommand, CancellationToken cancellationToken = default)
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
                await _sslStream.WriteAsync(commandBytes, 0, commandBytes.Length, cancellationToken);
                await _sslStream.FlushAsync(cancellationToken);
                Logger.LogMessage(_logTextBox, $"AT 명령 전송 완료");

                // 서버 응답 수신 - "OK\r\n", "FAIL\r\n" 또는 시리얼 번호 문자열 형태의 응답을 기대
                return await ReadResponseAsync(cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                Logger.LogMessage(_logTextBox, $"AT 명령 전송 타임아웃: {atCommand}");
                throw;
            }
            catch (Exception ex)
            {
                Logger.LogMessage(_logTextBox, $"AT 명령 전송 실패: {ex.Message}");
                throw;
            }
        }

        // 🔧 응답 읽기 메서드 - 타임아웃 지원 개선
        private async Task<string> ReadResponseAsync(CancellationToken cancellationToken = default)
        {
            try
            {
                Logger.LogMessage(_logTextBox, "서버 응답 대기 중...");

                // _sslStream null 체크 추가
                if (_sslStream == null)
                {
                    throw new InvalidOperationException("TLS 스트림이 초기화되지 않았습니다.");
                }

                StringBuilder responseBuilder = new StringBuilder();
                byte[] buffer = new byte[1024];
                var stream = _sslStream;
                int consecutiveEmptyReads = 0;

                while (!cancellationToken.IsCancellationRequested)
                {
                    if (stream.CanRead)
                    {
                        int bytesRead = await stream.ReadAsync(buffer, 0, buffer.Length, cancellationToken);
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
                            await Task.Delay(100, cancellationToken);
                        }
                    }
                    else
                    {
                        await Task.Delay(50, cancellationToken);
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
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
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
            // 인증서 정보 로깅
            if (certificate != null)
            {
                Logger.LogMessage(_logTextBox, $"인증서 주체: {certificate.Subject}");
                Logger.LogMessage(_logTextBox, $"인증서 발급자: {certificate.Issuer}");
            }

            // 검증 오류가 있는 경우 경고 로깅
            if (sslPolicyErrors != SslPolicyErrors.None)
            {
                Logger.LogMessage(_logTextBox, $"서버 인증서 검증 경고: {sslPolicyErrors}");
                Logger.LogMessage(_logTextBox, "자체 서명 인증서를 허용하도록 설정되어 있습니다.");
            }
            else
            {
                Logger.LogMessage(_logTextBox, "서버 인증서 검증 성공");
            }

            // 모든 인증서 오류 허용 (자체 서명 인증서 포함)
            // -verify_return_error 옵션을 비활성화한 것과 같은 효과
            return true;
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
                    // 🔧 조용한 해제 - 로그 출력 안함
                    try
                    {
                        if (_sslStream != null)
                        {
                            _sslStream.Dispose();
                            _sslStream = null;
                        }

                        if (_tcpClient != null)
                        {
                            _tcpClient.Close();
                            _tcpClient.Dispose();
                            _tcpClient = null;
                        }
                    }
                    catch
                    {
                        // 조용한 해제 - 예외도 무시
                    }
                }
                _disposed = true;
            }
        }
    }
}