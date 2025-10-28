namespace VixReaderTest01
{
    public partial class Main
    {
        private async void GetFirmwareVersion_Click(object sender, EventArgs e)
        {
            try
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 펌웨어 버전 조회 중...\r\n");
                }

                // 서버로부터 펌웨어 버전 정보를 가져옴
                string firmwareVersion = await _firmwareApi.GetFirmwareVersionAsync();

                // 성공 시 실제 펌웨어 버전을 데이터베이스에 저장
                await SaveTestResult("Get Firmware Version", "SUCCESS", firmwareVersion);

                // 성공 시 TestResult 버튼을 초록색으로 설정
                UpdateTestResultButton(true);

                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 펌웨어 버전 조회 완료\r\n");
                }
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 펌웨어 버전 조회 실패: {ex.Message}\r\n");
                }

                if (IsTlsError(ex.Message))
                {
                    HandleTlsConnectionError("Get Firmware Version", ex.Message);
                }
                else
                {
                    // 실패 시 "FAIL"을 데이터베이스에 저장
                    await SaveTestResult("Get Firmware Version", "FAIL");
                }

                // 실패 시 TestResult 버튼을 빨간색으로 설정
                UpdateTestResultButton(false);
            }
        }
    }
}