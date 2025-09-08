namespace VixReaderTest01
{
    public partial class Main
    {
        private async void DefaultState_Click(object sender, EventArgs e)
        {
            try
            {
                var result = MessageBox.Show(
                    "장치를 기본 상태로 설정하시겠습니까?\n" +
                    "이 작업은 장치의 모든 설정을 공장 기본값으로 복원합니다.\n" +
                    "진행하시겠습니까?",
                    "기본 상태 설정 확인",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question);

                if (result == DialogResult.Yes)
                {
                    if (!LogTextBox.IsDisposed && !this.IsDisposed)
                    {
                        LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 기본 상태 설정 시작...\r\n");
                    }

                    await _defaultStateApi.SetDefaultStateAsync();

                    await SaveTestResult("Set Default State", "Device Config", "PASS", "기본 상태 설정 완료");

                    // 테스트 성공 시 TestResult 버튼을 초록색으로 설정
                    UpdateTestResultButton(true);

                    MessageBox.Show("장치가 성공적으로 기본 상태로 설정되었습니다.\n" +
                                  "모든 설정이 공장 기본값으로 복원되었습니다.", 
                                  "기본 상태 설정 완료", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                else
                {
                    if (!LogTextBox.IsDisposed && !this.IsDisposed)
                    {
                        LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 기본 상태 설정이 취소되었습니다.\r\n");
                    }
                    await SaveTestResult("Set Default State", "Device Config", "CANCELLED", "사용자에 의해 취소됨");
                }
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 기본 상태 설정 실패: {ex.Message}\r\n");
                }
                
                // HTTP 연결 오류인지 확인
                if (IsHttpError(ex.Message))
                {
                    await HandleHttpConnectionError("Set Default State", "Device Config", ex.Message);
                }
                else
                {
                    await SaveTestResult("Set Default State", "Device Config", "FAIL", "기본 상태 설정 실패", ex.Message);
                }

                // 테스트 실패 시 TestResult 버튼을 빨간색으로 설정
                UpdateTestResultButton(false);

                MessageBox.Show($"기본 상태 설정 중 오류가 발생했습니다:\n\n{ex.Message}\n\n" +
                               "장치 연결을 확인한 후 다시 시도해주세요.",
                               "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}