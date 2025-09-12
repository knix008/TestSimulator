using VixReaderTest01.Utils;

namespace VixReaderTest01
{
    public partial class Main
    {
        private async void SensorTest_Click(object sender, EventArgs e)
        {
            try
            {
                Logger.LogMessage(LogTextBox, "센서 테스트 시작...");

                bool testResult = await _sensorTestApi.RunSensorTestAsync();

                if (testResult)
                {
                    await SaveTestResult("Sensor Test", "Hardware Test", "PASS", "센서 테스트 완료");
                    // 테스트 성공 시 TestResult 버튼을 초록색상태로 설정
                    UpdateTestResultButton(true);
                    Logger.LogMessage(LogTextBox, "센서 테스트 성공적으로 완료됨");
                }
                else
                {
                    await SaveTestResult("Sensor Test", "Hardware Test", "FAIL", "센서 테스트 실패", "서버가 FAIL을 응답했습니다.");
                    // 테스트 실패 시 TestResult 버튼을 빨간색상태로 설정
                    UpdateTestResultButton(false);
                    Logger.LogMessage(LogTextBox, "센서 테스트 실패");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"센서 테스트 오류: {ex.Message}");

                if (IsTlsError(ex.Message))
                {
                    await HandleOpenSslConnectionError("Sensor Test", "Hardware Test", ex.Message);
                }
                else
                {
                    await SaveTestResult("Sensor Test", "Hardware Test", "FAIL", "센서 테스트 실패", ex.Message);
                }

                // 테스트 실패 시 TestResult 버튼을 빨간색상태로 설정
                UpdateTestResultButton(false);
            }
        }
    }
}