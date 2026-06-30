namespace MyWorkspace.Win.Forms;

public partial class AccountProfileForm : Form
{
    public AccountProfileForm()
    {
        InitializeComponent();
        AppTheme.ApplyStandardDialog(this);
    }

    private void AccountProfileForm_Load(object sender, EventArgs e)
    {
        ApplyLocalization();
        txtUsername.Text = SessionContext.CurrentUser.Username;
    }

    private void ApplyLocalization()
    {
        Text = Localization.Get(K.MenuEditProfile);
        lblUsername.Text = Localization.Get(K.LabelUsername);
        btnSave.Text = Localization.Get(K.ButtonSave);
        btnCancel.Text = Localization.Get(K.ButtonCancel);
    }

    private void btnSave_Click(object sender, EventArgs e)
    {
        try
        {
            AppConfig.Services.Users.UpdateOwnProfile(SessionContext.CurrentUser.Id, txtUsername.Text);
            SessionContext.UpdateUsername(txtUsername.Text.Trim());
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
