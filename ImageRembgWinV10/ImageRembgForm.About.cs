using ImageRembgWinV10.Localization;

using ImageRembgWinV10.Resources;



namespace ImageRembgWinV10;



public partial class ImageRembgForm

{

    private ToolStripMenuItem? mnuHelp;

    private ToolStripMenuItem? mnuAbout;



    private void InitializeAboutUi()

    {

        mnuHelp = new ToolStripMenuItem();

        mnuAbout = new ToolStripMenuItem();

        mnuAbout.Click += (_, _) => AboutDialogForm.ShowAbout(this);

        mnuHelp.DropDownItems.Add(mnuAbout);

        menuStrip.Items.Add(mnuHelp);

        ApplyDynamicMenuIcons();

    }



    private void ApplyDynamicMenuIcons()

    {

        if (mnuPreferences != null)

        {

            AppIconProvider.ApplyMenuItem(mnuPreferences, imageListIcons, "settings");

        }



        if (mnuHelp != null)

        {

            AppIconProvider.ApplyMenuItem(mnuHelp, imageListIcons, "info");

        }



        if (mnuAbout != null)

        {

            AppIconProvider.ApplyMenuItem(mnuAbout, imageListIcons, "info");

        }

    }



    private void btnInfo_Click(object? sender, EventArgs e) => AboutDialogForm.ShowAbout(this);
}


