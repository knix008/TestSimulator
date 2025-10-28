using VixReaderTest01.Utils;

namespace VixReaderTest01
{
    public partial class Main
    {
        private async void LedTest_Click(object sender, EventArgs e)
        {
            try
            {
                Logger.LogMessage(LogTextBox, "LED 테스트 시작...");

                // 기존: var (testResult, serverResponse) = await _ledTestApi.RunLedTestWithResponseAsync();
                // LedTestApi에 RunLedTestWithResponseAsync가 없으므로, RunLedTestAsync만 사용
                bool testResult = await _ledTestApi.RunLedTestAsync();
                string serverResponse = ""; // 서버 응답이 필요하다면 LedTestApi에 해당 기능 추가 필요

                if (testResult)
                {
                    await SaveTestResult("LED Test", "PASS", serverResponse);
                    UpdateTestResultButton(true);
                    Logger.LogMessage(LogTextBox, "LED 테스트 성공적으로 완료됨");
                }
                else
                {
                    await SaveTestResult("LED Test", "FAIL", serverResponse);
                    UpdateTestResultButton(false);
                    Logger.LogMessage(LogTextBox, "LED 테스트 실패");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"LED 테스트 오류: {ex.Message}");

                if (IsTlsError(ex.Message))
                {
                    HandleTlsConnectionError("LED Test", ex.Message);
                }
                else
                {
                    await SaveTestResult("LED Test", "FAIL", "", ex.Message);
                }

                UpdateTestResultButton(false);
            }
        }
    }
}