namespace VixReaderTest01
{
    public partial class Main
    {
        private async void GetMacAddress_Click(object sender, EventArgs e)
        {
            try
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] MAC 주소 요청 중...\r\n");
                }

                await _macAddressApi.GetMacAddressInfoAsync();

                await SaveTestResult("MAC Address", "System Info", "PASS", "MAC 주소 조회 완료");

                // 성공 시 TestResult 버튼을 초록색으로 설정
                UpdateTestResultButton(true);
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] MAC 주소 조회 실패: {ex.Message}\r\n");
                }

                if (IsTlsError(ex.Message))
                {
                    HandleTlsConnectionError("DefaultState", ex.Message);
                }
                else
                {
                    // 인수 4개로 변경
                    await SaveTestResult("MAC Address", "System Info", "FAIL", $"MAC 주소 조회 실패: {ex.Message}");
                }

                // 실패 시 TestResult 버튼을 빨간색으로 설정
                UpdateTestResultButton(false);
            }
        }
    }
}