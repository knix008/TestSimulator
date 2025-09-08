namespace VixReaderTest01
{
    public partial class Main
    {
        private async void NetworkLink_Click(object sender, EventArgs e)
        {
            try
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 네트워크 링크 상태 확인 시작...\r\n");
                }

                await _networkLinkApi.CheckNetworkLinkAsync();

                await SaveTestResult("Network Link Check", "Network Diagnostics", "PASS", 
                    "네트워크 링크 상태 확인 완료");

                // 테스트 성공 시 TestResult 버튼을 초록색으로 설정
                UpdateTestResultButton(true);

                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 네트워크 링크 상태 확인 성공\r\n");
                }
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 네트워크 링크 상태 확인 실패: {ex.Message}\r\n");
                }
                
                // HTTP 연결 오류인지 확인
                if (IsHttpError(ex.Message))
                {
                    await HandleHttpConnectionError("Network Link Check", "Network Diagnostics", ex.Message);
                    
                    MessageBox.Show("네트워크 연결을 확인할 수 없습니다.\n\n" +
                                   "가능한 원인:\n" +
                                   "• 장치가 네트워크에 연결되지 않음\n" +
                                   "• 네트워크 케이블이 연결되지 않음\n" +
                                   "• 장치 서버가 실행되지 않음\n" +
                                   "• 방화벽이 연결을 차단함\n\n" +
                                   "네트워크 설정과 연결 상태를 확인해주세요.",
                                   "네트워크 연결 오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
                else
                {
                    await SaveTestResult("Network Link Check", "Network Diagnostics", "FAIL", 
                        "네트워크 링크 상태 확인 실패", ex.Message);
                    
                    MessageBox.Show($"네트워크 링크 상태 확인 중 오류가 발생했습니다:\n\n{ex.Message}\n\n" +
                                   "장치와 네트워크 연결을 확인한 후 다시 시도해주세요.",
                                   "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }

                // 테스트 실패 시 TestResult 버튼을 빨간색으로 설정
                UpdateTestResultButton(false);
            }
        }
    }
}