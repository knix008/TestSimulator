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

        AppIconProvider.ApplyMenuItem(mnuHelp, imageListIcons, "info");
        AppIconProvider.ApplyMenuItem(mnuAbout, imageListIcons, "info");
    }

    private void btnInfo_Click(object? sender, EventArgs e) => AboutDialogForm.ShowAbout(this);

    private void LayoutInfoButton(int buttonHeight)
    {
        btnInfo.AutoSize = false;
        btnInfo.Size = new Size(MeasureInfoButtonWidth(), buttonHeight);
    }
}
