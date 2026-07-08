namespace DCMViewer;

partial class MainForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
            components.Dispose();
        base.Dispose(disposing);
    }

    #region Windows Form Designer generated code

    private void InitializeComponent()
    {
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MainForm));
        menuStripMain = new MenuStrip();
        fileToolStripMenuItem = new ToolStripMenuItem();
        openToolStripMenuItem = new ToolStripMenuItem();
        selectFolderToolStripMenuItem = new ToolStripMenuItem();
        fileMenuSeparatorBatchConvert = new ToolStripSeparator();
        batchConvertToolStripMenuItem = new ToolStripMenuItem();
        batchConvertPngToolStripMenuItem = new ToolStripMenuItem();
        batchConvertJpegToolStripMenuItem = new ToolStripMenuItem();
        batchConvertBmpToolStripMenuItem = new ToolStripMenuItem();
        batchConvertTiffToolStripMenuItem = new ToolStripMenuItem();
        batchConvertGifToolStripMenuItem = new ToolStripMenuItem();
        fileMenuSeparatorAssociation = new ToolStripSeparator();
        registerDcmDefaultToolStripMenuItem = new ToolStripMenuItem();
        unregisterDcmAssociationToolStripMenuItem = new ToolStripMenuItem();
        fileMenuSeparatorExit = new ToolStripSeparator();
        exitToolStripMenuItem = new ToolStripMenuItem();
        helpToolStripMenuItem = new ToolStripMenuItem();
        aboutToolStripMenuItem = new ToolStripMenuItem();
        statusStripMain = new StatusStrip();
        toolStripStatusLabelFile = new ToolStripStatusLabel();
        toolStripStatusLabelPatient = new ToolStripStatusLabel();
        toolStripStatusLabelDetails = new ToolStripStatusLabel();
        toolStripStatusLabelFrame = new ToolStripStatusLabel();
        toolStripExport = new ToolStrip();
        toolStripLabelExport = new ToolStripLabel();
        toolStripSeparatorExport = new ToolStripSeparator();
        toolStripButtonSavePng = new ToolStripButton();
        toolStripButtonSaveJpeg = new ToolStripButton();
        toolStripButtonSaveBmp = new ToolStripButton();
        toolStripButtonSaveTiff = new ToolStripButton();
        toolStripButtonSaveGif = new ToolStripButton();
        toolStripSeparatorBatchConvert = new ToolStripSeparator();
        toolStripButtonBatchConvert = new ToolStripButton();
        toolStripButtonInfo = new ToolStripButton();
        splitContainerMain = new SplitContainer();
        panelDicomInfo = new Panel();
        splitContainerLeft = new SplitContainer();
        labelFolderTitle = new Label();
        treeViewFolder = new TreeView();
        labelInfoTitle = new Label();
        textBoxDicomInfo = new RichTextBox();
        panelImageHost = new Panel();
        panelScroll = new ImageScrollPanel();
        pictureBoxImage = new ZoomPictureBox();
        trackBarFrames = new TrackBar();
        labelZoomPercent = new Label();
        openFileDialogDicom = new OpenFileDialog();
        saveFileDialogImage = new SaveFileDialog();
        folderBrowserBatchSource = new FolderBrowserDialog();
        folderBrowserSelectFolder = new FolderBrowserDialog();
        contextMenuImage = new ContextMenuStrip();
        ctxMenuOpen = new ToolStripMenuItem();
        ctxMenuSeparator1 = new ToolStripSeparator();
        ctxMenuZoomFit = new ToolStripMenuItem();
        ctxMenuZoomActual = new ToolStripMenuItem();
        ctxMenuSeparator2 = new ToolStripSeparator();
        ctxMenuExport = new ToolStripMenuItem();
        ctxMenuExportPng = new ToolStripMenuItem();
        ctxMenuExportJpeg = new ToolStripMenuItem();
        ctxMenuExportBmp = new ToolStripMenuItem();
        ctxMenuExportTiff = new ToolStripMenuItem();
        ctxMenuExportGif = new ToolStripMenuItem();
        contextMenuFolder = new ContextMenuStrip();
        ctxFolderOpen = new ToolStripMenuItem();
        ctxFolderSeparator1 = new ToolStripSeparator();
        ctxFolderSelectFolder = new ToolStripMenuItem();
        ctxFolderSeparator2 = new ToolStripSeparator();
        ctxFolderCopy = new ToolStripMenuItem();
        ctxFolderPaste = new ToolStripMenuItem();
        ctxFolderDelete = new ToolStripMenuItem();
        ctxFolderSeparator3 = new ToolStripSeparator();
        ctxFolderRefresh = new ToolStripMenuItem();
        menuStripMain.SuspendLayout();
        statusStripMain.SuspendLayout();
        toolStripExport.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)splitContainerMain).BeginInit();
        splitContainerMain.Panel1.SuspendLayout();
        splitContainerMain.Panel2.SuspendLayout();
        splitContainerMain.SuspendLayout();
        panelDicomInfo.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)splitContainerLeft).BeginInit();
        splitContainerLeft.Panel1.SuspendLayout();
        splitContainerLeft.Panel2.SuspendLayout();
        splitContainerLeft.SuspendLayout();
        panelImageHost.SuspendLayout();
        panelScroll.SuspendLayout();
        contextMenuImage.SuspendLayout();
        contextMenuFolder.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)pictureBoxImage).BeginInit();
        ((System.ComponentModel.ISupportInitialize)trackBarFrames).BeginInit();
        SuspendLayout();
        // 
        // menuStripMain
        // 
        menuStripMain.Items.AddRange(new ToolStripItem[] { fileToolStripMenuItem, helpToolStripMenuItem });
        menuStripMain.Location = new Point(0, 0);
        menuStripMain.Name = "menuStripMain";
        menuStripMain.Size = new Size(984, 24);
        menuStripMain.TabIndex = 0;
        menuStripMain.Text = "menuStrip1";
        // 
        // fileToolStripMenuItem
        // 
        fileToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { openToolStripMenuItem, selectFolderToolStripMenuItem, fileMenuSeparatorBatchConvert, batchConvertToolStripMenuItem, fileMenuSeparatorAssociation, registerDcmDefaultToolStripMenuItem, unregisterDcmAssociationToolStripMenuItem, fileMenuSeparatorExit, exitToolStripMenuItem });
        fileToolStripMenuItem.Name = "fileToolStripMenuItem";
        fileToolStripMenuItem.Size = new Size(57, 20);
        fileToolStripMenuItem.Text = "파일(&F)";
        // 
        // openToolStripMenuItem
        // 
        openToolStripMenuItem.Name = "openToolStripMenuItem";
        openToolStripMenuItem.ShortcutKeys = Keys.Control | Keys.O;
        openToolStripMenuItem.Size = new Size(167, 22);
        openToolStripMenuItem.Text = "열기(&O)...";
        openToolStripMenuItem.Click += OpenToolStripMenuItem_Click;
        // 
        // selectFolderToolStripMenuItem
        // 
        selectFolderToolStripMenuItem.Name = "selectFolderToolStripMenuItem";
        selectFolderToolStripMenuItem.Size = new Size(167, 22);
        selectFolderToolStripMenuItem.Text = "폴더 선택(&P)...";
        selectFolderToolStripMenuItem.Click += SelectFolderToolStripMenuItem_Click;
        // 
        // fileMenuSeparatorBatchConvert
        // 
        fileMenuSeparatorBatchConvert.Name = "fileMenuSeparatorBatchConvert";
        fileMenuSeparatorBatchConvert.Size = new Size(166, 6);
        // 
        // batchConvertToolStripMenuItem
        // 
        batchConvertToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { batchConvertPngToolStripMenuItem, batchConvertJpegToolStripMenuItem, batchConvertBmpToolStripMenuItem, batchConvertTiffToolStripMenuItem, batchConvertGifToolStripMenuItem });
        batchConvertToolStripMenuItem.Name = "batchConvertToolStripMenuItem";
        batchConvertToolStripMenuItem.Size = new Size(167, 22);
        batchConvertToolStripMenuItem.Text = "폴더 일괄 변환(&B)";
        // 
        // batchConvertPngToolStripMenuItem
        // 
        batchConvertPngToolStripMenuItem.Name = "batchConvertPngToolStripMenuItem";
        batchConvertPngToolStripMenuItem.Size = new Size(180, 22);
        batchConvertPngToolStripMenuItem.Text = "PNG로 변환";
        batchConvertPngToolStripMenuItem.Click += BatchConvertButton_Click;
        // 
        // batchConvertJpegToolStripMenuItem
        // 
        batchConvertJpegToolStripMenuItem.Name = "batchConvertJpegToolStripMenuItem";
        batchConvertJpegToolStripMenuItem.Size = new Size(180, 22);
        batchConvertJpegToolStripMenuItem.Text = "JPEG로 변환";
        batchConvertJpegToolStripMenuItem.Click += BatchConvertButton_Click;
        // 
        // batchConvertBmpToolStripMenuItem
        // 
        batchConvertBmpToolStripMenuItem.Name = "batchConvertBmpToolStripMenuItem";
        batchConvertBmpToolStripMenuItem.Size = new Size(180, 22);
        batchConvertBmpToolStripMenuItem.Text = "BMP로 변환";
        batchConvertBmpToolStripMenuItem.Click += BatchConvertButton_Click;
        // 
        // batchConvertTiffToolStripMenuItem
        // 
        batchConvertTiffToolStripMenuItem.Name = "batchConvertTiffToolStripMenuItem";
        batchConvertTiffToolStripMenuItem.Size = new Size(180, 22);
        batchConvertTiffToolStripMenuItem.Text = "TIFF로 변환";
        batchConvertTiffToolStripMenuItem.Click += BatchConvertButton_Click;
        // 
        // batchConvertGifToolStripMenuItem
        // 
        batchConvertGifToolStripMenuItem.Name = "batchConvertGifToolStripMenuItem";
        batchConvertGifToolStripMenuItem.Size = new Size(180, 22);
        batchConvertGifToolStripMenuItem.Text = "GIF로 변환";
        batchConvertGifToolStripMenuItem.Click += BatchConvertButton_Click;
        // 
        // fileMenuSeparatorAssociation
        // 
        fileMenuSeparatorAssociation.Name = "fileMenuSeparatorAssociation";
        fileMenuSeparatorAssociation.Size = new Size(166, 6);
        // 
        // registerDcmDefaultToolStripMenuItem
        // 
        registerDcmDefaultToolStripMenuItem.Name = "registerDcmDefaultToolStripMenuItem";
        registerDcmDefaultToolStripMenuItem.Size = new Size(166, 22);
        registerDcmDefaultToolStripMenuItem.Text = "DCM 기본 프로그램으로 등록(&R)...";
        registerDcmDefaultToolStripMenuItem.Click += RegisterDcmDefaultToolStripMenuItem_Click;
        // 
        // unregisterDcmAssociationToolStripMenuItem
        // 
        unregisterDcmAssociationToolStripMenuItem.Name = "unregisterDcmAssociationToolStripMenuItem";
        unregisterDcmAssociationToolStripMenuItem.Size = new Size(166, 22);
        unregisterDcmAssociationToolStripMenuItem.Text = "DCM 연결 등록 해제(&U)";
        unregisterDcmAssociationToolStripMenuItem.Click += UnregisterDcmAssociationToolStripMenuItem_Click;
        // 
        // fileMenuSeparatorExit
        // 
        fileMenuSeparatorExit.Name = "fileMenuSeparatorExit";
        fileMenuSeparatorExit.Size = new Size(166, 6);
        // 
        // exitToolStripMenuItem
        // 
        exitToolStripMenuItem.Name = "exitToolStripMenuItem";
        exitToolStripMenuItem.Size = new Size(167, 22);
        exitToolStripMenuItem.Text = "종료(&X)";
        exitToolStripMenuItem.Click += ExitToolStripMenuItem_Click;
        // 
        // helpToolStripMenuItem
        // 
        helpToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { aboutToolStripMenuItem });
        helpToolStripMenuItem.Name = "helpToolStripMenuItem";
        helpToolStripMenuItem.Size = new Size(72, 20);
        helpToolStripMenuItem.Text = "도움말(&H)";
        // 
        // aboutToolStripMenuItem
        // 
        aboutToolStripMenuItem.Name = "aboutToolStripMenuItem";
        aboutToolStripMenuItem.Size = new Size(123, 22);
        aboutToolStripMenuItem.Text = "정보(&A)...";
        aboutToolStripMenuItem.Click += AboutToolStripMenuItem_Click;
        // 
        // toolStripExport
        // 
        toolStripExport.Dock = DockStyle.Top;
        toolStripExport.GripStyle = ToolStripGripStyle.Hidden;
        toolStripExport.ImageScalingSize = new Size(24, 24);
        toolStripExport.Items.AddRange(new ToolStripItem[] { toolStripLabelExport, toolStripSeparatorExport, toolStripButtonSavePng, toolStripButtonSaveJpeg, toolStripButtonSaveBmp, toolStripButtonSaveTiff, toolStripButtonSaveGif, toolStripSeparatorBatchConvert, toolStripButtonBatchConvert, toolStripButtonInfo });
        toolStripExport.Name = "toolStripExport";
        toolStripExport.Padding = new Padding(6, 4, 6, 4);
        toolStripExport.Size = new Size(984, 36);
        toolStripExport.TabIndex = 4;
        toolStripExport.Text = "toolStripExport";
        // 
        // toolStripLabelExport
        // 
        toolStripLabelExport.Font = new Font("Segoe UI", 10F);
        toolStripLabelExport.Name = "toolStripLabelExport";
        toolStripLabelExport.Padding = new Padding(0, 0, 4, 0);
        toolStripLabelExport.Size = new Size(63, 28);
        toolStripLabelExport.Text = "내보내기:";
        // 
        // toolStripSeparatorExport
        // 
        toolStripSeparatorExport.Name = "toolStripSeparatorExport";
        toolStripSeparatorExport.Size = new Size(6, 28);
        // 
        // toolStripButtonSavePng
        // 
        toolStripButtonSavePng.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        toolStripButtonSavePng.ImageTransparentColor = Color.Magenta;
        toolStripButtonSavePng.Name = "toolStripButtonSavePng";
        toolStripButtonSavePng.Size = new Size(72, 28);
        toolStripButtonSavePng.Text = "PNG";
        toolStripButtonSavePng.TextImageRelation = TextImageRelation.ImageBeforeText;
        toolStripButtonSavePng.Click += ExportButton_Click;
        // 
        // toolStripButtonSaveJpeg
        // 
        toolStripButtonSaveJpeg.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        toolStripButtonSaveJpeg.ImageTransparentColor = Color.Magenta;
        toolStripButtonSaveJpeg.Name = "toolStripButtonSaveJpeg";
        toolStripButtonSaveJpeg.Size = new Size(78, 28);
        toolStripButtonSaveJpeg.Text = "JPEG";
        toolStripButtonSaveJpeg.TextImageRelation = TextImageRelation.ImageBeforeText;
        toolStripButtonSaveJpeg.Click += ExportButton_Click;
        // 
        // toolStripButtonSaveBmp
        // 
        toolStripButtonSaveBmp.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        toolStripButtonSaveBmp.ImageTransparentColor = Color.Magenta;
        toolStripButtonSaveBmp.Name = "toolStripButtonSaveBmp";
        toolStripButtonSaveBmp.Size = new Size(72, 28);
        toolStripButtonSaveBmp.Text = "BMP";
        toolStripButtonSaveBmp.TextImageRelation = TextImageRelation.ImageBeforeText;
        toolStripButtonSaveBmp.Click += ExportButton_Click;
        // 
        // toolStripButtonSaveTiff
        // 
        toolStripButtonSaveTiff.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        toolStripButtonSaveTiff.ImageTransparentColor = Color.Magenta;
        toolStripButtonSaveTiff.Name = "toolStripButtonSaveTiff";
        toolStripButtonSaveTiff.Size = new Size(72, 28);
        toolStripButtonSaveTiff.Text = "TIFF";
        toolStripButtonSaveTiff.TextImageRelation = TextImageRelation.ImageBeforeText;
        toolStripButtonSaveTiff.Click += ExportButton_Click;
        // 
        // toolStripButtonSaveGif
        // 
        toolStripButtonSaveGif.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        toolStripButtonSaveGif.ImageTransparentColor = Color.Magenta;
        toolStripButtonSaveGif.Name = "toolStripButtonSaveGif";
        toolStripButtonSaveGif.Size = new Size(68, 28);
        toolStripButtonSaveGif.Text = "GIF";
        toolStripButtonSaveGif.TextImageRelation = TextImageRelation.ImageBeforeText;
        toolStripButtonSaveGif.Click += ExportButton_Click;
        // 
        // toolStripSeparatorBatchConvert
        // 
        toolStripSeparatorBatchConvert.Name = "toolStripSeparatorBatchConvert";
        toolStripSeparatorBatchConvert.Size = new Size(6, 28);
        // 
        // toolStripButtonBatchConvert
        // 
        toolStripButtonBatchConvert.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        toolStripButtonBatchConvert.ImageTransparentColor = Color.Magenta;
        toolStripButtonBatchConvert.Name = "toolStripButtonBatchConvert";
        toolStripButtonBatchConvert.Size = new Size(96, 28);
        toolStripButtonBatchConvert.Text = "일괄 변환";
        toolStripButtonBatchConvert.TextImageRelation = TextImageRelation.ImageBeforeText;
        toolStripButtonBatchConvert.Click += BatchConvertToolbarButton_Click;
        // 
        // toolStripButtonInfo
        // 
        toolStripButtonInfo.Alignment = ToolStripItemAlignment.Right;
        toolStripButtonInfo.DisplayStyle = ToolStripItemDisplayStyle.Image;
        toolStripButtonInfo.ImageScaling = ToolStripItemImageScaling.None;
        toolStripButtonInfo.ImageAlign = ContentAlignment.MiddleCenter;
        toolStripButtonInfo.Margin = new Padding(8, 1, 12, 1);
        toolStripButtonInfo.Name = "toolStripButtonInfo";
        toolStripButtonInfo.Size = new Size(24, 24);
        toolStripButtonInfo.ToolTipText = "프로그램 정보";
        toolStripButtonInfo.Click += ToolStripButtonInfo_Click;
        // 
        // statusStripMain
        // 
        statusStripMain.Items.AddRange(new ToolStripItem[] { toolStripStatusLabelFile, toolStripStatusLabelPatient, toolStripStatusLabelDetails, toolStripStatusLabelFrame });
        statusStripMain.Location = new Point(0, 539);
        statusStripMain.Name = "statusStripMain";
        statusStripMain.Size = new Size(984, 22);
        statusStripMain.TabIndex = 1;
        statusStripMain.Text = "statusStrip1";
        // 
        // toolStripStatusLabelFile
        // 
        toolStripStatusLabelFile.Name = "toolStripStatusLabelFile";
        toolStripStatusLabelFile.Size = new Size(969, 17);
        toolStripStatusLabelFile.Spring = true;
        toolStripStatusLabelFile.Text = "파일을 열어 주세요.";
        toolStripStatusLabelFile.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // toolStripStatusLabelPatient
        // 
        toolStripStatusLabelPatient.Name = "toolStripStatusLabelPatient";
        toolStripStatusLabelPatient.Size = new Size(0, 17);
        // 
        // toolStripStatusLabelDetails
        // 
        toolStripStatusLabelDetails.Name = "toolStripStatusLabelDetails";
        toolStripStatusLabelDetails.Size = new Size(0, 17);
        // 
        // toolStripStatusLabelFrame
        // 
        toolStripStatusLabelFrame.Name = "toolStripStatusLabelFrame";
        toolStripStatusLabelFrame.Size = new Size(0, 17);
        // 
        // splitContainerMain
        // 
        splitContainerMain.Dock = DockStyle.Fill;
        splitContainerMain.FixedPanel = FixedPanel.Panel1;
        splitContainerMain.Location = new Point(0, 49);
        splitContainerMain.Name = "splitContainerMain";
        // 
        // splitContainerMain.Panel1
        // 
        splitContainerMain.Panel1.Controls.Add(panelDicomInfo);
        splitContainerMain.Panel1MinSize = 200;
        // 
        // splitContainerMain.Panel2
        // 
        splitContainerMain.Panel2.Controls.Add(panelImageHost);
        splitContainerMain.Size = new Size(984, 490);
        splitContainerMain.SplitterDistance = 240;
        splitContainerMain.TabIndex = 3;
        // 
        // panelDicomInfo
        // 
        panelDicomInfo.BackColor = Color.FromArgb(36, 36, 40);
        panelDicomInfo.Controls.Add(splitContainerLeft);
        panelDicomInfo.Dock = DockStyle.Fill;
        panelDicomInfo.Location = new Point(0, 0);
        panelDicomInfo.Name = "panelDicomInfo";
        panelDicomInfo.Padding = new Padding(8, 8, 8, 8);
        panelDicomInfo.Size = new Size(240, 490);
        panelDicomInfo.TabIndex = 0;
        // 
        // splitContainerLeft
        // 
        splitContainerLeft.BackColor = Color.FromArgb(100, 100, 105);
        splitContainerLeft.Dock = DockStyle.Fill;
        splitContainerLeft.FixedPanel = FixedPanel.Panel2;
        splitContainerLeft.Location = new Point(8, 8);
        splitContainerLeft.Name = "splitContainerLeft";
        splitContainerLeft.Orientation = Orientation.Horizontal;
        // 
        // splitContainerLeft.Panel1
        // 
        splitContainerLeft.Panel1.BackColor = Color.FromArgb(36, 36, 40);
        splitContainerLeft.Panel1.Controls.Add(treeViewFolder);
        splitContainerLeft.Panel1.Controls.Add(labelFolderTitle);
        splitContainerLeft.Panel1MinSize = 80;
        // 
        // splitContainerLeft.Panel2
        // 
        splitContainerLeft.Panel2.BackColor = Color.FromArgb(36, 36, 40);
        splitContainerLeft.Panel2.Controls.Add(textBoxDicomInfo);
        splitContainerLeft.Panel2.Controls.Add(labelInfoTitle);
        splitContainerLeft.Panel2MinSize = 100;
        splitContainerLeft.Size = new Size(224, 474);
        splitContainerLeft.SplitterDistance = 260;
        splitContainerLeft.SplitterWidth = 6;
        splitContainerLeft.TabIndex = 0;
        // 
        // labelFolderTitle
        // 
        labelFolderTitle.Dock = DockStyle.Top;
        labelFolderTitle.Font = new Font("Segoe UI Semibold", 9F, FontStyle.Bold);
        labelFolderTitle.ForeColor = Color.FromArgb(220, 220, 225);
        labelFolderTitle.Location = new Point(0, 0);
        labelFolderTitle.Name = "labelFolderTitle";
        labelFolderTitle.Padding = new Padding(0, 0, 0, 4);
        labelFolderTitle.Size = new Size(224, 23);
        labelFolderTitle.TabIndex = 0;
        labelFolderTitle.Text = "폴더";
        labelFolderTitle.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // treeViewFolder
        // 
        treeViewFolder.BackColor = Color.FromArgb(28, 28, 32);
        treeViewFolder.BorderStyle = BorderStyle.None;
        treeViewFolder.ContextMenuStrip = contextMenuFolder;
        treeViewFolder.Dock = DockStyle.Fill;
        treeViewFolder.ForeColor = Color.FromArgb(200, 200, 205);
        treeViewFolder.FullRowSelect = true;
        treeViewFolder.HideSelection = false;
        treeViewFolder.Location = new Point(0, 23);
        treeViewFolder.Name = "treeViewFolder";
        treeViewFolder.ShowLines = true;
        treeViewFolder.ShowNodeToolTips = true;
        treeViewFolder.ShowPlusMinus = true;
        treeViewFolder.ShowRootLines = true;
        treeViewFolder.Size = new Size(224, 237);
        treeViewFolder.TabIndex = 1;
        treeViewFolder.BeforeExpand += TreeViewFolder_BeforeExpand;
        treeViewFolder.NodeMouseClick += TreeViewFolder_NodeMouseClick;
        treeViewFolder.AfterSelect += TreeViewFolder_AfterSelect;
        treeViewFolder.NodeMouseDoubleClick += TreeViewFolder_NodeMouseDoubleClick;
        treeViewFolder.KeyDown += TreeViewFolder_KeyDown;
        // 
        // labelInfoTitle
        // 
        labelInfoTitle.Dock = DockStyle.Top;
        labelInfoTitle.Font = new Font("Segoe UI Semibold", 9F, FontStyle.Bold);
        labelInfoTitle.ForeColor = Color.FromArgb(220, 220, 225);
        labelInfoTitle.Location = new Point(0, 0);
        labelInfoTitle.Name = "labelInfoTitle";
        labelInfoTitle.Padding = new Padding(0, 4, 0, 4);
        labelInfoTitle.Size = new Size(224, 27);
        labelInfoTitle.TabIndex = 0;
        labelInfoTitle.Text = "파일 정보";
        labelInfoTitle.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // textBoxDicomInfo
        // 
        textBoxDicomInfo.BackColor = Color.FromArgb(28, 28, 32);
        textBoxDicomInfo.BorderStyle = BorderStyle.None;
        textBoxDicomInfo.DetectUrls = false;
        textBoxDicomInfo.Dock = DockStyle.Fill;
        textBoxDicomInfo.Font = new Font("Segoe UI", 9F);
        textBoxDicomInfo.ForeColor = Color.FromArgb(200, 200, 205);
        textBoxDicomInfo.Location = new Point(0, 27);
        textBoxDicomInfo.Name = "textBoxDicomInfo";
        textBoxDicomInfo.ReadOnly = true;
        textBoxDicomInfo.ScrollBars = RichTextBoxScrollBars.Vertical;
        textBoxDicomInfo.ShortcutsEnabled = false;
        textBoxDicomInfo.Size = new Size(224, 183);
        textBoxDicomInfo.TabIndex = 1;
        textBoxDicomInfo.TabStop = false;
        textBoxDicomInfo.Text = "파일을 열면 DICOM 정보가 표시됩니다.";
        // 
        // panelImageHost
        // 
        panelImageHost.BackColor = Color.FromArgb(24, 24, 28);
        panelImageHost.Controls.Add(panelScroll);
        panelImageHost.Controls.Add(trackBarFrames);
        panelImageHost.Controls.Add(labelZoomPercent);
        panelImageHost.Dock = DockStyle.Fill;
        panelImageHost.Location = new Point(0, 0);
        panelImageHost.Name = "panelImageHost";
        panelImageHost.Padding = new Padding(4);
        panelImageHost.Size = new Size(740, 490);
        panelImageHost.TabIndex = 2;
        // 
        // panelScroll
        // 
        panelScroll.AutoScroll = false;
        panelScroll.BackColor = Color.FromArgb(24, 24, 28);
        panelScroll.Controls.Add(pictureBoxImage);
        panelScroll.ContextMenuStrip = contextMenuImage;
        panelScroll.Dock = DockStyle.Fill;
        panelScroll.Location = new Point(4, 4);
        panelScroll.Name = "panelScroll";
        panelScroll.Size = new Size(976, 462);
        panelScroll.TabIndex = 0;
        panelScroll.TabStop = true;
        panelScroll.ZoomWheel = null;
        panelScroll.Resize += PanelScroll_Resize;
        // 
        // pictureBoxImage
        // 
        pictureBoxImage.BackColor = Color.FromArgb(24, 24, 28);
        pictureBoxImage.ContextMenuStrip = contextMenuImage;
        pictureBoxImage.Location = new Point(0, 0);
        pictureBoxImage.Name = "pictureBoxImage";
        pictureBoxImage.Size = new Size(64, 64);
        pictureBoxImage.TabIndex = 0;
        pictureBoxImage.TabStop = false;
        pictureBoxImage.ZoomWheel = null;
        // 
        // trackBarFrames
        // 
        trackBarFrames.Dock = DockStyle.Bottom;
        trackBarFrames.Location = new Point(4, 466);
        trackBarFrames.Maximum = 0;
        trackBarFrames.Name = "trackBarFrames";
        trackBarFrames.Size = new Size(976, 45);
        trackBarFrames.TabIndex = 1;
        trackBarFrames.TickStyle = TickStyle.None;
        trackBarFrames.Visible = false;
        trackBarFrames.Scroll += TrackBarFrames_Scroll;
        // 
        // labelZoomPercent
        // 
        labelZoomPercent.AutoSize = true;
        labelZoomPercent.BackColor = Color.Transparent;
        labelZoomPercent.Font = new Font("Segoe UI", 11F, FontStyle.Bold);
        labelZoomPercent.ForeColor = Color.Red;
        labelZoomPercent.Location = new Point(8, 8);
        labelZoomPercent.Name = "labelZoomPercent";
        labelZoomPercent.Size = new Size(0, 20);
        labelZoomPercent.TabIndex = 2;
        labelZoomPercent.Visible = false;
        // 
        // openFileDialogDicom
        // 
        openFileDialogDicom.Filter = "모든 지원 형식|*.dcm;*.dicm;*.jpg;*.jpeg;*.png;*.gif;*.webp;*.bmp;*.tif;*.tiff;*.ico|DICOM|*.dcm;*.dicm|이미지|*.jpg;*.jpeg;*.png;*.gif;*.webp;*.bmp;*.tif;*.tiff;*.ico|모든 파일|*.*";
        openFileDialogDicom.Title = "파일 선택";
        // 
        // saveFileDialogImage
        // 
        saveFileDialogImage.Title = "이미지 저장";
        // 
        // folderBrowserBatchSource
        // 
        folderBrowserBatchSource.Description = "DCM 파일이 있는 폴더를 선택하세요";
        // 
        // folderBrowserSelectFolder
        // 
        folderBrowserSelectFolder.Description = "좌측 패널에 표시할 폴더를 선택하세요";
        // 
        // contextMenuImage
        // 
        contextMenuImage.Items.AddRange(new ToolStripItem[] { ctxMenuOpen, ctxMenuSeparator1, ctxMenuZoomFit, ctxMenuZoomActual, ctxMenuSeparator2, ctxMenuExport });
        contextMenuImage.Name = "contextMenuImage";
        contextMenuImage.Size = new Size(181, 120);
        contextMenuImage.Opening += ContextMenuImage_Opening;
        // 
        // ctxMenuOpen
        // 
        ctxMenuOpen.Name = "ctxMenuOpen";
        ctxMenuOpen.ShortcutKeys = Keys.Control | Keys.O;
        ctxMenuOpen.Size = new Size(180, 22);
        ctxMenuOpen.Text = "열기(&O)...";
        ctxMenuOpen.Click += OpenToolStripMenuItem_Click;
        // 
        // ctxMenuSeparator1
        // 
        ctxMenuSeparator1.Name = "ctxMenuSeparator1";
        ctxMenuSeparator1.Size = new Size(177, 6);
        // 
        // ctxMenuZoomFit
        // 
        ctxMenuZoomFit.Name = "ctxMenuZoomFit";
        ctxMenuZoomFit.Size = new Size(180, 22);
        ctxMenuZoomFit.Text = "화면에 맞춤";
        ctxMenuZoomFit.Click += CtxMenuZoomFit_Click;
        // 
        // ctxMenuZoomActual
        // 
        ctxMenuZoomActual.Name = "ctxMenuZoomActual";
        ctxMenuZoomActual.Size = new Size(180, 22);
        ctxMenuZoomActual.Text = "실제 크기 (100%)";
        ctxMenuZoomActual.Click += CtxMenuZoomActual_Click;
        // 
        // ctxMenuSeparator2
        // 
        ctxMenuSeparator2.Name = "ctxMenuSeparator2";
        ctxMenuSeparator2.Size = new Size(177, 6);
        // 
        // ctxMenuExport
        // 
        ctxMenuExport.DropDownItems.AddRange(new ToolStripItem[] { ctxMenuExportPng, ctxMenuExportJpeg, ctxMenuExportBmp, ctxMenuExportTiff, ctxMenuExportGif });
        ctxMenuExport.Name = "ctxMenuExport";
        ctxMenuExport.Size = new Size(180, 22);
        ctxMenuExport.Text = "내보내기(&E)";
        // 
        // ctxMenuExportPng
        // 
        ctxMenuExportPng.Name = "ctxMenuExportPng";
        ctxMenuExportPng.Size = new Size(180, 22);
        ctxMenuExportPng.Text = "PNG";
        ctxMenuExportPng.Click += ExportButton_Click;
        // 
        // ctxMenuExportJpeg
        // 
        ctxMenuExportJpeg.Name = "ctxMenuExportJpeg";
        ctxMenuExportJpeg.Size = new Size(180, 22);
        ctxMenuExportJpeg.Text = "JPEG";
        ctxMenuExportJpeg.Click += ExportButton_Click;
        // 
        // ctxMenuExportBmp
        // 
        ctxMenuExportBmp.Name = "ctxMenuExportBmp";
        ctxMenuExportBmp.Size = new Size(180, 22);
        ctxMenuExportBmp.Text = "BMP";
        ctxMenuExportBmp.Click += ExportButton_Click;
        // 
        // ctxMenuExportTiff
        // 
        ctxMenuExportTiff.Name = "ctxMenuExportTiff";
        ctxMenuExportTiff.Size = new Size(180, 22);
        ctxMenuExportTiff.Text = "TIFF";
        ctxMenuExportTiff.Click += ExportButton_Click;
        // 
        // ctxMenuExportGif
        // 
        ctxMenuExportGif.Name = "ctxMenuExportGif";
        ctxMenuExportGif.Size = new Size(180, 22);
        ctxMenuExportGif.Text = "GIF";
        ctxMenuExportGif.Click += ExportButton_Click;
        // 
        // contextMenuFolder
        // 
        contextMenuFolder.Items.AddRange(new ToolStripItem[] { ctxFolderOpen, ctxFolderSeparator1, ctxFolderCopy, ctxFolderPaste, ctxFolderDelete, ctxFolderSeparator2, ctxFolderSelectFolder, ctxFolderSeparator3, ctxFolderRefresh });
        contextMenuFolder.Name = "contextMenuFolder";
        contextMenuFolder.Size = new Size(181, 98);
        contextMenuFolder.Opening += ContextMenuFolder_Opening;
        // 
        // ctxFolderOpen
        // 
        ctxFolderOpen.Name = "ctxFolderOpen";
        ctxFolderOpen.Size = new Size(180, 22);
        ctxFolderOpen.Text = "열기(&O)";
        ctxFolderOpen.Click += CtxFolderOpen_Click;
        // 
        // ctxFolderSeparator1
        // 
        ctxFolderSeparator1.Name = "ctxFolderSeparator1";
        ctxFolderSeparator1.Size = new Size(177, 6);
        // 
        // ctxFolderSelectFolder
        // 
        ctxFolderSelectFolder.Name = "ctxFolderSelectFolder";
        ctxFolderSelectFolder.Size = new Size(180, 22);
        ctxFolderSelectFolder.Text = "폴더 선택(&P)...";
        ctxFolderSelectFolder.Click += SelectFolderToolStripMenuItem_Click;
        // 
        // ctxFolderCopy
        // 
        ctxFolderCopy.Name = "ctxFolderCopy";
        ctxFolderCopy.ShortcutKeys = Keys.Control | Keys.C;
        ctxFolderCopy.Size = new Size(180, 22);
        ctxFolderCopy.Text = "복사(&C)";
        ctxFolderCopy.Click += CtxFolderCopy_Click;
        // 
        // ctxFolderPaste
        // 
        ctxFolderPaste.Name = "ctxFolderPaste";
        ctxFolderPaste.ShortcutKeys = Keys.Control | Keys.V;
        ctxFolderPaste.Size = new Size(180, 22);
        ctxFolderPaste.Text = "붙여넣기(&V)";
        ctxFolderPaste.Click += CtxFolderPaste_Click;
        // 
        // ctxFolderDelete
        // 
        ctxFolderDelete.Name = "ctxFolderDelete";
        ctxFolderDelete.ShortcutKeys = Keys.Delete;
        ctxFolderDelete.Size = new Size(180, 22);
        ctxFolderDelete.Text = "삭제(&D)";
        ctxFolderDelete.Click += CtxFolderDelete_Click;
        // 
        // ctxFolderSeparator2
        // 
        ctxFolderSeparator2.Name = "ctxFolderSeparator2";
        ctxFolderSeparator2.Size = new Size(177, 6);
        // 
        // ctxFolderSeparator3
        // 
        ctxFolderSeparator3.Name = "ctxFolderSeparator3";
        ctxFolderSeparator3.Size = new Size(177, 6);
        // 
        // ctxFolderRefresh
        // 
        ctxFolderRefresh.Name = "ctxFolderRefresh";
        ctxFolderRefresh.Size = new Size(180, 22);
        ctxFolderRefresh.Text = "새로 고침(&R)";
        ctxFolderRefresh.Click += CtxFolderRefresh_Click;
        // 
        // MainForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(984, 561);
        Controls.Add(splitContainerMain);
        Controls.Add(statusStripMain);
        Controls.Add(toolStripExport);
        Controls.Add(menuStripMain);
        Icon = (Icon)resources.GetObject("$this.Icon");
        MainMenuStrip = menuStripMain;
        MinimumSize = new Size(640, 480);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "DCMViewer 0.1";
        menuStripMain.ResumeLayout(false);
        menuStripMain.PerformLayout();
        statusStripMain.ResumeLayout(false);
        statusStripMain.PerformLayout();
        toolStripExport.ResumeLayout(false);
        toolStripExport.PerformLayout();
        splitContainerMain.Panel1.ResumeLayout(false);
        splitContainerMain.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)splitContainerMain).EndInit();
        splitContainerMain.ResumeLayout(false);
        panelDicomInfo.ResumeLayout(false);
        splitContainerLeft.Panel1.ResumeLayout(false);
        splitContainerLeft.Panel1.PerformLayout();
        splitContainerLeft.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)splitContainerLeft).EndInit();
        splitContainerLeft.ResumeLayout(false);
        panelImageHost.ResumeLayout(false);
        panelImageHost.PerformLayout();
        panelScroll.ResumeLayout(false);
        contextMenuImage.ResumeLayout(false);
        contextMenuFolder.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)pictureBoxImage).EndInit();
        ((System.ComponentModel.ISupportInitialize)trackBarFrames).EndInit();
        ResumeLayout(false);
        PerformLayout();
    }

    #endregion

    private MenuStrip menuStripMain;
    private ToolStripMenuItem fileToolStripMenuItem;
    private ToolStripMenuItem openToolStripMenuItem;
    private ToolStripMenuItem selectFolderToolStripMenuItem;
    private ToolStripSeparator fileMenuSeparatorBatchConvert;
    private ToolStripMenuItem batchConvertToolStripMenuItem;
    private ToolStripMenuItem batchConvertPngToolStripMenuItem;
    private ToolStripMenuItem batchConvertJpegToolStripMenuItem;
    private ToolStripMenuItem batchConvertBmpToolStripMenuItem;
    private ToolStripMenuItem batchConvertTiffToolStripMenuItem;
    private ToolStripMenuItem batchConvertGifToolStripMenuItem;
    private ToolStripSeparator fileMenuSeparatorAssociation;
    private ToolStripMenuItem registerDcmDefaultToolStripMenuItem;
    private ToolStripMenuItem unregisterDcmAssociationToolStripMenuItem;
    private ToolStripSeparator fileMenuSeparatorExit;
    private ToolStripMenuItem exitToolStripMenuItem;
    private ToolStripMenuItem helpToolStripMenuItem;
    private ToolStripMenuItem aboutToolStripMenuItem;
    private StatusStrip statusStripMain;
    private ToolStripStatusLabel toolStripStatusLabelFile;
    private ToolStripStatusLabel toolStripStatusLabelPatient;
    private ToolStripStatusLabel toolStripStatusLabelDetails;
    private ToolStripStatusLabel toolStripStatusLabelFrame;
    private ToolStrip toolStripExport;
    private ToolStripLabel toolStripLabelExport;
    private ToolStripSeparator toolStripSeparatorExport;
    private ToolStripButton toolStripButtonSavePng;
    private ToolStripButton toolStripButtonSaveJpeg;
    private ToolStripButton toolStripButtonSaveBmp;
    private ToolStripButton toolStripButtonSaveTiff;
    private ToolStripButton toolStripButtonSaveGif;
    private ToolStripSeparator toolStripSeparatorBatchConvert;
    private ToolStripButton toolStripButtonBatchConvert;
    private ToolStripButton toolStripButtonInfo;
    private SplitContainer splitContainerMain;
    private Panel panelDicomInfo;
    private SplitContainer splitContainerLeft;
    private Label labelFolderTitle;
    private TreeView treeViewFolder;
    private Label labelInfoTitle;
    private RichTextBox textBoxDicomInfo;
    private Panel panelImageHost;
    private ImageScrollPanel panelScroll;
    private ZoomPictureBox pictureBoxImage;
    private Label labelZoomPercent;
    private TrackBar trackBarFrames;
    private OpenFileDialog openFileDialogDicom;
    private SaveFileDialog saveFileDialogImage;
    private FolderBrowserDialog folderBrowserBatchSource;
    private FolderBrowserDialog folderBrowserSelectFolder;
    private ContextMenuStrip contextMenuImage;
    private ToolStripMenuItem ctxMenuOpen;
    private ToolStripSeparator ctxMenuSeparator1;
    private ToolStripMenuItem ctxMenuZoomFit;
    private ToolStripMenuItem ctxMenuZoomActual;
    private ToolStripSeparator ctxMenuSeparator2;
    private ToolStripMenuItem ctxMenuExport;
    private ToolStripMenuItem ctxMenuExportPng;
    private ToolStripMenuItem ctxMenuExportJpeg;
    private ToolStripMenuItem ctxMenuExportBmp;
    private ToolStripMenuItem ctxMenuExportTiff;
    private ToolStripMenuItem ctxMenuExportGif;
    private ContextMenuStrip contextMenuFolder;
    private ToolStripMenuItem ctxFolderOpen;
    private ToolStripSeparator ctxFolderSeparator1;
    private ToolStripMenuItem ctxFolderSelectFolder;
    private ToolStripSeparator ctxFolderSeparator2;
    private ToolStripMenuItem ctxFolderCopy;
    private ToolStripMenuItem ctxFolderPaste;
    private ToolStripMenuItem ctxFolderDelete;
    private ToolStripSeparator ctxFolderSeparator3;
    private ToolStripMenuItem ctxFolderRefresh;
}
