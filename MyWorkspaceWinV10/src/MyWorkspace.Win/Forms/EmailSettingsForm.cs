using MyWorkspace.Core.Models;

namespace MyWorkspace.Win.Forms;

public partial class EmailSettingsForm : Form
{
    public EmailSettingsForm()
    {
        InitializeComponent();
        AppTheme.ApplyStandardDialog(this);
    }

    private void EmailSettingsForm_Load(object sender, EventArgs e)
    {
        ApplyLocalization();

        var settings = AppConfig.EmailSettings.Clone();
        chkEnabled.Checked = settings.Enabled;
        txtSmtpHost.Text = settings.SmtpHost;
        numPort.Value = Math.Clamp(settings.Port, (int)numPort.Minimum, (int)numPort.Maximum);
        chkEnableSsl.Checked = settings.EnableSsl;
        txtUsername.Text = settings.Username;
        txtPassword.Text = settings.Password;
        txtFromAddress.Text = settings.FromAddress;
        txtFromDisplayName.Text = settings.FromDisplayName;
    }

    private void ApplyLocalization()
    {
        Text = Localization.Get(K.MenuAdminEmail);
        lblHint.Text = Localization.Get(K.EmailSettingsHint);
        chkEnabled.Text = Localization.Get(K.EmailEnabled);
        lblSmtpHost.Text = Localization.Get(K.LabelSmtpHost);
        lblPort.Text = Localization.Get(K.LabelPort);
        chkEnableSsl.Text = Localization.Get(K.EmailEnableSsl);
        lblUsername.Text = Localization.Get(K.LabelUser);
        lblPassword.Text = Localization.Get(K.LabelPassword);
        lblFromAddress.Text = Localization.Get(K.LabelFromAddress);
        lblFromDisplayName.Text = Localization.Get(K.LabelFromDisplayName);
        btnSave.Text = Localization.Get(K.ButtonSave);
        btnCancel.Text = Localization.Get(K.ButtonCancel);
    }

    private EmailSettings ReadSettings() => new()
    {
        Enabled = chkEnabled.Checked,
        SmtpHost = txtSmtpHost.Text.Trim(),
        Port = (int)numPort.Value,
        EnableSsl = chkEnableSsl.Checked,
        Username = txtUsername.Text.Trim(),
        Password = txtPassword.Text,
        FromAddress = txtFromAddress.Text.Trim(),
        FromDisplayName = string.IsNullOrWhiteSpace(txtFromDisplayName.Text)
            ? "MyWorkspace"
            : txtFromDisplayName.Text.Trim()
    };

    private void btnSave_Click(object sender, EventArgs e)
    {
        var settings = ReadSettings();
        if (settings.Enabled)
        {
            if (string.IsNullOrWhiteSpace(settings.SmtpHost) || string.IsNullOrWhiteSpace(settings.FromAddress))
            {
                MessageBox.Show(Localization.Get(K.EmailSmtpRequired), Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
        }

        AppConfig.SaveLocalEmailSettings(settings);
        MessageBox.Show(
            Localization.Get(settings.Enabled ? K.EmailSavedEnabled : K.EmailSavedDisabled),
            Text,
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
        DialogResult = DialogResult.OK;
        Close();
    }

    private void btnCancel_Click(object sender, EventArgs e) => Close();
}
