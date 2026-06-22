using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public partial class ErrorDetailDialog : Form
{
    private readonly string _details;

    public ErrorDetailDialog(string title, string summary, string details)
    {
        InitializeComponent();
        Text = title;
        summaryLabel.Text = summary;
        detailsLabel.Text = details;
        _details = details;
        DialogIcons.ApplyError(iconPictureBox);
        detailsPanel.Resize += (_, _) => UpdateDetailsLabelWidth();
        UpdateDetailsLabelWidth();
    }

    public static void Show(IWin32Window? owner, string title, Exception exception)
    {
        using var dialog = new ErrorDetailDialog(
            title,
            ExceptionDetailFormatter.GetSummary(exception),
            ExceptionDetailFormatter.Format(exception));
        dialog.ShowDialog(owner);
    }

    private void UpdateDetailsLabelWidth()
    {
        int width = Math.Max(100, detailsPanel.ClientSize.Width - detailsPanel.Padding.Horizontal - SystemInformation.VerticalScrollBarWidth);
        detailsLabel.MaximumSize = new Size(width, 0);
    }

    private void CopyButton_Click(object? sender, EventArgs e)
    {
        Clipboard.SetText(_details);
        copyButton.Text = "Copied";
    }
}
