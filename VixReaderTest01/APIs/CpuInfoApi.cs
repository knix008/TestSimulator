using System.Net.Http;
using System.Net.Security;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;

namespace VixAirTest01.APIs
{
    public class CpuInfoApi
    {
        private readonly HttpClient _httpClient;
        private readonly TextBox _logTextBox;
        private const string DEVICE_BASE_URL = "https://localhost:8443";

        public CpuInfoApi(HttpClient httpClient, TextBox logTextBox)
        {
            _httpClient = httpClient;
            _logTextBox = logTextBox;
        }

        public async Task GetCpuInfoAsync()
        {
            try
            {
                string endpoint = $"{DEVICE_BASE_URL}/api/v1/system/cpuinfo";
                LogMessage($"CPU 정보 요청: {endpoint}");

                HttpResponseMessage response = await _httpClient.GetAsync(endpoint);
                
                if (response.IsSuccessStatusCode)
                {
                    string jsonResponse = await response.Content.ReadAsStringAsync();
                    LogMessage("CPU 정보 수신 완료");
                    
                    // 실제 JSON 데이터 표시
                    LogMessage("=== 서버 응답 (CPU 정보) ===");
                    LogMessage(jsonResponse);
                    
                    ParseAndDisplayCpuInfo(jsonResponse);
                }
                else
                {
                    LogMessage($"CPU 정보 요청 실패: {response.ReasonPhrase}");
                }
            }
            catch (HttpRequestException httpEx)
            {
                LogMessage($"HTTP 통신 오류: {httpEx.Message}");
                LogMessage("장치 연결을 확인해주세요.");
            }
            catch (TaskCanceledException)
            {
                LogMessage("요청 시간 초과");
            }
            catch (Exception ex)
            {
                LogMessage($"CPU 정보 요청 오류: {ex.Message}");
            }
        }

        private void ParseAndDisplayCpuInfo(string jsonResponse)
        {
            LogMessage("파싱된 CPU 정보:");
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