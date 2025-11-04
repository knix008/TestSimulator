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

        public static string GetLedColorCommand(bool isRed, bool isGreen, bool isBlue)
        {
            if (!isRed && !isGreen && !isBlue)
                return "AT+TEST=LED_BLACK";
            if (isRed && !isGreen && !isBlue)
                return "AT+TEST=LED_RED";
            if (isRed && isGreen && !isBlue)
                return "AT+TEST=LED_YELLOW";
            if (!isRed && isGreen && !isBlue)
                return "AT+TEST=LED_GREEN";
            if (!isRed && isGreen && isBlue)
                return "AT+TEST=LED_CYAN";
            if (!isRed && !isGreen && isBlue)
                return "AT+TEST=LED_BLUE";
            if (isRed && !isGreen && isBlue)
                return "AT+TEST=LED_MAGENTA";
            if (isRed && isGreen && isBlue)
                return "AT+TEST=LED_WHITE";
            return "AT+TEST=LED_BLACK";
        }

        // 새로운 LED 색상 명령 전송 메서드
        public async Task<string> SendLedColorAsync(bool isRed, bool isGreen, bool isBlue)
        {
            try
            {
                string command = GetLedColorCommand(isRed, isGreen, isBlue);
                LogMessage($"LED 색상 명령 전송: {command}");
                string response = await _tlsClient.SendAtCommandAsync(command);
                LogMessage($"서버 응답: {response}");
                return response ?? string.Empty;
            }
            catch (Exception ex)
            {
                LogMessage($"LED 색상 명령 전송 실패: {ex.Message}");
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