using FileMasterWinV10.Helpers;
using FileMasterWinV10.Models;

namespace FileMasterWinV10.Dialogs;

public partial class FileOperationProgressDialog : Form
{
    private const int MinUpdateIntervalMs = 40;

    public event Action? CancelRequested;

    private FileOperationProgress _latest;
    private DateTime _lastApplied = DateTime.MinValue;
    private bool _closeScheduled;
    private DialogResult _pendingResult = DialogResult.None;
    private string? _pendingErrorMessage;

    public FileOperationProgressDialog() : this("작업 진행")
    {
    }

    public FileOperationProgressDialog(string title)
    {
        InitializeComponent();
        Text = title;

        if (!AppIconHelper.IsDesignMode(this))
        {
            UiTheme.ApplyForm(this);
            UiTheme.StyleSecondaryButton(cancelButton);
            currentLabel.ForeColor = UiTheme.TextPrimary;
            countLabel.ForeColor = UiTheme.TextSecondary;
            countLabel.Font = UiTheme.UiFontSmall;
            cancelButton.Click += (_, _) =>
            {
                cancelButton.Enabled = false;
                currentLabel.Text = "취소하는 중...";
                CancelRequested?.Invoke();
            };
        }
    }

    public void ReportProgress(FileOperationProgress progress)
    {
        if (IsDisposed) return;
        _latest = progress;

        if (InvokeRequired)
        {
            BeginInvoke(ApplyLatestProgress);
            return;
        }

        ApplyLatestProgress();
    }

    private void ApplyLatestProgress()
    {
        if (IsDisposed) return;

        var now = DateTime.UtcNow;
        bool isDone = _latest.Total > 0 && _latest.Completed >= _latest.Total;
        if (!isDone && (now - _lastApplied).TotalMilliseconds < MinUpdateIntervalMs)
            return;

        _lastApplied = now;

        if (_latest.Total <= 0)
        {
            progressBar.Style = ProgressBarStyle.Marquee;
            progressBar.MarqueeAnimationSpeed = 30;
            countLabel.Text = _latest.Completed > 0 ? _latest.CountText : "준비 중...";
        }
        else
        {
            progressBar.Style = ProgressBarStyle.Continuous;
            progressBar.Maximum = Math.Max(_latest.Total, 1);
            progressBar.Value = Math.Min(progressBar.Maximum, _latest.Completed);
            countLabel.Text = _latest.CountText;
        }

        currentLabel.Text = string.IsNullOrEmpty(_latest.CurrentPath)
            ? "처리 중..."
            : _latest.CurrentPath;
    }

    public void FinishSuccess() => ScheduleClose(DialogResult.OK);

    public void FinishCancelled() => ScheduleClose(DialogResult.Cancel);

    public void FinishFailed(string message)
    {
        _pendingErrorMessage = message;
        ScheduleClose(DialogResult.Abort);
    }

    private void ScheduleClose(DialogResult result)
    {
        if (_closeScheduled) return;
        _closeScheduled = true;
        _pendingResult = result;

        if (InvokeRequired)
            BeginInvoke(CloseAfterPaint);
        else
            CloseAfterPaint();
    }

    private void CloseAfterPaint()
    {
        ApplyLatestProgress();

        if (!string.IsNullOrEmpty(_pendingErrorMessage))
            MessageBox.Show(this, _pendingErrorMessage, Text, MessageBoxButtons.OK, MessageBoxIcon.Error);

        DialogResult = _pendingResult;
        Close();
    }
}
