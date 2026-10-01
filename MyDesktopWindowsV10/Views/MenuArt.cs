using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;

namespace MyDesktop.Views;

/// <summary>
/// One place for the way MyDesktop builds menu entries, so every menu carries an icon rather than a
/// bare line of text. The glyphs come from the shell's own icon font, which means they match the
/// weight of the icons Windows draws in its menus and follow the menu's foreground into dark mode
/// on their own.
/// </summary>
internal static class MenuArt
{
    /// <summary>
    /// Windows 11 ships the glyphs as Segoe Fluent Icons and Windows 10 as Segoe MDL2 Assets. The
    /// codepoints used here exist in both, so naming the two families in order lets whichever one is
    /// installed answer.
    /// </summary>
    private static readonly FontFamily IconFont = new("Segoe Fluent Icons, Segoe MDL2 Assets");

    public const string Open = "";
    public const string FolderOpen = "";
    public const string OpenExternal = "";
    public const string Copy = "";
    public const string Delete = "";
    public const string EmptyBin = "";
    public const string MoveToFence = "";
    public const string Fence = "";
    public const string NewFence = "";
    public const string NewPortal = "";
    public const string Settings = "";
    public const string Startup = "";
    public const string Exit = "";
    public const string Refresh = "";
    public const string Remove = "";
    public const string Rename = "";
    public const string RollUp = "";
    public const string RollDown = "";
    public const string Sort = "";
    public const string IconSize = "";
    public const string Labels = "";
    public const string Colour = "";
    public const string Accent = "";
    public const string Transparency = "";
    public const string PointAtFolder = "";
    public const string ShowHidden = "";
    public const string StopMirroring = "";
    public const string MakePortal = "";
    public const string Locked = "";
    public const string Unlocked = "";
    public const string Desktop = "";
    public const string Hide = "";
    public const string Language = "";
    public const string Pointer = "";
    public const string Mouse = "";

    // The item menu. Windows 11 puts these on its own menu for a file, and the glyphs here are
    // the ones it draws beside them.
    public const string Cut = "";
    public const string Share = "";
    public const string Shield = "";
    public const string OpenWith = "";
    public const string Pin = "";
    public const string Unpin = "";
    public const string Compress = "";
    public const string CopyPath = "";
    public const string Properties = "";
    public const string MoreOptions = "";

    /// <summary>The state of a switch, drawn in the same column as every other icon.</summary>
    public const string CheckedBox = "";

    public const string UncheckedBox = "";

    public static MenuItem Command(string header, string glyph, Action action, bool enabled = true)
    {
        var item = new MenuItem { Header = header, IsEnabled = enabled, Icon = Icon(glyph) };
        item.Click += (_, _) => action();
        return item;
    }

    /// <summary>A parent entry. It opens a submenu instead of doing anything, but still shows why.</summary>
    public static MenuItem Submenu(string header, string glyph)
    {
        var item = new MenuItem { Header = header, Icon = Icon(glyph) };

        // A submenu is a window of its own, opened beside the menu rather than inside it, so it
        // needs lifting for the same reason the menu does.
        item.SubmenuOpened += (sender, _) => Lift(sender as Visual);
        return item;
    }

    /// <summary>
    /// Opens a menu and lifts it clear of the fences.
    ///
    /// A menu is a window, owned by the window it was opened from, and Windows keeps an owned window
    /// directly above its owner. Fences live pinned to the very bottom of the z-order, so a menu
    /// opened from one sits at the bottom too — above its own fence, but underneath every other
    /// fence on screen. Activating the fence first does not help: the anchor's
    /// WM_WINDOWPOSCHANGING hook puts it straight back on the bottom. Marking the menu's own window
    /// topmost is what takes it out of that pile, and it lasts only as long as the menu is open.
    /// </summary>
    public static void Show(ContextMenu menu)
    {
        Dress(menu);
        menu.Opened += OnOpened;
        menu.IsOpen = true;
    }

    /// <summary>
    /// Gives a menu the one look MyDesktop has: the shape Windows 11 draws its own menus in, in
    /// whichever of the light and dark sets the Windows app theme asks for.
    ///
    /// It happens here rather than at each menu, because there are several of them — the tray menu,
    /// the fence menu, the item menu, the desktop menu — and a menu that was built without the
    /// styles stood out at once: WPF's untouched menu is a smaller, lighter, square-cornered thing
    /// beside the rounded dark one next to it. Every menu MyDesktop opens goes through Show, so
    /// dressing it here is what keeps them the same.
    /// </summary>
    public static void Dress(ContextMenu menu)
    {
        ApplyTheme();

        menu.Style = Resource<Style>("ShellMenu") ?? menu.Style;
        Dress((ItemsControl)menu);
    }

    private static void Dress(ItemsControl parent)
    {
        var itemStyle = Resource<Style>("ShellMenuItem");
        var separatorStyle = Resource<Style>("ShellMenuSeparator");

        foreach (var entry in parent.Items)
        {
            switch (entry)
            {
                // A local Style is somebody saying what they want; only an undressed entry is dressed.
                case MenuItem item:
                    item.Style ??= itemStyle;
                    Dress(item);
                    break;

                case Separator separator:
                    separator.Style ??= separatorStyle;
                    break;
            }
        }
    }

