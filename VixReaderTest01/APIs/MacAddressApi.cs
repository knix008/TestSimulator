using System.Net.Http;
using System.Net.Security;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using System.Net;

namespace VixAirTest01.APIs
{
    public class MacAddressApi
    {
        private readonly HttpClient _httpClient;
        private readonly TextBox _logTextBox;
        private const string DEVICE_BASE_URL = "https://localhost:8443";

        public MacAddressApi(HttpClient httpClient, TextBox logTextBox)
        {
            _httpClient = httpClient;
            _logTextBox = logTextBox;
            
            // TLS 인증서 검증 우회 (개발 환경용)
            ConfigureTlsSettings();
        }

        private void ConfigureTlsSettings()
        {
            ServicePointManager.ServerCertificateValidationCallback = 
                (sender, certificate, chain, sslPolicyErrors) => true;
        }

        public async Task GetMacAddressInfoAsync()
        {
            try
            {
                string endpoint = $"{DEVICE_BASE_URL}/api/v1/system/getmacaddress";
                LogMessage($"MAC 주소 정보 요청: {endpoint}");

                LogMessage("서버 연결 상태 확인 중...");
                
                using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30)))
                {
                    HttpResponseMessage response = await _httpClient.GetAsync(endpoint, cts.Token);

                    LogMessage($"응답 상태 코드: {response.StatusCode}");
                    LogMessage($"응답 헤더: {response.Headers}");
                    
                    if (response.IsSuccessStatusCode)
                    {
                        string jsonResponse = await response.Content.ReadAsStringAsync();
                        LogMessage("MAC 주소 정보 수신 완료");
                        LogMessage("=== 서버 응답 (MAC 주소) ===");
                        LogMessage(jsonResponse);
                        
                        if (!string.IsNullOrWhiteSpace(jsonResponse))
                        {
                            ParseAndDisplayMacInfo(jsonResponse);
                        }
                        else
                        {
                            LogMessage("경고: 서버에서 빈 응답을 받았습니다");
                        }
                    }
                    else
                    {
                        string errorContent = await response.Content.ReadAsStringAsync();
                        LogMessage($"MAC 주소 요청 실패: {(int)response.StatusCode} {response.ReasonPhrase}");
                        LogMessage($"오류 상세: {errorContent}");
                    }
                }
            }
            catch (HttpRequestException httpEx)
            {
                LogMessage($"HTTP 통신 오류: {httpEx.Message}");
                LogMessage("가능한 원인:");
                LogMessage("- 서버가 실행되지 않음");
                LogMessage("- 네트워크 연결 문제");
                LogMessage("- 방화벽 차단");
                LogMessage("- TLS/SSL 인증서 문제");
                LogMessage($"- URL 확인: {DEVICE_BASE_URL}");
            }
            catch (TaskCanceledException ex) when (ex.InnerException is TimeoutException)
            {
                LogMessage("요청 시간 초과 (30초)");
                LogMessage("서버 응답이 느리거나 연결에 문제가 있습니다");
            }
            catch (TaskCanceledException)
            {
                LogMessage("요청 시간 초과");
            }
            catch (Exception ex)
            {
                LogMessage($"MAC 주소 요청 오류: {ex.Message}");
            }
        }

        private void ParseAndDisplayMacInfo(string jsonResponse)
        {
            LogMessage("파싱된 MAC 주소 정보:");
            LogMessage(jsonResponse);
            LogMessage("==========================================");
        }

        private void LogMessage(string message)
        {
            if (_logTextBox.InvokeRequired)
            {
                _logTextBox.Invoke(() => _logTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}\r\n"));
            }
            else
            {
                _logTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}\r\n");
            }
        }
    }
}