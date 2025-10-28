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
                    // PASS만 데이터베이스에 저장
                    await SaveTestResult("AUXIN", "PASS");
                    UpdateTestResultButton(true);
                    Logger.LogMessage(LogTextBox, "AUXIN 테스트 성공적으로 완료됨");
                }
                else
                {
                    // FAIL만 데이터베이스에 저장
                    await SaveTestResult("AUXIN", "FAIL");
                    UpdateTestResultButton(false);
                    Logger.LogMessage(LogTextBox, "AUXIN 테스트 실패");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"AUXIN 테스트 오류: {ex.Message}");

                if (IsTlsError(ex.Message))
                {
                    HandleTlsConnectionError("AUXIN", ex.Message);
                }
                else
                {
                    // FAIL만 데이터베이스에 저장 (오류 메시지는 저장하지 않음)
                    await SaveTestResult("AUXIN", "FAIL");
                }

                UpdateTestResultButton(false);
            }
        }
    }
}