    /// <summary>
    /// Points the menu colours at the light or the dark set. Windows 11's own menus follow the app
    /// theme rather than an application's own colours, and these are meant to pass for one of them.
    /// </summary>
    private static void ApplyTheme()
    {
        var light = UsesLightTheme();
        var resources = Application.Current?.Resources;
        if (resources is null)
        {
            return;
        }

        resources["MenuSurface"] = Brush(light, 0xF9, 0xF9, 0xF9, 0x2C, 0x2C, 0x2C);
        resources["MenuEdge"] = Brush(light, 0xE5, 0xE5, 0xE5, 0x45, 0x45, 0x45);
        resources["MenuText"] = Brush(light, 0x1A, 0x1A, 0x1A, 0xFF, 0xFF, 0xFF);
        resources["MenuTextDim"] = Brush(light, 0x5D, 0x5D, 0x5D, 0x9A, 0x9A, 0x9A);
        resources["MenuHover"] = Brush(light, 0xEA, 0xEA, 0xEA, 0x3D, 0x3D, 0x3D);
        resources["MenuLine"] = Brush(light, 0xE0, 0xE0, 0xE0, 0x3D, 0x3D, 0x3D);
    }

    private static SolidColorBrush Brush(bool light, byte lr, byte lg, byte lb, byte dr, byte dg, byte db)
        => new(light ? Color.FromRgb(lr, lg, lb) : Color.FromRgb(dr, dg, db));

    private static bool UsesLightTheme()
    {
        try
        {
            using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
            return key?.GetValue("AppsUseLightTheme") is not int value || value != 0;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            return true;
        }
    }

    private static T? Resource<T>(string key) where T : class
        => Application.Current?.TryFindResource(key) as T;

    private static void OnOpened(object sender, RoutedEventArgs e)
    {
        if (sender is not ContextMenu menu)
        {
            return;
        }

        menu.Opened -= OnOpened;
        Lift(menu);
    }

    private static void Lift(Visual? visual)
    {
        if (visual is null || PresentationSource.FromVisual(visual) is not HwndSource source)
        {
            return;
        }

        // Never steal the focus: taking it would close the menu that is being lifted.
        Interop.NativeMethods.SetWindowPos(
            source.Handle, Interop.NativeMethods.HWND_TOPMOST, 0, 0, 0, 0,
            Interop.NativeMethods.SWP_NOMOVE | Interop.NativeMethods.SWP_NOSIZE
            | Interop.NativeMethods.SWP_NOACTIVATE);
    }

    /// <summary>
    /// A switch. WPF's own IsCheckable draws its tick in the icon column, which would leave these
    /// entries as the only ones in MyDesktop without an icon, so the state is drawn as the icon.
    /// </summary>
    public static MenuItem Check(string header, bool isChecked, Action action)
        => Check(header, isChecked, CheckedBox, UncheckedBox, action);

    /// <summary>
    /// A switch whose two states have icons of their own, such as the open and closed padlock. The
    /// glyph then carries the state and no tick is needed.
    /// </summary>
    public static MenuItem Check(string header, bool isChecked, string onGlyph, string offGlyph, Action action)
    {
        var item = new MenuItem { Header = header, Icon = Icon(isChecked ? onGlyph : offGlyph) };
        item.Click += (_, _) => action();
        return item;
    }

    /// <summary>Repoints an existing switch, for menus that are built once and reopened.</summary>
    public static void SetState(MenuItem item, bool isChecked, string onGlyph = CheckedBox, string offGlyph = UncheckedBox)
        => item.Icon = Icon(isChecked ? onGlyph : offGlyph);

    /// <summary>A colour choice, which shows the colour itself rather than a glyph.</summary>
    public static MenuItem Swatch(string header, string colour, Action action)
    {
        var item = new MenuItem { Header = header };
        try
        {
            if (ColorConverter.ConvertFromString(colour) is Color parsed)
            {
                item.Icon = new System.Windows.Shapes.Rectangle
                {
                    Width = 14,
                    Height = 14,
                    RadiusX = 3,
                    RadiusY = 3,
                    Fill = new SolidColorBrush(parsed),
                    Stroke = new SolidColorBrush(Color.FromArgb(60, 128, 128, 128)),
                    StrokeThickness = 1
                };
            }
        }
        catch (FormatException)
        {
            // An unparseable colour is not worth a missing menu entry; it just goes without a swatch.
        }

        return Clicked(item, action);
    }

    /// <summary>
    /// Foreground is deliberately left unset: it is an inherited property, so the glyph picks up
    /// whatever colour the menu is drawing its text in, including when the entry is disabled.
    /// </summary>
    public static TextBlock Icon(string glyph) => new()
    {
        Text = glyph,
        FontFamily = IconFont,
        FontSize = 14,
        HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center
    };

    private static MenuItem Clicked(MenuItem item, Action action)
    {
        item.Click += (_, _) => action();
        return item;
    }
}
