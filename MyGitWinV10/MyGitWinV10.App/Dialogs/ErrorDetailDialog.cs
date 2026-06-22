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
        detailsTextBox.Text = details;
        _details = details;
        DialogIcons.ApplyError(iconPictureBox);
    }

    public static void Show(IWin32Window? owner, string title, Exception exception)
    {
        using var dialog = new ErrorDetailDialog(
            title,
            ExceptionDetailFormatter.GetSummary(exception),
            ExceptionDetailFormatter.Format(exception));
        dialog.ShowDialog(owner);
    }

    private void CopyButton_Click(object? sender, EventArgs e)
    {
        Clipboard.SetText(_details);
        copyButton.Text = "Copied";
    }
}
