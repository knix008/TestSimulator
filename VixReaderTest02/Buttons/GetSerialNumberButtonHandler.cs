using VixReaderTest01.Utils;

namespace VixReaderTest01
{
    public partial class Main
    {
        private async void GetSerialNumber_Click(object sender, EventArgs e)
        {
            try
            {
                Logger.LogMessage(LogTextBox, "시리얼 번호 조회 시작...");

                // AT+SERIAL? 명령으로 시리얼 번호 조회
                string serialNumber = await _serialNumberApi.GetSerialNumberAsync();

                await SaveTestResult("Get Serial Number", "System Info", "PASS", "시리얼 번호 조회 완료", serialNumber: serialNumber);

                // 성공 시 TestResult 버튼을 초록색상태로 설정
                UpdateTestResultButton(true);

                Logger.LogMessage(LogTextBox, $"시리얼 번호 조회 성공: {serialNumber}");

                // 시리얼 번호를 팝업으로 표시
                MessageBox.Show($"현재 시리얼 번호: {serialNumber}", 
                               "시리얼 번호 조회 성공", 
                               MessageBoxButtons.OK, 
                               MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"시리얼 번호 조회 실패: {ex.Message}");

                if (IsTlsError(ex.Message))
                {
                    await HandleOpenSslConnectionError("Get Serial Number", "System Info", ex.Message);
                }
                else
                {
                    await SaveTestResult("Get Serial Number", "System Info", "FAIL", "시리얼 번호 조회 실패", ex.Message);
                }

                // 실패 시 TestResult 버튼을 빨간색상태로 설정
                UpdateTestResultButton(false);

                // 실패 시 사용자에게 오류 메시지 표시
                MessageBox.Show($"시리얼 번호 조회에 실패했습니다.\n\n오류: {ex.Message}", 
                               "시리얼 번호 조회 실패", 
                               MessageBoxButtons.OK, 
                               MessageBoxIcon.Error);
            }
        }
    }
}