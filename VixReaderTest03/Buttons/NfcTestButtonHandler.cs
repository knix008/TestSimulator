using VixReaderTest01.Utils;

namespace VixReaderTest01
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
                    await SaveTestResult("NFC Test", "Hardware Test", "PASS", "NFC 테스트 완료");
                    UpdateTestResultButton(true);
                    Logger.LogMessage(LogTextBox, "NFC 테스트 성공적으로 완료됨");
                }
                else
                {
                    await SaveTestResult("NFC Test", "Hardware Test", "FAIL", "NFC 테스트 실패");
                    UpdateTestResultButton(false);
                    Logger.LogMessage(LogTextBox, "NFC 테스트 실패");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"NFC 테스트 오류: {ex.Message}");

                if (IsTlsError(ex.Message))
                {
                    HandleTlsConnectionError("DefaultState", ex.Message);
                }
                else
                {
                    await SaveTestResult("NFC Test", "Hardware Test", "FAIL", $"NFC 테스트 실패: {ex.Message}");
                }

                UpdateTestResultButton(false);
            }
        }
    }
}