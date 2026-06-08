using System.Runtime.InteropServices;

namespace CodeAnalyzer.Controls;

internal static class ApplicationDialogIcons
{
    private static Icon? _appIcon;

    public static Icon AppIcon
    {
        get
        {
            if (_appIcon is not null)
            {
                return _appIcon;
            }

            try
            {
                var iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "AppIcon.ico");
                if (File.Exists(iconPath))
                {
                    _appIcon = new Icon(iconPath);
                    return _appIcon;
                }
            }
            catch
            {
                // fall back below
            }

            _appIcon = SystemIcons.Application;
            return _appIcon;
        }
    }

    public static void ApplyAppTitleBar(Form form)
    {
        form.ShowIcon = true;
        form.Icon = (Icon)AppIcon.Clone();
    }

    public static void ApplyDialogTitleBar(Form form, Bitmap iconBitmap)
    {
        form.ShowIcon = true;
        form.Icon = CreateIconFromBitmap(iconBitmap);
    }

    public static Panel CreateHeaderPanel(string title, Bitmap? icon = null)
    {
        const int headerHeight = 52;
        var header = new Panel
        {
            Dock = DockStyle.Top,
            Height = headerHeight,
            Padding = new Padding(12, 10, 12, 6),
            BackColor = Color.FromArgb(245, 247, 252)
        };

        var iconBox = new PictureBox
        {
            Image = icon ?? MenuIconFactory.CreateAnalysisSettingsIcon(32),
            SizeMode = PictureBoxSizeMode.CenterImage,
            Size = new Size(32, 32),
            Location = new Point(12, 8),
            BackColor = Color.Transparent
        };

        var titleLabel = new Label
        {
            Text = title,
            AutoSize = true,
            Location = new Point(52, 14),
            Font = new Font(SystemFonts.DefaultFont.FontFamily, 11f, FontStyle.Bold),
            ForeColor = Color.FromArgb(35, 55, 90),
            BackColor = Color.Transparent
        };

        header.Controls.Add(iconBox);
        header.Controls.Add(titleLabel);
        return header;
    }

    private static Icon CreateIconFromBitmap(Bitmap bitmap)
    {
        var handle = bitmap.GetHicon();
        try
        {
            using var temp = Icon.FromHandle(handle);
            return (Icon)temp.Clone();
        }
        finally
        {
            DestroyIcon(handle);
        }
    }

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern bool DestroyIcon(IntPtr handle);
}
