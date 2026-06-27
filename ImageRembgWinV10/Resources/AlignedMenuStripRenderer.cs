using System.Drawing.Imaging;

namespace ImageRembgWinV10.Resources;

internal sealed class AlignedMenuStripRenderer : ToolStripProfessionalRenderer
{
    private const int IconTextGap = 6;

    protected override void OnRenderItemImage(ToolStripItemImageRenderEventArgs e)
    {
        if (e.Image == null)
        {
            base.OnRenderItemImage(e);
            return;
        }

        var bounds = e.ImageRectangle;
        if (bounds.Width <= 0 || bounds.Height <= 0)
        {
            return;
        }

        DrawColorIcon(e.Graphics, e.Image, bounds, e.Item.Enabled);
    }

    protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
    {
        if (e.Item.Image != null && IsTopLevelMenuBarItem(e.Item))
        {
            var content = e.Item.ContentRectangle;
            var iconSize = AppIconFactory.Size;
            var iconX = content.X + 2;
            var iconY = content.Y + Math.Max(0, (content.Height - iconSize) / 2);
            DrawColorIcon(e.Graphics, e.Item.Image, new Rectangle(iconX, iconY, iconSize, iconSize), e.Item.Enabled);

            var textRect = e.TextRectangle;
            textRect.X = iconX + iconSize + IconTextGap;
            textRect.Width = Math.Max(0, content.Right - textRect.X - 2);
            e = new ToolStripItemTextRenderEventArgs(
                e.Graphics,
                e.Item,
                e.Text,
                textRect,
                e.TextColor,
                e.TextFont,
                e.TextFormat);
        }

        base.OnRenderItemText(e);
    }

    private static bool IsTopLevelMenuBarItem(ToolStripItem item) =>
        item.Owner is MenuStrip menu && menu.Items.Contains(item);

    private static void DrawColorIcon(Graphics graphics, Image image, Rectangle bounds, bool enabled)
    {
        var x = bounds.X + Math.Max(0, (bounds.Width - image.Width) / 2);
        var y = bounds.Y + Math.Max(0, (bounds.Height - image.Height) / 2);

        if (enabled)
        {
            graphics.DrawImage(image, x, y, image.Width, image.Height);
            return;
        }

        using var attributes = new ImageAttributes();
        attributes.SetColorMatrix(new ColorMatrix { Matrix33 = 0.45f });
        graphics.DrawImage(
            image,
            new Rectangle(x, y, image.Width, image.Height),
            0,
            0,
            image.Width,
            image.Height,
            GraphicsUnit.Pixel,
            attributes);
    }
}
