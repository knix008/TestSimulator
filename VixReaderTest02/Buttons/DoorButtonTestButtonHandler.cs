using VixReaderTest01.Utils;

namespace VixReaderTest01
{
    public partial class Main
    {
        private async void DoorButtonTest_Click(object sender, EventArgs e)
        {
            try
            {
                Logger.LogMessage(LogTextBox, "도어버튼 테스트 시작...");

                bool testResult = await _doorButtonTestApi.RunDoorButtonTestAsync();

                if (testResult)
                {
                    await SaveTestResult("Door Button Test", "Hardware Test", "PASS", "도어버튼 테스트 완료");
                    UpdateTestResultButton(true);
                    Logger.LogMessage(LogTextBox, "도어버튼 테스트 성공적으로 완료됨");
                }
                else
                {
                    await SaveTestResult("Door Button Test", "Hardware Test", "FAIL", "도어버튼 테스트 실패", "서버가 FAIL을 응답했습니다.");
                    UpdateTestResultButton(false);
                    Logger.LogMessage(LogTextBox, "도어버튼 테스트 실패");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"도어버튼 테스트 오류: {ex.Message}");

                if (IsTlsError(ex.Message))
                {
                    await HandleOpenSslConnectionError("Door Button Test", "Hardware Test", ex.Message);
                }
                else
                {
                    await SaveTestResult("Door Button Test", "Hardware Test", "FAIL", "도어버튼 테스트 실패", ex.Message);
                }

                UpdateTestResultButton(false);
            }
        }
    }
}