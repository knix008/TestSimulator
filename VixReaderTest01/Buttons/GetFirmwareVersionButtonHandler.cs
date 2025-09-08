namespace VixReaderTest01
{
    public partial class Main
    {
        private async void GetFirmwareVersion_Click(object sender, EventArgs e)
        {
            try
            {
                if (!ValidateInterfaceSelection())
                    return;

                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 펌웨어 버전 조회 시작...\r\n");
                }

                await _firmwareApi.GetFirmwareVersionAsync();

                await SaveTestResult("Get Firmware Version", "System Info", "PASS", "펌웨어 버전 조회 완료");

                // 테스트 성공 시 TestResult 버튼을 초록색으로 설정
                UpdateTestResultButton(true);

                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 펌웨어 버전 조회 성공적으로 완료됨\r\n");
                }
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 펌웨어 버전 조회 실패: {ex.Message}\r\n");
                }
                
                if (IsHttpError(ex.Message))
                {
                    await HandleHttpConnectionError("Get Firmware Version", "System Info", ex.Message);
                }
                else
                {
                    await SaveTestResult("Get Firmware Version", "System Info", "FAIL", "펌웨어 버전 조회 실패", ex.Message);
                }

                // 테스트 실패 시 TestResult 버튼을 빨간색으로 설정
                UpdateTestResultButton(false);
            }
        }
    }
}