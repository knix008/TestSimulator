namespace MyGitWinV10.App.Dialogs;

public partial class DelayedProgressForm : Form
{
    public DelayedProgressForm(string message)
    {
        InitializeComponent();
        messageLabel.Text = message;
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
        stopButton.Text = "Stopping...";
        StopRequested?.Invoke(this, EventArgs.Empty);
    }
}
