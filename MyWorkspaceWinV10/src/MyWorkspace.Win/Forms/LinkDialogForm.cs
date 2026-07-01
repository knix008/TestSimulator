namespace MyWorkspace.Win.Forms;

public partial class LinkDialogForm : Form
{
    public string LinkText => txtLinkText.Text.Trim();
    public string LinkUrl => txtLinkUrl.Text.Trim();

    public LinkDialogForm(string? initialText = null, string? initialUrl = null)
    {
        InitializeComponent();
        AppTheme.ApplyStandardDialog(this);
        if (!string.IsNullOrWhiteSpace(initialText))
            txtLinkText.Text = initialText.Trim();
        if (!string.IsNullOrWhiteSpace(initialUrl))
            txtLinkUrl.Text = initialUrl.Trim();
        else
            txtLinkUrl.Text = "https://";

        ApplyLocalization();
        AppTheme.StyleTextBox(txtLinkText);
        AppTheme.StyleTextBox(txtLinkUrl);
        AppTheme.StylePrimaryButton(btnOk);
        AppTheme.StyleSecondaryButton(btnCancel);
        AppTheme.FitButtonSize(btnOk);
        AppTheme.FitButtonSize(btnCancel);
    }

    private void ApplyLocalization()
    {
        Text = Localization.Get(K.DialogLinkTitle);
        lblLinkText.Text = Localization.Get(K.DialogLinkTextPrompt);
        lblLinkUrl.Text = Localization.Get(K.DialogLinkUrlPrompt);
        btnOk.Text = Localization.Get(K.ButtonOk);
        btnCancel.Text = Localization.Get(K.ButtonCancel);
    }

    private void btnOk_Click(object sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(txtLinkUrl.Text))
        {
            MessageBox.Show(
                Localization.Get(K.DialogLinkUrlRequired),
                Text,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            txtLinkUrl.Focus();
            return;
        }

        DialogResult = DialogResult.OK;
        Close();
    }

    private void btnCancel_Click(object sender, EventArgs e)
    {
        DialogResult = DialogResult.Cancel;
        Close();
    }
}
