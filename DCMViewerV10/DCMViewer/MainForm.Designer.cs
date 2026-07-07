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
        toolStripButtonInfo = new ToolStripButton();
        splitContainerMain = new SplitContainer();
        panelDicomInfo = new Panel();
        labelInfoTitle = new Label();
        textBoxDicomInfo = new RichTextBox();
        panelImageHost = new Panel();
        panelScroll = new ImageScrollPanel();
        pictureBoxImage = new ZoomPictureBox();
        trackBarFrames = new TrackBar();
        labelZoomPercent = new Label();
        openFileDialogDicom = new OpenFileDialog();
        saveFileDialogImage = new SaveFileDialog();
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
        menuStripMain.SuspendLayout();
        statusStripMain.SuspendLayout();
        toolStripExport.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)splitContainerMain).BeginInit();
        splitContainerMain.Panel1.SuspendLayout();
        splitContainerMain.Panel2.SuspendLayout();
        splitContainerMain.SuspendLayout();
        panelDicomInfo.SuspendLayout();
        panelImageHost.SuspendLayout();
        panelScroll.SuspendLayout();
        contextMenuImage.SuspendLayout();
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
        fileToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { openToolStripMenuItem, fileMenuSeparatorAssociation, registerDcmDefaultToolStripMenuItem, unregisterDcmAssociationToolStripMenuItem, fileMenuSeparatorExit, exitToolStripMenuItem });
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
        toolStripExport.Items.AddRange(new ToolStripItem[] { toolStripLabelExport, toolStripSeparatorExport, toolStripButtonSavePng, toolStripButtonSaveJpeg, toolStripButtonSaveBmp, toolStripButtonSaveTiff, toolStripButtonSaveGif, toolStripButtonInfo });
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
        // toolStripButtonInfo
        // 
        toolStripButtonInfo.Alignment = ToolStripItemAlignment.Right;
        toolStripButtonInfo.DisplayStyle = ToolStripItemDisplayStyle.Image;
        toolStripButtonInfo.ImageScaling = ToolStripItemImageScaling.None;
        toolStripButtonInfo.Margin = new Padding(8, 0, 12, 0);
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
        splitContainerMain.Panel1MinSize = 180;
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
        panelDicomInfo.Controls.Add(textBoxDicomInfo);
        panelDicomInfo.Controls.Add(labelInfoTitle);
        panelDicomInfo.Dock = DockStyle.Fill;
        panelDicomInfo.Location = new Point(0, 0);
        panelDicomInfo.Name = "panelDicomInfo";
        panelDicomInfo.Padding = new Padding(8, 8, 8, 8);
        panelDicomInfo.Size = new Size(240, 490);
        panelDicomInfo.TabIndex = 0;
        // 
        // labelInfoTitle
        // 
        labelInfoTitle.Dock = DockStyle.Top;
        labelInfoTitle.Font = new Font("Segoe UI Semibold", 9F, FontStyle.Bold);
        labelInfoTitle.ForeColor = Color.FromArgb(220, 220, 225);
        labelInfoTitle.Location = new Point(8, 8);
        labelInfoTitle.Name = "labelInfoTitle";
        labelInfoTitle.Padding = new Padding(0, 0, 0, 6);
        labelInfoTitle.Size = new Size(188, 27);
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
        textBoxDicomInfo.Location = new Point(8, 35);
        textBoxDicomInfo.Name = "textBoxDicomInfo";
        textBoxDicomInfo.ReadOnly = true;
        textBoxDicomInfo.ScrollBars = RichTextBoxScrollBars.Vertical;
        textBoxDicomInfo.ShortcutsEnabled = false;
        textBoxDicomInfo.Size = new Size(188, 472);
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
        openFileDialogDicom.Filter = "모든 지원 형식|*.dcm;*.dicm;*.jpg;*.jpeg;*.png;*.gif;*.webp;*.bmp;*.tif;*.tiff|DICOM|*.dcm;*.dicm|이미지|*.jpg;*.jpeg;*.png;*.gif;*.webp;*.bmp;*.tif;*.tiff|모든 파일|*.*";
        openFileDialogDicom.Title = "파일 선택";
        // 
        // saveFileDialogImage
        // 
        saveFileDialogImage.Title = "이미지 저장";
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
        panelDicomInfo.PerformLayout();
        panelImageHost.ResumeLayout(false);
        panelImageHost.PerformLayout();
        panelScroll.ResumeLayout(false);
        contextMenuImage.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)pictureBoxImage).EndInit();
        ((System.ComponentModel.ISupportInitialize)trackBarFrames).EndInit();
        ResumeLayout(false);
        PerformLayout();
    }

    #endregion

    private MenuStrip menuStripMain;
    private ToolStripMenuItem fileToolStripMenuItem;
    private ToolStripMenuItem openToolStripMenuItem;
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
    private ToolStripButton toolStripButtonInfo;
    private SplitContainer splitContainerMain;
    private Panel panelDicomInfo;
    private Label labelInfoTitle;
    private RichTextBox textBoxDicomInfo;
    private Panel panelImageHost;
    private ImageScrollPanel panelScroll;
    private ZoomPictureBox pictureBoxImage;
    private Label labelZoomPercent;
    private TrackBar trackBarFrames;
    private OpenFileDialog openFileDialogDicom;
    private SaveFileDialog saveFileDialogImage;
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
}
