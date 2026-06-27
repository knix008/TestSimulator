namespace ImageRembgWinV10.Resources;

public static class AppIconProvider
{
    public static void ConfigureMenuStrip(MenuStrip menuStrip)
    {
        menuStrip.ImageScalingSize = new Size(AppIconFactory.Size, AppIconFactory.Size);
        menuStrip.Renderer = new AlignedMenuStripRenderer();
    }

    public static void ConfigureToolStrip(ToolStrip strip)
    {
        strip.ImageScalingSize = new Size(AppIconFactory.Size, AppIconFactory.Size);
        if (strip is not MenuStrip)
        {
            strip.Renderer = new AlignedMenuStripRenderer();
        }
    }

    public static void ApplyToolbarButton(ButtonBase button, ImageList imageList, string key)
    {
        button.AutoSize = false;
        button.ImageList = imageList;
        button.ImageKey = key;
    }

    public static void ApplyOptionButton(ButtonBase button, ImageList imageList, string key)
    {
        button.AutoSize = false;
        button.ImageList = imageList;
        button.ImageKey = key;
    }

    public static void ApplyMenuItem(ToolStripMenuItem item, ImageList imageList, string key)
    {
        item.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        item.ImageScaling = ToolStripItemImageScaling.None;
        item.ImageAlign = ContentAlignment.MiddleLeft;
        item.TextAlign = ContentAlignment.MiddleLeft;
        item.TextImageRelation = TextImageRelation.ImageBeforeText;

        var previous = item.Image;
        item.Image = GetColorIcon(imageList, key);
        previous?.Dispose();
    }

    /// <summary>
    /// Returns a 32-bit color clone so menu rendering keeps full color (ImageList retrieval can look flat).
    /// </summary>
    public static Image? GetColorIcon(ImageList imageList, string key)
    {
        var source = imageList.Images[key];
        if (source == null)
        {
            return null;
        }

        return new Bitmap(source);
    }
}
