namespace VixReaderTest01
{
    public partial class Main
    {
        private async void GetSerialNumber_Click(object sender, EventArgs e)
        {
            try
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 시리얼 번호 조회 시작...\r\n");
                }

                await _serialNumberApi.GetSerialNumberAsync();

                await SaveTestResult("Get Serial Number", "Device Info", "PASS", "시리얼 번호 조회 완료");

                // 테스트 성공 시 TestResult 버튼을 초록색으로 설정
                UpdateTestResultButton(true);
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 시리얼 번호 조회 실패: {ex.Message}\r\n");
                }
                
                if (IsHttpError(ex.Message))
                {
                    await HandleHttpConnectionError("Get Serial Number", "Device Info", ex.Message);
                }
                else
                {
                    await SaveTestResult("Get Serial Number", "Device Info", "FAIL", "시리얼 번호 조회 실패", ex.Message);
                }

                // 테스트 실패 시 TestResult 버튼을 빨간색으로 설정
                UpdateTestResultButton(false);
            }
        }
    }
}