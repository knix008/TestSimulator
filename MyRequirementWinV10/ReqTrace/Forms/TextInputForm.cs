using ReqTrace.Localization;
using ReqTrace.Theme;

namespace ReqTrace.Forms;

public partial class TextInputForm : Form
{
    public string Value => txtValue.Text.Trim();

    public TextInputForm(string title, string label, string defaultValue)
    {
        InitializeComponent();
        Text = title;
        lblPrompt.Text = label;
        txtValue.Text = defaultValue;
        ModernTheme.Apply(this);
        ModernTheme.MakePrimary(btnOk);
        ApplyCommonLocalization();
    }

    private void ApplyCommonLocalization()
    {
        btnOk.Text = Loc.T("Common_OK");
        btnCancel.Text = Loc.T("Common_Cancel");
    }

    private void btnOk_Click(object? sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(txtValue.Text))
        {
            MessageBox.Show(this, Loc.T("Msg_ValueRequired"), Loc.T("Common_Validation"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
            DialogResult = DialogResult.None;
        }
    }
}
