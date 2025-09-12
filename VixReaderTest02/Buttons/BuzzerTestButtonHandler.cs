using VixReaderTest01.Utils;

namespace VixReaderTest01
{
    public partial class Main
    {
        private async void BuzzerTest_Click(object sender, EventArgs e)
        {
            try
            {
                Logger.LogMessage(LogTextBox, "부저 테스트 시작...");

                bool testResult = await _buzzerTestApi.RunBuzzerTestAsync();

                if (testResult)
                {
                    await SaveTestResult("Buzzer", "Hardware Test", "PASS", "부저 테스트 완료");
                    UpdateTestResultButton(true);
                    Logger.LogMessage(LogTextBox, "부저 테스트 성공적으로 완료됨");
                }
                else
                {
                    await SaveTestResult("Buzzer", "Hardware Test", "FAIL", "부저 테스트 실패");
                    Logger.LogMessage(LogTextBox, "서버가 FAIL을 응답했습니다.");
                    UpdateTestResultButton(false);
                    Logger.LogMessage(LogTextBox, "부저 테스트 실패");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"부저 테스트 오류: {ex.Message}");

                if (IsTlsError(ex.Message))
                {
                    HandleTlsConnectionError("DefaultState", ex.Message);
                }
                else
                {
                    await SaveTestResult("Buzzer", "Hardware Test", "FAIL", $"부저 테스트 실패: {ex.Message}");
                }

                UpdateTestResultButton(false);
            }
        }
    }
}