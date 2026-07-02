using MyWorkspace.Core.Entities;
using MyWorkspace.Data;

namespace MyWorkspace.Win.Forms;

public partial class LoginForm : Form
{
    public User? LoggedInUser { get; private set; }

    public LoginForm()
    {
        InitializeComponent();
        AppTheme.ApplyStandardDialog(this);
        AppTheme.Changed += OnAppThemeChanged;
        FormClosed += (_, _) => AppTheme.Changed -= OnAppThemeChanged;
        ApplyLoginAppearance();
    }

    private void OnAppThemeChanged()
    {
        if (IsDisposed)
            return;

        if (InvokeRequired)
        {
            BeginInvoke(ApplyLoginAppearance);
            return;
        }

        ApplyLoginAppearance();
    }

    private void btnLogin_Click(object sender, EventArgs e)
    {
        lblMessage.Text = string.Empty;

        if (AuthLoginHelper.TryLogin(this, txtUsername.Text, txtPassword.Text, out var user, out var error))
        {
            AppConfig.RecordSuccessfulLogin(txtUsername.Text);
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
        ApplyFirstRunDefaults();
    }

    private static bool ShouldShowDefaultAdminCredentials() =>
        !AppConfig.UiSettings.HasLoggedInOnce;

    private void ApplyFirstRunDefaults()
    {
        var showDefaultAdmin = ShouldShowDefaultAdminCredentials();

        if (showDefaultAdmin)
        {
            txtUsername.Text = DbInitializer.DefaultAdminUsername;
            txtPassword.Text = DbInitializer.DefaultAdminPassword;
            txtPassword.Focus();
            txtPassword.SelectAll();
        }
        else
        {
            txtUsername.Text = AppConfig.UiSettings.LastLoginUsername;
            txtPassword.Clear();
            txtPassword.Focus();
        }

        ApplyFirstRunLayout(showDefaultAdmin);
        UpdateDefaultAdminHint(showDefaultAdmin);
    }

    private void ApplyFirstRunLayout(bool isFirstRun)
    {
        const int compactTop = 72;
        const int expandedTop = 96;
        var top = isFirstRun ? expandedTop : compactTop;
        var fieldTop = top - 4;

        lblDefaultAdminHint.Visible = isFirstRun;
        lblDefaultAdminHint.Location = new Point(34, 48);
        lblDefaultAdminHint.MaximumSize = new Size(360, 0);

        lblUsername.Location = new Point(34, top);
        txtUsername.Location = new Point(120, fieldTop);
        lblPassword.Location = new Point(34, top + 36);
        txtPassword.Location = new Point(120, fieldTop + 36);
        lblMessage.Location = new Point(120, fieldTop + 68);
        btnLogin.Location = new Point(120, fieldTop + 84);
        btnCancel.Location = new Point(btnLogin.Right + 8, btnLogin.Top);
        ClientSize = new Size(420, isFirstRun ? 280 : 240);
    }

    private void ApplyLoginAppearance()
    {
        ApplyLoginLocalization();
        AppTheme.StyleTextBox(txtUsername);
        AppTheme.StyleTextBox(txtPassword);
        AppTheme.FinalizeDialogLayout(this);
        ApplyFirstRunLayout(ShouldShowDefaultAdminCredentials());
    }

    private void ApplyLoginLocalization()
    {
        Text = Localization.Get(K.LoginWindowTitle);
        lblTitle.Font = AppTheme.TitleFont;
        lblTitle.ForeColor = AppTheme.TextPrimary;
        lblUsername.ForeColor = AppTheme.TextSecondary;
        lblPassword.ForeColor = AppTheme.TextSecondary;
        lblMessage.ForeColor = AppTheme.Danger;
        lblDefaultAdminHint.ForeColor = AppTheme.TextPrimary;
        lblDefaultAdminHint.Font = AppTheme.UiFontSemibold;
        lblTitle.Text = Localization.Get(K.LoginTitle);
        lblUsername.Text = Localization.Get(K.LoginUsername);
        lblPassword.Text = Localization.Get(K.LoginPassword);
        btnLogin.Text = Localization.Get(K.LoginSubmit);
        btnCancel.Text = Localization.Get(K.LoginCancel);
        UpdateDefaultAdminHint(ShouldShowDefaultAdminCredentials());
    }

    private void UpdateDefaultAdminHint(bool showDefaultAdmin)
    {
        lblDefaultAdminHint.Visible = showDefaultAdmin;
        if (!showDefaultAdmin)
        {
            lblDefaultAdminHint.Text = string.Empty;
            return;
        }

        lblDefaultAdminHint.Text = Localization.Format(
            K.LoginDefaultAdminHint,
            DbInitializer.DefaultAdminUsername,
            DbInitializer.DefaultAdminPassword);
    }
}
