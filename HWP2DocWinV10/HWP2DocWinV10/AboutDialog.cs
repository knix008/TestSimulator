namespace HWP2DocWinV10;

sealed partial class AboutDialog : Form
{
    public AboutDialog()
    {
        InitializeComponent();
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
    }
}
