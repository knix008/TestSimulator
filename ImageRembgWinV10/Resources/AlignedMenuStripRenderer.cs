namespace ImageRembgWinV10.Resources;

internal sealed class AlignedMenuStripRenderer : ToolStripProfessionalRenderer
{
    protected override void OnRenderItemImage(ToolStripItemImageRenderEventArgs e)
    {
        if (e.Image == null)
        {
            base.OnRenderItemImage(e);
            return;
        }

        var image = e.Image;
        var bounds = e.ImageRectangle;
        var x = bounds.X + Math.Max(0, (bounds.Width - image.Width) / 2);
        var y = bounds.Y + Math.Max(0, (bounds.Height - image.Height) / 2);
        e.Graphics.DrawImage(image, x, y, image.Width, image.Height);
    }
}
