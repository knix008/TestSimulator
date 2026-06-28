using ImageRembgWinV10.Localization;

namespace ImageRembgWinV10;

internal sealed class ProgressDialogForm : Form
{
    private readonly Label _lblStatus;

    private ProgressDialogForm(string initialStatus)
    {
        FormBorderStyle = FormBorderStyle.FixedDialog;
        ControlBox = false;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(320, 100);
        Padding = new Padding(16);

        _lblStatus = new Label
        {
            AutoSize = false,
            Location = new Point(16, 16),
            Size = new Size(288, 20),
            Text = initialStatus,
        };

        var progressBar = new ProgressBar
        {
            Style = ProgressBarStyle.Marquee,
            MarqueeAnimationSpeed = 30,
            Location = new Point(16, 44),
            Size = new Size(288, 20),
        };

        Controls.AddRange([_lblStatus, progressBar]);
        Text = L.Get("ProgressDialog.Title");
    }

    public void UpdateStatus(string text)
    {
        if (IsDisposed)
        {
            return;
        }

        _lblStatus.Text = text;
    }

    public static ProgressDialogForm ShowFor(IWin32Window owner, string initialStatus)
    {
        var dialog = new ProgressDialogForm(initialStatus);
        dialog.Show(owner);
        return dialog;
    }
}
