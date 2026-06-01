using VIXFaceTest.Utils;

namespace VIXFaceTest.APIs
{
    public class WiegandTestApi
    {
        private readonly TlsClient _tlsClient;
        private readonly TextBox _logTextBox;

        public WiegandTestApi(TlsClient tlsClient, TextBox logTextBox, Func<string> getIPAddress)
        {
            _tlsClient = tlsClient;
            _logTextBox = logTextBox;
        }

        public async Task<bool> RunWiegandTestAsync()
        {
            Logger.LogMessage(_logTextBox, "Wiegand 테스트 시작 (AT+TEST=WIEGAND)");
            string response = await _tlsClient.SendAtCommandAsync("AT+TEST=WIEGAND");
            Logger.LogMessage(_logTextBox, $"서버 응답: {response}");

            if (string.IsNullOrEmpty(response))
            {
                throw new InvalidOperationException("서버로부터 응답을 받지 못했습니다.");
            }

            if (response.Trim().ToUpper().Contains("OK"))
            {
                Logger.LogMessage(_logTextBox, "✅ Wiegand 테스트 성공");
                return true;
            }

            if (response.Trim().ToUpper().Contains("FAIL"))
            {
                Logger.LogMessage(_logTextBox, "❌ Wiegand 테스트 실패");
                return false;
            }

            throw new InvalidOperationException($"예상치 못한 응답: '{response}'");
        }
    }
}
