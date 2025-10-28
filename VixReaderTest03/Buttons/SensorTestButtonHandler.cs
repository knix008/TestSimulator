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
                    await SaveTestResult("Sensor Test", "Hardware Test", "FAIL", "센서 테스트 실패");
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
                    HandleTlsConnectionError("DefaultState", ex.Message);
                }
                else
                {
                    // ex.Message를 포함하려면 메시지에 추가하여 4개 인수로 전달
                    await SaveTestResult("Sensor Test", "Hardware Test", "FAIL", $"센서 테스트 실패: {ex.Message}");
                }

                // 테스트 실패 시 TestResult 버튼을 빨간색상태로 설정
                UpdateTestResultButton(false);
            }
        }
    }
}