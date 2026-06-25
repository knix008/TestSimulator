namespace MyGitWinV10.App.Dialogs;

using MyGitWinV10.App.Services;

public partial class DelayedProgressForm : Form
{
    public DelayedProgressForm(string message)
    {
        InitializeComponent();
        messageLabel.Text = message;
        ApplyLocalizedText();
    }

    private void ApplyLocalizedText()
    {
        stopButton.Text = Localization.T("Progress.Stop");
    }

    public event EventHandler? StopRequested;

    public void SetMessage(string message)
    {
        if (IsDisposed)
        {
            return;
        }

        if (InvokeRequired)
        {
            try
            {
                BeginInvoke(SetMessage, message);
            }
            catch (ObjectDisposedException)
            {
            }

            return;
        }

        messageLabel.Text = message;
    }

    public void SetProgress(int? percent, string? message = null, string? detail = null)
    {
        if (IsDisposed)
        {
            return;
        }

        if (InvokeRequired)
        {
            try
            {
                BeginInvoke(SetProgress, percent, message, detail);
            }
            catch (ObjectDisposedException)
            {
            }

            return;
        }

        if (!string.IsNullOrEmpty(message))
        {
            messageLabel.Text = message;
        }

        if (detail is not null)
        {
            detailLabel.Text = detail;
            detailLabel.Visible = detail.Length > 0;
        }

        if (percent is int value)
        {
            progressBar.Style = ProgressBarStyle.Continuous;
            progressBar.Maximum = 100;
            progressBar.Value = Math.Clamp(value, 0, 100);
            percentLabel.Text = $"{value}%";
            percentLabel.Visible = true;
        }
        else
        {
            progressBar.Style = ProgressBarStyle.Marquee;
            progressBar.MarqueeAnimationSpeed = 30;
            percentLabel.Text = string.Empty;
            percentLabel.Visible = false;
        }
    }

    public void SetStopEnabled(bool enabled)
    {
        if (IsDisposed)
        {
            return;
        }

        if (InvokeRequired)
        {
            try
            {
                BeginInvoke(SetStopEnabled, enabled);
            }
            catch (ObjectDisposedException)
            {
            }

            return;
        }

        stopButton.Enabled = enabled;
    }

    private void StopButton_Click(object? sender, EventArgs e)
    {
        stopButton.Enabled = false;
        stopButton.Text = Localization.T("Progress.Stopping");
        StopRequested?.Invoke(this, EventArgs.Empty);
    }
}
