using System.Net; // 이 줄을 파일 상단에 추가하세요.

namespace VixReaderTest01
{
    public partial class Main
    {
        private async void ConnectButton_Click(object sender, EventArgs e)
        {
            try
            {
                if (!ValidateInterfaceSelection())
                {
                    return;
                }

                if (_isConnected)
                {
                    // 연결 해제
                    await DisconnectAsync();
                }
                else
                {
                    // 연결 시도
                    await ConnectAsync();
                }
            }
            catch (Exception ex)
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 연결 처리 중 오류: {ex.Message}\r\n");
                MessageBox.Show($"연결 처리 중 오류가 발생했습니다:\n\n{ex.Message}", 
                               "연결 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private async Task ConnectAsync()
        {
            try
            {
                ConnectButton.Text = "연결 중...";
                ConnectButton.Enabled = false;
                
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 장치 연결 시도 시작...\r\n");
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 대상 주소: {CurrentIPAddress}\r\n");

                // 단순 연결 테스트
                await TestConnectionAsync();
                
                // 연결 성공
                _isConnected = true;
                ConnectButton.Text = "연결 해제";
                ConnectButton.BackColor = Color.LightGreen;
                
                // 테스트 버튼들 활성화
                SetTestButtonsEnabled(true);
                
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 장치 연결 성공!\r\n");
                
                // 연결 성공 시 TestResult 버튼을 PASS 상태로 설정
                UpdateTestResultButton(true);
                
                // 연결 성공 팝업
                MessageBox.Show($"장치에 성공적으로 연결되었습니다.\n\n대상 주소: {CurrentIPAddress}\n연결 시간: {DateTime.Now:yyyy-MM-dd HH:mm:ss}", 
                               "연결 성공", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 장치 연결 실패: {ex.Message}\r\n");
                
                // 연결 실패 시 TestResult 버튼을 NO CONNECTION 상태로 설정
                UpdateTestResultButton(false, true);
                
                // 연결 실패 팝업
                MessageBox.Show($"장치 연결에 실패했습니다.\n\n오류 내용: {ex.Message}\n\n" +
                               "가능한 원인:\n" +
                               "• 장치가 네트워크에 연결되지 않음\n" +
                               "• IP 주소가 잘못됨\n" +
                               "• 장치 서버가 실행되지 않음\n" +
                               "• 방화벽이 연결을 차단함\n\n" +
                               "설정을 확인한 후 다시 시도해주세요.",
                               "연결 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                ConnectButton.Text = "연결...";
                ConnectButton.Enabled = true;
            }
        }

        // 순수 연결 테스트 메서드
        private async Task TestConnectionAsync()
        {
            try
            {
                string endpoint = $"https://{CurrentIPAddress}:8443/";
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 연결 테스트 중: {endpoint}\r\n");

                // 단순 HEAD 요청으로 서버 응답만 확인
                using (var request = new HttpRequestMessage(HttpMethod.Head, endpoint))
                {
                    HttpResponseMessage response = await _httpClient.SendAsync(request);
                    
                    if (response.IsSuccessStatusCode || response.StatusCode == HttpStatusCode.NotFound)
                    {
                        // 200 OK 또는 404 Not Found도 서버가 응답한다는 의미이므로 연결 성공으로 간주
                        LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 서버 응답 확인됨 (HTTP {response.StatusCode})\r\n");
                        return;
                    }
                    else
                    {
                        throw new HttpRequestException($"서버 응답 오류: HTTP {response.StatusCode}");
                    }
                }
            }
            catch (HttpRequestException httpEx)
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] HTTP 연결 오류: {httpEx.Message}\r\n");
                throw;
            }
            catch (TaskCanceledException)
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 연결 시간 초과\r\n");
                throw new TimeoutException("장치 연결 시간이 초과되었습니다.");
            }
            catch (Exception ex)
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 연결 테스트 오류: {ex.Message}\r\n");
                throw new InvalidOperationException($"장치 연결에 실패했습니다: {ex.Message}");
            }
        }

        private Task DisconnectAsync()
        {
            try
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 장치 연결 해제 중...\r\n");
                
                _isConnected = false;
                ConnectButton.Text = "연결...";
                ConnectButton.BackColor = SystemColors.Control;
                
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 장치 연결이 해제되었습니다.\r\n");
                
                // 연결 해제 팝업
                MessageBox.Show("장치 연결이 해제되었습니다.", 
                               "연결 해제", MessageBoxButtons.OK, MessageBoxIcon.Information);
                
                return Task.CompletedTask;
            }
            catch (Exception ex)
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 연결 해제 중 오류: {ex.Message}\r\n");
                throw;
            }
        }
    }
}