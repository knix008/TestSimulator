using VixReaderTest01.Utils;
using VixAirTest01.APIs;

namespace VixReaderTest01
{
    public partial class Main
    {
        private async void LedColorTestOnButton_Click(object sender, EventArgs e)
        {
            try
            {
                // 체크박스 상태 읽기
                bool isRed = LedColorRedCheckBox.Checked;
                bool isGreen = LedColorGreenCheckBox.Checked;
                bool isBlue = LedColorBlueCheckBox.Checked;

                // LedColorApi 인스턴스 생성
                var ledColorApi = new LedColorApi(_tlsClient!, LogTextBox, () => CurrentIPAddress);

                // 병령어 생성 및 전송
                string response = await ledColorApi.SendLedColorAsync(isRed, isGreen, isBlue);
                if (!string.IsNullOrEmpty(response) && response.ToUpper().Contains("OK"))
                {
                    UpdateTestResultButton(true);
                    Logger.LogMessage(LogTextBox, "✅ LED 색상 명령 성공");
                }
                else
                {
                    UpdateTestResultButton(false);
                    Logger.LogMessage(LogTextBox, "❌ LED 색상 명령 실패");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"LED 색상 명령 실패: {ex.Message}");

                if (IsTlsError(ex.Message))
                {
                    HandleTlsConnectionError("LED Color", ex.Message);
                }
                else
                {
                    Logger.LogMessage(LogTextBox, $"LED Color 처리 중 오류(저장 없음): {ex.Message}");
                }

                UpdateTestResultButton(false);
            }
        }
    }
}