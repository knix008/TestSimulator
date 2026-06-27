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

    public static void ApplyToolbarButton(Button button, ImageList imageList, string key)
    {
        button.AutoSize = false;
        button.ImageList = imageList;
        button.ImageKey = key;
        button.TextImageRelation = TextImageRelation.ImageBeforeText;
        button.ImageAlign = ContentAlignment.MiddleCenter;
        button.TextAlign = ContentAlignment.MiddleCenter;
    }

    public static void ApplyOptionButton(ButtonBase button, ImageList imageList, string key)
    {
        button.AutoSize = false;
        button.ImageList = imageList;
        button.ImageKey = key;
        button.TextImageRelation = TextImageRelation.ImageBeforeText;
        button.ImageAlign = ContentAlignment.MiddleCenter;
        button.TextAlign = ContentAlignment.MiddleCenter;
    }

    public static void ApplyMenuItem(ToolStripMenuItem item, ImageList imageList, string key)
    {
        item.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        item.ImageScaling = ToolStripItemImageScaling.None;
        item.Image = imageList.Images[key];
        item.TextImageRelation = TextImageRelation.ImageBeforeText;
        item.ImageAlign = ContentAlignment.MiddleLeft;
        item.TextAlign = ContentAlignment.MiddleLeft;
    }
}
