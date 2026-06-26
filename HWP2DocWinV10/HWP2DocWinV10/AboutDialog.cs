namespace HWP2DocWinV10;

sealed partial class AboutDialog : Form
{
    private const string CopyrightText =
        "Copyright © 2026 SHKWON (knix008@naver.com) · 일부 구성 요소는 오픈소스(Open Source, MIT License)입니다.";

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
            "Unhwp — 문서 구조·제목 분석 (내장, MIT)\r\n" +
            "rhwp — 표·그림 변환 (선택, Tools\\rhwp\\rhwp.exe)\r\n" +
            "hwp2md — 대체 변환 엔진 (선택, Tools\\hwp2md-*\\hwp2md.exe)\r\n" +
            "Markdig — Markdown 미리보기\r\n" +
            "Microsoft WebView2 — HTML/PDF 렌더링\r\n" +
            "DocumentFormat.OpenXml — Word보내기";
    }
}
