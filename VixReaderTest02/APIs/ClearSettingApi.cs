using System.Net.Http;
using System.Text;
using VixReaderTest01.Utils;

namespace VixAirTest01.APIs
{
    public class ClearSettingApi
    {
        private readonly TlsClient _tlsClient;
        private readonly TextBox _logTextBox;
        private readonly Func<string> _getIPAddress;

        public ClearSettingApi(TlsClient tlsClient, TextBox logTextBox, Func<string> getIPAddress)
        {
            _tlsClient = tlsClient;
            _logTextBox = logTextBox;
            _getIPAddress = getIPAddress;
        }

        public async Task ClearAllSettingsAsync()
        {
            try
            {
                LogMessage("설정 초기화 시작...");
                LogMessage("AT+CLEAR 명령을 전송합니다...");

                // AT+CLEAR 명령 전송
                string response = await _tlsClient.SendAtCommandAsync("AT+CLEAR");

                LogMessage($"서버 응답: {response}");

                // 응답 분석
                if (string.IsNullOrEmpty(response))
                {
                    throw new InvalidOperationException("서버로부터 응답을 받지 못했습니다.");
                }

                // OK 또는 FAIL 응답 확인
                string normalizedResponse = response.Trim().ToUpper();
                
                if (normalizedResponse.Contains("OK"))
                {
                    LogMessage("✅ 설정 초기화 성공!");
                    LogMessage("모든 설정이 성공적으로 초기화되었습니다.");
                }
                else if (normalizedResponse.Contains("FAIL"))
                {
                    LogMessage("❌ 설정 초기화 실패!");
                    throw new InvalidOperationException("설정 초기화에 실패했습니다. 서버가 FAIL을 응답했습니다.");
                }
                else
                {
                    LogMessage("⚠️ 예상치 못한 응답!");
                    throw new InvalidOperationException($"예상치 못한 응답을 받았습니다: '{response}'. 'OK' 또는 'FAIL'을 기대했습니다.");
                }

                LogMessage("설정 초기화 완료");
            }
            catch (Exception ex)
            {
                LogMessage($"설정 초기화 실패: {ex.Message}");
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