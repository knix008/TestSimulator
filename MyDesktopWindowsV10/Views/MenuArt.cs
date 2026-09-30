using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace Palisades.Views;

/// <summary>
/// One place for the way Palisades builds menu entries, so every menu carries an icon rather than a
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
        => new() { Header = header, Icon = Icon(glyph) };

    /// <summary>
    /// A switch. WPF's own IsCheckable draws its tick in the icon column, which would leave these
    /// entries as the only ones in Palisades without an icon, so the state is drawn as the icon.
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
        FontSize = 15,
        HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center
    };

    private static MenuItem Clicked(MenuItem item, Action action)
    {
        item.Click += (_, _) => action();
        return item;
    }
}
