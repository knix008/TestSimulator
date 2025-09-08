namespace VixReaderTest01
{
    public partial class Main
    {
        private async void GetMacAddress_Click(object sender, EventArgs e)
        {
            if (!ValidateInterfaceSelection()) return;

            try
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] MAC 주소 정보 조회 시작...\r\n");
                }

                await _macAddressApi.GetMacAddressInfoAsync();

                await SaveTestResult("Get Mac Address", "Network Info", "PASS", "MAC 주소 정보 조회 완료");

                // 테스트 성공 시 TestResult 버튼을 초록색으로 설정
                UpdateTestResultButton(true);
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] MAC 주소 정보 조회 실패: {ex.Message}\r\n");
                }
                
                if (IsHttpError(ex.Message))
                {
                    await HandleHttpConnectionError("Get Mac Address", "Network Info", ex.Message);
                }
                else
                {
                    await SaveTestResult("Get Mac Address", "Network Info", "FAIL", "MAC 주소 정보 조회 실패", ex.Message);
                }

                // 테스트 실패 시 TestResult 버튼을 빨간색으로 설정
                UpdateTestResultButton(false);
            }
        }
    }
}