using System.Net.Http;
using System.Text;
using VixReaderTest01.Utils;

namespace VixAirTest01.APIs
{
    public class FirmwareApi
    {
        private readonly TlsClient _tlsClient;
        private readonly TextBox _logTextBox;
        private readonly Func<string> _getIPAddress;

        public FirmwareApi(TlsClient tlsClient, TextBox logTextBox, Func<string> getIPAddress)
        {
            _tlsClient = tlsClient;
            _logTextBox = logTextBox;
            _getIPAddress = getIPAddress;
        }

        public async Task GetFirmwareVersionAsync()
        {
            try
            {
                LogMessage("🔍 펌웨어 버전 조회 시작...");
                LogMessage("AT+VER? 명령을 전송합니다...");

                // AT+VER? 명령 전송
                string response = await _tlsClient.SendAtCommandAsync("AT+VER?");

                LogMessage($"서버 응답: {response}");

                // 응답 분석
                if (string.IsNullOrEmpty(response))
                {
                    LogMessage("❌ 서버로부터 응답을 받지 못했습니다.");
                    throw new InvalidOperationException("서버로부터 응답을 받지 못했습니다.");
                }

                string normalizedResponse = response.Trim().ToUpper();
                
                if (normalizedResponse.Contains("FAIL"))
                {
                    LogMessage("❌ 펌웨어 버전 조회 실패!");
                    LogMessage("서버가 FAIL을 응답했습니다.");
                    
                    throw new InvalidOperationException("서버가 펌웨어 버전 조회 요청을 처리하지 못했습니다.");
                }
                else
                {
                    LogMessage("✅ 펌웨어 버전 조회 성공!");
                    LogMessage("버전 번호를 받았습니다.");
                    
                    // 원본 응답 표시
                    LogMessage("=== 펌웨어 버전 정보 ===");
                    ParseAndDisplayFirmwareVersion(response);
                }
            }
            catch (InvalidOperationException tlsEx)
            {
                LogMessage($"❌ TLS 통신 오류: {tlsEx.Message}");
                LogMessage("장치 연결을 확인하세요.");
                throw;
            }
            catch (Exception ex)
            {
                LogMessage($"❌ 펌웨어 버전 조회 오류: {ex.Message}");
                throw;
            }
        }

        private void ParseAndDisplayFirmwareVersion(string response)
        {
            LogMessage($"펌웨어 버전: {response}");
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