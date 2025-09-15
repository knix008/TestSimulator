using System.Net;
using VixReaderTest01.Utils;

namespace VixReaderTest01
{
    public partial class Main
    {
        private async void ConnectButton_Click(object sender, EventArgs e)
        {
            try
            {
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
                Logger.LogMessage(LogTextBox, $"연결 처리 중 오류: {ex.Message}");
                MessageBox.Show($"연결 처리 중 오류가 발생했습니다:\n\n{ex.Message}", 
                               "연결 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private async Task ConnectAsync()
        {
            // 🔧 Connect 버튼을 누를 때 텍스트박스에서 직접 IP 주소 가져오기
            string targetIP = GetCurrentIPAddress();
            
            try
            {
                ConnectButton.Text = "연결 중...";
                ConnectButton.Enabled = false;
                
                Logger.LogMessage(LogTextBox, $"장치 연결 시도... (대상: {targetIP}:8443)");

                // 🔧 Connect 버튼이 눌렸을 때 텍스트박스의 IP 주소로 연결 시도
                await TestAtConnectionAsync(targetIP);
                
                // 연결 성공
                _isConnected = true;
                ConnectButton.Text = "연결 해제";
                ConnectButton.BackColor = Color.LightGreen;
                ConnectButton.ForeColor = Color.Black;
                ConnectButton.Enabled = true;
                
                Logger.LogMessage(LogTextBox, "✅ 장치 연결 성공!");
                
                // 연결 성공 시 TestResult 버튼을 "연결됨" 상태로 설정
                SetTestResultConnected();
                
                // 연결 성공 팝업
                MessageBox.Show($"장치에 성공적으로 연결되었습니다.\n\n대상 주소: {targetIP}:8443\n연결 시간: {DateTime.Now:yyyy-MM-dd HH:mm:ss}", 
                               "연결 성공", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"❌ 장치 연결 실패: {ex.Message}");
                
                // 연결 실패 시 상태 초기화
                _isConnected = false;
                ConnectButton.Text = "연결...";
                ConnectButton.BackColor = Color.Red;
                ConnectButton.ForeColor = SystemColors.ControlText;
                ConnectButton.Enabled = true;
                
                // 연결 실패 시 TestResult 버튼을 "준비" 상태로 설정
                SetTestResultReady();
                
                // 연결 실패 팝업
                MessageBox.Show($"장치 연결에 실패했습니다.\n\n오류 내용: {ex.Message}\n\n" +
                               "가능한 원인:\n" +
                               "• 장치가 네트워크에 연결되지 않음\n" +
                               $"• {targetIP}:8443 서버가 실행되지 않음\n" +
                               "• 방화벽이 연결을 차단함\n" +
                               "• OpenSSL이 시스템에 설치되지 않음\n\n" +
                               "설정을 확인한 후 다시 시도해주세요.",
                               "연결 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 🔧 현재 IP 주소를 텍스트박스에서 직접 가져오는 메서드
        private string GetCurrentIPAddress()
        {
            try
            {
                // IPAddressTextBox에서 직접 텍스트 가져오기
                string ipText = IPAddressTextBox?.Text?.Trim() ?? "";
                
                // 빈 값이면 localhost 사용
                if (string.IsNullOrWhiteSpace(ipText))
                {
                    ipText = "localhost";
                }
                
                Logger.LogMessage(LogTextBox, $"🔍 텍스트박스에서 가져온 IP 주소: '{ipText}'");
                
                return ipText;
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"⚠️ IP 주소 가져오기 실패: {ex.Message}, localhost 사용");
                return "localhost";
            }
        }

        // 🔧 AT 명령을 사용한 연결 테스트 메서드 - 지정된 IP 주소로 연결
        private async Task TestAtConnectionAsync(string targetIPAddress)
        {
            try
            {
                Logger.LogMessage(LogTextBox, $"TLS 연결 테스트 시작 - 대상: {targetIPAddress}:8443");

                // 🔧 Connect 버튼을 누를 때마다 항상 새로운 TLS 클라이언트 생성
                // 기존 클라이언트가 있으면 조용히 해제
                if (_tlsClient != null)
                {
                    _tlsClient.Dispose();
                    Logger.LogMessage(LogTextBox, "기존 TLS 클라이언트 해제");
                }
                
                // 🔧 지정된 IP 주소로 새 TLS 클라이언트 생성
                _tlsClient = new TlsClient(targetIPAddress, 8443, LogTextBox, () => _isConnected);
                Logger.LogMessage(LogTextBox, $"새로운 TLS 클라이언트 생성: {targetIPAddress}:8443");
                
                // 🔧 CurrentIPAddress 속성도 업데이트
                CurrentIPAddress = targetIPAddress;
                
                // 🔧 ConnectAsync 메서드가 내부적으로 "AT" 및 "AT+TEST=BEGIN" 명령을 처리함
                await _tlsClient.ConnectAsync();
                
                Logger.LogMessage(LogTextBox, "TLS 연결 및 테스트 설정 완료");
            }
            catch (InvalidOperationException opEx)
            {
                Logger.LogMessage(LogTextBox, $"❌ TLS 연결 오류: {opEx.Message}");
                throw;
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"❌ TLS 테스트 오류: {ex.Message}");
                throw new InvalidOperationException($"TLS를 통한 AT 명령 연결에 실패했습니다: {ex.Message}");
            }
        }

        private async Task DisconnectAsync()
        {
            try
            {
                Logger.LogMessage(LogTextBox, "장치 연결 해제 중...");
                
                // TLS 클라이언트 연결 해제 (인스턴스는 유지)
                if (_tlsClient != null)
                {
                    await _tlsClient.DisconnectAsync();
                }
                
                _isConnected = false;
                ConnectButton.Text = "연결...";
                ConnectButton.BackColor = Color.Red;
                ConnectButton.ForeColor = SystemColors.ControlText;
                
                // 연결 해제 시 TestResult 버튼을 "준비" 상태로 변경
                SetTestResultReady();
                
                Logger.LogMessage(LogTextBox, "장치 연결 해제 완료");
                Logger.LogMessage(LogTextBox, "📋 TestResult 버튼이 '준비' 상태로 변경되었습니다.");
                
                // 연결 해제 팝업
                MessageBox.Show("장치 연결이 해제되었습니다.", 
                               "연결 해제", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"연결 해제 중 오류: {ex.Message}");
                throw;
            }
        }
    }
}