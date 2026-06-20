using ReqTrace.Theme;

namespace ReqTrace.Forms;

/// <summary>
/// Simple modal progress dialog (progress bar + percentage label) for long-running
/// background work such as Excel import. Call <see cref="SetProgress"/> from any thread.
/// </summary>
public partial class ProgressDialog : Form
{
    public ProgressDialog(string title, string message)
    {
        InitializeComponent();
        Text = title;
        lblMessage.Text = message;
        progressBar.Minimum = 0;
        progressBar.Maximum = 100;
        progressBar.Value = 0;
        progressBar.Style = ProgressBarStyle.Continuous;
        ModernTheme.Apply(this);
        SetProgress(0);
    }

    public void SetProgress(int percent)
    {
        if (InvokeRequired)
        {
            BeginInvoke(() => SetProgress(percent));
            return;
        }

        var clamped = Math.Clamp(percent, 0, 100);
        progressBar.Value = clamped;
        lblPercent.Text = $"{clamped}%";
    }

    public void CloseDialog()
    {
        if (InvokeRequired)
        {
            BeginInvoke(CloseDialog);
            return;
        }

        if (!IsDisposed)
            Close();
    }
}
