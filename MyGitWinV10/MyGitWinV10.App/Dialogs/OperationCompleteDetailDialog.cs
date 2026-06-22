namespace MyGitWinV10.App.Dialogs;

public partial class OperationCompleteDetailDialog : Form
{
    private readonly string _detailsText;

    public OperationCompleteDetailDialog(string title, string summary, string detailsText)
    {
        InitializeComponent();
        Text = title;
        summaryLabel.Text = summary;
        detailsTextBox.Text = detailsText;
        _detailsText = detailsText;
    }

    private void CopyButton_Click(object? sender, EventArgs e)
    {
        Clipboard.SetText(_detailsText);
        copyButton.Text = "Copied";
    }
}
