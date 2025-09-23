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

        public async Task<string> GetMacAddressInfoAsync()
        {
            try
            {
                LogMessage("AT+MAC? 명령 전송");
                string response = await _tlsClient.SendAtCommandAsync("AT+MAC?");

                if (!string.IsNullOrWhiteSpace(response) && !response.Trim().Equals("FAIL", StringComparison.OrdinalIgnoreCase))
                {
                    LogMessage("MAC 주소 수신 완료");
                    LogMessage("=== 응답 데이터 (MAC 주소) ===");
                    LogMessage(response.Trim());
                    LogMessage("==========================================");
                    return response.Trim();
                }
                else
                {
                    LogMessage("MAC 주소 조회 실패(Fail 응답)");
                    return "FAIL";
                }
            }
            catch (Exception ex)
            {
                LogMessage($"MAC 주소 요청 실패: {ex.Message}");
                return "FAIL";
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