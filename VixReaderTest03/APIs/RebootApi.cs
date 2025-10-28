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
                string ipAddress = _getIPAddress();
                LogMessage($"🔄 디바이스 리부트 요청 - 대상: {ipAddress}");
                LogMessage("⚠️  경고: 서버가 곧 리부트됩니다!");
                LogMessage("AT+REBOOT 명령을 전송합니다...");

                // AT+REBOOT 명령 전송
                string response = await _tlsClient.SendAtCommandAsync("AT+REBOOT");
                
                // 응답 내용에 따라 결과 처리
                bool isSuccess = !string.IsNullOrEmpty(response) && 
                                (response.Contains("OK") || response.Contains("REBOOTING") || response.Contains("200"));

                if (isSuccess)
                {
                    LogMessage($"✅ 리부트 명령 성공: {response.Trim()}");
                    LogMessage("서버가 리부트 명령을 제대로 받았습니다.");
                    LogMessage("🔄 디바이스가 리부트 프로세스를 시작합니다...");
                    
                    // 리부트 성공 시 TLS 클라이언트의 연결 상태를 명시적으로 끊어줌
                    LogMessage("🔌 리부트 성공으로 연결을 해제합니다...");
                    await _tlsClient.DisconnectAsync();
                    
                    LogMessage("⏳ 약 30-60초 후 디바이스가 다시 온라인 상태가 됩니다.");
                    LogMessage("🔌 연결이 해제되었습니다. 리부트 완료 후 Connect 버튼을 클릭하여 다시 연결하세요.");
                    LogMessage("=".PadLeft(50, '='));
                    
                    return true; // 성공
                }
                else
                {
                    LogMessage($"❌ 리부트 명령 실패: {response.Trim()}");
                    return false;
                }
            }
            catch (Exception ex)
            {
                LogMessage($"❌ 리부트 명령 오류: {ex.Message}");
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