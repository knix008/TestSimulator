using VIXFaceTest.Utils;

namespace VIXFaceTest
{
    public partial class Main
    {
        private async void GetSerialNumber_Click(object sender, EventArgs e)
        {
            try
            {
                Logger.LogMessage(LogTextBox, "시리얼 번호 조회 시작...");

                string serialNumber = await _serialNumberApi.GetSerialNumberAsync();
                await CheckSerialNumberChangeAndCreateNewSession(serialNumber);

                await SaveTestResult("SERIAL", "PASS", serialNumber);
                UpdateTestResultButton(true);
                Logger.LogMessage(LogTextBox, $"시리얼 번호 조회 성공: {serialNumber}");

                MessageBox.Show($"현재 시리얼 번호: {serialNumber}",
                    "시리얼 번호 조회 성공",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"시리얼 번호 조회 실패: {ex.Message}");

                if (IsTlsError(ex.Message))
                    HandleTlsConnectionError("SERIAL", ex.Message);
                else
                    await SaveTestResult("SERIAL", "FAIL", "", ex.Message);

                UpdateTestResultButton(false);
            }
        }
    }
}
