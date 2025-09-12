using VixReaderTest01.Utils;

namespace VixReaderTest01
{
    public partial class Main
    {
        private async void AuxinTest_Click(object sender, EventArgs e)
        {
            try
            {
                Logger.LogMessage(LogTextBox, "AUXIN 테스트 시작...");

                bool testResult = await _auxinTestApi.RunAuxinTestAsync();

                if (testResult)
                {
                    await SaveTestResult("AUXIN Test", "Hardware Test", "PASS", "AUXIN 테스트 완료");
                    UpdateTestResultButton(true);
                    Logger.LogMessage(LogTextBox, "AUXIN 테스트 성공적으로 완료됨");
                }
                else
                {
                    await SaveTestResult("AUXIN Test", "Hardware Test", "FAIL", "AUXIN 테스트 실패", "서버가 FAIL을 응답했습니다.");
                    UpdateTestResultButton(false);
                    Logger.LogMessage(LogTextBox, "AUXIN 테스트 실패");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"AUXIN 테스트 오류: {ex.Message}");

                if (IsTlsError(ex.Message))
                {
                    await HandleOpenSslConnectionError("AUXIN Test", "Hardware Test", ex.Message);
                }
                else
                {
                    await SaveTestResult("AUXIN Test", "Hardware Test", "FAIL", "AUXIN 테스트 실패", ex.Message);
                }

                UpdateTestResultButton(false);
            }
        }
    }
}