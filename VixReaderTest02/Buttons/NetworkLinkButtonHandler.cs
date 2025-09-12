using VixReaderTest01.Utils;

namespace VixReaderTest01
{
    public partial class Main
    {
        private async void NetworkLink_Click(object sender, EventArgs e)
        {
            try
            {
                Logger.LogMessage(LogTextBox, "네트워크 링크 테스트 시작...");

                bool testResult = await _networkLinkApi.RunNetworkLinkTestAsync();

                if (testResult)
                {
                    await SaveTestResult("Network Link Test", "Network Test", "PASS", "네트워크 링크 테스트 완료");
                    UpdateTestResultButton(true);
                    Logger.LogMessage(LogTextBox, "네트워크 링크 테스트 성공적으로 완료됨");
                    
                    // 성공 시 추가 정보 표시
                    MessageBox.Show("네트워크 링크 테스트가 성공적으로 완료되었습니다.\n\n" +
                                   "🌐 네트워크 상태: UP (활성화)\n" +
                                   "💡 네트워크 연결이 정상적으로 동작합니다.",
                                   "네트워크 링크 테스트 성공",
                                   MessageBoxButtons.OK,
                                   MessageBoxIcon.Information);
                }
                else
                {
                    await SaveTestResult("Network Link Test", "Network Test", "FAIL", "네트워크 링크 테스트 실패", "네트워크 상태가 DOWN입니다.");
                    UpdateTestResultButton(false);
                    Logger.LogMessage(LogTextBox, "네트워크 링크 테스트 실패");
                    
                    // 실패 시 추가 정보 표시
                    MessageBox.Show("네트워크 링크 테스트에 실패했습니다.\n\n" +
                                   "🚫 네트워크 상태: DOWN (비활성화)\n\n" +
                                   "가능한 원인:\n" +
                                   "• 네트워크 케이블 연결 문제\n" +
                                   "• 네트워크 스위치/라우터 오류\n" +
                                   "• 장치의 이더넷 포트 문제\n" +
                                   "• 네트워크 설정 오류\n\n" +
                                   "💡 네트워크 연결을 확인한 후 다시 시도해주세요.",
                                   "네트워크 링크 테스트 실패",
                                   MessageBoxButtons.OK,
                                   MessageBoxIcon.Warning);
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"네트워크 링크 테스트 오류: {ex.Message}");

                if (IsTlsError(ex.Message))
                {
                    await HandleOpenSslConnectionError("Network Link Test", "Network Test", ex.Message);
                }
                else
                {
                    await SaveTestResult("Network Link Test", "Network Test", "FAIL", "네트워크 링크 테스트 실패", ex.Message);
                }

                // 테스트 실패 시 TestResult 버튼을 빨간색으로 설정
                UpdateTestResultButton(false);
                
                // 오류 시 팝업 표시
                MessageBox.Show($"네트워크 링크 테스트 중 오류가 발생했습니다.\n\n" +
                               $"오류 내용: {ex.Message}\n\n" +
                               "💡 연결 상태를 확인한 후 다시 시도해주세요.",
                               "네트워크 링크 테스트 오류",
                               MessageBoxButtons.OK,
                               MessageBoxIcon.Error);
            }
        }
    }
}