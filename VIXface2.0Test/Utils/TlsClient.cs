using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;

namespace VIXFaceTest.Utils
{
    public class TlsClient : IDisposable
    {
        private string _serverAddress;
        private readonly int _port;
        private readonly TextBox _logTextBox;
        private TcpClient? _tcpClient;
        private SslStream? _sslStream;
        private bool _disposed = false;
        
        // 연결 상태를 추적하는 단일 변수
        private bool _isConnected = false;
        
        // 연결 상태 확인을 위한 콜백 함수
        private readonly Func<bool>? _isConnectedCallback;
        
        // 타임아웃 설정
        private readonly int _defaultConnectionTimeoutSeconds = 30;
        private readonly int _defaultCommandTimeoutSeconds = 15;
        
        // 연결 상태를 추적하는 공개 속성 - 내부 상태 변수만 사용
        public bool IsConnected => _isConnected;

        // 현재 서버 주소 속성
        public string ServerAddress => _serverAddress;

        // 생성자
        public TlsClient(string serverAddress, int port, TextBox logTextBox, Func<bool>? isConnectedCallback = null)
        {
            _serverAddress = serverAddress;
            _port = port;
            _logTextBox = logTextBox;
            _isConnectedCallback = isConnectedCallback;
            _isConnected = false;
        }

        // 서버 주소 업데이트 메서드 (연결 없이 주소만 변경)
        public void UpdateServerAddress(string newServerAddress)
        {
            _serverAddress = newServerAddress;
        }

        // Connect 버튼 전용 연결 메서드 - 타임아웃 지원 (CancellationToken 파라미터 추가)
        public async Task ConnectAsync(int timeoutSeconds = 0, CancellationToken cancellationToken = default)
        {
            // 기본 타임아웃 설정
            int actualTimeout = timeoutSeconds > 0 ? timeoutSeconds : _defaultConnectionTimeoutSeconds;
            
            // 타임아웃과 외부 취소 요청을 모두 처리하기 위한 연결된 취소 토큰 생성
            using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(actualTimeout));
            using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(timeoutCts.Token, cancellationToken);
            
