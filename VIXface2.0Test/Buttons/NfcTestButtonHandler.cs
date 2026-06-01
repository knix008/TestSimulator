using VIXFaceTest.Utils;

namespace VIXFaceTest
{
    public partial class Main
    {
        private async void NfcTest_Click(object sender, EventArgs e)
        {
            try
            {
                Logger.LogMessage(LogTextBox, "NFC 테스트 시작...");

                bool testResult = await _nfcTestApi.RunNfcTestAsync();

                if (testResult)
                {
                    await SaveTestResult("NFC", "PASS");
                    UpdateTestResultButton(true);
                }
                else
                {
                    await SaveTestResult("NFC", "FAIL");
                    UpdateTestResultButton(false);
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"NFC 테스트 오류: {ex.Message}");

                if (IsTlsError(ex.Message))
                    HandleTlsConnectionError("NFC", ex.Message);
                else
                    await SaveTestResult("NFC", "FAIL", "", ex.Message);

                UpdateTestResultButton(false);
            }
        }
    }
}
