using System.Net.Http;
using System.Text;
using VIXFaceTest.Utils;

namespace VIXFaceTest.APIs
{
    public class DoorLockTestApi
    {
        private readonly TlsClient _tlsClient;
        private readonly TextBox _logTextBox;
        private readonly Func<string> _getIPAddress;

        public DoorLockTestApi(TlsClient tlsClient, TextBox logTextBox, Func<string> getIPAddress)
        {
            _tlsClient = tlsClient;
            _logTextBox = logTextBox;
            _getIPAddress = getIPAddress;
        }

        public async Task<bool> RunDoorLockTestAsync()
        {
            try
            {
                Logger.LogMessage(_logTextBox, "도어락 테스트 시작");
                Logger.LogMessage(_logTextBox, "AT+TEST=LOCK 명령을 전송합니다...");

                // AT+TEST=LOCK 명령 전송
                string response = await _tlsClient.SendAtCommandAsync("AT+TEST=LOCK");

                Logger.LogMessage(_logTextBox, $"서버 응답: {response}");

                // 응답 분석
                if (string.IsNullOrEmpty(response))
                {
                    Logger.LogMessage(_logTextBox, "❌ 서버로부터 응답을 받지 못했습니다.");
                    throw new InvalidOperationException("서버로부터 응답을 받지 못했습니다.");
                }

                // OK 또는 FAIL 응답 확인
                string normalizedResponse = response.Trim().ToUpper();
                
                if (normalizedResponse.Contains("OK"))
                {
                    Logger.LogMessage(_logTextBox, "✅ 도어락 테스트 성공!");
                    Logger.LogMessage(_logTextBox, "도어락이 정상적으로 동작합니다.");
                    return true;
                }
                else if (normalizedResponse.Contains("FAIL"))
                {
                    Logger.LogMessage(_logTextBox, "❌ 도어락 테스트 실패!");
                    Logger.LogMessage(_logTextBox, "도어락 동작에 문제가 있습니다.");
                    return false;
                }
                else
                {
                    Logger.LogMessage(_logTextBox, "⚠️ 예상치 못한 응답!");
                    throw new InvalidOperationException($"예상치 못한 응답을 받았습니다: '{response}'. 'OK' 또는 'FAIL'을 기대했습니다.");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(_logTextBox, $"도어락 테스트 실패: {ex.Message}");
                throw;
            }
        }
    }
}