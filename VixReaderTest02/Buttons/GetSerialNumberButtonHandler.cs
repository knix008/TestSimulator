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

                // 성공 시 조회한 시리얼 번호만 DB에 저장
                await SaveTestResult("Get Serial Number", serialNumber);

                UpdateTestResultButton(true);
                Logger.LogMessage(LogTextBox, $"시리얼 번호 조회 성공: {serialNumber}");

                MessageBox.Show($"현재 시리얼 번호: {serialNumber}", 
                               "시리얼 번호 조회 성공", 
                               MessageBoxButtons.OK, 
                               MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"시리얼 번호 조회 오류: {ex.Message}");

                if (IsTlsError(ex.Message))
                {
                    HandleTlsConnectionError("Get Serial Number", ex.Message);
                }
                else
                {
                    // 실패 시 "FAIL"만 DB에 저장
                    await SaveTestResult("Get Serial Number", "FAIL");
                }

                UpdateTestResultButton(false);
            }
        }
    }
}