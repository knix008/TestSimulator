namespace VixReaderTest01
{
    public partial class Main
    {
        private async void ClearSetting_Click(object sender, EventArgs e)
        {
            // 경고 메시지 추가
            var result = MessageBox.Show(
                "이 작업을 진행하면 장치의 모든 설정이 지워질 수 있습니다.\n계속하시겠습니까?",
                "설정 초기화 경고",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning);

            if (result != DialogResult.Yes)
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 설정 지우기가 사용자에 의해 취소됨\r\n");
                }
                return;
            }

            try
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 설정 지우기 시작...\r\n");
                }

                await _clearSettingApi.ClearAllSettingsAsync();

                // PASS만 데이터베이스에 저장
                await SaveTestResult("Clear Setting", "PASS");

                // 성공 시 TestResult 버튼을 초록색으로 설정
                UpdateTestResultButton(true);

                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 설정 지우기가 성공적으로 완료됨\r\n");
                }
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 설정 지우기 실패: {ex.Message}\r\n");
                }

                if (IsTlsError(ex.Message))
                {
                    HandleTlsConnectionError("Clear Setting", ex.Message);
                }
                else
                {
                    // FAIL만 데이터베이스에 저장 (오류 메시지는 저장하지 않음)
                    await SaveTestResult("Clear Setting", "FAIL");
                }

                // 실패 시 TestResult 버튼을 빨간색으로 설정
                UpdateTestResultButton(false);
            }
        }
    }
}