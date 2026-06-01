using VIXFaceTest.Utils;

namespace VIXFaceTest
{
    public partial class Main
    {
        private async void BleTest_Click(object sender, EventArgs e)
        {
            try
            {
                bool testResult = await _bleTestApi.RunBleTestAsync();

                if (testResult)
                {
                    await SaveTestResult("BLE", "PASS");
                    UpdateTestResultButton(true);
                }
                else
                {
                    await SaveTestResult("BLE", "FAIL", "", "FAIL");
                    UpdateTestResultButton(false);
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"BLE error: {ex.Message}");

                if (IsTlsError(ex.Message))
                    HandleTlsConnectionError("BLE", ex.Message);
                else
                    await SaveTestResult("BLE", "FAIL", "", ex.Message);

                UpdateTestResultButton(false);
            }
        }
    }
}
