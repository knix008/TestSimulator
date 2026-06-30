using System.Reflection;

namespace MyWorkspace.Win.Forms;

public partial class AboutForm : Form
{
    public AboutForm()
    {
        InitializeComponent();
        AppTheme.ApplyStandardDialog(this);
    }

    private void AboutForm_Load(object sender, EventArgs e)
    {
        ApplyLocalization();

        var version = Assembly.GetExecutingAssembly().GetName().Version;
        lblVersion.Text = string.Format(
            Localization.Get(K.AboutVersionFormat),
            version?.ToString(3) ?? "1.0.0");
        lblCopyright.Text = string.Format(
            Localization.Get(K.AboutCopyrightFormat),
            DateTime.Now.Year);
    }

    private void ApplyLocalization()
    {
        Text = Localization.Get(K.AboutTitle);
        lblAppName.Text = Localization.Get(K.AppName);
        lblDescription.Text = Localization.Get(K.AboutDescription);
        lblCopyright.Text = string.Format(
            Localization.Get(K.AboutCopyrightFormat),
            DateTime.Now.Year);
        btnClose.Text = Localization.Get(K.ButtonClose);
    }

    private void btnClose_Click(object sender, EventArgs e) => Close();
}
