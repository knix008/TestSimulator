using VIXFaceTest.Utils;

namespace VIXFaceTest
{
    public partial class Main
    {
        private async void Report_Click(object sender, EventArgs e)
        {
            try
            {
                using var saveFileDialog = new SaveFileDialog
                {
                    Title = "테스트 결과 리포트 저장",
                    Filter = "CSV 파일 (*.csv)|*.csv|모든 파일 (*.*)|*.*",
                    DefaultExt = "csv",
                    FileName = $"TestReport_{DateTime.Now:yyyyMMdd_HHmmss}.csv",
                    InitialDirectory = Application.StartupPath
                };

                if (saveFileDialog.ShowDialog() != DialogResult.OK)
                {
                    Logger.LogMessage(LogTextBox, "리포트 저장이 취소되었습니다.");
                    return;
                }

                Logger.LogMessage(LogTextBox, "테스트 결과 리포트 생성 중...");

                var dateRangeResult = MessageBox.Show(
                    "특정 기간의 데이터만 보내시겠습니까?\n\n" +
                    "예: 날짜 범위 지정\n" +
                    "아니오: 모든 데이터 보내기",
                    "날짜 범위 선택",
                    MessageBoxButtons.YesNoCancel,
                    MessageBoxIcon.Question);

                if (dateRangeResult == DialogResult.Cancel)
                {
                    Logger.LogMessage(LogTextBox, "리포트 생성이 취소되었습니다.");
                    return;
                }

                DateTime? startDate = null;
                DateTime? endDate = null;

                if (dateRangeResult == DialogResult.Yes)
                {
                    var dateRangeForm = new DateRangeSelectionForm();
                    if (dateRangeForm.ShowDialog() == DialogResult.OK)
                    {
                        startDate = dateRangeForm.StartDate;
                        endDate = dateRangeForm.EndDate;
                        Logger.LogMessage(LogTextBox, $"선택된 기간: {startDate:yyyy-MM-dd} ~ {endDate:yyyy-MM-dd}");
                    }
                    else
                    {
                        Logger.LogMessage(LogTextBox, "리포트 생성이 취소되었습니다.");
                        return;
                    }
                }

                string result = await _testResultService.ExportToCsvAsync(saveFileDialog.FileName, startDate, endDate);
                Logger.LogMessage(LogTextBox, result);

                if (result.Contains("성공적으로 생성", StringComparison.Ordinal))
                {
                    var openFileResult = MessageBox.Show(
                        result + "\n\n파일을 열어보시겠습니까?",
                        "리포트 생성 완료",
                        MessageBoxButtons.YesNo,
                        MessageBoxIcon.Information);

                    if (openFileResult == DialogResult.Yes)
                    {
                        try
                        {
                            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                            {
                                FileName = saveFileDialog.FileName,
                                UseShellExecute = true
                            });
                        }
                        catch (Exception ex)
                        {
                            MessageBox.Show($"파일을 열 수 없습니다: {ex.Message}",
                                "오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        }
                    }
                }
                else
                {
                    MessageBox.Show(result, "리포트 생성 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"리포트 생성 오류: {ex.Message}");
                MessageBox.Show($"리포트 생성 중 오류가 발생했습니다:\n\n{ex.Message}",
                    "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
