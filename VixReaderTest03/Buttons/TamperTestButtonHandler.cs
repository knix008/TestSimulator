using VixReaderTest01.Utils;

namespace VixReaderTest01
{
    public partial class Main
    {
        private async void TamperTest_Click(object sender, EventArgs e)
        {
            try
            {
                Logger.LogMessage(LogTextBox, "템퍼 테스트 시작...");

                bool testResult = await _tamperTestApi.RunTamperTestAsync();

                if (testResult)
                {
                    await SaveTestResult("Tamper Test", "Hardware Test", "PASS", "템퍼 테스트 완료");
                    UpdateTestResultButton(true);
                    Logger.LogMessage(LogTextBox, "템퍼 테스트 성공적으로 완료됨");
                }
                else
                {
                    await SaveTestResult("Tamper Test", "Hardware Test", "FAIL", "템퍼 테스트 실패");
                    Logger.LogMessage(LogTextBox, "템퍼 테스트 실패");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"템퍼 테스트 오류: {ex.Message}");

                if (IsTlsError(ex.Message))
                {
                    HandleTlsConnectionError("DefaultState", ex.Message);
                }
                else
                {
                    await SaveTestResult("Tamper Test", "Hardware Test", "FAIL", "템퍼 테스트 실패" /*, ex.Message*/);
                }

                UpdateTestResultButton(false);
            }
        }
    }
}