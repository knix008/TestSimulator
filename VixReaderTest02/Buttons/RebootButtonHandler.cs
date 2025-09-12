namespace VixReaderTest01
{
    public partial class Main
    {
        private async void Reboot_Click(object sender, EventArgs e)
        {
            // 리부트 확인 팝업
            var confirmResult = MessageBox.Show(
                "디바이스를 리부트하시겠습니까?\n\n" +
                "⚠️ 주의사항:\n" +
                "• 리부트 성공 시 연결이 끊어집니다\n" +
                "• 약 30-60초 후 Connect 버튼으로 다시 연결해야 합니다\n" +
                "• 진행 중인 모든 작업이 중단됩니다",
                "디바이스 리부트 확인",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning,
                MessageBoxDefaultButton.Button2); // No가 기본 선택

            // 사용자가 취소를 선택한 경우
            if (confirmResult != DialogResult.Yes)
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 사용자가 리부트를 취소했습니다.\r\n");
                }
                return;
            }

            try
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 디바이스 리부트 요청 중...\r\n");
                }

                // 리부트 API 실행 (OK 시에만 내부에서 연결 해제)
                bool rebootSuccess = await _rebootApi.RebootDeviceAsync();

                if (rebootSuccess)
                {
                    // OK 응답 시 - 연결이 이미 해제되었으므로 상태만 업데이트
                    _isConnected = false;
                    ConnectButton.Text = "연결...";
                    ConnectButton.BackColor = Color.Red;

                    // PASS만 데이터베이스에 저장
                    await SaveTestResult("Device Reboot", "PASS");
                    
                    // 🔧 리부트 성공 시 연결이 끊어지므로 TestResult 버튼을 "준비" 상태로 설정
                    SetTestResultReady();

                    if (!LogTextBox.IsDisposed && !this.IsDisposed)
                    {
                        LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] ✅ 리부트 명령이 성공적으로 처리되었습니다.\r\n");
                        LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 🔌 연결이 해제되었습니다. 리부트 완료 후 Connect 버튼을 사용하여 다시 연결하세요.\r\n");
                        LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 📋 TestResult 버튼이 '준비' 상태로 변경되었습니다.\r\n");
                    }
                }
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 디바이스 리부트 실패: {ex.Message}\r\n");
                }

                // FAIL이나 오류 시 - 연결 상태는 그대로 유지
                // _isConnected 상태는 변경하지 않음
                // ConnectButton 상태도 변경하지 않음

                if (IsTlsError(ex.Message))
                {
                    HandleTlsConnectionError("Device Reboot", ex.Message);
                }
                else
                {
                    // FAIL만 데이터베이스에 저장 (오류 메시지는 저장하지 않음)
                    await SaveTestResult("Device Reboot", "FAIL");
                }

                // 실패 시 TestResult 버튼을 빨간색상태로 변경
                UpdateTestResultButton(false);

                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 🔌 리부트 실패로 인해 연결을 유지합니다.\r\n");
                }
            }
        }
    }
}