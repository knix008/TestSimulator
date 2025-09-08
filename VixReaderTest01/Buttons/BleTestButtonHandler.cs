namespace VixReaderTest01
{
    public partial class Main
    {
        private async void BleTest_Click(object sender, EventArgs e)
        {
            try
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] BLE 테스트 시작...\r\n");
                }

                await _bleTestApi.RunBleTestAsync();

                await SaveTestResult("BLE Test", "Communication Test", "PASS", "BLE 테스트 완료");

                // 테스트 성공 시 TestResult 버튼을 초록색으로 설정
                UpdateTestResultButton(true);

                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] BLE 테스트 성공적으로 완료됨\r\n");
                }
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] BLE 테스트 실패: {ex.Message}\r\n");
                }
                
                if (IsHttpError(ex.Message))
                {
                    await HandleHttpConnectionError("BLE Test", "Communication Test", ex.Message);
                }
                else
                {
                    await SaveTestResult("BLE Test", "Communication Test", "FAIL", "BLE 테스트 실패", ex.Message);
                }

                // 테스트 실패 시 TestResult 버튼을 빨간색으로 설정
                UpdateTestResultButton(false);
            }
        }
    }
}