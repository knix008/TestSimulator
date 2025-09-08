namespace VixReaderTest01
{
    public partial class Main
    {
        private async void ClearSetting_Click(object sender, EventArgs e)
        {
            try
            {
                var result = MessageBox.Show(
                    "장치의 모든 설정을 초기화하시겠습니까?\n" +
                    "이 작업은 되돌릴 수 없습니다.",
                    "설정 초기화 확인",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Warning);

                if (result == DialogResult.Yes)
                {
                    if (!LogTextBox.IsDisposed && !this.IsDisposed)
                    {
                        LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 설정 초기화 시작...\r\n");
                    }

                    await _clearSettingApi.ClearSettingAsync();

                    await SaveTestResult("Clear Settings", "Device Control", "PASS", "설정 초기화 완료");

                    // 테스트 성공 시 TestResult 버튼을 초록색으로 설정
                    UpdateTestResultButton(true);

                    MessageBox.Show("장치 설정이 성공적으로 초기화되었습니다.", 
                                  "초기화 완료", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                else
                {
                    if (!LogTextBox.IsDisposed && !this.IsDisposed)
                    {
                        LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 설정 초기화가 취소되었습니다.\r\n");
                    }

                    await SaveTestResult("Clear Settings", "Device Control", "CANCELLED", "사용자에 의해 취소됨");
                }
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 설정 초기화 실패: {ex.Message}\r\n");
                }

                // HTTP 연결 오류인지 확인
                if (IsHttpError(ex.Message))
                {
                    await HandleHttpConnectionError("Clear Settings", "Device Control", ex.Message);
                }
                else
                {
                    await SaveTestResult("Clear Settings", "Device Control", "FAIL", "설정 초기화 실패", ex.Message);
                }

                // 테스트 실패 시 TestResult 버튼을 빨간색으로 설정
                UpdateTestResultButton(false);

                MessageBox.Show($"설정 초기화 중 오류가 발생했습니다:\n\n{ex.Message}",
                               "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}