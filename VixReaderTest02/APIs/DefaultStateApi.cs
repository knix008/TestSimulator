using System.Net.Http;
using System.Text;
using VixReaderTest01.Utils;

namespace VixAirTest01.APIs
{
    public class DefaultStateApi
    {
        private readonly TlsClient _tlsClient;
        private readonly TextBox _logTextBox;
        private readonly Func<string> _getIPAddress;

        public DefaultStateApi(TlsClient tlsClient, TextBox logTextBox, Func<string> getIPAddress)
        {
            _tlsClient = tlsClient;
            _logTextBox = logTextBox;
            _getIPAddress = getIPAddress;
        }

        public async Task<bool> SetDefaultStateAsync()
        {
            try
            {
                Logger.LogMessage(_logTextBox, "기본 상태 설정 시작");
                Logger.LogMessage(_logTextBox, "AT+TEST=DEFBUTTON 명령을 전송합니다...");

                string response = await _tlsClient.SendAtCommandAsync("AT+TEST=DEFBUTTON");
                
                Logger.LogMessage(_logTextBox, $"서버 응답: {response}");
                
                return ParseAndDisplayDefaultStateResult(response);
            }
            catch (Exception ex)
            {
                Logger.LogMessage(_logTextBox, $"기본 상태 설정 실패: {ex.Message}");
                throw;
            }
        }

        private bool ParseAndDisplayDefaultStateResult(string response)
        {
            Logger.LogMessage(_logTextBox, "기본 상태 설정 결과:");
            
            // 응답에서 불필요한 공백과 줄바꿈 제거
            string cleanResponse = response?.Trim().ToUpper() ?? string.Empty;
            
            if (string.IsNullOrEmpty(cleanResponse))
            {
                Logger.LogMessage(_logTextBox, "❌ 응답을 받지 못했습니다.");
                return false;
            }

            // OK 또는 FAIL 응답 처리
            if (cleanResponse.Contains("OK"))
            {
                Logger.LogMessage(_logTextBox, "✅ 기본 상태 설정 성공 (OK)");
                Logger.LogMessage(_logTextBox, "💡 시스템이 성공적으로 기본 상태로 설정되었습니다.");
                return true;
            }
            else if (cleanResponse.Contains("FAIL"))
            {
                Logger.LogMessage(_logTextBox, "❌ 기본 상태 설정 실패 (FAIL)");
                Logger.LogMessage(_logTextBox, "💡 시스템을 기본 상태로 설정하는데 실패했습니다.");
                return false;
            }
            else
            {
                Logger.LogMessage(_logTextBox, $"⚠️ 예상치 못한 응답: {cleanResponse}");
                Logger.LogMessage(_logTextBox, "💡 예상 응답: OK 또는 FAIL");
                return false;
            }
        }
    }
}