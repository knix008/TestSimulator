using VIXFaceTest.Utils;

namespace VIXFaceTest
{
    public partial class Main
    {
        private async void NetworkTest_Click(object sender, EventArgs e)
        {
            try
            {
                Logger.LogMessage(LogTextBox, "네트워크 링크 테스트 시작...");

                // API 호출 및 서버 응답 받기
                var (testResult, serverResponse) = await _networkLinkApi.RunNetworkLinkTestWithResponseAsync();

                if (testResult)
                {
                    // 실제 서버 응답 ("UP") 그대로 저장
                    await SaveTestResult("NETWORK", "PASS", serverResponse, "");
                    UpdateTestResultButton(true);
                    Logger.LogMessage(LogTextBox, "네트워크 링크 테스트 성공적으로 완료됨");
                }
                else
                {
                    // 실제 서버 응답 ("DOWN") 그대로 저장
                    await SaveTestResult("NETWORK", "FAIL", serverResponse, "네트워크 상태가 DOWN입니다.");
                    UpdateTestResultButton(false);
                    Logger.LogMessage(LogTextBox, "네트워크 링크 테스트 실패");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"네트워크 링크 테스트 오류: {ex.Message}");
                
                if (IsTlsError(ex.Message))
                    HandleTlsConnectionError("NETWORK", ex.Message);
                else
                    await SaveTestResult("NETWORK", "FAIL", "", ex.Message);
                UpdateTestResultButton(false);
            }
        }
    }
}