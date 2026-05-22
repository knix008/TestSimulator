namespace FileMasterWinV10.Controls;

partial class FilePanel
{
    private System.ComponentModel.IContainer components = null!;

    private Panel pathBar;
    private Label headerLabel;
    private Label chevronLabel;
    private FolderTreeDropdownPanel folderTree;
    private FlowLayoutPanel driveBar;
    private ListView listView;
    private ImageList imageListSmall;
    private StatusStrip statusStrip;
    private ToolStripStatusLabel statusLabel;

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        columnName = new ColumnHeader();
        columnSize = new ColumnHeader();
        columnType = new ColumnHeader();
        columnModified = new ColumnHeader();
        pathBar = new Panel();
        headerLabel = new Label();
        chevronLabel = new Label();
        folderTree = new FolderTreeDropdownPanel();
        driveBar = new FlowLayoutPanel();
        listView = new ListView();
        imageListSmall = new ImageList(components);
        statusStrip = new StatusStrip();
        statusLabel = new ToolStripStatusLabel();
        pathBar.SuspendLayout();
        statusStrip.SuspendLayout();
        SuspendLayout();
        //
        // pathBar
        //
        pathBar.Controls.Add(headerLabel);
        pathBar.Controls.Add(chevronLabel);
        pathBar.Cursor = Cursors.Hand;
        pathBar.Dock = DockStyle.Top;
        pathBar.Location = new Point(1, 1);
        pathBar.Name = "pathBar";
        pathBar.Padding = new Padding(8, 4, 8, 4);
        pathBar.Size = new Size(398, 36);
        pathBar.TabIndex = 3;
        //
        // headerLabel
        //
        headerLabel.Cursor = Cursors.Hand;
        headerLabel.Dock = DockStyle.Fill;
        headerLabel.Font = new Font("Segoe UI Semibold", 9.25F, FontStyle.Bold);
        headerLabel.ForeColor = Color.FromArgb(0, 103, 192);
        headerLabel.Location = new Point(8, 4);
        headerLabel.Name = "headerLabel";
        headerLabel.Size = new Size(358, 28);
        headerLabel.TabIndex = 0;
        headerLabel.Text = "왼쪽";
        headerLabel.TextAlign = ContentAlignment.MiddleLeft;
        //
        // chevronLabel
        //
        chevronLabel.Cursor = Cursors.Hand;
        chevronLabel.Dock = DockStyle.Right;
        chevronLabel.Font = new Font("Segoe UI", 9.25F);
        chevronLabel.ForeColor = Color.FromArgb(96, 102, 112);
        chevronLabel.Location = new Point(366, 4);
        chevronLabel.Name = "chevronLabel";
        chevronLabel.Size = new Size(24, 28);
        chevronLabel.TabIndex = 1;
        chevronLabel.Text = "▾";
        chevronLabel.TextAlign = ContentAlignment.MiddleCenter;
        //
        // folderTree
        //
        folderTree.Dock = DockStyle.Top;
        folderTree.Location = new Point(1, 37);
        folderTree.Name = "folderTree";
        folderTree.Size = new Size(398, 0);
        folderTree.TabIndex = 2;
        folderTree.Visible = false;
        //
        // driveBar
        //
        driveBar.AutoScroll = true;
        driveBar.Dock = DockStyle.Top;
        driveBar.FlowDirection = FlowDirection.LeftToRight;
        driveBar.Location = new Point(1, 37);
        driveBar.Name = "driveBar";
        driveBar.Padding = new Padding(6, 4, 6, 4);
        driveBar.Size = new Size(398, 34);
        driveBar.TabIndex = 1;
        driveBar.WrapContents = false;
        //
        // listView
        //
        listView.AllowColumnReorder = true;
        listView.AllowDrop = true;
        listView.BorderStyle = BorderStyle.None;
        listView.Columns.AddRange(new ColumnHeader[]
        {
            columnName,
            columnSize,
            columnType,
            columnModified,
        });
        listView.Dock = DockStyle.Fill;
        listView.FullRowSelect = true;
        listView.LabelEdit = false;
        listView.Location = new Point(1, 72);
        listView.MultiSelect = true;
        listView.Name = "listView";
        listView.Size = new Size(398, 303);
        listView.SmallImageList = imageListSmall;
        listView.TabIndex = 0;
        listView.UseCompatibleStateImageBehavior = false;
        listView.View = View.Details;
        //
        // columnName
        //
        columnName.Text = "이름";
        columnName.Width = 240;
        //
        // columnSize
        //
        columnSize.Text = "크기";
        columnSize.TextAlign = HorizontalAlignment.Right;
        columnSize.Width = 90;
        //
        // columnType
        //
        columnType.Text = "종류";
        columnType.Width = 100;
        //
        // columnModified
        //
        columnModified.Text = "수정된 날짜";
        columnModified.Width = 150;
        //
        // imageListSmall
        //
        imageListSmall.ColorDepth = ColorDepth.Depth32Bit;
        imageListSmall.ImageSize = new Size(16, 16);
        //
        // statusStrip
        //
        statusStrip.Items.AddRange(new ToolStripItem[] { statusLabel });
        statusStrip.Location = new Point(1, 375);
        statusStrip.Name = "statusStrip";
        statusStrip.Size = new Size(398, 22);
        statusStrip.SizingGrip = false;
        statusStrip.TabIndex = 4;
        statusStrip.Text = "statusStrip";
        //
        // statusLabel
        //
        statusLabel.Name = "statusLabel";
        statusLabel.Size = new Size(383, 17);
        statusLabel.Spring = true;
        statusLabel.Text = "준비";
        statusLabel.TextAlign = ContentAlignment.MiddleLeft;
        //
        // FilePanel
        //
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        BackColor = Color.FromArgb(245, 246, 248);
        Controls.Add(listView);
        Controls.Add(statusStrip);
        Controls.Add(driveBar);
        Controls.Add(folderTree);
        Controls.Add(pathBar);
        Font = new Font("Segoe UI", 9.25F);
        Name = "FilePanel";
        Padding = new Padding(1);
        Size = new Size(400, 400);
        pathBar.ResumeLayout(false);
        statusStrip.ResumeLayout(false);
        statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }

    private ColumnHeader columnName = null!;
    private ColumnHeader columnSize = null!;
    private ColumnHeader columnType = null!;
    private ColumnHeader columnModified = null!;
}
