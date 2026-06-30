using System.Reflection;

namespace MyWorkspace.Win.Forms;

public partial class AboutForm : Form
{
    public AboutForm()
    {
        InitializeComponent();
        AppTheme.ApplyStandardDialog(this);
        Shown += (_, _) => LayoutAboutContent();
    }

    private void LayoutAboutContent()
    {
        lblCopyright.Top = lblDescription.Bottom + 8;
        btnClose.Top = lblCopyright.Bottom + 16;
        btnClose.Left = ClientSize.Width - btnClose.Width - 24;
        ClientSize = new Size(ClientSize.Width, btnClose.Bottom + 24);
    }

    private void AboutForm_Load(object sender, EventArgs e)
    {
        ApplyLocalization();
        SetAppIconImage();

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

    private void SetAppIconImage()
    {
        picAppIcon.Image?.Dispose();
        using var icon = IconAssets.CreateAppIcon();
        using var sizedIcon = new Icon(icon, picAppIcon.Size);
        picAppIcon.Image = sizedIcon.ToBitmap();
    }
}
