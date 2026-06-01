using VIXFaceTest.Utils;

namespace VIXFaceTest
{
    public partial class Main
    {
        private async void WiegandTest_Click(object sender, EventArgs e)
        {
            try
            {
                bool testResult = await _wiegandTestApi.RunWiegandTestAsync();
                if (testResult)
                {
                    await SaveTestResult("WIEGAND", "PASS");
                    UpdateTestResultButton(true);
                }
                else
                {
                    await SaveTestResult("WIEGAND", "FAIL");
                    UpdateTestResultButton(false);
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"Wiegand 테스트 오류: {ex.Message}");
                if (IsTlsError(ex.Message))
                    HandleTlsConnectionError("WIEGAND", ex.Message);
                else
                    await SaveTestResult("WIEGAND", "FAIL", "", ex.Message);
                UpdateTestResultButton(false);
            }
        }
    }
}
