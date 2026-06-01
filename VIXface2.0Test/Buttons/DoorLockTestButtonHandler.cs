using VIXFaceTest.Utils;

namespace VIXFaceTest
{
    public partial class Main
    {
        private async void DoorLockTest_Click(object sender, EventArgs e)
        {
            try
            {
                Logger.LogMessage(LogTextBox, "LOCK 테스트 시작...");

                bool testResult = await _doorLockTestApi.RunDoorLockTestAsync();

                if (testResult)
                {
                    await SaveTestResult("LOCK", "PASS");
                    UpdateTestResultButton(true);
                }
                else
                {
                    await SaveTestResult("LOCK", "FAIL");
                    UpdateTestResultButton(false);
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"LOCK 테스트 오류: {ex.Message}");

                if (IsTlsError(ex.Message))
                    HandleTlsConnectionError("LOCK", ex.Message);
                else
                    await SaveTestResult("LOCK", "FAIL", "", ex.Message);

                UpdateTestResultButton(false);
            }
        }
    }
}
