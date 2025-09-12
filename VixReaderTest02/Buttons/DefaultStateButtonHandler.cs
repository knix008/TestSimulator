using VixReaderTest01.Utils;

namespace VixReaderTest01
{
    public partial class Main
    {
        private async void DefaultState_Click(object sender, EventArgs e)
        {
            try
            {
                Logger.LogMessage(LogTextBox, "상태 초기화 시작...");

                bool testResult = await _defaultStateApi.SetDefaultStateAsync();

                if (testResult)
                {
                    // PASS만 데이터베이스에 저장
                    await SaveTestResult("DefaultState", "PASS");
                    UpdateTestResultButton(true);
                    Logger.LogMessage(LogTextBox, "상태 초기화가 성공적으로 완료됨");
                }
                else
                {
                    // FAIL만 데이터베이스에 저장
                    await SaveTestResult("DefaultState", "FAIL");
                    UpdateTestResultButton(false);
                    Logger.LogMessage(LogTextBox, "상태 초기화 실패");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"상태 초기화 오류: {ex.Message}");

                // 🔧 연결 오류 확인 및 처리
                if (IsTlsError(ex.Message))
                {
                    // 연결 오류 시 TestResult 버튼을 "준비" 상태로 변경
                    SetTestResultReady();
                    
                    // 연결 상태도 업데이트
                    _isConnected = false;
                    ConnectButton.Text = "연결...";
                    ConnectButton.BackColor = Color.Red;
                    ConnectButton.ForeColor = SystemColors.ControlText;
                    
                    Logger.LogMessage(LogTextBox, "🔌 연결 오류로 인해 TestResult 버튼이 '준비' 상태로 변경되었습니다.");
                    
                    HandleTlsConnectionError("DefaultState", ex.Message);
                }
                else
                {
                    // 실패 시 TestResult 버튼을 빨간색으로 설정
                    UpdateTestResultButton(false);
                    // FAIL만 데이터베이스에 저장 (오류 메시지는 저장하지 않음)
                    await SaveTestResult("DefaultState", "FAIL");
                }
            }
        }
    }
}