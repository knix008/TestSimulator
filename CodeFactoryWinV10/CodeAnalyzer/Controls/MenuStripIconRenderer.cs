namespace CodeAnalyzer.Controls;

internal sealed class MenuStripIconRenderer : ToolStripProfessionalRenderer
{
    private const int IconSize = 16;
    private const int IconPadding = 4;
    private const int IconTextGap = 6;

    protected override void OnRenderItemImage(ToolStripItemImageRenderEventArgs e)
    {
        if (IsTopLevelMenuItem(e.Item))
        {
            return;
        }

        base.OnRenderItemImage(e);
    }

    protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
    {
        if (e.Item.Image is not null && IsTopLevelMenuItem(e.Item))
        {
            var content = e.Item.ContentRectangle;
            var imageY = content.Top + Math.Max(0, (content.Height - IconSize) / 2);
            var imageRect = new Rectangle(content.Left + IconPadding, imageY, IconSize, IconSize);
            e.Graphics.DrawImage(e.Item.Image, imageRect);

            var textLeft = imageRect.Right + IconTextGap;
            e.TextRectangle = new Rectangle(
                textLeft,
                e.TextRectangle.Top,
                Math.Max(0, content.Right - textLeft),
                e.TextRectangle.Height);
            e.TextFormat |= TextFormatFlags.NoPrefix;
        }

        base.OnRenderItemText(e);
    }

    private static bool IsTopLevelMenuItem(ToolStripItem item) =>
        item is ToolStripMenuItem && item.Owner is MenuStrip && item.OwnerItem is null;
}
