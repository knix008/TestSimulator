namespace VixReaderTest01
{
    public partial class Main
    {
        private async void ClearSetting_Click(object sender, EventArgs e)
        {
            try
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 설정 지우기 시작...\r\n");
                }

                await _clearSettingApi.ClearAllSettingsAsync();

                await SaveTestResult("Clear Setting", "System Control", "PASS", "설정 지우기 완료");

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
                    await HandleOpenSslConnectionError("Clear Setting", "System Control", ex.Message);
                }
                else
                {
                    await SaveTestResult("Clear Setting", "System Control", "FAIL", "설정 지우기 실패", ex.Message);
                }

                // 실패 시 TestResult 버튼을 빨간색으로 설정
                UpdateTestResultButton(false);
            }
        }
    }
}