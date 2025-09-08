using System.Net.Http;
using System.Text;

namespace VixAirTest01.APIs
{
    public class ClearSettingApi
    {
        private readonly HttpClient _httpClient;
        private readonly TextBox _logTextBox;
        private readonly Func<string> _getIPAddress;

        public ClearSettingApi(HttpClient httpClient, TextBox logTextBox, Func<string> getIPAddress)
        {
            _httpClient = httpClient;
            _logTextBox = logTextBox;
            _getIPAddress = getIPAddress;
        }

        public async Task ClearSettingAsync()
        {
            try
            {
                string endpoint = $"https://{_getIPAddress()}:8443/api/v1/test/clearsetting";
                LogMessage($"설정 초기화 요청: {endpoint}");

                HttpResponseMessage response = await _httpClient.PostAsync(endpoint, null);
                
                if (response.IsSuccessStatusCode)
                {
                    string jsonResponse = await response.Content.ReadAsStringAsync();
                    LogMessage("설정 초기화 완료");
                    
                    // 원본 JSON 데이터 표시
                    LogMessage("=== 서버 응답 (설정 초기화) ===");
                    LogMessage(jsonResponse);
                    
                    ParseAndDisplayClearResult(jsonResponse);
                }
                else
                {
                    LogMessage($"설정 초기화 실패: {response.ReasonPhrase}");
                    string errorContent = await response.Content.ReadAsStringAsync();
                    if (!string.IsNullOrEmpty(errorContent))
                    {
                        LogMessage($"오류 상세: {errorContent}");
                    }
                    
                    // HTTP 응답 실패 시 예외 발생
                    throw new HttpRequestException($"설정 초기화 HTTP 오류: {response.StatusCode} - {response.ReasonPhrase}");
                }
            }
            catch (HttpRequestException httpEx)
            {
                LogMessage($"HTTP 통신 오류: {httpEx.Message}");
                LogMessage("장치 연결을 확인해주세요.");
                throw; // 예외를 다시 발생시켜 호출자에게 전달
            }
            catch (TaskCanceledException)
            {
                LogMessage("요청 시간 초과");
                throw; // 예외를 다시 발생시켜 호출자에게 전달
            }
            catch (Exception ex)
            {
                LogMessage($"설정 초기화 오류: {ex.Message}");
                throw; // 예외를 다시 발생시켜 호출자에게 전달
            }
        }

        private void ParseAndDisplayClearResult(string jsonResponse)
        {
            LogMessage("설정 초기화 결과:");
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