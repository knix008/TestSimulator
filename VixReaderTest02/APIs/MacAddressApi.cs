using System.Net;
using VixReaderTest01.Utils;

namespace VixAirTest01.APIs
{
    public class MacAddressApi
    {
        private readonly TlsClient _tlsClient;
        private readonly TextBox _logTextBox;
        private readonly Func<string> _getIPAddress;

        public MacAddressApi(TlsClient tlsClient, TextBox logTextBox, Func<string> getIPAddress)
        {
            _tlsClient = tlsClient;
            _logTextBox = logTextBox;
            _getIPAddress = getIPAddress;
        }

        public async Task GetMacAddressInfoAsync()
        {
            try
            {
                string path = "/api/v1/test/getmacaddress";
                LogMessage($"MAC 주소 정보 요청: {path}");

                string jsonResponse = await _tlsClient.SendAtCommandAsync($"POST {path}");
                
                LogMessage("MAC 주소 정보 수신 완료");
                LogMessage("=== 응답 데이터 (MAC 주소) ===");
                LogMessage(jsonResponse);
                
                ParseAndDisplayMacInfo(jsonResponse);
            }
            catch (Exception ex)
            {
                LogMessage($"MAC 주소 요청 실패: {ex.Message}");
                throw;
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