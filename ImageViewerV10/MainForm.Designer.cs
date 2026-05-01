namespace ImageViewerV10;

partial class MainForm
{
    private System.ComponentModel.IContainer components = null!;

    private SplitContainer splitMain;
    private Panel panelLeft;
    private Panel panelFolderBar;
    private TextBox textFolderPath;
    private Button buttonPickFolder;
    private SplitContainer splitLeft;
    private TreeView treeFolders;
    private ListView listViewFiles;
    private ColumnHeader columnName;
    private ColumnHeader columnSize;
    private ColumnHeader columnModified;
    private Panel panelPreviewRoot;
    private Panel panelGalleryHost;
    private FlowLayoutPanel flowThumbnails;
    private Panel panelImageHost;
    private Panel panelImageScrollHost;
    private PictureBox picturePreview;
    private Label labelImageZoomInfo;
    private Panel panelVideoHost;
    private TableLayoutPanel layoutVideo;
    private LibVLCSharp.WinForms.VideoView videoView;
    private FlowLayoutPanel flowVideoControls;
    private Button buttonVideoPlay;
    private Button buttonVideoPause;
    private Button buttonVideoStop;
    private Label labelPreviewPlaceholder;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components is not null)
        {
            components.Dispose();
        }

        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        splitMain = new SplitContainer();
        panelLeft = new Panel();
        panelFolderBar = new Panel();
        textFolderPath = new TextBox();
        buttonPickFolder = new Button();
        splitLeft = new SplitContainer();
        treeFolders = new TreeView();
        listViewFiles = new ListView();
        columnName = new ColumnHeader();
        columnSize = new ColumnHeader();
        columnModified = new ColumnHeader();
        panelPreviewRoot = new Panel();
        panelGalleryHost = new Panel();
        flowThumbnails = new FlowLayoutPanel();
        panelImageHost = new Panel();
        panelImageScrollHost = new Panel();
        picturePreview = new PictureBox();
        labelImageZoomInfo = new Label();
        panelVideoHost = new Panel();
        layoutVideo = new TableLayoutPanel();
        videoView = new LibVLCSharp.WinForms.VideoView();
        flowVideoControls = new FlowLayoutPanel();
        buttonVideoPlay = new Button();
        buttonVideoPause = new Button();
        buttonVideoStop = new Button();
        labelPreviewPlaceholder = new Label();
        ((System.ComponentModel.ISupportInitialize)splitMain).BeginInit();
        splitMain.Panel1.SuspendLayout();
        splitMain.Panel2.SuspendLayout();
        splitMain.SuspendLayout();
        panelLeft.SuspendLayout();
        panelFolderBar.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)splitLeft).BeginInit();
        splitLeft.Panel1.SuspendLayout();
        splitLeft.Panel2.SuspendLayout();
        splitLeft.SuspendLayout();
        panelPreviewRoot.SuspendLayout();
        panelGalleryHost.SuspendLayout();
        panelImageHost.SuspendLayout();
        panelImageScrollHost.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)picturePreview).BeginInit();
        panelVideoHost.SuspendLayout();
        layoutVideo.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)videoView).BeginInit();
        flowVideoControls.SuspendLayout();
        SuspendLayout();
        //
        // splitMain
        //
        splitMain.Dock = DockStyle.Fill;
        splitMain.FixedPanel = FixedPanel.Panel1;
        splitMain.Location = new Point(0, 0);
        splitMain.Margin = new Padding(3, 4, 3, 4);
        splitMain.Name = "splitMain";
        splitMain.Orientation = Orientation.Vertical;
        splitMain.Panel1.Controls.Add(panelLeft);
        splitMain.Panel2.Controls.Add(panelPreviewRoot);
        splitMain.Size = new Size(1184, 761);
        splitMain.SplitterDistance = 320;
        splitMain.SplitterWidth = 6;
        splitMain.TabIndex = 0;
        //
        // panelLeft
        //
        panelLeft.Controls.Add(splitLeft);
        panelLeft.Controls.Add(panelFolderBar);
        panelLeft.Dock = DockStyle.Fill;
        panelLeft.Location = new Point(0, 0);
        panelLeft.Margin = new Padding(3, 4, 3, 4);
        panelLeft.Name = "panelLeft";
        panelLeft.Padding = new Padding(8, 8, 8, 8);
        panelLeft.Size = new Size(320, 761);
        panelLeft.TabIndex = 0;
        //
        // panelFolderBar
        //
        panelFolderBar.Controls.Add(buttonPickFolder);
        panelFolderBar.Controls.Add(textFolderPath);
        panelFolderBar.Dock = DockStyle.Top;
        panelFolderBar.Location = new Point(8, 8);
        panelFolderBar.Margin = new Padding(3, 4, 3, 4);
        panelFolderBar.Name = "panelFolderBar";
        panelFolderBar.Padding = new Padding(0, 0, 0, 8);
        panelFolderBar.Size = new Size(304, 48);
        panelFolderBar.TabIndex = 1;
        //
        // textFolderPath
        //
        textFolderPath.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        textFolderPath.Location = new Point(0, 0);
        textFolderPath.Margin = new Padding(3, 4, 3, 4);
        textFolderPath.Name = "textFolderPath";
        textFolderPath.PlaceholderText = "폴더를 선택하세요…";
        textFolderPath.ReadOnly = true;
        textFolderPath.Size = new Size(216, 27);
        textFolderPath.TabIndex = 0;
        //
        // buttonPickFolder
        //
        buttonPickFolder.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        buttonPickFolder.Location = new Point(224, 0);
        buttonPickFolder.Margin = new Padding(3, 4, 3, 4);
        buttonPickFolder.Name = "buttonPickFolder";
        buttonPickFolder.Size = new Size(80, 29);
        buttonPickFolder.TabIndex = 1;
        buttonPickFolder.Text = "찾아보기";
        buttonPickFolder.UseVisualStyleBackColor = true;
        //
        // splitLeft
        //
        splitLeft.Dock = DockStyle.Fill;
        splitLeft.Location = new Point(8, 56);
        splitLeft.Name = "splitLeft";
        splitLeft.Orientation = Orientation.Horizontal;
        splitLeft.Panel1.Controls.Add(treeFolders);
        splitLeft.Panel2.Controls.Add(listViewFiles);
        splitLeft.Size = new Size(304, 697);
        splitLeft.SplitterDistance = 340;
        splitLeft.TabIndex = 2;
        //
        // treeFolders
        //
        treeFolders.Dock = DockStyle.Fill;
        treeFolders.HideSelection = false;
        treeFolders.Location = new Point(0, 0);
        treeFolders.Name = "treeFolders";
        treeFolders.Size = new Size(304, 340);
        treeFolders.TabIndex = 0;
        //
        // listViewFiles
        //
        listViewFiles.Columns.AddRange(new ColumnHeader[] { columnName, columnSize, columnModified });
        listViewFiles.Dock = DockStyle.Fill;
        listViewFiles.FullRowSelect = true;
        listViewFiles.GridLines = true;
        listViewFiles.HideSelection = false;
        listViewFiles.Location = new Point(8, 56);
        listViewFiles.Margin = new Padding(3, 4, 3, 4);
        listViewFiles.MultiSelect = false;
        listViewFiles.Name = "listViewFiles";
        listViewFiles.Size = new Size(304, 353);
        listViewFiles.TabIndex = 0;
        listViewFiles.UseCompatibleStateImageBehavior = false;
        listViewFiles.View = View.Details;
        //
        // columnName
        //
        columnName.Text = "파일 이름";
        columnName.Width = 160;
        //
        // columnSize
        //
        columnSize.Text = "크기";
        columnSize.TextAlign = HorizontalAlignment.Right;
        columnSize.Width = 72;
        //
        // columnModified
        //
        columnModified.Text = "수정";
        columnModified.Width = 120;
        //
        // panelPreviewRoot
        //
        panelPreviewRoot.BackColor = Color.FromArgb(24, 24, 28);
        panelPreviewRoot.Controls.Add(labelPreviewPlaceholder);
        panelPreviewRoot.Controls.Add(panelVideoHost);
        panelPreviewRoot.Controls.Add(panelImageHost);
        panelPreviewRoot.Controls.Add(panelGalleryHost);
        panelPreviewRoot.Dock = DockStyle.Fill;
        panelPreviewRoot.Location = new Point(0, 0);
        panelPreviewRoot.Margin = new Padding(3, 4, 3, 4);
        panelPreviewRoot.Name = "panelPreviewRoot";
        panelPreviewRoot.Size = new Size(858, 761);
        panelPreviewRoot.TabIndex = 0;
        //
        // panelGalleryHost
        //
        panelGalleryHost.Controls.Add(flowThumbnails);
        panelGalleryHost.Dock = DockStyle.Fill;
        panelGalleryHost.Location = new Point(0, 0);
        panelGalleryHost.Name = "panelGalleryHost";
        panelGalleryHost.Size = new Size(858, 761);
        panelGalleryHost.TabIndex = 3;
        panelGalleryHost.Visible = false;
        //
        // flowThumbnails
        //
        flowThumbnails.AutoScroll = true;
        flowThumbnails.BackColor = Color.FromArgb(18, 18, 22);
        flowThumbnails.Dock = DockStyle.Fill;
        flowThumbnails.Location = new Point(0, 0);
        flowThumbnails.Name = "flowThumbnails";
        flowThumbnails.Padding = new Padding(12);
        flowThumbnails.Size = new Size(858, 761);
        flowThumbnails.TabIndex = 0;
        //
        // panelImageHost
        //
        panelImageHost.Controls.Add(labelImageZoomInfo);
        panelImageHost.Controls.Add(panelImageScrollHost);
        panelImageHost.Dock = DockStyle.Fill;
        panelImageHost.Location = new Point(0, 0);
        panelImageHost.Margin = new Padding(3, 4, 3, 4);
        panelImageHost.Name = "panelImageHost";
        panelImageHost.Size = new Size(858, 761);
        panelImageHost.TabIndex = 0;
        panelImageHost.Visible = false;
        //
        // panelImageScrollHost
        //
        panelImageScrollHost.AutoScroll = true;
        panelImageScrollHost.BackColor = Color.FromArgb(18, 18, 22);
        panelImageScrollHost.Controls.Add(picturePreview);
        panelImageScrollHost.Dock = DockStyle.Fill;
        panelImageScrollHost.TabStop = true;
        panelImageScrollHost.Location = new Point(0, 0);
        panelImageScrollHost.Margin = new Padding(3, 4, 3, 4);
        panelImageScrollHost.Name = "panelImageScrollHost";
        panelImageScrollHost.Size = new Size(858, 761);
        panelImageScrollHost.TabIndex = 0;
        //
        // picturePreview
        //
        picturePreview.BackColor = Color.FromArgb(18, 18, 22);
        picturePreview.Location = new Point(0, 0);
        picturePreview.Margin = new Padding(3, 4, 3, 4);
        picturePreview.Name = "picturePreview";
        picturePreview.Size = new Size(640, 480);
        picturePreview.SizeMode = PictureBoxSizeMode.StretchImage;
        picturePreview.TabIndex = 0;
        picturePreview.TabStop = false;
        //
        // labelImageZoomInfo
        //
        labelImageZoomInfo.AutoSize = true;
        labelImageZoomInfo.BackColor = Color.FromArgb(200, 32, 32, 32);
        labelImageZoomInfo.Font = new Font("Segoe UI Semibold", 9.75F, FontStyle.Bold, GraphicsUnit.Point);
        labelImageZoomInfo.ForeColor = Color.WhiteSmoke;
        labelImageZoomInfo.Location = new Point(12, 12);
        labelImageZoomInfo.Margin = new Padding(3, 4, 3, 4);
        labelImageZoomInfo.Name = "labelImageZoomInfo";
        labelImageZoomInfo.Padding = new Padding(8, 4, 8, 4);
        labelImageZoomInfo.Size = new Size(86, 29);
        labelImageZoomInfo.TabIndex = 1;
        labelImageZoomInfo.Text = "100% · —";
        //
        // panelVideoHost
        //
        panelVideoHost.Controls.Add(layoutVideo);
        panelVideoHost.Dock = DockStyle.Fill;
        panelVideoHost.Location = new Point(0, 0);
        panelVideoHost.Margin = new Padding(3, 4, 3, 4);
        panelVideoHost.Name = "panelVideoHost";
        panelVideoHost.Size = new Size(858, 761);
        panelVideoHost.TabIndex = 1;
        panelVideoHost.Visible = false;
        //
        // layoutVideo
        //
        layoutVideo.ColumnCount = 1;
        layoutVideo.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        layoutVideo.Controls.Add(videoView, 0, 0);
        layoutVideo.Controls.Add(flowVideoControls, 0, 1);
        layoutVideo.Dock = DockStyle.Fill;
        layoutVideo.Location = new Point(0, 0);
        layoutVideo.Margin = new Padding(3, 4, 3, 4);
        layoutVideo.Name = "layoutVideo";
        layoutVideo.RowCount = 2;
        layoutVideo.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        layoutVideo.RowStyles.Add(new RowStyle(SizeType.Absolute, 56F));
        layoutVideo.Size = new Size(858, 761);
        layoutVideo.TabIndex = 0;
        //
        // videoView
        //
        videoView.BackColor = Color.Black;
        videoView.Dock = DockStyle.Fill;
        videoView.Location = new Point(3, 4);
        videoView.Margin = new Padding(3, 4, 3, 4);
        videoView.MediaPlayer = null;
        videoView.Name = "videoView";
        videoView.Size = new Size(852, 697);
        videoView.TabIndex = 0;
        videoView.TabStop = false;
        //
        // flowVideoControls
        //
        flowVideoControls.AutoSize = true;
        flowVideoControls.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        flowVideoControls.BackColor = Color.FromArgb(32, 32, 38);
        flowVideoControls.Controls.Add(buttonVideoPlay);
        flowVideoControls.Controls.Add(buttonVideoPause);
        flowVideoControls.Controls.Add(buttonVideoStop);
        flowVideoControls.Dock = DockStyle.Fill;
        flowVideoControls.FlowDirection = FlowDirection.LeftToRight;
        flowVideoControls.Location = new Point(3, 708);
        flowVideoControls.Margin = new Padding(3, 4, 3, 4);
        flowVideoControls.Name = "flowVideoControls";
        flowVideoControls.Padding = new Padding(10, 8, 10, 8);
        flowVideoControls.Size = new Size(852, 49);
        flowVideoControls.TabIndex = 1;
        flowVideoControls.WrapContents = false;
        //
        // buttonVideoPlay
        //
        buttonVideoPlay.Font = new Font("Segoe MDL2 Assets", 14.25F, FontStyle.Regular, GraphicsUnit.Point);
        buttonVideoPlay.Location = new Point(13, 12);
        buttonVideoPlay.Margin = new Padding(3, 4, 6, 4);
        buttonVideoPlay.Name = "buttonVideoPlay";
        buttonVideoPlay.Size = new Size(44, 40);
        buttonVideoPlay.TabIndex = 0;
        buttonVideoPlay.Text = "\uE102";
        buttonVideoPlay.UseVisualStyleBackColor = true;
        //
        // buttonVideoPause
        //
        buttonVideoPause.Font = new Font("Segoe MDL2 Assets", 14.25F, FontStyle.Regular, GraphicsUnit.Point);
        buttonVideoPause.Location = new Point(63, 12);
        buttonVideoPause.Margin = new Padding(3, 4, 6, 4);
        buttonVideoPause.Name = "buttonVideoPause";
        buttonVideoPause.Size = new Size(44, 40);
        buttonVideoPause.TabIndex = 1;
        buttonVideoPause.Text = "\uE103";
        buttonVideoPause.UseVisualStyleBackColor = true;
        //
        // buttonVideoStop
        //
        buttonVideoStop.Font = new Font("Segoe MDL2 Assets", 14.25F, FontStyle.Regular, GraphicsUnit.Point);
        buttonVideoStop.Location = new Point(113, 12);
        buttonVideoStop.Margin = new Padding(3, 4, 6, 4);
        buttonVideoStop.Name = "buttonVideoStop";
        buttonVideoStop.Size = new Size(44, 40);
        buttonVideoStop.TabIndex = 2;
        buttonVideoStop.Text = "\uE15B";
        buttonVideoStop.UseVisualStyleBackColor = true;
        //
        // labelPreviewPlaceholder
        //
        labelPreviewPlaceholder.Dock = DockStyle.Fill;
        labelPreviewPlaceholder.Font = new Font("Segoe UI", 11.25F, FontStyle.Regular, GraphicsUnit.Point);
        labelPreviewPlaceholder.ForeColor = Color.Gainsboro;
        labelPreviewPlaceholder.Margin = new Padding(3, 4, 3, 4);
        labelPreviewPlaceholder.Name = "labelPreviewPlaceholder";
        labelPreviewPlaceholder.Text = "폴더와 파일을 선택하면 여기에 표시됩니다.";
        labelPreviewPlaceholder.TextAlign = ContentAlignment.MiddleCenter;
        //
        // MainForm
        //
        AutoScaleDimensions = new SizeF(8F, 20F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1184, 761);
        Controls.Add(splitMain);
        Margin = new Padding(3, 4, 3, 4);
        MinimumSize = new Size(900, 560);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "ImageViewerV10 — 폴더 미리보기";
        splitMain.Panel1.ResumeLayout(false);
        splitMain.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)splitMain).EndInit();
        splitMain.ResumeLayout(false);
        panelLeft.ResumeLayout(false);
        panelFolderBar.ResumeLayout(false);
        panelFolderBar.PerformLayout();
        splitLeft.Panel1.ResumeLayout(false);
        splitLeft.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)splitLeft).EndInit();
        splitLeft.ResumeLayout(false);
        panelPreviewRoot.ResumeLayout(false);
        panelPreviewRoot.PerformLayout();
        panelGalleryHost.ResumeLayout(false);
        panelImageHost.ResumeLayout(false);
        panelImageHost.PerformLayout();
        panelImageScrollHost.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)picturePreview).EndInit();
        panelVideoHost.ResumeLayout(false);
        layoutVideo.ResumeLayout(false);
        layoutVideo.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)videoView).EndInit();
        flowVideoControls.ResumeLayout(false);
        ResumeLayout(false);
    }
}
