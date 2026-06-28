using ImageRembgWinV10.Localization;

namespace ImageRembgWinV10;

public partial class ErrorDialogForm : Form
{
    public ErrorDialogForm(string title, string summary, string? primaryMessage, string details)
    {
        InitializeComponent();
        ApplyLocalization();
        Text = title;
        lblSummary.Text = summary;

        if (string.IsNullOrWhiteSpace(primaryMessage))
        {
            lblMessage.Visible = false;
            txtDetails.Location = new Point(12, 58);
            txtDetails.Size = new Size(560, 238);
        }
        else
        {
            lblMessage.Text = primaryMessage;
            lblMessage.Visible = true;
        }

        txtDetails.Text = details;
    }

    private void ApplyLocalization()
    {
        btnCopy.Text = L.Get("ErrorDialog.Copy");
        btnOk.Text = L.Get("ErrorDialog.Ok");
    }

    private void btnCopy_Click(object? sender, EventArgs e)
    {
        var copyText = string.IsNullOrWhiteSpace(lblMessage.Text)
            ? txtDetails.Text
            : $"{lblSummary.Text}{Environment.NewLine}{Environment.NewLine}{lblMessage.Text}{Environment.NewLine}{Environment.NewLine}{txtDetails.Text}";

        if (string.IsNullOrEmpty(copyText))
        {
            return;
        }

        Clipboard.SetText(copyText);
        btnCopy.Text = L.Get("ErrorDialog.Copied");
    }

    private void btnOk_Click(object? sender, EventArgs e)
    {
        Close();
    }
}
