using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace VixAirTest01.APIs
{
    public class FirmwareApi
    {
        private readonly HttpClient _httpClient;
        private readonly TextBox _logTextBox;
        private readonly Func<string> _getIPAddress;

        public FirmwareApi(HttpClient httpClient, TextBox logTextBox, Func<string> getIPAddress)
        {
            _httpClient = httpClient;
            _logTextBox = logTextBox;
            _getIPAddress = getIPAddress;
        }

        public async Task GetFirmwareVersionAsync()
        {
            try
            {
                string endpoint = $"https://{_getIPAddress()}:8443/api/v1/test/getfirmwareversion";
                LogMessage($"펌웨어 버전 조회 요청: {endpoint}");

                HttpResponseMessage response = await _httpClient.GetAsync(endpoint);
                
                if (response.IsSuccessStatusCode)
                {
                    string jsonResponse = await response.Content.ReadAsStringAsync();
                    LogMessage("펌웨어 버전 조회 성공");
                    
                    // 원본 JSON 응답 표시
                    LogMessage("=== 서버 응답 (펌웨어 버전) ===");
                    LogMessage(jsonResponse);
                    
                    ParseAndDisplayFirmwareVersion(jsonResponse);
                }
                else
                {
                    LogMessage($"펌웨어 버전 조회 실패: {response.ReasonPhrase}");
                    string errorContent = await response.Content.ReadAsStringAsync();
                    if (!string.IsNullOrEmpty(errorContent))
                    {
                        LogMessage($"오류 상세: {errorContent}");
                    }
                    
                    // HTTP 응답 실패 시 예외 발생
                    throw new HttpRequestException($"펌웨어 버전 조회 HTTP 오류: {response.StatusCode} - {response.ReasonPhrase}");
                }
            }
            catch (HttpRequestException httpEx)
            {
                LogMessage($"HTTP 통신 오류: {httpEx.Message}");
                LogMessage("장치 연결을 확인하세요.");
                throw; // 예외를 다시 발생시켜 호출자에게 전달
            }
            catch (TaskCanceledException)
            {
                LogMessage("요청 시간 초과");
                throw; // 예외를 다시 발생시켜 호출자에게 전달
            }
            catch (Exception ex)
            {
                LogMessage($"펌웨어 버전 조회 오류: {ex.Message}");
                throw; // 예외를 다시 발생시켜 호출자에게 전달
            }
        }

        public async Task SetFirmwareVersionAsync(string firmwareVersion)
        {
            try
            {
                string endpoint = $"https://{_getIPAddress()}:8443/api/v1/test/setfirmwareversion";
                LogMessage($"펌웨어 버전 설정 요청: {endpoint}");
                LogMessage($"설정할 펌웨어 버전: {firmwareVersion}");

                // JSON 페이로드 생성
                var payload = new { firmware_version = firmwareVersion };
                string jsonPayload = JsonSerializer.Serialize(payload);
                
                var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");
                
                HttpResponseMessage response = await _httpClient.PutAsync(endpoint, content);
                
                if (response.IsSuccessStatusCode)
                {
                    string jsonResponse = await response.Content.ReadAsStringAsync();
                    LogMessage("펌웨어 버전 설정 완료");
                    
                    // 원본 JSON 응답 표시
                    LogMessage("=== 서버 응답 (펌웨어 버전 설정) ===");
                    LogMessage(jsonResponse);
                    
                    ParseAndDisplaySetResult(jsonResponse);
                }
                else
                {
                    LogMessage($"펌웨어 버전 설정 실패: {response.ReasonPhrase}");
                    string errorContent = await response.Content.ReadAsStringAsync();
                    if (!string.IsNullOrEmpty(errorContent))
                    {
                        LogMessage($"오류 상세: {errorContent}");
                    }
                    
                    // HTTP 응답 실패 시 예외 발생
                    throw new HttpRequestException($"펌웨어 버전 설정 HTTP 오류: {response.StatusCode} - {response.ReasonPhrase}");
                }
            }
            catch (HttpRequestException httpEx)
            {
                LogMessage($"HTTP 통신 오류: {httpEx.Message}");
                LogMessage("장치 연결을 확인하세요.");
                throw; // 예외를 다시 발생시켜 호출자에게 전달
            }
            catch (TaskCanceledException)
            {
                LogMessage("요청 시간 초과");
                throw; // 예외를 다시 발생시켜 호출자에게 전달
            }
            catch (Exception ex)
            {
                LogMessage($"펌웨어 버전 설정 오류: {ex.Message}");
                throw; // 예외를 다시 발생시켜 호출자에게 전달
            }
        }

        private void ParseAndDisplayFirmwareVersion(string jsonResponse)
        {
            LogMessage("파싱된 펌웨어 버전 정보:");
            LogMessage(jsonResponse);
            LogMessage("==========================================");
        }

        private void ParseAndDisplaySetResult(string jsonResponse)
        {
            LogMessage("펌웨어 버전 설정 결과:");
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