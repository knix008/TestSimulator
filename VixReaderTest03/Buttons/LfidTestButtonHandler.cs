using VixReaderTest01.Utils;

namespace VixReaderTest01
{
    public partial class Main
    {
        private async void LfidTest_Click(object sender, EventArgs e)
        {
            try
            {
                Logger.LogMessage(LogTextBox, "LFID 테스트 시작...");

                bool testResult = await _lfidTestApi.RunLfidTestAsync();

                if (testResult)
                {
                    await SaveTestResult("LFID Test", "PASS");
                    UpdateTestResultButton(true);
                    Logger.LogMessage(LogTextBox, "LFID 테스트 성공적으로 완료됨");
                }
                else
                {
                    await SaveTestResult("LFID Test", "FAIL");
                    // "서버가 FAIL을 응답했습니다." 메시지는 로그로 남깁니다.
                    Logger.LogMessage(LogTextBox, "서버가 FAIL을 응답했습니다.");
                    UpdateTestResultButton(false);
                    Logger.LogMessage(LogTextBox, "LFID 테스트 실패");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"LFID 테스트 오류: {ex.Message}");

                if (IsTlsError(ex.Message))
                {
                    HandleTlsConnectionError("DefaultState", ex.Message);
                }
                else
                {
                    await SaveTestResult("LFID Test", "FAIL");
                }

                UpdateTestResultButton(false);
            }
        }
    }
}