using System.Net.Http;
using System.Text;

namespace VixAirTest01.APIs
{
    public class NetworkLinkApi
    {
        private readonly HttpClient _httpClient;
        private readonly TextBox _logTextBox;
        private readonly Func<string> _getIPAddress;

        public NetworkLinkApi(HttpClient httpClient, TextBox logTextBox, Func<string> getIPAddress)
        {
            _httpClient = httpClient;
            _logTextBox = logTextBox;
            _getIPAddress = getIPAddress;
        }

        public async Task CheckNetworkLinkAsync()
        {
            try
            {
                string endpoint = $"https://{_getIPAddress()}:8443/api/v1/test/networklink";
                LogMessage($"네트워크 링크 확인 요청: {endpoint}");
                LogMessage("네트워크 연결 상태를 확인합니다...");

                HttpResponseMessage response = await _httpClient.GetAsync(endpoint);
                
                if (response.IsSuccessStatusCode)
                {
                    string jsonResponse = await response.Content.ReadAsStringAsync();
                    LogMessage("네트워크 링크 확인 완료");
                    
                    LogMessage("=== 서버 응답 (네트워크 링크) ===");
                    LogMessage(jsonResponse);
                    
                    ParseAndDisplayNetworkLinkResult(jsonResponse);
                }
                else
                {
                    LogMessage($"네트워크 링크 확인 실패: {response.ReasonPhrase}");
                    string errorContent = await response.Content.ReadAsStringAsync();
                    if (!string.IsNullOrEmpty(errorContent))
                    {
                        LogMessage($"오류 상세: {errorContent}");
                    }
                    
                    // HTTP 응답 실패 시 예외 발생
                    throw new HttpRequestException($"네트워크 링크 확인 HTTP 오류: {response.StatusCode} - {response.ReasonPhrase}");
                }
            }
            catch (HttpRequestException httpEx)
            {
                LogMessage($"HTTP 통신 오류: {httpEx.Message}");
                LogMessage("네트워크 연결을 확인해주세요.");
                throw; // 예외를 다시 발생시켜 호출자에게 전달
            }
            catch (TaskCanceledException)
            {
                LogMessage("네트워크 링크 확인 요청 시간 초과");
                LogMessage("네트워크 상태 확인이 지연되고 있습니다.");
                throw; // 예외를 다시 발생시켜 호출자에게 전달
            }
            catch (Exception ex)
            {
                LogMessage($"네트워크 링크 확인 오류: {ex.Message}");
                throw; // 예외를 다시 발생시켜 호출자에게 전달
            }
        }

        private void ParseAndDisplayNetworkLinkResult(string jsonResponse)
        {
            LogMessage("네트워크 링크 결과:");
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