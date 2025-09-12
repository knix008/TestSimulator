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
            try
            {
                ConnectButton.Text = "연결 중...";
                ConnectButton.Enabled = false;
                
                Logger.LogMessage(LogTextBox, "장치 연결 시도 (localhost:8443)...");

                // AT 명령을 사용한 연결 테스트 (기존 _tlsClient 인스턴스 사용)
                await TestAtConnectionAsync();
                
                // 연결 성공
                _isConnected = true;
                ConnectButton.Text = "연결 해제";
                ConnectButton.BackColor = Color.LightGreen;
                ConnectButton.ForeColor = Color.Black; // 텍스트 색상을 검은색으로 설정
                ConnectButton.Enabled = true;
                
                Logger.LogMessage(LogTextBox, "✅ 장치 연결 성공!");
                
                // 연결 성공 시 TestResult 버튼을 "연결됨" 상태로 설정
                SetTestResultConnected();
                
                // 연결 성공 팝업
                MessageBox.Show($"장치에 성공적으로 연결되었습니다.\n\n대상 주소: localhost:8443\n연결 시간: {DateTime.Now:yyyy-MM-dd HH:mm:ss}", 
                               "연결 성공", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"❌ 장치 연결 실패: {ex.Message}");
                
                // 연결 실패 시 상태 초기화
                _isConnected = false;
                ConnectButton.Text = "연결...";
                ConnectButton.BackColor = Color.Red;
                ConnectButton.ForeColor = SystemColors.ControlText; // 기본 텍스트 색상으로 복원
                ConnectButton.Enabled = true;
                
                // 연결 실패 시 TestResult 버튼을 "준비" 상태로 설정
                SetTestResultReady();
                
                // 연결 실패 팝업
                MessageBox.Show($"장치 연결에 실패했습니다.\n\n오류 내용: {ex.Message}\n\n" +
                               "가능한 원인:\n" +
                               "• 장치가 네트워크에 연결되지 않음\n" +
                               "• localhost:8443 서버가 실행되지 않음\n" +
                               "• 방화벽이 연결을 차단함\n" +
                               "• OpenSSL이 시스템에 설치되지 않음\n\n" +
                               "설정을 확인한 후 다시 시도해주세요.",
                               "연결 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // AT 명령을 사용한 연결 테스트 메서드
        private async Task TestAtConnectionAsync()
        {
            try
            {
                Logger.LogMessage(LogTextBox, "TLS 연결 테스트 시작");

                // 🔧 기존 _tlsClient 인스턴스 사용 (새로 생성하지 않음)
                // Main 생성자에서 이미 생성된 _tlsClient를 재사용
                if (_tlsClient == null)
                {
                    throw new InvalidOperationException("TLS 클라이언트가 초기화되지 않았습니다.");
                }
                
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
                
                // 🔧 TLS 클라이언트 연결 해제 (인스턴스는 유지) - await 추가
                if (_tlsClient != null)
                {
                    await _tlsClient.DisconnectAsync();
                }
                
                _isConnected = false;
                ConnectButton.Text = "연결...";
                ConnectButton.BackColor = Color.Red;
                ConnectButton.ForeColor = SystemColors.ControlText; // 기본 텍스트 색상으로 복원
                
                // 🔧 연결 해제 시 TestResult 버튼을 "준비" 상태로 변경
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