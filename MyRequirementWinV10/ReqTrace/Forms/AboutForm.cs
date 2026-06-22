using ReqTrace.Localization;
using ReqTrace.Resources;
using ReqTrace.Theme;

namespace ReqTrace.Forms;

public partial class AboutForm : Form
{
    private const int TextLeft = 72;
    private const int TextWidth = 336;
    private const int HorizontalMargin = 12;
    private const int BottomMargin = 12;
    private const int SectionGap = 8;

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
        lblCopyright.Text = Loc.T("Dlg_AboutCopyright");
        btnClose.Text = Loc.T("Common_Close");
        AdjustLayout();
    }

    private void AdjustLayout()
    {
        var aboutHeight = TextRenderer.MeasureText(
            lblAboutText.Text,
            lblAboutText.Font,
            new Size(TextWidth, int.MaxValue),
            TextFormatFlags.WordBreak).Height + lblAboutText.Padding.Vertical;

        lblAboutText.Location = new Point(TextLeft, 8);
        lblAboutText.Size = new Size(TextWidth, aboutHeight);

        var copyrightHeight = TextRenderer.MeasureText(
            lblCopyright.Text,
            lblCopyright.Font,
            new Size(TextWidth, int.MaxValue),
            TextFormatFlags.WordBreak).Height + 4;

        lblCopyright.Location = new Point(TextLeft, lblAboutText.Bottom + SectionGap);
        lblCopyright.Size = new Size(TextWidth, copyrightHeight);

        var buttonTop = lblCopyright.Bottom + SectionGap;
        btnClose.Location = new Point(420 - HorizontalMargin - btnClose.Width, buttonTop);

        ClientSize = new Size(420, buttonTop + btnClose.Height + BottomMargin);
    }
}
