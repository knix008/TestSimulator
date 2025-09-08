namespace VixReaderTest01
{
    public partial class Main
    {
        private async void TamperTest_Click(object sender, EventArgs e)
        {
            try
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 탬퍼 테스트 시작...\r\n");
                }

                await _tamperTestApi.RunTamperTestAsync();

                await SaveTestResult("Tamper Test", "Security Test", "PASS", "탬퍼 테스트 완료");

                // 테스트 성공 시 TestResult 버튼을 초록색으로 설정
                UpdateTestResultButton(true);

                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 탬퍼 테스트 성공적으로 완료됨\r\n");
                }

                MessageBox.Show("탬퍼 테스트가 성공적으로 완료되었습니다.\n" +
                               "장치의 보안 탐지 기능이 정상적으로 작동합니다.", 
                               "탬퍼 테스트 완료", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 탬퍼 테스트 실패: {ex.Message}\r\n");
                }
                
                // HTTP 연결 오류인지 확인
                if (IsHttpError(ex.Message))
                {
                    await HandleHttpConnectionError("Tamper Test", "Security Test", ex.Message);
                    
                    MessageBox.Show("탬퍼 테스트를 수행할 수 없습니다.\n\n" +
                                   "네트워크 연결 문제:\n" +
                                   "• 장치가 네트워크에 연결되지 않음\n" +
                                   "• 장치 서버가 실행되지 않음\n" +
                                   "• 통신 포트가 차단됨\n\n" +
                                   "장치 연결과 네트워크 상태를 확인해주세요.",
                                   "네트워크 연결 오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
                else
                {
                    await SaveTestResult("Tamper Test", "Security Test", "FAIL", "탬퍼 테스트 실패", ex.Message);
                    
                    MessageBox.Show($"탬퍼 테스트 중 오류가 발생했습니다:\n\n{ex.Message}\n\n" +
                                   "가능한 원인:\n" +
                                   "• 탬퍼 센서 하드웨어 문제\n" +
                                   "• 장치 펌웨어 오류\n" +
                                   "• 보안 모듈 초기화 실패\n\n" +
                                   "장치 상태를 확인한 후 다시 시도해주세요.",
                                   "탬퍼 테스트 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }

                // 테스트 실패 시 TestResult 버튼을 빨간색으로 설정
                UpdateTestResultButton(false);
            }
        }
    }
}