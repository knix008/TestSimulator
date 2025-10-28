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
                // 선택된 색상 수집 (핸들러는 콤마로 구분된 색상 문자열을 API에 전달)
                var colors = new List<string>();
                if (LedColorRedCheckBox.Checked) colors.Add("RED");
                if (LedColorGreenCheckBox.Checked) colors.Add("GREEN");
                if (LedColorBlueCheckBox.Checked) colors.Add("BLUE");
                string? colorArg = colors.Count > 0 ? string.Join(",", colors) : null;

                // LedColorApi 인스턴스 사용 (간단히 로컬 생성)
                var ledColorApi = new LedColorApi(_tlsClient!, LogTextBox, () => CurrentIPAddress);

                string response = await ledColorApi.SendLedColorOnAsync(colorArg);
                if (!string.IsNullOrEmpty(response) && response.ToUpper().Contains("OK"))
                {
                    UpdateTestResultButton(true);
                    Logger.LogMessage(LogTextBox, "✅ LED 색상 ON 명령 성공");
                }
                else
                {
                    UpdateTestResultButton(false);
                    Logger.LogMessage(LogTextBox, "❌ LED 색상 ON 명령 실패");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"LED 색상 ON 명령 실패: {ex.Message}");

                if (IsTlsError(ex.Message))
                {
                    HandleTlsConnectionError("LED Color On", ex.Message);
                }
                else
                {
                    // DB 저장 제거: 오류는 로그로만 남기고 UI 상태만 업데이트합니다.
                    Logger.LogMessage(LogTextBox, $"LED Color On 처리 중 오류(저장 없음): {ex.Message}");
                }

                UpdateTestResultButton(false);
            }
        }

        private async void LedColorTestOffButton_Click(object sender, EventArgs e)
        {
            try
            {
                var ledColorApi = new LedColorApi(_tlsClient!, LogTextBox, () => CurrentIPAddress);

                string response = await ledColorApi.SendLedColorOffAsync();
                if (!string.IsNullOrEmpty(response) && response.ToUpper().Contains("OK"))
                {
                    UpdateTestResultButton(true);
                    Logger.LogMessage(LogTextBox, "✅ LED 색상 OFF 명령 성공");
                }
                else
                {
                    UpdateTestResultButton(false);
                    Logger.LogMessage(LogTextBox, "❌ LED 색상 OFF 명령 실패");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"LED 색상 OFF 명령 실패: {ex.Message}");

                if (IsTlsError(ex.Message))
                {
                    HandleTlsConnectionError("LED Color Off", ex.Message);
                }
                else
                {
                    // DB 저장 제거: 오류는 로그로만 남기고 UI 상태만 업데이트합니다.
                    Logger.LogMessage(LogTextBox, $"LED Color Off 처리 중 오류(저장 없음): {ex.Message}");
                }

                UpdateTestResultButton(false);
            }
        }
    }
}