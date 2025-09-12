using VixReaderTest01.Utils;

namespace VixReaderTest01
{
    public partial class Main
    {
        private async void DoorLockTest_Click(object sender, EventArgs e)
        {
            try
            {
                Logger.LogMessage(LogTextBox, "도어락 테스트 시작...");

                bool testResult = await _doorLockTestApi.RunDoorLockTestAsync();

                if (testResult)
                {
                    await SaveTestResult("Door Lock Test", "Hardware Test", "PASS", "도어락 테스트 완료");
                    UpdateTestResultButton(true);
                    Logger.LogMessage(LogTextBox, "도어락 테스트 성공적으로 완료됨");
                }
                else
                {
                    await SaveTestResult("Door Lock Test", "Hardware Test", "FAIL", "도어락 테스트 실패");
                    UpdateTestResultButton(false);
                    Logger.LogMessage(LogTextBox, "도어락 테스트 실패");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"도어락 테스트 오류: {ex.Message}");

                if (IsTlsError(ex.Message))
                {
                    HandleTlsConnectionError("DefaultState", ex.Message);
                }
                else
                {
                    // 인수 4개만 전달하도록 수정
                    await SaveTestResult("Door Lock Test", "Hardware Test", "FAIL", $"도어락 테스트 실패: {ex.Message}");
                }

                UpdateTestResultButton(false);
            }
        }
    }
}