using VixReaderTest01.Utils;

namespace VixReaderTest01
{
    public partial class Main
    {
        private async void SelfTest_Click(object sender, EventArgs e)
        {
            try
            {
                Logger.LogMessage(LogTextBox, "자가 진단 테스트 시작...");

                // SelfTestApi는 이미 응답을 반환하므로 그대로 사용
                var (isSuccess, responseMessage) = await _selfTestApi.RunSelfTestAsync();

                if (isSuccess)
                {
                    // 서버 응답이 "OK"인 경우 "PASS"를 데이터베이스에 저장
                    await SaveTestResult("BIST", "PASS");
                    UpdateTestResultButton(true);
                    Logger.LogMessage(LogTextBox, "자가 진단 테스트 성공적으로 완료됨");
                    
                    // 서버 응답은 로그에만 출력
                    if (!string.IsNullOrEmpty(responseMessage))
                    {
                        Logger.LogMessage(LogTextBox, $"응답 내용: {responseMessage}");
                    }
                }
                else
                {
                    // 서버 응답이 "OK"가 아닌 경우 서버에서 전달받은 메시지를 데이터베이스에 저장
                    await SaveTestResult("BIST", responseMessage);
                    UpdateTestResultButton(false);
                    Logger.LogMessage(LogTextBox, "자가 진단 테스트 실패");
                    
                    // 상세한 오류 내용은 이미 responseMessage에 포함되어 있으므로 추가 로그는 불필요
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"자가 진단 테스트 오류: {ex.Message}");

                if (IsTlsError(ex.Message))
                {
                    HandleTlsConnectionError("BIST", ex.Message);
                }
                else
                {
                    // 예외 발생 시 예외 메시지를 데이터베이스에 저장
                    await SaveTestResult("BIST", $"테스트 중 예외 발생: {ex.Message}");
                }

                UpdateTestResultButton(false);
            }
        }
    }
}