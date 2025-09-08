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
        private readonly Func<string> _getIPAddress;

        public MacAddressApi(HttpClient httpClient, TextBox logTextBox, Func<string> getIPAddress)
        {
            _httpClient = httpClient;
            _logTextBox = logTextBox;
            _getIPAddress = getIPAddress;
        }

        public async Task GetMacAddressInfoAsync()
        {
            try
            {
                string endpoint = $"https://{_getIPAddress()}:8443/api/v1/test/getmacaddress";
                LogMessage($"MAC 주소 정보 요청: {endpoint}");

                HttpResponseMessage response = await _httpClient.GetAsync(endpoint);
                
                if (response.IsSuccessStatusCode)
                {
                    string jsonResponse = await response.Content.ReadAsStringAsync();
                    LogMessage("MAC 주소 정보 수신 완료");
                    
                    LogMessage("=== 서버 응답 (MAC 주소) ===");
                    LogMessage(jsonResponse);
                    
                    ParseAndDisplayMacInfo(jsonResponse);
                }
                else
                {
                    LogMessage($"MAC 주소 요청 실패: {response.ReasonPhrase}");
                    string errorContent = await response.Content.ReadAsStringAsync();
                    if (!string.IsNullOrEmpty(errorContent))
                    {
                        LogMessage($"오류 상세: {errorContent}");
                    }
                    
                    // HTTP 응답 실패 시 예외 발생
                    throw new HttpRequestException($"MAC 주소 HTTP 오류: {response.StatusCode} - {response.ReasonPhrase}");
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
                LogMessage($"MAC 주소 요청 오류: {ex.Message}");
                throw; // 예외를 다시 발생시켜 호출자에게 전달
            }
        }

        private string ParseAndDisplayMacInfo(string jsonResponse)
        {
            LogMessage("파싱된 MAC 주소 정보:");
            LogMessage(jsonResponse);
            LogMessage("==========================================");
            
            try
            {
                return jsonResponse; // 임시로 전체 응답 반환
            }
            catch
            {
                return "";
            }
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