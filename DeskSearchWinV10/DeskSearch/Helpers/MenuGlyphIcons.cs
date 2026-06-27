using System.Drawing;
using System.Drawing.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using MediaFontFamily = System.Windows.Media.FontFamily;

namespace DeskSearch.Helpers;

internal static class MenuGlyphIcons
{
    public const string ClearSearch = "\uE70F";
    public const string RefreshIndex = "\uE72C";
    public const string OpenDesktop = "\uE8B7";
    public const string ResetPosition = "\uE81E";
    public const string AlwaysOnTop = "\uE718";
    public const string Settings = "\uE713";
    public const string Hide = "\uE921";
    public const string Exit = "\uE7E8";
    public const string IndexStatus = "\uE721";
    public const string Open = "\uE8E5";
    public const string ShowInFolder = "\uE838";
    public const string CopyPath = "\uE8C8";
    public const string CopyFileName = "\uE8AC";
    public const string ShowWindow = "\uE8A7";

    private static readonly MediaFontFamily WpfGlyphFont = new("Segoe MDL2 Assets");

    public static TextBlock CreateWpfIcon(string glyph) =>
        new()
        {
            Text = glyph,
            FontFamily = WpfGlyphFont,
            FontSize = 14,
            Width = 16,
            Height = 16,
            TextAlignment = TextAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
            HorizontalAlignment = System.Windows.HorizontalAlignment.Center
        };

    public static Bitmap CreateWinFormsIcon(string glyph)
    {
        const int size = 16;
        var bitmap = new Bitmap(size, size, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.Clear(System.Drawing.Color.Transparent);
        graphics.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
        using var font = new Font("Segoe MDL2 Assets", 9f, System.Drawing.FontStyle.Regular, GraphicsUnit.Point);
        using var brush = new SolidBrush(System.Drawing.Color.FromArgb(0x22, 0x22, 0x22));
        graphics.DrawString(glyph, font, brush, -1f, 0f);
        return bitmap;
    }
}
