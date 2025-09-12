using VixReaderTest01.Utils;

namespace VixReaderTest01
{
    public partial class Main
    {
        private async void SelfTest_Click(object sender, EventArgs e)
        {
            try
            {
                Logger.LogMessage(LogTextBox, "자체 진단 테스트 시작...");

                // 자체 진단 테스트 실행 및 결과 받기
                var (isSuccess, responseMessage) = await _selfTestApi.RunSelfTestAsync();

                if (isSuccess)
                {
                    await SaveTestResult("Self Test", "System Test", "PASS", "자체 진단 테스트 완료");
                    
                    // 테스트 성공 시 TestResult 버튼을 초록색상태로 설정
                    UpdateTestResultButton(true);
                    
                    Logger.LogMessage(LogTextBox, "자체 진단 테스트 성공적으로 완료됨");
                }
                else
                {
                    await SaveTestResult("Self Test", "System Test", "FAIL", "자체 진단 테스트 실패", responseMessage);
                    
                    // 테스트 실패 시 TestResult 버튼을 빨간색상태로 설정
                    UpdateTestResultButton(false);
                    
                    Logger.LogMessage(LogTextBox, "자체 진단 테스트 실패");
                    
                    // 🔧 실패 시 오류 메시지를 팝업으로 표시
                    MessageBox.Show(responseMessage, 
                                   "자체 진단 테스트 실패", 
                                   MessageBoxButtons.OK, 
                                   MessageBoxIcon.Error);
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"자체 진단 테스트 오류: {ex.Message}");

                if (IsTlsError(ex.Message))
                {
                    await HandleOpenSslConnectionError("Self Test", "System Test", ex.Message);
                }
                else
                {
                    await SaveTestResult("Self Test", "System Test", "FAIL", "자체 진단 테스트 실패", ex.Message);
                }

                // 테스트 실패 시 TestResult 버튼을 빨간색상태로 설정
                UpdateTestResultButton(false);
                
                // 🔧 예외 발생 시에도 팝업으로 표시
                MessageBox.Show($"자체 진단 테스트 중 예외가 발생했습니다.\n\n오류: {ex.Message}", 
                               "자체 진단 테스트 오류", 
                               MessageBoxButtons.OK, 
                               MessageBoxIcon.Error);
            }
        }
    }
}