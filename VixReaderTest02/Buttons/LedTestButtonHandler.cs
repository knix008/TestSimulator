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

                bool testResult = await _ledTestApi.RunLedTestAsync();

                if (testResult)
                {
                    await SaveTestResult("LED Test", "Hardware Test", "PASS", "LED 테스트 완료");
                    UpdateTestResultButton(true);
                    Logger.LogMessage(LogTextBox, "LED 테스트 성공적으로 완료됨");
                }
                else
                {
                    await SaveTestResult("LED Test", "Hardware Test", "FAIL", "LED 테스트 실패", "서버가 FAIL을 응답했습니다.");
                    UpdateTestResultButton(false);
                    Logger.LogMessage(LogTextBox, "LED 테스트 실패");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"LED 테스트 오류: {ex.Message}");

                if (IsTlsError(ex.Message))
                {
                    await HandleOpenSslConnectionError("LED Test", "Hardware Test", ex.Message);
                }
                else
                {
                    await SaveTestResult("LED Test", "Hardware Test", "FAIL", "LED 테스트 실패", ex.Message);
                }

                UpdateTestResultButton(false);
            }
        }
    }
}