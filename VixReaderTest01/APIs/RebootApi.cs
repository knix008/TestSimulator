using System.Net.Http;
using System.Text;

namespace VixAirTest01.APIs
{
    public class RebootApi
    {
        private readonly HttpClient _httpClient;
        private readonly TextBox _logTextBox;
        private readonly Func<string> _getIPAddress;

        public RebootApi(HttpClient httpClient, TextBox logTextBox, Func<string> getIPAddress)
        {
            _httpClient = httpClient;
            _logTextBox = logTextBox;
            _getIPAddress = getIPAddress;
        }

        public async Task RebootDeviceAsync()
        {
            try
            {
                string endpoint = $"https://{_getIPAddress()}:8443/api/v1/test/reboot";
                LogMessage($"시스템 재부팅 요청: {endpoint}");
                LogMessage("경고: 장치를 재부팅합니다. 잠시 후 연결이 끊어질 수 있습니다.");

                HttpResponseMessage response = await _httpClient.PostAsync(endpoint, null);
                
                if (response.IsSuccessStatusCode)
                {
                    string jsonResponse = await response.Content.ReadAsStringAsync();
                    LogMessage("시스템 재부팅 명령 전송 완료");
                    
                    // 원본 JSON 데이터 표시
                    LogMessage("=== 서버 응답 (시스템 재부팅) ===");
                    LogMessage(jsonResponse);
                    
                    ParseAndDisplayRebootResult(jsonResponse);
                    
                    LogMessage("장치 재부팅이 시작되었습니다. 약 30-60초 후 장치가 다시 온라인 상태가 됩니다.");
                }
                else
                {
                    LogMessage($"시스템 재부팅 요청 실패: {response.ReasonPhrase}");
                    string errorContent = await response.Content.ReadAsStringAsync();
                    if (!string.IsNullOrEmpty(errorContent))
                    {
                        LogMessage($"오류 상세: {errorContent}");
                    }
                    
                    // HTTP 응답 실패 시 예외 발생
                    throw new HttpRequestException($"시스템 재부팅 HTTP 오류: {response.StatusCode} - {response.ReasonPhrase}");
                }
            }
            catch (HttpRequestException httpEx)
            {
                LogMessage($"HTTP 통신 오류: {httpEx.Message}");
                LogMessage("장치 연결을 확인해주세요.");
                LogMessage("재부팅 과정에서 연결이 일시적으로 끊길 수도 있습니다.");
                throw; // 예외를 다시 발생시켜 호출자에게 전달
            }
            catch (TaskCanceledException)
            {
                LogMessage("요청 시간 초과");
                LogMessage("장치가 재부팅 중일 수도 있습니다.");
                throw; // 예외를 다시 발생시켜 호출자에게 전달
            }
            catch (Exception ex)
            {
                LogMessage($"시스템 재부팅 요청 오류: {ex.Message}");
                throw; // 예외를 다시 발생시켜 호출자에게 전달
            }
        }

        private void ParseAndDisplayRebootResult(string jsonResponse)
        {
            LogMessage("시스템 재부팅 결과:");
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