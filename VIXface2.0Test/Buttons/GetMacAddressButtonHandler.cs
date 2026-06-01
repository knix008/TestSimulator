using VIXFaceTest.Utils;

namespace VIXFaceTest
{
    public partial class Main
    {
        private async void GetMacAddress_Click(object sender, EventArgs e)
        {
            try
            {
                string macResult = await _macAddressApi.GetMacAddressInfoAsync();

                if (!string.IsNullOrWhiteSpace(macResult) &&
                    !macResult.Equals("FAIL", StringComparison.OrdinalIgnoreCase))
                {
                    await SaveTestResult("MAC", "PASS", macResult);
                    UpdateTestResultButton(true);
                }
                else
                {
                    await SaveTestResult("MAC", "FAIL");
                    UpdateTestResultButton(false);
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"MAC 주소 조회 오류: {ex.Message}");

                if (IsTlsError(ex.Message))
                    HandleTlsConnectionError("MAC", ex.Message);
                else
                    await SaveTestResult("MAC", "FAIL", "", ex.Message);

                UpdateTestResultButton(false);
            }
        }
    }
}
