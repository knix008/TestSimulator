using ReqTrace.Localization;
using ReqTrace.Resources;
using ReqTrace.Theme;

namespace ReqTrace.Forms;

public partial class AboutForm : Form
{
    public AboutForm()
    {
        InitializeComponent();
        ModernTheme.Apply(this);
        ModernTheme.MakePrimary(btnClose);
        picAppIcon.Image = AppAssets.GetAppIcon(48);
        ApplyLocalization();
    }

    private void ApplyLocalization()
    {
        Text = Loc.T("Dlg_AboutTitle");
        lblAboutText.Text = Loc.T("Dlg_AboutText");
        btnClose.Text = Loc.T("Common_Close");
    }
}
