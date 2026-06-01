using VIXFaceTest.Utils;

namespace VIXFaceTest
{
    public partial class Main
    {
        private async void GetFirmwareVersion_Click(object sender, EventArgs e)
        {
            try
            {
                Logger.LogMessage(LogTextBox, "펌웨어 버전 조회 중...");

                string firmwareVersion = await _firmwareApi.GetFirmwareVersionAsync();

                await SaveTestResult("VERSION", "PASS", firmwareVersion);
                UpdateTestResultButton(true);
                Logger.LogMessage(LogTextBox, "펌웨어 버전 조회 완료");
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"펌웨어 버전 조회 실패: {ex.Message}");

                if (IsTlsError(ex.Message))
                    HandleTlsConnectionError("VERSION", ex.Message);
                else
                    await SaveTestResult("VERSION", "FAIL", "", ex.Message);

                UpdateTestResultButton(false);
            }
        }
    }
}
