using System.Net.Http;
using System.Text;
using VIXFaceTest.Utils;

namespace VIXFaceTest.APIs
{
    public class SelfTestApi
    {
        private readonly TlsClient _tlsClient;
        private readonly TextBox _logTextBox;
        private readonly Func<string> _getIPAddress;

        public SelfTestApi(TlsClient tlsClient, TextBox logTextBox, Func<string> getIPAddress)
        {
            _tlsClient = tlsClient;
            _logTextBox = logTextBox;
            _getIPAddress = getIPAddress;
        }

        public async Task<(bool isSuccess, string responseMessage)> RunSelfTestAsync()
        {
            try
            {
                Logger.LogMessage(_logTextBox, "자체 진단 테스트(BIST) 시작");
                Logger.LogMessage(_logTextBox, "AT+TEST=BIST 명령을 전송합니다...");

                // AT+TEST=BIST 명령 전송
                string response = await _tlsClient.SendAtCommandAsync("AT+TEST=BIST");

                Logger.LogMessage(_logTextBox, $"서버 응답: {response}");

                // 응답 분석
                if (string.IsNullOrEmpty(response))
                {
                    string errorMsg = "서버로부터 응답을 받지 못했습니다.";
                    Logger.LogMessage(_logTextBox, $"❌ {errorMsg}");
                    return (false, errorMsg);
                }

                // 응답 정리
                string cleanResponse = response.Trim();
                
                // OK 응답 확인
                if (cleanResponse.ToUpper().Contains("OK"))
                {
                    Logger.LogMessage(_logTextBox, "✅ 자체 진단 테스트(BIST) 성공!");
                    Logger.LogMessage(_logTextBox, "모든 하드웨어가 정상적으로 동작합니다.");
                    return (true, "자체 진단 테스트가 성공적으로 완료되었습니다.\n\n모든 하드웨어가 정상적으로 동작합니다.");
                }
                else
                {
                    // OK가 아닌 경우는 모두 오류 메시지로 처리
                    Logger.LogMessage(_logTextBox, "❌ 자체 진단 테스트(BIST) 실패!");
                    Logger.LogMessage(_logTextBox, $"오류 내용: {cleanResponse}");
                    
                    // 오류 메시지가 너무 길면 요약
                    string displayMessage = cleanResponse.Length > 200 ? 
                        cleanResponse.Substring(0, 200) + "..." : 
                        cleanResponse;
                    
                    return (false, $"자체 진단 테스트에서 오류가 발견되었습니다.\n\n오류 내용:\n{displayMessage}");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(_logTextBox, $"자체 진단 테스트 실패: {ex.Message}");
                return (false, $"자체 진단 테스트 중 예외가 발생했습니다.\n\n오류: {ex.Message}");
            }
        }
    }
}