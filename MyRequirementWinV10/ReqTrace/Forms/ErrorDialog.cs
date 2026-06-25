using ReqTrace.Helpers;
using ReqTrace.Localization;
using ReqTrace.Theme;

namespace ReqTrace.Forms;

/// <summary>
/// Shows error text in a normal, selectable read-only textbox with clipboard copy support.
/// </summary>
public partial class ErrorDialog : Form
{
    /// <summary>Designer-only constructor.</summary>
    public ErrorDialog()
    {
        InitializeComponent();
    }

    public ErrorDialog(string title, string details) : this()
    {
        Text = title;
        txtDetails.Text = details;
        ConfigureDetailsTextBox();
        ModernTheme.Apply(this);
        ConfigureDetailsTextBox();
        WireCopyHandlers();
        ModernTheme.MakePrimary(btnClose);
        btnCopy.Text = Loc.T("Common_CopyToClipboard");
        btnClose.Text = Loc.T("Common_OK");
        copyMenuItem.Text = Loc.T("Common_CopyToClipboard");
    }

    public static void Show(IWin32Window? owner, string title, Exception ex) =>
        Show(owner, title, ex.ToString());

    public static void Show(IWin32Window? owner, string title, string details)
    {
        using var dlg = new ErrorDialog(title, details);
        if (owner is Form { IsDisposed: false })
            dlg.ShowDialog(owner);
        else
            dlg.ShowDialog();
    }

    private void ConfigureDetailsTextBox()
    {
        txtDetails.ReadOnly = true;
        txtDetails.ShortcutsEnabled = false;
        txtDetails.HideSelection = false;
        txtDetails.BackColor = ModernTheme.Surface;
        txtDetails.ForeColor = ModernTheme.TextPrimary;
        txtDetails.BorderStyle = BorderStyle.FixedSingle;
        txtDetails.Font = ModernTheme.BaseFont;
    }

    private void WireCopyHandlers()
    {
        txtDetails.KeyDown += TxtDetails_KeyDown;
        copyMenuItem.Click += copyMenuItem_Click;
        Shown += ErrorDialog_Shown;
    }

    private void TxtDetails_KeyDown(object? sender, KeyEventArgs e)
    {
        if (!e.Control)
            return;

        if (e.KeyCode == Keys.C)
        {
            CopySelectedText();
            e.Handled = true;
            e.SuppressKeyPress = true;
            return;
        }

        if (e.KeyCode == Keys.A)
        {
            txtDetails.SelectAll();
            e.Handled = true;
            e.SuppressKeyPress = true;
        }
    }

    private void btnCopy_Click(object? sender, EventArgs e) => CopyAllText();

    private void copyMenuItem_Click(object? sender, EventArgs e) => CopySelectedText();

    private void ErrorDialog_Shown(object? sender, EventArgs e) => txtDetails.SelectionLength = 0;

    private void CopyAllText() => ClipboardHelper.TrySetPersistentText(txtDetails.Text);

    private void CopySelectedText()
    {
        var text = txtDetails.SelectionLength > 0
            ? txtDetails.SelectedText
            : txtDetails.Text;

        ClipboardHelper.TrySetPersistentText(text);
    }
}
