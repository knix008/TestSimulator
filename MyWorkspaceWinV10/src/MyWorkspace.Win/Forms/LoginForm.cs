using MyWorkspace.Core.Entities;

namespace MyWorkspace.Win.Forms;

public partial class LoginForm : Form
{
    public User? LoggedInUser { get; private set; }

    public LoginForm()
    {
        InitializeComponent();
        ApplyLoginAppearance();
    }

    private void btnLogin_Click(object sender, EventArgs e)
    {
        lblMessage.Text = string.Empty;

        if (AuthLoginHelper.TryLogin(this, txtUsername.Text, txtPassword.Text, out var user, out var error))
        {
            AppConfig.SaveLastLoginUsername(txtUsername.Text);
            LoggedInUser = user;
            DialogResult = DialogResult.OK;
            Close();
            return;
        }

        if (!string.IsNullOrWhiteSpace(error))
        {
            lblMessage.Text = Localization.TranslateServiceMessage(error);
            txtPassword.SelectAll();
            txtPassword.Focus();
        }
    }

    private void btnCancel_Click(object sender, EventArgs e)
    {
        DialogResult = DialogResult.Cancel;
        Close();
    }

    private void LoginForm_Load(object sender, EventArgs e)
    {
        AcceptButton = btnLogin;
        CancelButton = btnCancel;

        var lastUsername = AppConfig.UiSettings.LastLoginUsername;
        if (!string.IsNullOrWhiteSpace(lastUsername))
        {
            txtUsername.Text = lastUsername;
            txtPassword.Focus();
        }
        else
        {
            txtUsername.Focus();
        }
    }

    private void ApplyLoginAppearance()
    {
        AppTheme.ApplyFormChrome(this);
        ApplyLoginLocalization();
        AppTheme.StyleTextBox(txtUsername);
        AppTheme.StyleTextBox(txtPassword);
        AppTheme.StylePrimaryButton(btnLogin);
        AppTheme.StyleSecondaryButton(btnCancel);
        AppTheme.FitButtonSize(btnLogin);
        AppTheme.FitButtonSize(btnCancel);
        btnCancel.Location = new Point(btnLogin.Right + 8, btnLogin.Top);
    }

    private void ApplyLoginLocalization()
    {
        Text = Localization.Get(K.LoginWindowTitle);
        lblTitle.Font = AppTheme.TitleFont;
        lblTitle.ForeColor = AppTheme.TextPrimary;
        lblUsername.ForeColor = AppTheme.TextSecondary;
        lblPassword.ForeColor = AppTheme.TextSecondary;
        lblMessage.ForeColor = AppTheme.Danger;
        lblTitle.Text = Localization.Get(K.LoginTitle);
        lblUsername.Text = Localization.Get(K.LoginUsername);
        lblPassword.Text = Localization.Get(K.LoginPassword);
        btnLogin.Text = Localization.Get(K.LoginSubmit);
        btnCancel.Text = Localization.Get(K.LoginCancel);
    }
}
