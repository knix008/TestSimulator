namespace FileMasterWinV10.Controls;

partial class FilePanel
{
    private System.ComponentModel.IContainer components = null!;

    private Panel pathBar;
    private Panel dirBox;
    private Label pathLabel;
    private Label chevronLabel;
    private ComboBox driveCombo;
    private FolderTreeDropdownPanel folderTree;
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
        dirBox = new Panel();
        pathLabel = new Label();
        chevronLabel = new Label();
        driveCombo = new ComboBox();
        folderTree = new FolderTreeDropdownPanel();
        listView = new ListView();
        imageListSmall = new ImageList(components);
        statusStrip = new StatusStrip();
        statusLabel = new ToolStripStatusLabel();
        pathBar.SuspendLayout();
        dirBox.SuspendLayout();
        statusStrip.SuspendLayout();
        SuspendLayout();
        //
        // pathBar
        //
        pathBar.Controls.Add(dirBox);
        pathBar.Controls.Add(driveCombo);
        pathBar.Cursor = Cursors.Hand;
        pathBar.Dock = DockStyle.Top;
        pathBar.Location = new Point(1, 1);
        pathBar.Name = "pathBar";
        pathBar.Padding = new Padding(8, 6, 8, 6);
        pathBar.Size = new Size(398, 38);
        pathBar.TabIndex = 3;
        //
        // dirBox
        //
        dirBox.Controls.Add(pathLabel);
        dirBox.Controls.Add(chevronLabel);
        dirBox.BorderStyle = BorderStyle.FixedSingle;
        dirBox.Cursor = Cursors.Hand;
        dirBox.Dock = DockStyle.Fill;
        dirBox.Name = "dirBox";
        dirBox.TabIndex = 2;
        //
        // pathLabel
        //
        pathLabel.Cursor = Cursors.Hand;
        pathLabel.Dock = DockStyle.Fill;
        pathLabel.Font = new Font("Segoe UI", 9.25F);
        pathLabel.ForeColor = Color.FromArgb(30, 30, 30);
        pathLabel.Name = "pathLabel";
        pathLabel.Padding = new Padding(8, 0, 0, 0);
        pathLabel.TabIndex = 0;
        pathLabel.Text = "";
        pathLabel.TextAlign = ContentAlignment.MiddleLeft;
        pathLabel.AutoEllipsis = true;
        //
        // chevronLabel
        //
        chevronLabel.Cursor = Cursors.Hand;
        chevronLabel.Dock = DockStyle.Right;
        chevronLabel.Font = new Font("Segoe UI", 9.25F);
        chevronLabel.ForeColor = Color.FromArgb(96, 102, 112);
        chevronLabel.Name = "chevronLabel";
        chevronLabel.Size = new Size(26, 24);
        chevronLabel.TabIndex = 1;
        chevronLabel.Text = "▾";
        chevronLabel.TextAlign = ContentAlignment.MiddleCenter;
        //
        // folderTree
        //
        folderTree.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        folderTree.Location = new Point(1, 37);
        folderTree.Name = "folderTree";
        folderTree.Size = new Size(398, 0);
        folderTree.TabIndex = 2;
        folderTree.Visible = false;
        //
        // driveCombo
        //
        driveCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        driveCombo.Dock = DockStyle.Left;
        driveCombo.FlatStyle = FlatStyle.Flat;
        driveCombo.Name = "driveCombo";
        driveCombo.Size = new Size(88, 23);
        driveCombo.TabIndex = 1;
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
        Controls.Add(folderTree);
        Controls.Add(pathBar);
        Font = new Font("Segoe UI", 9.25F);
        Name = "FilePanel";
        Padding = new Padding(1);
        Size = new Size(400, 400);
        dirBox.ResumeLayout(false);
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