            try
            {
                // 연결 상태 초기화
                _isConnected = false;
                
                Logger.LogMessage(_logTextBox, $"TLS 연결 시도 중... ({_serverAddress}:{_port}, 타임아웃: {actualTimeout}초)");
                
                // TCP 연결 생성 - 타임아웃 적용
                _tcpClient = new TcpClient();
                _tcpClient.ReceiveTimeout = actualTimeout * 1000; // 밀리초 단위
                _tcpClient.SendTimeout = actualTimeout * 1000;
                
                // 취소 가능한 TCP 연결
                var connectTask = _tcpClient.ConnectAsync(_serverAddress, _port);
                
                try
                {
                    // 취소 토큰으로 태스크 완료 대기
                    await connectTask.WaitAsync(linkedCts.Token);
                    Logger.LogMessage(_logTextBox, "TCP 연결 성공");
                }
                catch (OperationCanceledException) when (timeoutCts.Token.IsCancellationRequested && !cancellationToken.IsCancellationRequested)
                {
                    Logger.LogMessage(_logTextBox, $"❌ TCP 연결 타임아웃 ({actualTimeout}초)");
                    throw new TimeoutException($"TCP 연결이 {actualTimeout}초 내에 완료되지 않았습니다.");
                }

                // SSL/TLS 스트림 생성 - 타임아웃 적용
                _sslStream = new SslStream(
                    _tcpClient.GetStream(),
                    false,
                    ValidateServerCertificate,
                    null
                );

                // TLS 핸드셰이크 수행
                Logger.LogMessage(_logTextBox, "TLS 핸드셰이크 시작...");
                
                var authTask = _sslStream.AuthenticateAsClientAsync(
                    _serverAddress,
                    null,
                    SslProtocols.Tls12 | SslProtocols.Tls13,
                    false
                );
                
                try
                {
                    // 취소 토큰으로 TLS 핸드셰이크 대기
                    await authTask.WaitAsync(linkedCts.Token);
                }
                catch (OperationCanceledException) when (timeoutCts.Token.IsCancellationRequested && !cancellationToken.IsCancellationRequested)
                {
                    Logger.LogMessage(_logTextBox, $"❌ TLS 핸드셰이크 타임아웃 ({actualTimeout}초)");
                    throw new TimeoutException($"TLS 핸드셰이크가 {actualTimeout}초 내에 완료되지 않았습니다.");
                }

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

                // 취소 요청 확인
                linkedCts.Token.ThrowIfCancellationRequested();

                // 1단계: "AT" 명령으로 연결 확인
                Logger.LogMessage(_logTextBox, "AT 명령 전송...");
                string atResponse = await SendRawCommandAsync("AT", linkedCts.Token);

                // AT 응답 확인
                bool isAtSuccess = !string.IsNullOrEmpty(atResponse) && 
                                  (atResponse.Contains("OK") || atResponse.Contains("200") || atResponse.Contains("ok"));
                
                if (!isAtSuccess)
                {
                    Logger.LogMessage(_logTextBox, $"❌ AT 명령 실패: 올바른 응답 없음 ('{atResponse}')");
                    throw new InvalidOperationException($"AT 명령 실패: 서버에서 올바른 응답을 받지 못했습니다. 응답: '{atResponse}'");
                }
                
                Logger.LogMessage(_logTextBox, "✅ AT 명령 성공");
                
                // 취소 요청 확인
                linkedCts.Token.ThrowIfCancellationRequested();

                // 2단계: "AT+TEST=BEGIN" 명령으로 테스트 모드 진입
                Logger.LogMessage(_logTextBox, "테스트 모드 진입...");
                
                await Task.Delay(1000, linkedCts.Token);
                
                string testBeginResponse = await SendRawCommandAsync("AT+TEST=BEGIN", linkedCts.Token);
                
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
                
                // 모든 과정이 성공적으로 완료되었으므로 연결 상태 설정
                _isConnected = true;
                
                Logger.LogMessage(_logTextBox, $"TLS 연결 및 테스트 설정 완료 (연결 상태: {_isConnected})");
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                Logger.LogMessage(_logTextBox, "❌ 연결 작업이 사용자에 의해 취소되었습니다.");
                _isConnected = false;
                await DisconnectAsync();
                throw; // 취소 예외 전파
            }
            catch (OperationCanceledException) // 타임아웃이나 다른 취소 처리
            {
                Logger.LogMessage(_logTextBox, $"❌ 연결 작업 타임아웃 또는 취소됨");
                _isConnected = false;
                await DisconnectAsync();
                throw new TimeoutException($"연결 작업이 {actualTimeout}초 내에 완료되지 않았거나 취소되었습니다.");
            }
            catch (TimeoutException)
            {
                Logger.LogMessage(_logTextBox, $"❌ 연결 타임아웃");
                _isConnected = false;
                await DisconnectAsync();
                throw;
            }
            catch (Exception ex)
            {
                Logger.LogMessage(_logTextBox, $"TLS 연결 실패: {ex.Message}");
                _isConnected = false;
                await DisconnectAsync();
                throw;
            }
        }

        // 일반 AT 명령 전송 - 타임아웃 지원 (CancellationToken 파라미터 추가)
        public async Task<string> SendAtCommandAsync(string atCommand, int timeoutSeconds = 0, CancellationToken cancellationToken = default)
        {
            // 기본 타임아웃 설정
            int actualTimeout = timeoutSeconds > 0 ? timeoutSeconds : _defaultCommandTimeoutSeconds;
            
            // 타임아웃과 외부 취소 요청을 모두 처리하기 위한 연결된 취소 토큰 생성
            using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(actualTimeout));
            using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(timeoutCts.Token, cancellationToken);
            
