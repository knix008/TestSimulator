using System.Text;
using System.Text.Json;
using VIXFaceTest.Utils;

namespace VIXFaceTest.APIs
{
    public class SerialNumberApi
    {
        private readonly TlsClient _tlsClient;
        private readonly TextBox _logTextBox;
        private readonly Func<string> _getIPAddress;

        public SerialNumberApi(TlsClient tlsClient, TextBox logTextBox, Func<string> getIPAddress)
        {
            _tlsClient = tlsClient;
            _logTextBox = logTextBox;
            _getIPAddress = getIPAddress;
        }

        public async Task<string> GetSerialNumberAsync()
        {
            try
            {
                LogMessage("시리얼 번호 조회 시작...");
                LogMessage("AT+SERIAL? 명령을 전송합니다...");

                // AT+SERIAL? 명령 전송
                string response = await _tlsClient.SendAtCommandAsync("AT+SERIAL?");

                LogMessage($"서버 응답: {response}");

                // 응답 분석
                if (string.IsNullOrEmpty(response))
                {
                    throw new InvalidOperationException("서버로부터 응답을 받지 못했습니다.");
                }

                // FAIL 응답 확인
                string normalizedResponse = response.Trim().ToUpper();
                
                if (normalizedResponse.Contains("FAIL"))
                {
                    LogMessage("❌ 시리얼 번호 조회 실패!");
                    throw new InvalidOperationException("시리얼 번호 조회에 실패했습니다. 서버가 FAIL을 응답했습니다.");
                }

                // 시리얼 번호 추출 (FAIL이 아닌 경우 시리얼 번호로 간주)
                string serialNumber = response.Trim();
                
                // 기본적인 시리얼 번호 형태 검증
                if (serialNumber.Length < 3)
                {
                    LogMessage("⚠️ 시리얼 번호가 너무 짧습니다!");
                    throw new InvalidOperationException($"유효하지 않은 시리얼 번호입니다: '{serialNumber}'");
                }

                LogMessage($"✅ 시리얼 번호 조회 성공: {serialNumber}");
                return serialNumber;
            }
            catch (Exception ex)
            {
                LogMessage($"시리얼 번호 조회 실패: {ex.Message}");
                throw;
            }
        }

        public async Task SetSerialNumberAsync(string serialNumber)
        {
            try
            {
                LogMessage("시리얼 번호 설정 시작...");
                LogMessage($"AT+SERIAL={serialNumber} 명령을 전송합니다...");

                // AT+SERIAL=값 명령 전송
                string response = await _tlsClient.SendAtCommandAsync($"AT+SERIAL={serialNumber}");

                LogMessage($"서버 응답: {response}");

                // 응답 분석
                if (string.IsNullOrEmpty(response))
                {
                    throw new InvalidOperationException("서버로부터 응답을 받지 못했습니다.");
                }

                // OK 또는 FAIL 응답 확인
                string normalizedResponse = response.Trim().ToUpper();
                
                if (normalizedResponse.Contains("OK"))
                {
                    LogMessage($"✅ 시리얼 번호 설정 성공: {serialNumber}");
                    LogMessage("시리얼 번호가 성공적으로 설정되었습니다.");
                }
                else if (normalizedResponse.Contains("FAIL"))
                {
                    LogMessage("❌ 시리얼 번호 설정 실패!");
                    throw new InvalidOperationException("시리얼 번호 설정에 실패했습니다. 서버가 FAIL을 응답했습니다.");
                }
                else
                {
                    LogMessage("⚠️ 예상치 못한 응답!");
                    throw new InvalidOperationException($"예상치 못한 응답을 받았습니다: '{response}'. 'OK' 또는 'FAIL'을 기대했습니다.");
                }

                LogMessage("시리얼 번호 설정 완료");
            }
            catch (Exception ex)
            {
                LogMessage($"시리얼 번호 설정 실패: {ex.Message}");
                throw;
            }
        }

        private void LogMessage(string message)
        {
            if (_logTextBox.InvokeRequired)
            {
                _logTextBox.Invoke(() => _logTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}\r\n"));
            }
            else
            {
                _logTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}\r\n");
            }
        }
    }
}