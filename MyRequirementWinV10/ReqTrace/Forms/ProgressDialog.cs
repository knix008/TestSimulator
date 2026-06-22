using ReqTrace.Importing;
using ReqTrace.Localization;
using ReqTrace.Theme;

namespace ReqTrace.Forms;

/// <summary>
/// Modal progress dialog for long-running work. Shows current step, detail, percent, and optional elapsed time.
/// </summary>
public partial class ProgressDialog : Form
{
    private readonly bool _showElapsedTime;
    private readonly System.Windows.Forms.Timer _autoCloseTimer;
    private DateTime _startedUtc;
    private bool _workCompleted;

    public event Action? CancelRequested;

    public ProgressDialog(string title, string message, bool allowCancel = false, bool showElapsedTime = false)
    {
        _showElapsedTime = showElapsedTime;
        InitializeComponent();
        Text = title;
        lblStep.Text = message;
        lblDetail.Text = string.Empty;
        progressBar.Minimum = 0;
        progressBar.Maximum = 100;
        progressBar.Value = 0;
        progressBar.Style = ProgressBarStyle.Continuous;
        btnCancel.Text = Loc.T("Common_Cancel");
        btnCancel.Visible = allowCancel;

        if (allowCancel)
            CancelButton = btnCancel;
        else
        {
            layoutTable.RowStyles[5].Height = 0;
            btnCancel.Visible = false;
        }

        if (!_showElapsedTime)
        {
            layoutTable.RowStyles[4].Height = 0;
            lblElapsed.Visible = false;
        }

        ApplyDialogSize(allowCancel, _showElapsedTime);
        ModernTheme.Apply(this);
        lblStep.Font = new Font(ModernTheme.BoldFont.FontFamily, ModernTheme.BoldFont.Size, FontStyle.Bold);
        SetProgress(0);
        TopMost = true;

        _autoCloseTimer = new System.Windows.Forms.Timer(components!) { Interval = 600 };
        _autoCloseTimer.Tick += (_, _) =>
        {
            _autoCloseTimer.Stop();
            CloseDialog();
        };

        Shown += (_, _) =>
        {
            if (!_showElapsedTime)
                return;

            _startedUtc = DateTime.UtcNow;
            UpdateElapsedDisplay();
            elapsedTimer.Start();
        };

        FormClosed += (_, _) =>
        {
            elapsedTimer.Stop();
            _autoCloseTimer.Stop();
        };
    }

    public TimeSpan Elapsed =>
        _showElapsedTime ? DateTime.UtcNow - _startedUtc : TimeSpan.Zero;

    public void SetProgress(int percent)
    {
        if (InvokeRequired)
        {
            if (IsDisposed)
                return;

            try
            {
                BeginInvoke(() => SetProgress(percent));
            }
            catch (ObjectDisposedException)
            {
            }

            return;
        }

        if (IsDisposed)
            return;

        var clamped = Math.Clamp(percent, 0, 100);
        progressBar.Value = clamped;
        lblPercent.Text = $"{clamped}%";

        if (clamped >= 100)
            MarkWorkCompleted();
    }

    public void SetMessage(string message)
    {
        if (InvokeRequired)
        {
            if (IsDisposed)
                return;

            try
            {
                BeginInvoke(() => SetMessage(message));
            }
            catch (ObjectDisposedException)
            {
            }

            return;
        }

        if (IsDisposed)
            return;

        lblStep.Text = message;
    }

    public void SetProgress(ImportProgressReport report)
    {
        if (InvokeRequired)
        {
            if (IsDisposed)
                return;

            try
            {
                BeginInvoke(() => SetProgress(report));
            }
            catch (ObjectDisposedException)
            {
            }

            return;
        }

        if (IsDisposed)
            return;

        var clamped = Math.Clamp(report.Percent, 0, 100);
        progressBar.Value = clamped;
        lblPercent.Text = $"{clamped}%";

        if (!string.IsNullOrWhiteSpace(report.Step))
            lblStep.Text = report.Step;

        if (!string.IsNullOrWhiteSpace(report.Detail))
        {
            layoutTable.RowStyles[1].Height = 40;
            lblDetail.Visible = true;
            lblDetail.Text = report.Detail;
        }
        else
        {
            lblDetail.Text = string.Empty;
            lblDetail.Visible = false;
            layoutTable.RowStyles[1].Height = 0;
        }

        if (clamped >= 100)
            MarkWorkCompleted();
    }

    public void MarkWorkCompleted(bool scheduleAutoCloseFallback = true)
    {
        if (InvokeRequired)
        {
            if (IsDisposed)
                return;

            try
            {
                BeginInvoke(() => MarkWorkCompleted(scheduleAutoCloseFallback));
            }
            catch (ObjectDisposedException)
            {
            }

            return;
        }

        if (IsDisposed || _workCompleted)
            return;

        _workCompleted = true;
        TopMost = false;

        if (btnCancel.Visible)
        {
            btnCancel.Text = Loc.T("Common_Close");
            btnCancel.Enabled = true;
            CancelButton = btnCancel;
        }

        if (scheduleAutoCloseFallback)
            _autoCloseTimer.Start();
    }

    public void SetCancelEnabled(bool enabled)
    {
        if (InvokeRequired)
        {
            if (IsDisposed)
                return;

            try
            {
                BeginInvoke(() => SetCancelEnabled(enabled));
            }
            catch (ObjectDisposedException)
            {
            }

            return;
        }

        if (IsDisposed)
            return;

        if (btnCancel.Visible)
            btnCancel.Enabled = enabled;
    }

    public void CloseDialog()
    {
        if (InvokeRequired)
        {
            try
            {
                Invoke(CloseDialog);
            }
            catch (ObjectDisposedException)
            {
            }

            return;
        }

        if (IsDisposed)
            return;

        _autoCloseTimer.Stop();
        Close();
    }

    private void elapsedTimer_Tick(object? sender, EventArgs e) => UpdateElapsedDisplay();

    private void UpdateElapsedDisplay()
    {
        if (!_showElapsedTime)
            return;

        lblElapsed.Text = Loc.T("Progress_Elapsed", ElapsedTimeFormatter.FormatDuration(Elapsed));
    }

    private void ApplyDialogSize(bool allowCancel, bool showElapsedTime)
    {
        var height = 156;
        if (showElapsedTime)
            height += 22;
        if (allowCancel)
            height += 40;
        ClientSize = new Size(460, height);
    }

    private void btnCancel_Click(object? sender, EventArgs e)
    {
        if (!btnCancel.Visible || !btnCancel.Enabled)
            return;

        if (_workCompleted)
        {
            _autoCloseTimer.Stop();
            CloseDialog();
            return;
        }

        btnCancel.Enabled = false;
        lblStep.Text = Loc.T("Progress_Cancelling");
        lblDetail.Text = string.Empty;
        lblDetail.Visible = false;
        layoutTable.RowStyles[1].Height = 0;
        CancelRequested?.Invoke();
    }
}