            try
            {
                Logger.LogMessage(_logTextBox, $"AT 명령 전송 요청: {atCommand} (타임아웃: {actualTimeout}초)");

                // 연결 상태 확인 - 단일 상태 변수로 체크
                if (!_isConnected)
                {
                    // 연결이 되어있지 않은 경우 사용자에게 Connect 버튼 사용 안내
                    Logger.LogMessage(_logTextBox, "❌ 연결이 설정되지 않았습니다. Connect 버튼을 클릭하여 먼저 연결해주세요.");
                    throw new InvalidOperationException("명령을 전송하려면 먼저 Connect 버튼을 클릭하여 연결을 설정해주세요.");
                }
                
                // 개선된 물리적 연결 확인
                bool isPhysicallyConnected = IsPhysicallyConnected();
                if (!isPhysicallyConnected)
                {
                    // 연결이 끊어진 경우 사용자에게 Connect 버튼 사용 안내
                    Logger.LogMessage(_logTextBox, "❌ 네트워크 연결이 끊어졌습니다. Connect 버튼을 클릭하여 다시 연결해주세요.");
                    _isConnected = false; // 실제 연결이 끊어진 경우에만 상태 변수 업데이트
                    throw new InvalidOperationException("네트워크 연결이 끊어졌습니다. Connect 버튼을 클릭하여 다시 연결해주세요.");
                }

                // 취소 토큰 전달
                return await SendRawCommandAsync(atCommand, linkedCts.Token);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                Logger.LogMessage(_logTextBox, $"❌ AT 명령이 사용자에 의해 취소되었습니다: {atCommand}");
                throw; // 취소 예외 전파
            }
            catch (OperationCanceledException) when (timeoutCts.Token.IsCancellationRequested)
            {
                Logger.LogMessage(_logTextBox, $"❌ AT 명령 타임아웃 ({actualTimeout}초): {atCommand}");
                throw new TimeoutException($"AT 명령 '{atCommand}'이 {actualTimeout}초 내에 완료되지 않았습니다.");
            }
            catch (InvalidOperationException ex) when (ex.Message.Contains("연결되지 않았습니다") || 
                                                     ex.Message.Contains("설정되지 않았습니다") ||
                                                     ex.Message.Contains("끊어졌습니다") ||
                                                     ex.Message.Contains("닫혔습니다"))
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

        public async Task<string> SendJsonRequestAsync(object request, int timeoutSeconds = 0, CancellationToken cancellationToken = default)
        {
            int actualTimeout = timeoutSeconds > 0 ? timeoutSeconds : _defaultCommandTimeoutSeconds;

            using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(actualTimeout));
            using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(timeoutCts.Token, cancellationToken);

            if (!_isConnected)
            {
                throw new InvalidOperationException("명령을 전송하려면 먼저 Connect 버튼을 클릭하여 연결을 설정해주세요.");
            }

            if (!IsPhysicallyConnected())
            {
                _isConnected = false;
                throw new InvalidOperationException("네트워크 연결이 끊어졌습니다. Connect 버튼을 클릭하여 다시 연결해주세요.");
            }

