namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private ToolStripMenuItem? _menuOutline;
    private ToolStripMenuItem? _menuOutlineNavRoot;

    private void EnsureOutlineNavMenuItem()
    {
        if (_menuOutline != null)
            return;

        _menuOutlineNavRoot = new ToolStripMenuItem
        {
            Name = "menuOutlineNavRoot",
            Visible = false
        };

        _menuOutline = new ToolStripMenuItem
        {
            Name = "menuOutline"
        };
        _menuOutline.Click += (_, _) => BeginInvoke(ToggleOutlinePanel);
        _menuOutlineNavRoot.DropDownItems.Add(_menuOutline);
    }

    private void ApplyOutlineNavLocalization()
    {
        if (_menuOutline == null)
            return;

        _menuOutline.Text = Localization.Get(K.MenuDocumentStructure);
        _menuOutline.Image = AppIcons.LoadMenuIcon("outline");
    }
}
