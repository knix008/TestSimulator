using VIXFaceTest.Utils;

namespace VIXFaceTest
{
    public partial class Main
    {
        private async void DbResetButton_Click(object sender, EventArgs e)
        {
            var confirm = MessageBox.Show(
                "test_results.db의 모든 테스트 기록을 삭제하고\n테이블 스키마를 새로 만듭니다.\n\n이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?",
                "DB 초기화 확인",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning,
                MessageBoxDefaultButton.Button2);

            if (confirm != DialogResult.Yes)
            {
                Logger.LogMessage(LogTextBox, "DB 초기화가 취소되었습니다.");
                return;
            }

            try
            {
                int deletedRows = await _testResultService.ResetDatabaseAsync();

                _currentSessionId = 0;
                _lastRetrievedSerialNumber = string.Empty;
                SetTestResultReady();

                Logger.LogMessage(LogTextBox, $"DB 초기화 완료: {deletedRows}건 삭제, 스키마 재생성됨");
                MessageBox.Show(
                    $"삭제된 기록: {deletedRows}건\n테이블이 현재 앱 스키마로 다시 생성되었습니다.",
                    "DB 초기화 완료",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"DB 초기화 실패: {ex.Message}");
                MessageBox.Show(
                    $"DB 초기화 중 오류가 발생했습니다.\n\n{ex.Message}",
                    "DB 초기화 실패",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }
    }
}