            return await SendRawJsonAsync(request, linkedCts.Token);
        }

        private async Task<string> SendRawJsonAsync(object request, CancellationToken cancellationToken = default)
        {
            if (_sslStream == null)
            {
                throw new InvalidOperationException("TLS 스트림이 초기화되지 않았습니다.");
            }

            cancellationToken.ThrowIfCancellationRequested();

            string json = JsonSerializer.Serialize(request);
            Logger.LogMessage(_logTextBox, $"JSON 요청 전송: {json}");

            byte[] commandBytes = Encoding.UTF8.GetBytes(json + "\r\n");
            await _sslStream.WriteAsync(commandBytes, 0, commandBytes.Length, cancellationToken);
            await _sslStream.FlushAsync(cancellationToken);

            return await ReadJsonResponseAsync(cancellationToken);
        }

        private async Task<string> ReadJsonResponseAsync(CancellationToken cancellationToken = default)
        {
            if (_sslStream == null)
            {
                throw new InvalidOperationException("TLS 스트림이 초기화되지 않았습니다.");
            }

            StringBuilder responseBuilder = new StringBuilder();
            byte[] buffer = new byte[4096];

            while (!cancellationToken.IsCancellationRequested)
            {
                int bytesRead = await _sslStream.ReadAsync(buffer, 0, buffer.Length, cancellationToken);
                if (bytesRead > 0)
                {
                    responseBuilder.Append(Encoding.UTF8.GetString(buffer, 0, bytesRead));
                    string currentResponse = responseBuilder.ToString();
                    if (IsJsonResponseComplete(currentResponse))
                    {
                        break;
                    }
                }
                else if (responseBuilder.Length > 0)
                {
                    break;
                }
                else
                {
                    await Task.Delay(50, cancellationToken);
                }
            }

            cancellationToken.ThrowIfCancellationRequested();

            string finalResponse = responseBuilder.ToString().Trim();
            if (string.IsNullOrEmpty(finalResponse))
            {
                throw new TimeoutException("서버 JSON 응답 타임아웃");
            }

            Logger.LogMessage(_logTextBox, $"JSON 응답 수신 완료 (길이: {finalResponse.Length})");
            return finalResponse;
        }

        private static bool IsJsonResponseComplete(string response)
        {
            if (string.IsNullOrWhiteSpace(response))
            {
                return false;
            }

            try
            {
                using var doc = JsonDocument.Parse(response);
                return doc.RootElement.TryGetProperty("status", out _);
            }
            catch (JsonException)
            {
                return false;
            }
        }

        // 물리적 연결 상태를 더 정확하게 확인하는 개선된 메서드
        private bool IsPhysicallyConnected()
        {
            try
            {
                // 기본 조건 확인
                if (_tcpClient == null || _sslStream == null || !_sslStream.CanWrite)
                {
                    Logger.LogMessage(_logTextBox, "물리적 연결 상태 확인: 기본 조건 불충족");
                    return false;
                }

                // 소켓 연결 확인 (더 강화된 검증)
                if (_tcpClient.Client == null)
                {
                    Logger.LogMessage(_logTextBox, "물리적 연결 상태 확인: 소켓이 null");
                    return false;
                }

                // 소켓이 연결되어 있는지 확인 (Connected 속성 먼저 확인)
                if (!_tcpClient.Client.Connected)
                {
                    Logger.LogMessage(_logTextBox, "물리적 연결 상태 확인: 소켓이 연결되지 않음 (Connected = false)");
                    return false;
                }

                // 추가 검증: 소켓이 실제로 사용 가능한지 확인
                // Poll 메서드는 상태가 변경되었거나 타임아웃에 도달한 경우 true를 반환
                // SelectMode.SelectRead와 함께 사용하면 소켓이 닫혔거나 데이터를 받을 수 있는지 확인
                // Available이 0이면서 Poll이 true를 반환하면 소켓이 닫힌 것
                if (_tcpClient.Client.Poll(1, SelectMode.SelectRead) && _tcpClient.Client.Available == 0)
                {
                    Logger.LogMessage(_logTextBox, "물리적 연결 상태 확인: 소켓이 닫힘 (Poll 검사)");
                    return false;
                }

                // TLS 스트림이 읽기/쓰기 가능한지 확인
                if (!_sslStream.CanRead || !_sslStream.CanWrite)
                {
                    Logger.LogMessage(_logTextBox, $"물리적 연결 상태 확인: TLS 스트림 불가능 (읽기: {_sslStream.CanRead}, 쓰기: {_sslStream.CanWrite})");
                    return false;
                }

                // 모든 검사를 통과하면 연결된 것으로 간주
                return true;
            }
            catch (Exception ex)
            {
                Logger.LogMessage(_logTextBox, $"물리적 연결 상태 확인 중 오류: {ex.Message}");
                return false;
            }
        }

        // 실제 AT 명령 전송 로직 (내부 메서드) - 타임아웃 지원
        private async Task<string> SendRawCommandAsync(string atCommand, CancellationToken cancellationToken = default)
        {
            try
            {
                // _sslStream이 null이 아님을 보장
                if (_sslStream == null)
                {
                    throw new InvalidOperationException("TLS 스트림이 초기화되지 않았습니다.");
                }

                // 취소 요청 확인
                cancellationToken.ThrowIfCancellationRequested();

                // AT 명령 전송
                Logger.LogMessage(_logTextBox, $"AT 명령 '{atCommand}' 전송 중...");
                byte[] commandBytes = Encoding.UTF8.GetBytes(atCommand + "\r\n");
                await _sslStream.WriteAsync(commandBytes, 0, commandBytes.Length, cancellationToken);
                await _sslStream.FlushAsync(cancellationToken);
                Logger.LogMessage(_logTextBox, $"AT 명령 전송 완료");

                // 서버 응답 수신 - "OK\r\n", "FAIL\r\n" 또는 시리얼 번호 문자열 형태의 응답을 기대
                return await ReadResponseAsync(cancellationToken);
            }
            catch (OperationCanceledException)
            {
                Logger.LogMessage(_logTextBox, $"AT 명령 전송 취소됨: {atCommand}");
                throw; // 취소 예외 전파
            }
            catch (Exception ex)
            {
                Logger.LogMessage(_logTextBox, $"AT 명령 전송 실패: {ex.Message}");
                throw;
            }
        }

        // 응답 읽기 메서드 - 타임아웃 지원
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
                        cancellationToken.ThrowIfCancellationRequested();
                        
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
                            
                            // 취소 토큰으로 지연
                            await Task.Delay(100, cancellationToken);
                        }
                    }
                    else
                    {
                        // 취소 토큰으로 지연
                        await Task.Delay(50, cancellationToken);
                    }
                }

                // 취소 요청 확인
                cancellationToken.ThrowIfCancellationRequested();

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
                Logger.LogMessage(_logTextBox, "응답 읽기가 취소되었습니다.");
                throw; // 취소 예외 전파
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

            // OK/FAIL/UP/DOWN/ERROR 응답 확인 (명확한 종료 신호)
            if (response.Contains("OK\r\n") || 
                response.Contains("OK\n") || 
                response.TrimEnd().EndsWith("OK") ||
                response.Contains("FAIL\r\n") ||
                response.Contains("FAIL\n") ||
                response.TrimEnd().EndsWith("FAIL") ||
                response.Contains("UP\r\n") ||
                response.TrimEnd().EndsWith("UP") ||
                response.Contains("DOWN\r\n") ||
                response.TrimEnd().EndsWith("DOWN") ||
                response.StartsWith("ERROR:", StringComparison.OrdinalIgnoreCase))
            {
                Logger.LogMessage(_logTextBox, "AT 응답 종료 신호 감지됨");
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
            return true;
        }

        public async Task DisconnectAsync()
        {
            try
            {
                // 연결 상태 변수 업데이트
                _isConnected = false;
                
                // 이전에 SSL 스트림이 열려있으면 닫기
                if (_sslStream != null)
                {
                    try
                    {
                        // 정상적으로 닫을 수 있도록 시도
                        await _sslStream.DisposeAsync();
                    }
                    catch (Exception ex)
                    {
                        Logger.LogMessage(_logTextBox, $"SSL 스트림 해제 중 오류 (무시됨): {ex.Message}");
                    }
                    finally
                    {
                        _sslStream = null;
                    }
                }

                // 이전에 TCP 클라이언트가 열려있으면 닫기
                if (_tcpClient != null)
                {
                    try
                    {
                        _tcpClient.Close();
                        _tcpClient.Dispose();
                    }
                    catch (Exception ex)
                    {
                        Logger.LogMessage(_logTextBox, $"TCP 클라이언트 해제 중 오류 (무시됨): {ex.Message}");
                    }
                    finally
                    {
                        _tcpClient = null;
                    }
                }

                Logger.LogMessage(_logTextBox, "TLS 연결 해제 완료");
            }
            catch (Exception ex)
            {
                Logger.LogMessage(_logTextBox, $"TLS 연결 해제 중 오류: {ex.Message}");
                // 연결 해제 중 오류가 발생해도 연결 상태는 끊어진 것으로 간주
                _isConnected = false;
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
                    // 연결 상태 변수 업데이트
                    _isConnected = false;
                    
                    // 조용한 해제 - 로그 출력 안함
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