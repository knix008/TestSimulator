namespace ImageViewerV30;

partial class MainForm
{
    private System.ComponentModel.IContainer components = null!;

    private SplitContainer splitMain;
    private ImageList imageListTree;
    private ImageList imageListFiles;
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
    private Panel panelImageToolbar;
    private Panel panelImageScrollHost;
    private PictureBox picturePreview;
    private Label labelImageZoomInfo;
    private Button buttonRotateCCW;
    private Button buttonRotateCW;
    private Button buttonFlipHorizontal;
    private Button buttonEditImage;
    private Panel panelVideoHost;
    private TableLayoutPanel layoutVideo;
    private Panel panelVideoStage;
    private LibVLCSharp.WinForms.VideoView videoView;
    private Label labelVideoOverlayIcon;
    private Panel panelVideoBottom;
    private Panel panelVideoBottomSeparator;
    private TableLayoutPanel layoutVideoBottom;
    private TableLayoutPanel layoutVideoButtons;
    private Panel panelVideoTimeline;
    private Label labelVideoTime;
    private Label labelVideoPercent;
    private MediaSeekBar videoSeekBar;
    private FlowLayoutPanel flowVideoControls;
    private Button buttonVideoPlay;
    private Button buttonVideoPause;
    private Button buttonVideoStop;
    private Label labelPreviewPlaceholder;
    private StatusStrip statusStripMain;
    private ToolStripStatusLabel statusLabelDirectory;
    private ToolStripStatusLabel statusLabelFile;

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
        splitLeft = new SplitContainer();
        treeFolders = new TreeView();
        imageListTree = new ImageList(components);
        listViewFiles = new ListView();
        columnName = new ColumnHeader();
        columnSize = new ColumnHeader();
        columnModified = new ColumnHeader();
        imageListFiles = new ImageList(components);
        panelFolderBar = new Panel();
        buttonPickFolder = new Button();
        textFolderPath = new TextBox();
        panelPreviewRoot = new Panel();
        panelImageToolbar = new Panel();
        buttonRotateCW = new Button();
        buttonRotateCCW = new Button();
        buttonFlipHorizontal = new Button();
        buttonEditImage = new Button();
        labelPreviewPlaceholder = new Label();
        panelVideoHost = new Panel();
        layoutVideo = new TableLayoutPanel();
        panelVideoStage = new Panel();
        labelVideoOverlayIcon = new Label();
        videoView = new LibVLCSharp.WinForms.VideoView();
        panelVideoBottom = new Panel();
        layoutVideoBottom = new TableLayoutPanel();
        panelVideoTimeline = new Panel();
        labelVideoPercent = new Label();
        labelVideoTime = new Label();
        layoutVideoButtons = new TableLayoutPanel();
        flowVideoControls = new FlowLayoutPanel();
        buttonVideoPlay = new Button();
        buttonVideoPause = new Button();
        buttonVideoStop = new Button();
        panelVideoBottomSeparator = new Panel();
        panelImageHost = new Panel();
        panelImageScrollHost = new Panel();
        picturePreview = new PictureBox();
        panelGalleryHost = new Panel();
        flowThumbnails = new FlowLayoutPanel();
        labelImageZoomInfo = new Label();
        statusStripMain = new StatusStrip();
        statusLabelDirectory = new ToolStripStatusLabel();
        statusLabelFile = new ToolStripStatusLabel();
        ((System.ComponentModel.ISupportInitialize)splitMain).BeginInit();
        splitMain.Panel1.SuspendLayout();
        splitMain.Panel2.SuspendLayout();
        splitMain.SuspendLayout();
        panelLeft.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)splitLeft).BeginInit();
        splitLeft.Panel1.SuspendLayout();
        splitLeft.Panel2.SuspendLayout();
        splitLeft.SuspendLayout();
        panelFolderBar.SuspendLayout();
        panelPreviewRoot.SuspendLayout();
        panelImageToolbar.SuspendLayout();
        panelVideoHost.SuspendLayout();
        layoutVideo.SuspendLayout();
        panelVideoStage.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)videoView).BeginInit();
        panelVideoBottom.SuspendLayout();
        layoutVideoBottom.SuspendLayout();
        panelVideoTimeline.SuspendLayout();
        layoutVideoButtons.SuspendLayout();
        flowVideoControls.SuspendLayout();
        panelImageHost.SuspendLayout();
        panelImageScrollHost.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)picturePreview).BeginInit();
        panelGalleryHost.SuspendLayout();
        statusStripMain.SuspendLayout();
        SuspendLayout();
        // 
        // splitMain
        // 
        splitMain.Dock = DockStyle.Fill;
        splitMain.FixedPanel = FixedPanel.Panel1;
        splitMain.Location = new Point(0, 0);
        splitMain.Name = "splitMain";
        // 
        // splitMain.Panel1
        // 
        splitMain.Panel1.Controls.Add(panelLeft);
        // 
        // splitMain.Panel2
        // 
        splitMain.Panel2.Controls.Add(panelPreviewRoot);
        splitMain.Size = new Size(1036, 547);
        splitMain.SplitterDistance = 280;
        splitMain.SplitterWidth = 5;
        splitMain.TabIndex = 0;
        // 
        // panelLeft
        // 
        panelLeft.Controls.Add(splitLeft);
        panelLeft.Controls.Add(panelFolderBar);
        panelLeft.Dock = DockStyle.Fill;
        panelLeft.Location = new Point(0, 0);
        panelLeft.Name = "panelLeft";
        panelLeft.Padding = new Padding(7, 6, 7, 6);
        panelLeft.Size = new Size(280, 547);
        panelLeft.TabIndex = 0;
        // 
        // splitLeft
        // 
        splitLeft.Dock = DockStyle.Fill;
        splitLeft.Location = new Point(7, 42);
        splitLeft.Margin = new Padding(3, 2, 3, 2);
        splitLeft.Name = "splitLeft";
        splitLeft.Orientation = Orientation.Horizontal;
        // 
        // splitLeft.Panel1
        // 
        splitLeft.Panel1.Controls.Add(treeFolders);
        // 
        // splitLeft.Panel2
        // 
        splitLeft.Panel2.Controls.Add(listViewFiles);
        splitLeft.Size = new Size(266, 499);
        splitLeft.SplitterDistance = 243;
        splitLeft.SplitterWidth = 3;
        splitLeft.TabIndex = 2;
        // 
        // treeFolders
        // 
        treeFolders.Dock = DockStyle.Fill;
        treeFolders.HideSelection = false;
        treeFolders.ImageIndex = 0;
        treeFolders.ImageList = imageListTree;
        treeFolders.Location = new Point(0, 0);
        treeFolders.Margin = new Padding(3, 2, 3, 2);
        treeFolders.Name = "treeFolders";
        treeFolders.SelectedImageKey = "folder-open";
        treeFolders.Size = new Size(266, 243);
        treeFolders.TabIndex = 0;
        // 
        // imageListTree
        // 
        imageListTree.ColorDepth = ColorDepth.Depth32Bit;
        imageListTree.ImageSize = new Size(16, 16);
        imageListTree.TransparentColor = Color.Transparent;
        // 
        // listViewFiles
        // 
        listViewFiles.Columns.AddRange(new ColumnHeader[] { columnName, columnSize, columnModified });
        listViewFiles.Dock = DockStyle.Fill;
        listViewFiles.FullRowSelect = true;
        listViewFiles.GridLines = true;
        listViewFiles.Location = new Point(0, 0);
        listViewFiles.MultiSelect = false;
        listViewFiles.Name = "listViewFiles";
        listViewFiles.Size = new Size(266, 253);
        listViewFiles.SmallImageList = imageListFiles;
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
        // imageListFiles
        // 
        imageListFiles.ColorDepth = ColorDepth.Depth32Bit;
        imageListFiles.ImageSize = new Size(16, 16);
        imageListFiles.TransparentColor = Color.Transparent;
        // 
        // panelFolderBar
        // 
        panelFolderBar.Controls.Add(buttonPickFolder);
        panelFolderBar.Controls.Add(textFolderPath);
        panelFolderBar.Dock = DockStyle.Top;
        panelFolderBar.Location = new Point(7, 6);
        panelFolderBar.Name = "panelFolderBar";
        panelFolderBar.Padding = new Padding(0, 0, 0, 6);
        panelFolderBar.Size = new Size(266, 36);
        panelFolderBar.TabIndex = 1;
        // 
        // buttonPickFolder
        // 
        buttonPickFolder.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        buttonPickFolder.Location = new Point(196, 0);
        buttonPickFolder.Name = "buttonPickFolder";
        buttonPickFolder.Size = new Size(70, 22);
        buttonPickFolder.TabIndex = 1;
        buttonPickFolder.Text = "찾아보기";
        buttonPickFolder.UseVisualStyleBackColor = true;
        // 
        // textFolderPath
        // 
        textFolderPath.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        textFolderPath.Location = new Point(0, 0);
        textFolderPath.Name = "textFolderPath";
        textFolderPath.PlaceholderText = "폴더를 선택하세요…";
        textFolderPath.ReadOnly = true;
        textFolderPath.Size = new Size(190, 23);
        textFolderPath.TabIndex = 0;
        // 
        // panelPreviewRoot
        // 
        panelPreviewRoot.BackColor = Color.FromArgb(24, 24, 28);
        panelPreviewRoot.Controls.Add(panelImageToolbar);
        panelPreviewRoot.Controls.Add(labelPreviewPlaceholder);
        panelPreviewRoot.Controls.Add(panelVideoHost);
        panelPreviewRoot.Controls.Add(panelImageHost);
        panelPreviewRoot.Controls.Add(panelGalleryHost);
        panelPreviewRoot.Dock = DockStyle.Fill;
        panelPreviewRoot.Location = new Point(0, 0);
        panelPreviewRoot.Name = "panelPreviewRoot";
        panelPreviewRoot.Size = new Size(751, 547);
        panelPreviewRoot.TabIndex = 0;
        // 
        // panelImageToolbar
        // 
        panelImageToolbar.BackColor = Color.FromArgb(28, 28, 34);
        panelImageToolbar.Controls.Add(buttonRotateCW);
        panelImageToolbar.Controls.Add(buttonRotateCCW);
        panelImageToolbar.Controls.Add(buttonFlipHorizontal);
        panelImageToolbar.Controls.Add(buttonEditImage);
        panelImageToolbar.Dock = DockStyle.Top;
        panelImageToolbar.Location = new Point(0, 0);
        panelImageToolbar.Name = "panelImageToolbar";
        panelImageToolbar.Size = new Size(751, 36);
        panelImageToolbar.TabIndex = 1;
        panelImageToolbar.Visible = false;
        // 
        // buttonRotateCW
        // 
        buttonRotateCW.BackColor = Color.FromArgb(48, 50, 56);
        buttonRotateCW.Dock = DockStyle.Right;
        buttonRotateCW.FlatAppearance.BorderSize = 0;
        buttonRotateCW.FlatStyle = FlatStyle.Flat;
        buttonRotateCW.Font = new Font("Segoe UI", 14F);
        buttonRotateCW.ForeColor = Color.WhiteSmoke;
        buttonRotateCW.Location = new Point(643, 0);
        buttonRotateCW.Name = "buttonRotateCW";
        buttonRotateCW.Size = new Size(36, 36);
        buttonRotateCW.TabIndex = 2;
        buttonRotateCW.Text = "↻";
        buttonRotateCW.UseVisualStyleBackColor = false;
        // 
        // buttonRotateCCW
        // 
        buttonRotateCCW.BackColor = Color.FromArgb(50, 50, 58);
        buttonRotateCCW.Dock = DockStyle.Right;
        buttonRotateCCW.FlatAppearance.BorderSize = 0;
        buttonRotateCCW.FlatStyle = FlatStyle.Flat;
        buttonRotateCCW.Font = new Font("Segoe UI", 14F);
        buttonRotateCCW.ForeColor = Color.WhiteSmoke;
        buttonRotateCCW.Location = new Point(679, 0);
        buttonRotateCCW.Name = "buttonRotateCCW";
        buttonRotateCCW.Size = new Size(36, 36);
        buttonRotateCCW.TabIndex = 1;
        buttonRotateCCW.Text = "↺";
        buttonRotateCCW.UseVisualStyleBackColor = false;
        // 
        // buttonFlipHorizontal
        // 
        buttonFlipHorizontal.BackColor = Color.FromArgb(50, 50, 58);
        buttonFlipHorizontal.Dock = DockStyle.Right;
        buttonFlipHorizontal.FlatAppearance.BorderSize = 0;
        buttonFlipHorizontal.FlatStyle = FlatStyle.Flat;
        buttonFlipHorizontal.Font = new Font("Segoe UI", 20F);
        buttonFlipHorizontal.ForeColor = Color.WhiteSmoke;
        buttonFlipHorizontal.Location = new Point(715, 0);
        buttonFlipHorizontal.Name = "buttonFlipHorizontal";
        buttonFlipHorizontal.Size = new Size(36, 36);
        buttonFlipHorizontal.TabIndex = 3;
        buttonFlipHorizontal.Text = "⇔";
        buttonFlipHorizontal.UseVisualStyleBackColor = false;
        // 
        // buttonEditImage
        // 
        buttonEditImage.BackColor = Color.FromArgb(56, 58, 64);
        buttonEditImage.Dock = DockStyle.Left;
        buttonEditImage.FlatAppearance.BorderSize = 0;
        buttonEditImage.FlatStyle = FlatStyle.Flat;
        buttonEditImage.Font = new Font("Segoe UI", 9F);
        buttonEditImage.ForeColor = Color.WhiteSmoke;
        buttonEditImage.Location = new Point(0, 0);
        buttonEditImage.Name = "buttonEditImage";
        buttonEditImage.Size = new Size(64, 36);
        buttonEditImage.TabIndex = 10;
        buttonEditImage.Text = "편집";
        buttonEditImage.UseVisualStyleBackColor = false;
        // 
        // labelPreviewPlaceholder
        // 
        labelPreviewPlaceholder.Dock = DockStyle.Fill;
        labelPreviewPlaceholder.Font = new Font("Segoe UI", 11.25F);
        labelPreviewPlaceholder.ForeColor = Color.Gray;
        labelPreviewPlaceholder.Location = new Point(0, 0);
        labelPreviewPlaceholder.Margin = new Padding(3);
        labelPreviewPlaceholder.Name = "labelPreviewPlaceholder";
        labelPreviewPlaceholder.Size = new Size(751, 547);
        labelPreviewPlaceholder.TabIndex = 0;
        labelPreviewPlaceholder.Text = "폴더와 파일을 선택하면 여기에 표시됩니다.";
        labelPreviewPlaceholder.TextAlign = ContentAlignment.MiddleCenter;
        // 
        // panelVideoHost
        // 
        panelVideoHost.Controls.Add(layoutVideo);
        panelVideoHost.Dock = DockStyle.Fill;
        panelVideoHost.Location = new Point(0, 0);
        panelVideoHost.Name = "panelVideoHost";
        panelVideoHost.Size = new Size(751, 547);
        panelVideoHost.TabIndex = 1;
        panelVideoHost.Visible = false;
        // 
        // layoutVideo
        // 
        layoutVideo.ColumnCount = 1;
        layoutVideo.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        layoutVideo.Controls.Add(panelVideoStage, 0, 0);
        layoutVideo.Controls.Add(panelVideoBottom, 0, 1);
        layoutVideo.Dock = DockStyle.Fill;
        layoutVideo.Location = new Point(0, 0);
        layoutVideo.Name = "layoutVideo";
        layoutVideo.RowCount = 2;
        layoutVideo.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        layoutVideo.RowStyles.Add(new RowStyle(SizeType.Absolute, 126F));
        layoutVideo.Size = new Size(751, 547);
        layoutVideo.TabIndex = 0;
        // 
        // panelVideoStage
        // 
        panelVideoStage.BackColor = Color.Black;
        panelVideoStage.Controls.Add(labelVideoOverlayIcon);
        panelVideoStage.Controls.Add(videoView);
        panelVideoStage.Dock = DockStyle.Fill;
        panelVideoStage.Location = new Point(0, 0);
        panelVideoStage.Margin = new Padding(0);
        panelVideoStage.Name = "panelVideoStage";
        panelVideoStage.Size = new Size(751, 421);
        panelVideoStage.TabIndex = 0;
        // 
        // labelVideoOverlayIcon
        // 
        labelVideoOverlayIcon.Anchor = AnchorStyles.None;
        labelVideoOverlayIcon.BackColor = Color.FromArgb(140, 20, 20, 20);
        labelVideoOverlayIcon.Font = new Font("Segoe MDL2 Assets", 42F);
        labelVideoOverlayIcon.ForeColor = Color.WhiteSmoke;
        labelVideoOverlayIcon.Location = new Point(310, 172);
        labelVideoOverlayIcon.Name = "labelVideoOverlayIcon";
        labelVideoOverlayIcon.Size = new Size(131, 75);
        labelVideoOverlayIcon.TabIndex = 1;
        labelVideoOverlayIcon.Text = "";
        labelVideoOverlayIcon.TextAlign = ContentAlignment.MiddleCenter;
        labelVideoOverlayIcon.Visible = false;
        // 
        // videoView
        // 
        videoView.BackColor = Color.Black;
        videoView.Dock = DockStyle.Fill;
        videoView.Location = new Point(0, 0);
        videoView.Margin = new Padding(0);
        videoView.MediaPlayer = null;
        videoView.Name = "videoView";
        videoView.Size = new Size(751, 421);
        videoView.TabIndex = 0;
        videoView.TabStop = false;
        // 
        // panelVideoBottom
        // 
        panelVideoBottom.BackColor = Color.FromArgb(20, 20, 24);
        panelVideoBottom.Controls.Add(layoutVideoBottom);
        panelVideoBottom.Controls.Add(panelVideoBottomSeparator);
        panelVideoBottom.Dock = DockStyle.Fill;
        panelVideoBottom.Location = new Point(0, 421);
        panelVideoBottom.Margin = new Padding(0);
        panelVideoBottom.Name = "panelVideoBottom";
        panelVideoBottom.Size = new Size(751, 126);
        panelVideoBottom.TabIndex = 1;
        // 
        // layoutVideoBottom
        // 
        layoutVideoBottom.ColumnCount = 1;
        layoutVideoBottom.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        layoutVideoBottom.Controls.Add(panelVideoTimeline, 0, 0);
        layoutVideoBottom.Controls.Add(layoutVideoButtons, 0, 1);
        layoutVideoBottom.Dock = DockStyle.Fill;
        layoutVideoBottom.Location = new Point(0, 1);
        layoutVideoBottom.Margin = new Padding(0);
        layoutVideoBottom.Name = "layoutVideoBottom";
        layoutVideoBottom.RowCount = 2;
        layoutVideoBottom.RowStyles.Add(new RowStyle(SizeType.Absolute, 39F));
        layoutVideoBottom.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        layoutVideoBottom.Size = new Size(751, 125);
        layoutVideoBottom.TabIndex = 1;
        // 
        // panelVideoTimeline
        // 
        panelVideoTimeline.BackColor = Color.FromArgb(20, 20, 24);
        panelVideoTimeline.Controls.Add(labelVideoPercent);
        panelVideoTimeline.Controls.Add(labelVideoTime);
        panelVideoTimeline.Dock = DockStyle.Fill;
        panelVideoTimeline.Location = new Point(0, 0);
        panelVideoTimeline.Margin = new Padding(0);
        panelVideoTimeline.Name = "panelVideoTimeline";
        panelVideoTimeline.Padding = new Padding(10, 6, 10, 3);
        panelVideoTimeline.Size = new Size(751, 39);
        panelVideoTimeline.TabIndex = 1;
        // 
        // labelVideoPercent
        // 
        labelVideoPercent.AutoSize = true;
        labelVideoPercent.Dock = DockStyle.Right;
        labelVideoPercent.ForeColor = Color.DimGray;
        labelVideoPercent.Location = new Point(703, 6);
        labelVideoPercent.Name = "labelVideoPercent";
        labelVideoPercent.Size = new Size(38, 15);
        labelVideoPercent.TabIndex = 2;
        labelVideoPercent.Text = "0.0 %";
        // 
        // labelVideoTime
        // 
        labelVideoTime.AutoSize = true;
        labelVideoTime.Dock = DockStyle.Left;
        labelVideoTime.ForeColor = Color.DimGray;
        labelVideoTime.Location = new Point(10, 6);
        labelVideoTime.Name = "labelVideoTime";
        labelVideoTime.Size = new Size(82, 15);
        labelVideoTime.TabIndex = 0;
        labelVideoTime.Text = "00:00 / 00:00";
        // 
        // layoutVideoButtons
        // 
        layoutVideoButtons.ColumnCount = 3;
        layoutVideoButtons.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50F));
        layoutVideoButtons.ColumnStyles.Add(new ColumnStyle());
        layoutVideoButtons.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50F));
        layoutVideoButtons.Controls.Add(flowVideoControls, 1, 0);
        layoutVideoButtons.Dock = DockStyle.Fill;
        layoutVideoButtons.Location = new Point(0, 39);
        layoutVideoButtons.Margin = new Padding(0);
        layoutVideoButtons.Name = "layoutVideoButtons";
        layoutVideoButtons.RowCount = 1;
        layoutVideoButtons.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        layoutVideoButtons.Size = new Size(751, 86);
        layoutVideoButtons.TabIndex = 2;
        // 
        // flowVideoControls
        // 
        flowVideoControls.Anchor = AnchorStyles.None;
        flowVideoControls.AutoSize = true;
        flowVideoControls.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        flowVideoControls.BackColor = Color.FromArgb(32, 32, 38);
        flowVideoControls.Controls.Add(buttonVideoPlay);
        flowVideoControls.Controls.Add(buttonVideoPause);
        flowVideoControls.Controls.Add(buttonVideoStop);
        flowVideoControls.Location = new Point(290, 17);
        flowVideoControls.Margin = new Padding(0);
        flowVideoControls.Name = "flowVideoControls";
        flowVideoControls.Padding = new Padding(10, 9, 10, 9);
        flowVideoControls.Size = new Size(170, 51);
        flowVideoControls.TabIndex = 2;
        flowVideoControls.WrapContents = false;
        // 
        // buttonVideoPlay
        // 
        buttonVideoPlay.Font = new Font("Segoe MDL2 Assets", 14.25F);
        buttonVideoPlay.Location = new Point(13, 12);
        buttonVideoPlay.Margin = new Padding(3, 3, 7, 3);
        buttonVideoPlay.Name = "buttonVideoPlay";
        buttonVideoPlay.Size = new Size(40, 27);
        buttonVideoPlay.TabIndex = 0;
        buttonVideoPlay.Text = "";
        buttonVideoPlay.UseVisualStyleBackColor = true;
        // 
        // buttonVideoPause
        // 
        buttonVideoPause.Font = new Font("Segoe MDL2 Assets", 14.25F);
        buttonVideoPause.Location = new Point(63, 12);
        buttonVideoPause.Margin = new Padding(3, 3, 7, 3);
        buttonVideoPause.Name = "buttonVideoPause";
        buttonVideoPause.Size = new Size(40, 27);
        buttonVideoPause.TabIndex = 1;
        buttonVideoPause.Text = "";
        buttonVideoPause.UseVisualStyleBackColor = true;
        // 
        // buttonVideoStop
        // 
        buttonVideoStop.Font = new Font("Segoe MDL2 Assets", 14.25F);
        buttonVideoStop.Location = new Point(113, 12);
        buttonVideoStop.Margin = new Padding(3, 3, 7, 3);
        buttonVideoStop.Name = "buttonVideoStop";
        buttonVideoStop.Size = new Size(40, 27);
        buttonVideoStop.TabIndex = 2;
        buttonVideoStop.Text = "";
        buttonVideoStop.UseVisualStyleBackColor = true;
        // 
        // panelVideoBottomSeparator
        // 
        panelVideoBottomSeparator.BackColor = Color.FromArgb(64, 64, 72);
        panelVideoBottomSeparator.Dock = DockStyle.Top;
        panelVideoBottomSeparator.Location = new Point(0, 0);
        panelVideoBottomSeparator.Margin = new Padding(3, 2, 3, 2);
        panelVideoBottomSeparator.Name = "panelVideoBottomSeparator";
        panelVideoBottomSeparator.Size = new Size(751, 1);
        panelVideoBottomSeparator.TabIndex = 0;
        // 
        // panelImageHost
        // 
        panelImageHost.Controls.Add(panelImageScrollHost);
        panelImageHost.Dock = DockStyle.Fill;
        panelImageHost.Location = new Point(0, 0);
        panelImageHost.Name = "panelImageHost";
        panelImageHost.Size = new Size(751, 547);
        panelImageHost.TabIndex = 0;
        panelImageHost.Visible = false;
        // 
        // panelImageScrollHost
        // 
        panelImageScrollHost.AutoScroll = true;
        panelImageScrollHost.BackColor = Color.FromArgb(18, 18, 22);
        panelImageScrollHost.Controls.Add(picturePreview);
        panelImageScrollHost.Dock = DockStyle.Fill;
        panelImageScrollHost.Location = new Point(0, 0);
        panelImageScrollHost.Name = "panelImageScrollHost";
        panelImageScrollHost.Size = new Size(751, 547);
        panelImageScrollHost.TabIndex = 0;
        panelImageScrollHost.TabStop = true;
        // 
        // picturePreview
        // 
        picturePreview.BackColor = Color.FromArgb(18, 18, 22);
        picturePreview.Location = new Point(0, 0);
        picturePreview.Name = "picturePreview";
        picturePreview.Size = new Size(560, 360);
        picturePreview.SizeMode = PictureBoxSizeMode.StretchImage;
        picturePreview.TabIndex = 0;
        picturePreview.TabStop = false;
        // 
        // panelGalleryHost
        // 
        panelGalleryHost.Controls.Add(flowThumbnails);
        panelGalleryHost.Dock = DockStyle.Fill;
        panelGalleryHost.Location = new Point(0, 0);
        panelGalleryHost.Margin = new Padding(3, 2, 3, 2);
        panelGalleryHost.Name = "panelGalleryHost";
        panelGalleryHost.Size = new Size(751, 547);
        panelGalleryHost.TabIndex = 3;
        panelGalleryHost.Visible = false;
        // 
        // flowThumbnails
        // 
        flowThumbnails.AutoScroll = true;
        flowThumbnails.BackColor = Color.FromArgb(18, 18, 22);
        flowThumbnails.Dock = DockStyle.Fill;
        flowThumbnails.Location = new Point(0, 0);
        flowThumbnails.Margin = new Padding(3, 2, 3, 2);
        flowThumbnails.Name = "flowThumbnails";
        flowThumbnails.Padding = new Padding(10, 9, 10, 9);
        flowThumbnails.Size = new Size(751, 547);
        flowThumbnails.TabIndex = 0;
        // 
        // labelImageZoomInfo
        // 
        labelImageZoomInfo.Location = new Point(0, 0);
        labelImageZoomInfo.Name = "labelImageZoomInfo";
        labelImageZoomInfo.Size = new Size(100, 23);
        labelImageZoomInfo.TabIndex = 0;
        labelImageZoomInfo.Visible = false;
        // 
        // statusStripMain
        // 
        statusStripMain.ImageScalingSize = new Size(20, 20);
        statusStripMain.Items.AddRange(new ToolStripItem[] { statusLabelDirectory, statusLabelFile });
        statusStripMain.Location = new Point(0, 547);
        statusStripMain.Name = "statusStripMain";
        statusStripMain.Padding = new Padding(1, 0, 12, 0);
        statusStripMain.Size = new Size(1036, 24);
        statusStripMain.TabIndex = 1;
        statusStripMain.Text = "statusStrip1";
        // 
        // statusLabelDirectory
        // 
        statusLabelDirectory.Name = "statusLabelDirectory";
        statusLabelDirectory.Size = new Size(817, 19);
        statusLabelDirectory.Spring = true;
        statusLabelDirectory.Text = "디렉토리를 선택하세요.";
        statusLabelDirectory.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // statusLabelFile
        // 
        statusLabelFile.BorderSides = ToolStripStatusLabelBorderSides.Left;
        statusLabelFile.Name = "statusLabelFile";
        statusLabelFile.Size = new Size(206, 19);
        statusLabelFile.Text = "파일을 선택하면 정보가 표시됩니다.";
        statusLabelFile.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // MainForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1036, 571);
        Controls.Add(splitMain);
        Controls.Add(statusStripMain);
        MinimumSize = new Size(790, 430);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "ImageViewerV30 — 폴더 미리보기";
        splitMain.Panel1.ResumeLayout(false);
        splitMain.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)splitMain).EndInit();
        splitMain.ResumeLayout(false);
        panelLeft.ResumeLayout(false);
        splitLeft.Panel1.ResumeLayout(false);
        splitLeft.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)splitLeft).EndInit();
        splitLeft.ResumeLayout(false);
        panelFolderBar.ResumeLayout(false);
        panelFolderBar.PerformLayout();
        panelPreviewRoot.ResumeLayout(false);
        panelImageToolbar.ResumeLayout(false);
        panelVideoHost.ResumeLayout(false);
        layoutVideo.ResumeLayout(false);
        panelVideoStage.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)videoView).EndInit();
        panelVideoBottom.ResumeLayout(false);
        layoutVideoBottom.ResumeLayout(false);
        panelVideoTimeline.ResumeLayout(false);
        panelVideoTimeline.PerformLayout();
        layoutVideoButtons.ResumeLayout(false);
        layoutVideoButtons.PerformLayout();
        flowVideoControls.ResumeLayout(false);
        panelImageHost.ResumeLayout(false);
        panelImageScrollHost.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)picturePreview).EndInit();
        panelGalleryHost.ResumeLayout(false);
        statusStripMain.ResumeLayout(false);
        statusStripMain.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }
}
