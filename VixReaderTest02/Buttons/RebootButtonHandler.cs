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
                    // PASS만 데이터베이스에 저장
                    await SaveTestResult("Device Reboot", "PASS");
                    
                    // 🔧 리부트 성공 시 연결이 끊어지므로 TestResult 버튼을 "준비" 상태로 설정
                    SetTestResultReady();
                    
                    // 🔧 리부트 성공 시 TLS 클라이언트 강제로 연결 해제 및 초기화
                    if (_tlsClient != null)
                    {
                        try
                        {
                            // 연결 해제
                            await _tlsClient.DisconnectAsync();
                            
                            // UI 업데이트
                            ConnectButton.Text = "연결...";
                            ConnectButton.BackColor = Color.Red;
                            ConnectButton.ForeColor = SystemColors.ControlText;
                        }
                        catch (Exception connEx)
                        {
                            if (!LogTextBox.IsDisposed && !this.IsDisposed)
                            {
                                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 리부트 후 연결 해제 중 오류 (무시됨): {connEx.Message}\r\n");
                            }
                        }
                    }

                    if (!LogTextBox.IsDisposed && !this.IsDisposed)
                    {
                        LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] ✅ 리부트 명령이 성공적으로 처리되었습니다.\r\n");
                        LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 🔌 연결이 해제되었습니다. 리부트 완료 후 Connect 버튼을 사용하여 다시 연결하세요.\r\n");
                        LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 📋 TestResult 버튼이 '준비' 상태로 변경되었습니다.\r\n");
                    }
                    
                    // 🔧 리부트 성공 메시지 표시
                    MessageBox.Show(
                        "디바이스가 성공적으로 리부트 명령을 받았습니다.\n\n" +
                        "디바이스가 재시작 중입니다. 약 30-60초 후에\n" +
                        "Connect 버튼을 클릭하여 다시 연결해주세요.",
                        "리부트 명령 성공",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                }
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 디바이스 리부트 실패: {ex.Message}\r\n");
                }

                // FAIL이나 오류 시 - 연결 상태는 그대로 유지
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
                
                // 🔧 리부트 실패 메시지 표시
                MessageBox.Show(
                    $"디바이스 리부트 명령이 실패했습니다.\n\n오류: {ex.Message}",
                    "리부트 실패",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }
    }
}