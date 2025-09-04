using System.Net.Http;
using System.Net.Security;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using System.Text;

namespace VixAirTest01.APIs
{
    public class SerialNumberApi
    {
        private readonly HttpClient _httpClient;
        private readonly TextBox _logTextBox;
        private const string DEVICE_BASE_URL = "https://localhost:8443";

        public SerialNumberApi(HttpClient httpClient, TextBox logTextBox)
        {
            _httpClient = httpClient;
            _logTextBox = logTextBox;
        }

        public async Task GetSerialNumberAsync()
        {
            try
            {
                string endpoint = $"{DEVICE_BASE_URL}/api/v1/system/getserialnumber";
                LogMessage($"시리얼 번호 조회 요청: {endpoint}");

                HttpResponseMessage response = await _httpClient.GetAsync(endpoint);
                
                if (response.IsSuccessStatusCode)
                {
                    string jsonResponse = await response.Content.ReadAsStringAsync();
                    LogMessage("시리얼 번호 정보 수신 완료");
                    
                    // 실제 JSON 데이터 표시
                    LogMessage("=== 서버 응답 (시리얼 번호) ===");
                    LogMessage(jsonResponse);
                    
                    ParseAndDisplaySerialNumber(jsonResponse);
                }
                else
                {
                    LogMessage($"시리얼 번호 조회 실패: {response.ReasonPhrase}");
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
                LogMessage($"시리얼 번호 조회 오류: {ex.Message}");
            }
        }

        public async Task SetSerialNumberAsync(string serialNumber)
        {
            try
            {
                string endpoint = $"{DEVICE_BASE_URL}/api/v1/system/setserialnumber";
                LogMessage($"시리얼 번호 설정 요청: {endpoint}");
                LogMessage($"설정할 시리얼 번호: {serialNumber}");

                // JSON 페이로드 생성
                var payload = new { serial_number = serialNumber };
                string jsonPayload = System.Text.Json.JsonSerializer.Serialize(payload);
                
                var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");
                
                HttpResponseMessage response = await _httpClient.PutAsync(endpoint, content);
                
                if (response.IsSuccessStatusCode)
                {
                    string jsonResponse = await response.Content.ReadAsStringAsync();
                    LogMessage("시리얼 번호 설정 완료");
                    
                    // 실제 JSON 데이터 표시
                    LogMessage("=== 서버 응답 (시리얼 번호 설정) ===");
                    LogMessage(jsonResponse);
                    
                    ParseAndDisplaySetResult(jsonResponse);
                }
                else
                {
                    LogMessage($"시리얼 번호 설정 실패: {response.ReasonPhrase}");
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
                LogMessage($"시리얼 번호 설정 오류: {ex.Message}");
            }
        }

        private void ParseAndDisplaySerialNumber(string jsonResponse)
        {
            LogMessage("파싱된 시리얼 번호 정보:");
            LogMessage(jsonResponse);
            LogMessage("==========================================");
        }

        private void ParseAndDisplaySetResult(string jsonResponse)
        {
            LogMessage("시리얼 번호 설정 결과:");
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