namespace VixReaderTest01
{
    public partial class Main
    {
        private async void SetSerialNumber_Click(object sender, EventArgs e)
        {
            try
            {
                string serialNumber = Microsoft.VisualBasic.Interaction.InputBox(
                    "설정할 시리얼 번호를 입력하세요:", 
                    "시리얼 번호 설정", 
                    _lastSetSerialNumber);

                if (string.IsNullOrWhiteSpace(serialNumber))
                {
                    if (!LogTextBox.IsDisposed && !this.IsDisposed)
                    {
                        LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 시리얼 번호 설정이 취소되었습니다.\r\n");
                    }

                    await SaveTestResult("Set Serial Number", "Device Config", "CANCELLED", "사용자에 의해 취소됨");
                    return;
                }

                _lastSetSerialNumber = serialNumber;

                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 시리얼 번호 설정 시작: {serialNumber}\r\n");
                }

                await _serialNumberApi.SetSerialNumberAsync(serialNumber);

                await SaveTestResult("Set Serial Number", "Device Config", "PASS", 
                    $"시리얼 번호 설정 완료: {serialNumber}", serialNumber);

                // 테스트 성공 시 TestResult 버튼을 초록색으로 설정
                UpdateTestResultButton(true);
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 시리얼 번호 설정 실패: {ex.Message}\r\n");
                }
                
                if (IsHttpError(ex.Message))
                {
                    await HandleHttpConnectionError("Set Serial Number", "Device Config", ex.Message);
                }
                else
                {
                    await SaveTestResult("Set Serial Number", "Device Config", "FAIL", "시리얼 번호 설정 실패", ex.Message);
                }

                // 테스트 실패 시 TestResult 버튼을 빨간색으로 설정
                UpdateTestResultButton(false);
            }
        }
    }
}