using VIXFaceTest.Utils;

namespace VIXFaceTest
{
    public partial class Main
    {
        private async void CameraTest_Click(object sender, EventArgs e)
        {
            try
            {
                bool testResult = await _cameraTestApi.RunCameraTestAsync();
                if (testResult)
                {
                    await SaveTestResult("CAMERA", "PASS");
                    UpdateTestResultButton(true);
                }
                else
                {
                    await SaveTestResult("CAMERA", "FAIL");
                    UpdateTestResultButton(false);
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"카메라 테스트 오류: {ex.Message}");
                if (IsTlsError(ex.Message))
                    HandleTlsConnectionError("CAMERA", ex.Message);
                else
                    await SaveTestResult("CAMERA", "FAIL", "", ex.Message);
                UpdateTestResultButton(false);
            }
        }
    }
}
