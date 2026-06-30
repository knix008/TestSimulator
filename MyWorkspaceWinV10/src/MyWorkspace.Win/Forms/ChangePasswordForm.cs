namespace MyWorkspace.Win.Forms;

public partial class ChangePasswordForm : Form
{
    public ChangePasswordForm()
    {
        InitializeComponent();
        AppTheme.ApplyStandardDialog(this);
    }

    private void ChangePasswordForm_Load(object sender, EventArgs e) => ApplyLocalization();

    private void ApplyLocalization()
    {
        Text = Localization.Get(K.MenuChangePassword);
        lblCurrent.Text = Localization.Get(K.LabelCurrentPassword);
        lblNew.Text = Localization.Get(K.LabelNewPassword);
        lblConfirm.Text = Localization.Get(K.LabelConfirmPassword);
        btnSave.Text = Localization.Get(K.ButtonChange);
        btnCancel.Text = Localization.Get(K.ButtonCancel);
    }

    private void btnSave_Click(object sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(txtCurrent.Text) ||
            string.IsNullOrWhiteSpace(txtNew.Text) ||
            string.IsNullOrWhiteSpace(txtConfirm.Text))
        {
            MessageBox.Show(Localization.Get(K.ChangePasswordAllFieldsRequired), Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (txtNew.Text != txtConfirm.Text)
        {
            MessageBox.Show(Localization.Get(K.ChangePasswordMismatch), Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var ok = AppConfig.Services.Auth.ChangePassword(
            SessionContext.CurrentUser.Id,
            txtCurrent.Text,
            txtNew.Text);

        if (!ok)
        {
            MessageBox.Show(Localization.Get(K.ChangePasswordInvalidCurrent), Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        MessageBox.Show(Localization.Get(K.ChangePasswordSuccess), Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
        DialogResult = DialogResult.OK;
        Close();
    }

    private void btnCancel_Click(object sender, EventArgs e) => Close();
}
