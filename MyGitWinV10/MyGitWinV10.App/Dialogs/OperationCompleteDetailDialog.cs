namespace MyGitWinV10.App.Dialogs;

public partial class OperationCompleteDetailDialog : Form
{
    private readonly string _detailsText;

    public OperationCompleteDetailDialog(string title, string summary, string detailsText)
    {
        InitializeComponent();
        Text = title;
        summaryLabel.Text = summary;
        detailsLabel.Text = detailsText;
        _detailsText = detailsText;
        DialogIcons.ApplySuccess(iconPictureBox);
        detailsPanel.Resize += (_, _) => UpdateDetailsLabelWidth();
        UpdateDetailsLabelWidth();
    }

    private void UpdateDetailsLabelWidth()
    {
        int width = Math.Max(100, detailsPanel.ClientSize.Width - detailsPanel.Padding.Horizontal - SystemInformation.VerticalScrollBarWidth);
        detailsLabel.MaximumSize = new Size(width, 0);
    }

    private void CopyButton_Click(object? sender, EventArgs e)
    {
        Clipboard.SetText(_detailsText);
        copyButton.Text = "Copied";
    }
}
