using VIXFaceTest.Utils;

namespace VIXFaceTest
{
    public partial class Main
    {
        private async void WifiTest_Click(object sender, EventArgs e)
        {
            try
            {
                bool testResult = await _wifiTestApi.RunWifiTestAsync();
                if (testResult)
                {
                    await SaveTestResult("WIFI", "PASS");
                    UpdateTestResultButton(true);
                }
                else
                {
                    await SaveTestResult("WIFI", "FAIL");
                    UpdateTestResultButton(false);
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"WiFi 테스트 오류: {ex.Message}");
                if (IsTlsError(ex.Message))
                    HandleTlsConnectionError("WIFI", ex.Message);
                else
                    await SaveTestResult("WIFI", "FAIL", "", ex.Message);
                UpdateTestResultButton(false);
            }
        }
    }
}
