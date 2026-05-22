namespace FileMasterWinV10.Controls;

partial class FolderTreeDropdownPanel
{
    private System.ComponentModel.IContainer components = null!;

    private TreeView treeView;
    private ImageList folderIcons;

    protected override void Dispose(bool disposing)
    {
        if (disposing)
            components?.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        treeView = new TreeView();
        folderIcons = new ImageList(components);
        SuspendLayout();
        //
        // treeView
        //
        treeView.BorderStyle = BorderStyle.None;
        treeView.Dock = DockStyle.Fill;
        treeView.Font = new Font("Segoe UI", 9.25F);
        treeView.HideSelection = false;
        treeView.ImageList = folderIcons;
        treeView.ItemHeight = 22;
        treeView.Location = new Point(1, 1);
        treeView.Name = "treeView";
        treeView.ShowLines = true;
        treeView.ShowNodeToolTips = true;
        treeView.ShowPlusMinus = true;
        treeView.ShowRootLines = true;
        treeView.Size = new Size(398, 0);
        treeView.TabIndex = 0;
        //
        // folderIcons
        //
        folderIcons.ColorDepth = ColorDepth.Depth32Bit;
        folderIcons.ImageSize = new Size(16, 16);
        //
        // FolderTreeDropdownPanel
        //
        BackColor = Color.White;
        BorderStyle = BorderStyle.FixedSingle;
        Controls.Add(treeView);
        Dock = DockStyle.Top;
        Name = "FolderTreeDropdownPanel";
        Padding = new Padding(1);
        Size = new Size(400, 0);
        Visible = false;
        ResumeLayout(false);
    }
}
