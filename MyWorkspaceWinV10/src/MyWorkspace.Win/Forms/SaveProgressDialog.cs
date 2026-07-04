namespace MyWorkspace.Win.Forms;

internal sealed class SaveProgressScope : IDisposable
{
    private const int ShowDelayMs = 3000;

    private readonly Form _owner;
    private readonly System.Windows.Forms.Timer _delayTimer;
    private SaveProgressDialog? _dialog;
    private bool _disposed;
    private string? _pendingStageText;
    private int? _pendingPercent;
    private bool _pendingIndeterminate;

    private SaveProgressScope(Form owner)
    {
        _owner = owner;
        _delayTimer = new System.Windows.Forms.Timer { Interval = ShowDelayMs };
        _delayTimer.Tick += (_, _) =>
        {
            _delayTimer.Stop();
            EnsureVisible();
        };
    }

    public static SaveProgressScope Begin(Form owner)
    {
        var scope = new SaveProgressScope(owner);
        scope._delayTimer.Start();
        return scope;
    }

    public async Task RunStageAsync(string stageText, int percent, Func<Task> action)
    {
        ReportDeterminate(percent, stageText);
        await action();
    }

    public void ReportDeterminate(int percent, string stageText)
    {
        if (_disposed || _owner.IsDisposed)
            return;

        if (_owner.InvokeRequired)
        {
            _owner.BeginInvoke(() => ReportDeterminate(percent, stageText));
            return;
        }

        _pendingPercent = percent;
        _pendingIndeterminate = false;
        _pendingStageText = stageText;
        if (_dialog != null)
            _dialog.SetDeterminate(percent, stageText);
    }

    public void ReportIndeterminate(string stageText)
    {
        if (_disposed || _owner.IsDisposed)
            return;

        if (_owner.InvokeRequired)
        {
            _owner.BeginInvoke(() => ReportIndeterminate(stageText));
            return;
        }

        _pendingIndeterminate = true;
        _pendingPercent = null;
        _pendingStageText = stageText;
        if (_dialog != null)
            _dialog.SetIndeterminate(stageText);
    }

    private void EnsureVisible()
    {
        if (_disposed || _dialog != null || _owner.IsDisposed)
            return;

        _dialog = new SaveProgressDialog();
        if (!string.IsNullOrEmpty(_pendingStageText))
        {
            if (_pendingIndeterminate)
                _dialog.SetIndeterminate(_pendingStageText);
            else
                _dialog.SetDeterminate(_pendingPercent ?? 0, _pendingStageText);
        }

        _dialog.Show(_owner);
        _owner.Activate();
    }

    public void Dispose()
    {
        if (_disposed)
            return;

        _disposed = true;
        _delayTimer.Stop();
        _delayTimer.Dispose();

        if (_owner.IsDisposed)
            return;

        if (_owner.InvokeRequired)
        {
            _owner.BeginInvoke(DisposeDialog);
            return;
        }

        DisposeDialog();
    }

    private void DisposeDialog()
    {
        if (_dialog == null)
            return;

        _dialog.Close();
        _dialog.Dispose();
        _dialog = null;
    }
}

internal sealed class SaveProgressDialog : Form
{
    private readonly Label _lblStage = new();
    private readonly ProgressBar _progressBar = new();

    public SaveProgressDialog()
    {
        Text = Localization.Get(K.SaveProgressTitle);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        ControlBox = false;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(360, 84);
        Padding = new Padding(16);

        _lblStage.AutoSize = false;
        _lblStage.Dock = DockStyle.Top;
        _lblStage.Height = 36;
        _lblStage.TextAlign = ContentAlignment.MiddleLeft;

        _progressBar.Dock = DockStyle.Bottom;
        _progressBar.Height = 18;
        _progressBar.Minimum = 0;
        _progressBar.Maximum = 100;
        _progressBar.Style = ProgressBarStyle.Continuous;

        Controls.Add(_progressBar);
        Controls.Add(_lblStage);

        AppTheme.ApplyStandardDialog(this);
        _lblStage.ForeColor = AppTheme.TextPrimary;
        _lblStage.Font = AppTheme.UiFont;
        SetDeterminate(0, Localization.Get(K.SaveProgressStarting));
    }

    public void SetDeterminate(int percent, string stageText)
    {
        _progressBar.Style = ProgressBarStyle.Continuous;
        _progressBar.Value = Math.Clamp(percent, _progressBar.Minimum, _progressBar.Maximum);
        _lblStage.Text = stageText;
    }

    public void SetIndeterminate(string stageText)
    {
        _progressBar.Style = ProgressBarStyle.Marquee;
        _progressBar.MarqueeAnimationSpeed = 30;
        _lblStage.Text = stageText;
    }
}
