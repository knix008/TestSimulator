using System.Net.Http;
using System.Text;
using VixReaderTest01.Utils;

namespace VixAirTest01.APIs
{
    public class RebootApi
    {
        private readonly TlsClient _tlsClient;
        private readonly TextBox _logTextBox;
        private readonly Func<string> _getIPAddress;

        public RebootApi(TlsClient tlsClient, TextBox logTextBox, Func<string> getIPAddress)
        {
            _tlsClient = tlsClient;
            _logTextBox = logTextBox;
            _getIPAddress = getIPAddress;
        }

        public async Task<bool> RebootDeviceAsync()
        {
            try
            {
                LogMessage("🔄 디바이스 리부트 시작...");
                LogMessage("⚠️  경고: 서버가 곧 리부트됩니다!");
                LogMessage("AT+REBOOT 명령을 전송합니다...");

                // AT+REBOOT 명령 전송
                string response = await _tlsClient.SendAtCommandAsync("AT+REBOOT");

                LogMessage($"서버 응답: {response}");

                // 응답 분석
                if (string.IsNullOrEmpty(response))
                {
                    LogMessage("❌ 서버로부터 응답을 받지 못했습니다.");
                    throw new InvalidOperationException("서버로부터 응답을 받지 못했습니다.");
                }

                // OK 또는 FAIL 응답 확인
                string normalizedResponse = response.Trim().ToUpper();
                
                if (normalizedResponse.Contains("OK"))
                {
                    LogMessage("✅ 리부트 명령 수신 성공!");
                    LogMessage("서버가 리부트 명령을 제대로 받았습니다.");
                    LogMessage("🔄 디바이스가 리부트 프로세스를 시작합니다...");
                    
                    // OK 응답 시에만 연결 해제
                    LogMessage("🔌 OK 응답 수신 완료. 연결을 해제합니다...");
                    await _tlsClient.DisconnectAsync();
                    
                    LogMessage("⏳ 약 30-60초 후 디바이스가 다시 온라인 상태가 됩니다.");
                    LogMessage("🔌 연결이 해제되었습니다. 리부트 완료 후 Connect 버튼을 클릭하여 다시 연결하세요.");
                    LogMessage("=".PadLeft(50, '='));
                    
                    return true; // 성공
                }
                else if (normalizedResponse.Contains("FAIL"))
                {
                    LogMessage("❌ 리부트 명령 수신 실패!");
                    LogMessage("서버가 FAIL을 응답했습니다.");
                    LogMessage("🔌 FAIL 응답이므로 연결을 유지합니다.");
                    
                    throw new InvalidOperationException("서버가 리부트 명령을 제대로 받지 못했습니다. 서버가 FAIL을 응답했습니다.");
                }
                else
                {
                    LogMessage("⚠️ 예상치 못한 응답!");
                    LogMessage("🔌 예상치 못한 응답이므로 연결을 유지합니다.");
                    
                    throw new InvalidOperationException($"예상치 못한 응답을 받았습니다: '{response}'. 'OK' 또는 'FAIL'을 기대했습니다.");
                }
            }
            catch (Exception ex)
            {
                LogMessage($"❌ 리부트 명령 실패: {ex.Message}");
                LogMessage("리부트 명령 전송 또는 응답 처리 중 오류가 발생했습니다.");
                
                // 예외 발생 시에는 연결을 유지 (FAIL이나 기타 오류의 경우)
                LogMessage("🔌 오류 발생으로 인해 연결을 유지합니다.");
                
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