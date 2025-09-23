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
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] MAC 주소 조회 중...\r\n");
                }

                // AT+MAC? 명령 전송 및 응답 수신
                string macResult = await _macAddressApi.GetMacAddressInfoAsync();

                if (!string.IsNullOrWhiteSpace(macResult) && !macResult.Equals("FAIL", StringComparison.OrdinalIgnoreCase))
                {
                    // 성공 시 MAC 주소를 DB에 저장
                    await SaveTestResult("MAC", "SUCCESS", macResult);

                    UpdateTestResultButton(true);

                    if (!LogTextBox.IsDisposed && !this.IsDisposed)
                    {
                        LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] MAC 주소 조회 완료\r\n");
                    }
                }
                else
                {
                    // 실패 시 "FAIL"을 DB에 저장
                    await SaveTestResult("MAC", "FAIL");

                    UpdateTestResultButton(false);

                    if (!LogTextBox.IsDisposed && !this.IsDisposed)
                    {
                        LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] MAC 주소 조회 실패\r\n");
                    }
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
                    HandleTlsConnectionError("MAC", ex.Message);
                }
                else
                {
                    await SaveTestResult("MAC", "FAIL");
                }

                UpdateTestResultButton(false);
            }
        }
    }
}