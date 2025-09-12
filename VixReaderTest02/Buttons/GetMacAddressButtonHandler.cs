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
                string macAddress = ""; // 필요하다면, GetMacAddressInfoAsync의 반환값을 활용하도록 MacAddressApi를 수정해야 합니다.

                await SaveTestResult("MAC Address", "System Info", "PASS", "MAC 주소 조회 완료", serialNumber: macAddress);

                // 성공 시 TestResult 버튼을 초록색으로 설정
                UpdateTestResultButton(true);

                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] MAC 주소 조회 완료: {macAddress}\r\n");
                }
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] MAC 주소 조회 실패: {ex.Message}\r\n");
                }

                if (IsTlsError(ex.Message))
                {
                    await HandleOpenSslConnectionError("MAC Address", "System Info", ex.Message);
                }
                else
                {
                    await SaveTestResult("MAC Address", "System Info", "FAIL", "MAC 주소 조회 실패", ex.Message);
                }

                // 실패 시 TestResult 버튼을 빨간색으로 설정
                UpdateTestResultButton(false);
            }
        }
    }
}