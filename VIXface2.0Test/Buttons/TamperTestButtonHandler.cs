using VIXFaceTest.Utils;

namespace VIXFaceTest
{
    public partial class Main
    {
        private async void TamperTest_Click(object sender, EventArgs e)
        {
            try
            {
                Logger.LogMessage(LogTextBox, "TAMPER 테스트 시작...");

                bool testResult = await _tamperTestApi.RunTamperTestAsync();

                if (testResult)
                {
                    await SaveTestResult("TAMPER", "PASS");
                    UpdateTestResultButton(true);
                }
                else
                {
                    await SaveTestResult("TAMPER", "FAIL");
                    UpdateTestResultButton(false);
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"TAMPER 테스트 오류: {ex.Message}");

                if (IsTlsError(ex.Message))
                    HandleTlsConnectionError("TAMPER", ex.Message);
                else
                    await SaveTestResult("TAMPER", "FAIL", "", ex.Message);

                UpdateTestResultButton(false);
            }
        }
    }
}
