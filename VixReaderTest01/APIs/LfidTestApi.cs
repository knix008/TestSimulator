using System.Net.Http;
using System.Text;

namespace VixAirTest01.APIs
{
    public class LfidTestApi
    {
        private readonly HttpClient _httpClient;
        private readonly TextBox _logTextBox;
        private readonly Func<string> _getIPAddress;

        public LfidTestApi(HttpClient httpClient, TextBox logTextBox, Func<string> getIPAddress)
        {
            _httpClient = httpClient;
            _logTextBox = logTextBox;
            _getIPAddress = getIPAddress;
        }

        public async Task RunLfidTestAsync()
        {
            try
            {
                string endpoint = $"https://{_getIPAddress()}:8443/api/v1/test/lfidtest";
                LogMessage($"LFID 테스트 실행 요청: {endpoint}");
                LogMessage("LFID(Low Frequency ID) 테스트를 시작합니다...");

                HttpResponseMessage response = await _httpClient.PostAsync(endpoint, null);
                
                if (response.IsSuccessStatusCode)
                {
                    string jsonResponse = await response.Content.ReadAsStringAsync();
                    LogMessage("LFID 테스트 실행 완료");
                    
                    LogMessage("=== 서버 응답 (LFID 테스트) ===");
                    LogMessage(jsonResponse);
                    
                    ParseAndDisplayLfidTestResult(jsonResponse);
                }
                else
                {
                    LogMessage($"LFID 테스트 실행 실패: {response.ReasonPhrase}");
                    string errorContent = await response.Content.ReadAsStringAsync();
                    if (!string.IsNullOrEmpty(errorContent))
                    {
                        LogMessage($"오류 상세: {errorContent}");
                    }
                    
                    // HTTP 응답 실패 시 예외 발생
                    throw new HttpRequestException($"LFID 테스트 HTTP 오류: {response.StatusCode} - {response.ReasonPhrase}");
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
                LogMessage("LFID 테스트 요청 시간 초과");
                LogMessage("LFID 테스트가 완료되는데 시간이 걸릴 수 있습니다.");
                throw; // 예외를 다시 발생시켜 호출자에게 전달
            }
            catch (Exception ex)
            {
                LogMessage($"LFID 테스트 실행 오류: {ex.Message}");
                throw; // 예외를 다시 발생시켜 호출자에게 전달
            }
        }

        private void ParseAndDisplayLfidTestResult(string jsonResponse)
        {
            LogMessage("LFID 테스트 결과:");
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