namespace HWP2DocWinV10;

sealed partial class AboutDialog : Form
{
    private const string CopyrightText = "Copyright © 2026 SHKWON (knix008@naver.com)";

    public AboutDialog()
    {
        InitializeComponent();
        lblCopyright.Text = CopyrightText;
        TryLoadAppIcon();
    }

    private void TryLoadAppIcon()
    {
        try
        {
            string iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "app.ico");
            if (File.Exists(iconPath))
                Icon = new Icon(iconPath);
        }
        catch
        {
        }
    }

    private void AboutDialog_Load(object? sender, EventArgs e)
    {
        try
        {
            string iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "app.ico");
            if (File.Exists(iconPath))
            {
                using var icon = new Icon(iconPath);
                picAppIcon.Image = icon.ToBitmap();
            }
        }
        catch
        {
        }

        var version = System.Reflection.Assembly.GetExecutingAssembly().GetName().Version;
        if (version != null)
            lblVersion.Text = $"버전 {version.Major}.{version.Minor}.{version.Build}";

        lblLibraries.Text =
            "rhwp — HWP/HWPX 표·그림·레이아웃 변환 (MIT)\r\n" +
            "unhwp — HWP/HWPX Markdown 변환 (MIT, 보조)\r\n" +
            "Markdig — Markdown 미리보기\r\n" +
            "Microsoft WebView2 — HTML/PDF 렌더링\r\n" +
            "DocumentFormat.OpenXml — Word보내기";
    }
}
