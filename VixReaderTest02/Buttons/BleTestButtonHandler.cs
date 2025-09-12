using VixReaderTest01.Utils;

namespace VixReaderTest01
{
    public partial class Main
    {
        private async void BleTest_Click(object sender, EventArgs e)
        {
            try
            {
                Logger.LogMessage(LogTextBox, "BLE 테스트 시작...");

                // API에서 서버 응답을 포함하여 결과 받기
                bool testResult = await _bleTestApi.RunBleTestAsync();
                string serverResponse = "";

                if (testResult)
                {
                    await SaveTestResult("BLE", "PASS", serverResponse, "");
                    UpdateTestResultButton(true);
                    Logger.LogMessage(LogTextBox, "BLE 테스트 성공적으로 완료됨");
                }
                else
                {
                    await SaveTestResult("BLE", "FAIL", serverResponse, "서버에서 실패 응답을 받았습니다.");
                    UpdateTestResultButton(false);
                    Logger.LogMessage(LogTextBox, "BLE 테스트 실패");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"BLE 테스트 오류: {ex.Message}");

                if (IsTlsError(ex.Message))
                {
                    HandleTlsConnectionError("BLE", ex.Message);
                }
                else
                {
                    await SaveTestResult("BLE", "FAIL", "", ex.Message);
                }

                UpdateTestResultButton(false);
            }
        }
    }
}