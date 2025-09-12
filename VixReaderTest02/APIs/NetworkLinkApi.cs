using System.Net.Http;
using System.Text;
using VixReaderTest01.Utils;

namespace VixAirTest01.APIs
{
    public class NetworkLinkApi
    {
        private readonly TlsClient _tlsClient;
        private readonly TextBox _logTextBox;
        private readonly Func<string> _getIPAddress;

        public NetworkLinkApi(TlsClient tlsClient, TextBox logTextBox, Func<string> getIPAddress)
        {
            _tlsClient = tlsClient;
            _logTextBox = logTextBox;
            _getIPAddress = getIPAddress;
        }

        public async Task<bool> RunNetworkLinkTestAsync()
        {
            try
            {
                Logger.LogMessage(_logTextBox, "네트워크 링크 테스트 시작");
                Logger.LogMessage(_logTextBox, "AT+TEST=NETWORK 명령을 전송합니다...");

                // AT+TEST=NETWORK 명령 전송
                string response = await _tlsClient.SendAtCommandAsync("AT+TEST=NETWORK");

                Logger.LogMessage(_logTextBox, $"서버 응답: {response}");

                // 응답 분석
                if (string.IsNullOrEmpty(response))
                {
                    Logger.LogMessage(_logTextBox, "❌ 서버로부터 응답을 받지 못했습니다.");
                    throw new InvalidOperationException("서버로부터 응답을 받지 못했습니다.");
                }

                // UP 또는 DOWN 응답 확인
                string normalizedResponse = response.Trim().ToUpper();
                
                if (normalizedResponse.Contains("UP"))
                {
                    Logger.LogMessage(_logTextBox, "✅ 네트워크 링크 테스트 성공!");
                    Logger.LogMessage(_logTextBox, "🌐 네트워크 연결이 정상적으로 동작합니다.");
                    Logger.LogMessage(_logTextBox, "💡 네트워크 상태: UP (활성화)");
                    return true;
                }
                else if (normalizedResponse.Contains("DOWN"))
                {
                    Logger.LogMessage(_logTextBox, "❌ 네트워크 링크 테스트 실패!");
                    Logger.LogMessage(_logTextBox, "🚫 네트워크 연결에 문제가 있습니다.");
                    Logger.LogMessage(_logTextBox, "💡 네트워크 상태: DOWN (비활성화)");
                    return false;
                }
                else
                {
                    Logger.LogMessage(_logTextBox, "⚠️ 예상치 못한 응답!");
                    Logger.LogMessage(_logTextBox, $"💡 수신된 응답: '{normalizedResponse}'");
                    Logger.LogMessage(_logTextBox, "💡 예상 응답: UP 또는 DOWN");
                    throw new InvalidOperationException($"예상치 못한 응답을 받았습니다: '{response}'. 'UP' 또는 'DOWN'을 기대했습니다.");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(_logTextBox, $"네트워크 링크 테스트 실패: {ex.Message}");
                throw;
            }
        }
    }
}