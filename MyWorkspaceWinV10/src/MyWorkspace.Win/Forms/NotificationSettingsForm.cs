namespace MyWorkspace.Win.Forms;

public partial class NotificationSettingsForm : Form
{
    public NotificationSettingsForm()
    {
        InitializeComponent();
        AppTheme.ApplyStandardDialog(this);
    }

    private void NotificationSettingsForm_Load(object sender, EventArgs e)
    {
        ApplyLocalization();

        var user = AppConfig.Services.Users.GetById(SessionContext.CurrentUser.Id);
        if (user == null)
            return;

        txtEmail.Text = user.Email ?? string.Empty;
        chkNotifyPageUpdate.Checked = user.NotifyOnPageUpdate;
        chkNotifyWorkspaceChange.Checked = user.NotifyOnWorkspaceChange;
        UpdateEmailStatus();
    }

    private void ApplyLocalization()
    {
        Text = Localization.Get(K.MenuNotificationSettings);
        lblEmail.Text = Localization.Get(K.LabelEmail);
        chkNotifyPageUpdate.Text = Localization.Get(K.NotifyPageUpdate);
        chkNotifyWorkspaceChange.Text = Localization.Get(K.NotifyWorkspaceChange);
        btnSave.Text = Localization.Get(K.ButtonSave);
        btnCancel.Text = Localization.Get(K.ButtonCancel);
    }

    private void UpdateEmailStatus()
    {
        lblEmailStatus.Text = Localization.Get(
            AppConfig.Services.Notifications.IsEmailConfigured
                ? K.NotificationEmailConfigured
                : K.NotificationEmailNotConfigured);
        lblEmailStatus.ForeColor = AppConfig.Services.Notifications.IsEmailConfigured
            ? Color.ForestGreen
            : Color.DimGray;
    }

    private void btnSave_Click(object sender, EventArgs e)
    {
        try
        {
            AppConfig.Services.Users.UpdateNotificationSettings(
                SessionContext.CurrentUser.Id,
                txtEmail.Text,
                chkNotifyPageUpdate.Checked,
                chkNotifyWorkspaceChange.Checked);

            var refreshed = AppConfig.Services.Users.GetById(SessionContext.CurrentUser.Id);
            if (refreshed != null)
                SessionContext.SetUser(refreshed);

            DialogResult = DialogResult.OK;
            Close();
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Text, ex);
        }
    }

    private void btnCancel_Click(object sender, EventArgs e) => Close();
}
