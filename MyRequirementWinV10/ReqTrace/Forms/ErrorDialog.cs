using ReqTrace.Localization;
using ReqTrace.Theme;

namespace ReqTrace.Forms;

/// <summary>
/// Shows the full exception message/stack trace in a read-only, selectable textbox with a
/// one-click "Copy to Clipboard" button, instead of a plain MessageBox that hides details.
/// </summary>
public partial class ErrorDialog : Form
{
    private readonly string _detailsText;

    public ErrorDialog(string title, string summary, string details)
    {
        _detailsText = details;
        InitializeComponent();
        Text = title;
        lblSummary.Text = summary;
        txtDetails.Text = details;
        ModernTheme.Apply(this);
        ModernTheme.MakePrimary(btnClose);
        btnCopy.Text = Loc.T("Common_CopyToClipboard");
        btnClose.Text = Loc.T("Common_OK");
    }

    public static void Show(IWin32Window? owner, string title, Exception ex)
    {
        using var dlg = new ErrorDialog(title, ex.Message, ex.ToString());
        if (owner is Form ownerForm)
            dlg.ShowDialog(ownerForm);
        else
            dlg.ShowDialog();
    }

    private void btnCopy_Click(object? sender, EventArgs e) => Clipboard.SetText(_detailsText);
}
