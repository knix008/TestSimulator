using Microsoft.VisualBasic;

namespace VixReaderTest01
{
    public partial class Main
    {
        private async void FirmwareVersion_Click(object sender, EventArgs e)
        {
            try
            {
                if (!ValidateInterfaceSelection())
                    return;

                // 사용자에게 새로운 펌웨어 버전 입력받기
                string firmwareVersion = Interaction.InputBox(
                    "새로운 펌웨어 버전을 입력하세요:\n(예: 1.0.0, 2.1.3)", 
                    "펌웨어 버전 설정", 
                    "1.0.0");

                if (string.IsNullOrWhiteSpace(firmwareVersion))
                {
                    if (!LogTextBox.IsDisposed && !this.IsDisposed)
                    {
                        LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 펌웨어 버전 설정이 취소되었습니다.\r\n");
                    }

                    await SaveTestResult("Set Firmware Version", "System Config", "CANCELLED", "사용자에 의해 취소됨");
                    return;
                }

                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 펌웨어 버전 설정 시작: {firmwareVersion}\r\n");
                }

                await _firmwareApi.SetFirmwareVersionAsync(firmwareVersion);

                await SaveTestResult("Set Firmware Version", "System Config", "PASS", 
                                   $"펌웨어 버전 설정 완료: {firmwareVersion}");

                // 테스트 성공 시 TestResult 버튼을 초록색으로 설정
                UpdateTestResultButton(true);

                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 펌웨어 버전 설정 성공적으로 완료\r\n");
                }
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 펌웨어 버전 설정 실패: {ex.Message}\r\n");
                }
                
                if (IsHttpError(ex.Message))
                {
                    await HandleHttpConnectionError("Set Firmware Version", "System Config", ex.Message);
                }
                else
                {
                    await SaveTestResult("Set Firmware Version", "System Config", "FAIL", "펌웨어 버전 설정 실패", ex.Message);
                }

                // 테스트 실패 시 TestResult 버튼을 빨간색으로 설정
                UpdateTestResultButton(false);
            }
        }
    }
}