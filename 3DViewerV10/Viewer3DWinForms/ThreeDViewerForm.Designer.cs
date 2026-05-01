namespace Viewer3DWinForms;

partial class ThreeDViewerForm
{
    /// <summary>
    ///  Required designer variable.
    /// </summary>
    private System.ComponentModel.IContainer components = null;

    /// <summary>
    ///  Clean up any resources being used.
    /// </summary>
    /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
        {
            components.Dispose();
        }
        base.Dispose(disposing);
    }

    #region Windows Form Designer generated code

    /// <summary>
    ///  Required method for Designer support - do not modify
    ///  the contents of this method with the code editor.
    /// </summary>
    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        splitMain = new SplitContainer();
        splitLeft = new SplitContainer();
        topPanel = new Panel();
        btnSelectFolder = new Button();
        lblCurrentFolder = new Label();
        treeDirectories = new TreeView();
        listFiles = new ListView();
        panelZoomInfo = new Panel();
        lblZoomRatio = new Label();
        viewerHost = new System.Windows.Forms.Integration.ElementHost();
        statusStrip = new StatusStrip();
        lblStatus = new ToolStripStatusLabel();
        treeImageList = new ImageList(components);
        fileImageList = new ImageList(components);
        ((System.ComponentModel.ISupportInitialize)splitMain).BeginInit();
        splitMain.Panel1.SuspendLayout();
        splitMain.Panel2.SuspendLayout();
        splitMain.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)splitLeft).BeginInit();
        splitLeft.Panel1.SuspendLayout();
        splitLeft.Panel2.SuspendLayout();
        splitLeft.SuspendLayout();
        topPanel.SuspendLayout();
        statusStrip.SuspendLayout();
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1400, 850);
        Controls.Add(splitMain);
        Controls.Add(statusStrip);
        Name = "ThreeDViewerForm";
        Text = "3D Viewer (WinForms)";
        Load += ViewerForm_Load;
        splitMain.Dock = DockStyle.Fill;
        splitMain.FixedPanel = FixedPanel.Panel1;
        splitMain.Location = new Point(0, 0);
        splitMain.Name = "splitMain";
        splitMain.Panel1.Controls.Add(splitLeft);
        splitMain.Panel2.Controls.Add(panelZoomInfo);
        splitMain.Panel2.Controls.Add(viewerHost);
        splitMain.Size = new Size(1400, 828);
        splitMain.SplitterDistance = 430;
        splitMain.TabIndex = 0;
        splitLeft.Dock = DockStyle.Fill;
        splitLeft.Location = new Point(0, 0);
        splitLeft.Name = "splitLeft";
        splitLeft.Orientation = Orientation.Horizontal;
        splitLeft.Panel1.Controls.Add(treeDirectories);
        splitLeft.Panel1.Controls.Add(topPanel);
        splitLeft.Panel2.Controls.Add(listFiles);
        splitLeft.Size = new Size(430, 828);
        splitLeft.SplitterDistance = 545;
        splitLeft.TabIndex = 0;
        topPanel.Controls.Add(btnSelectFolder);
        topPanel.Controls.Add(lblCurrentFolder);
        topPanel.Dock = DockStyle.Top;
        topPanel.Location = new Point(0, 0);
        topPanel.Name = "topPanel";
        topPanel.Size = new Size(430, 62);
        topPanel.TabIndex = 0;
        btnSelectFolder.Location = new Point(12, 17);
        btnSelectFolder.Name = "btnSelectFolder";
        btnSelectFolder.Size = new Size(123, 30);
        btnSelectFolder.TabIndex = 0;
        btnSelectFolder.Text = "폴더 선택...";
        btnSelectFolder.UseVisualStyleBackColor = true;
        btnSelectFolder.Click += btnSelectFolder_Click;
        lblCurrentFolder.AutoEllipsis = true;
        lblCurrentFolder.Location = new Point(148, 11);
        lblCurrentFolder.Name = "lblCurrentFolder";
        lblCurrentFolder.Size = new Size(270, 42);
        lblCurrentFolder.TabIndex = 1;
        lblCurrentFolder.Text = "루트 폴더를 선택하세요.";
        lblCurrentFolder.TextAlign = ContentAlignment.MiddleLeft;
        treeDirectories.Dock = DockStyle.Fill;
        treeDirectories.Location = new Point(0, 62);
        treeDirectories.Name = "treeDirectories";
        treeDirectories.Size = new Size(430, 483);
        treeDirectories.TabIndex = 1;
        treeDirectories.ImageList = treeImageList;
        treeDirectories.BeforeExpand += treeDirectories_BeforeExpand;
        treeDirectories.AfterSelect += treeDirectories_AfterSelect;
        listFiles.Dock = DockStyle.Fill;
        listFiles.FullRowSelect = true;
        listFiles.HideSelection = false;
        listFiles.Location = new Point(0, 0);
        listFiles.MultiSelect = false;
        listFiles.Name = "listFiles";
        listFiles.SmallImageList = fileImageList;
        listFiles.Size = new Size(430, 279);
        listFiles.TabIndex = 0;
        listFiles.UseCompatibleStateImageBehavior = false;
        listFiles.View = View.List;
        listFiles.SelectedIndexChanged += listFiles_SelectedIndexChanged;
        panelZoomInfo.BackColor = System.Drawing.Color.FromArgb(180, 32, 32, 32);
        panelZoomInfo.Controls.Add(lblZoomRatio);
        panelZoomInfo.Location = new Point(8, 8);
        panelZoomInfo.Name = "panelZoomInfo";
        panelZoomInfo.Size = new Size(108, 28);
        panelZoomInfo.TabIndex = 1;
        panelZoomInfo.Anchor = AnchorStyles.Top | AnchorStyles.Left;
        lblZoomRatio.ForeColor = System.Drawing.Color.White;
        lblZoomRatio.Location = new Point(8, 6);
        lblZoomRatio.Name = "lblZoomRatio";
        lblZoomRatio.Size = new Size(92, 16);
        lblZoomRatio.TabIndex = 0;
        lblZoomRatio.Text = "Zoom: 100%";
        viewerHost.Dock = DockStyle.Fill;
        viewerHost.Location = new Point(0, 0);
        viewerHost.Name = "viewerHost";
        viewerHost.Size = new Size(966, 828);
        viewerHost.TabIndex = 0;
        viewerHost.Text = "elementHost1";
        viewerHost.Child = null;
        statusStrip.ImageScalingSize = new Size(20, 20);
        statusStrip.Items.AddRange(new ToolStripItem[] { lblStatus });
        statusStrip.Location = new Point(0, 828);
        statusStrip.Name = "statusStrip";
        statusStrip.Size = new Size(1400, 22);
        statusStrip.TabIndex = 1;
        statusStrip.Text = "statusStrip1";
        lblStatus.Name = "lblStatus";
        lblStatus.Size = new Size(0, 16);
        splitMain.Panel1.ResumeLayout(false);
        splitMain.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)splitMain).EndInit();
        splitMain.ResumeLayout(false);
        splitLeft.Panel1.ResumeLayout(false);
        splitLeft.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)splitLeft).EndInit();
        splitLeft.ResumeLayout(false);
        topPanel.ResumeLayout(false);
        statusStrip.ResumeLayout(false);
        statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }

    #endregion

    private SplitContainer splitMain;
    private SplitContainer splitLeft;
    private Panel topPanel;
    private Button btnSelectFolder;
    private Label lblCurrentFolder;
    private TreeView treeDirectories;
    private ListView listFiles;
    private Panel panelZoomInfo;
    private Label lblZoomRatio;
    private System.Windows.Forms.Integration.ElementHost viewerHost;
    private StatusStrip statusStrip;
    private ToolStripStatusLabel lblStatus;
    private ImageList treeImageList;
    private ImageList fileImageList;
}
