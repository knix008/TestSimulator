using VIXFaceTest.Utils;

namespace VIXFaceTest
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
                    // 성공하지 않은 경우 서버에서 받은 메시지를 그대로 DB에 저장
                    await SaveTestResult("BIST", responseMessage);
                    UpdateTestResultButton(false);
                    Logger.LogMessage(LogTextBox, "자가 진단 테스트 실패");
                    Logger.LogMessage(LogTextBox, $"응답 내용: {responseMessage}");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"자가 진단 테스트 오류: {ex.Message}");

                if (IsTlsError(ex.Message))
                {
                    // TLS 연결 오류는 DB에 저장하지 않고 로그만 출력
                    HandleTlsConnectionError("BIST", ex.Message);
                }
                else
                {
                    // 서버에서 받은 오류 메시지가 아닌 경우, 서버 응답이 없는 것으로 간주하고 로그만 출력
                    Logger.LogMessage(LogTextBox, $"오류 메시지: {ex.Message}");
                }

                UpdateTestResultButton(false);
            }
        }
    }
}