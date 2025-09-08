namespace VixReaderTest01
{
    public partial class Main
    {
        private async void Reboot_Click(object sender, EventArgs e)
        {
            try
            {
                var result = MessageBox.Show(
                    "장치를 재부팅하시겠습니까?\n" +
                    "재부팅 후 장치가 완전히 시작될 때까지 기다려 주십시오.",
                    "장치 재부팅 확인",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question);

                if (result == DialogResult.Yes)
                {
                    if (!LogTextBox.IsDisposed && !this.IsDisposed)
                    {
                        LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 장치 재부팅 시작...\r\n");
                    }

                    await _rebootApi.RebootDeviceAsync();

                    await SaveTestResult("Device Reboot", "System Control", "PASS", "장치 재부팅 명령 정상 완료");

                    // 테스트 성공 시 TestResult 버튼을 초록색으로 설정
                    UpdateTestResultButton(true);

                    MessageBox.Show("재부팅 명령이 전송되었습니다.\n장치가 다시 시작될 때까지 잠시 기다려 주세요.",
                                  "재부팅 명령 완료", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                else
                {
                    if (!LogTextBox.IsDisposed && !this.IsDisposed)
                    {
                        LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 장치 재부팅이 취소되었습니다.\r\n");
                    }

                    await SaveTestResult("Device Reboot", "System Control", "CANCELLED", "사용자에 의해 취소됨");
                }
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 장치 재부팅 실패: {ex.Message}\r\n");
                }
                
                if (IsHttpError(ex.Message))
                {
                    await HandleHttpConnectionError("Device Reboot", "System Control", ex.Message);
                }
                else
                {
                    await SaveTestResult("Device Reboot", "System Control", "FAIL", "장치 재부팅 실패", ex.Message);
                }

                // 테스트 실패 시 TestResult 버튼을 빨간색으로 설정
                UpdateTestResultButton(false);
            }
        }
    }
}