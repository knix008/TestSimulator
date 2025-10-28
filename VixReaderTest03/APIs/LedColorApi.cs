using System.Text;
using VixReaderTest01.Utils;

namespace VixAirTest01.APIs
{
    public class LedColorApi
    {
        private readonly TlsClient _tlsClient;
        private readonly TextBox _logTextBox;
        private readonly Func<string> _getIPAddress;

        public LedColorApi(TlsClient tlsClient, TextBox logTextBox, Func<string> getIPAddress)
        {
            _tlsClient = tlsClient;
            _logTextBox = logTextBox;
            _getIPAddress = getIPAddress;
        }

        public async Task<string> SendLedColorOnAsync(string? colorList = null)
        {
            try
            {
                LogMessage("LED 색상 ON 명령 전송 시작...");
                string command = "AT+TEST=LEDCOLORON";
                if (!string.IsNullOrWhiteSpace(colorList))
                    command = $"{command}:{colorList}";

                LogMessage($"전송 명령: {command}");
                string response = await _tlsClient.SendAtCommandAsync(command);
                LogMessage($"서버 응답: {response}");
                return response ?? string.Empty;
            }
            catch (Exception ex)
            {
                LogMessage($"LED 색상 ON 전송 실패: {ex.Message}");
                throw;
            }
        }

        public async Task<string> SendLedColorOffAsync()
        {
            try
            {
                LogMessage("LED 색상 OFF 명령 전송 시작...");
                string command = "AT+TEST=LEDCOLOROFF";
                LogMessage($"전송 명령: {command}");
                string response = await _tlsClient.SendAtCommandAsync(command);
                LogMessage($"서버 응답: {response}");
                return response ?? string.Empty;
            }
            catch (Exception ex)
            {
                LogMessage($"LED 색상 OFF 전송 실패: {ex.Message}");
                throw;
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