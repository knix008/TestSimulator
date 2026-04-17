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
        exitToolStripMenuItem = new ToolStripMenuItem();
        helpToolStripMenuItem = new ToolStripMenuItem();
        aboutToolStripMenuItem = new ToolStripMenuItem();
        toolStripButtonInfo = new ToolStripButton();
        statusStripMain = new StatusStrip();
        toolStripStatusLabelFile = new ToolStripStatusLabel();
        toolStripStatusLabelPatient = new ToolStripStatusLabel();
        toolStripStatusLabelDetails = new ToolStripStatusLabel();
        toolStripStatusLabelFrame = new ToolStripStatusLabel();
        panelImageHost = new Panel();
        panelScroll = new ImageScrollPanel();
        pictureBoxImage = new ZoomPictureBox();
        trackBarFrames = new TrackBar();
        labelZoomPercent = new Label();
        openFileDialogDicom = new OpenFileDialog();
        menuStripMain.SuspendLayout();
        statusStripMain.SuspendLayout();
        panelImageHost.SuspendLayout();
        panelScroll.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)pictureBoxImage).BeginInit();
        ((System.ComponentModel.ISupportInitialize)trackBarFrames).BeginInit();
        SuspendLayout();
        // 
        // menuStripMain
        // 
        menuStripMain.Items.AddRange(new ToolStripItem[] { fileToolStripMenuItem, helpToolStripMenuItem, toolStripButtonInfo });
        menuStripMain.Location = new Point(0, 0);
        menuStripMain.Name = "menuStripMain";
        menuStripMain.Size = new Size(984, 24);
        menuStripMain.TabIndex = 0;
        menuStripMain.Text = "menuStrip1";
        // 
        // fileToolStripMenuItem
        // 
        fileToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { openToolStripMenuItem, exitToolStripMenuItem });
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
        // toolStripButtonInfo
        // 
        toolStripButtonInfo.Alignment = ToolStripItemAlignment.Right;
        toolStripButtonInfo.DisplayStyle = ToolStripItemDisplayStyle.Image;
        toolStripButtonInfo.ImageScaling = ToolStripItemImageScaling.None;
        toolStripButtonInfo.Name = "toolStripButtonInfo";
        toolStripButtonInfo.Size = new Size(28, 20);
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
        // panelImageHost
        // 
        panelImageHost.BackColor = Color.FromArgb(24, 24, 28);
        panelImageHost.Controls.Add(panelScroll);
        panelImageHost.Controls.Add(trackBarFrames);
        panelImageHost.Controls.Add(labelZoomPercent);
        panelImageHost.Dock = DockStyle.Fill;
        panelImageHost.Location = new Point(0, 24);
        panelImageHost.Name = "panelImageHost";
        panelImageHost.Padding = new Padding(4);
        panelImageHost.Size = new Size(984, 515);
        panelImageHost.TabIndex = 2;
        // 
        // panelScroll
        // 
        panelScroll.AutoScroll = true;
        panelScroll.BackColor = Color.FromArgb(24, 24, 28);
        panelScroll.Controls.Add(pictureBoxImage);
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
        // MainForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(984, 561);
        Controls.Add(panelImageHost);
        Controls.Add(statusStripMain);
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
        panelImageHost.ResumeLayout(false);
        panelImageHost.PerformLayout();
        panelScroll.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)pictureBoxImage).EndInit();
        ((System.ComponentModel.ISupportInitialize)trackBarFrames).EndInit();
        ResumeLayout(false);
        PerformLayout();
    }

    #endregion

    private MenuStrip menuStripMain;
    private ToolStripMenuItem fileToolStripMenuItem;
    private ToolStripMenuItem openToolStripMenuItem;
    private ToolStripMenuItem exitToolStripMenuItem;
    private ToolStripMenuItem helpToolStripMenuItem;
    private ToolStripMenuItem aboutToolStripMenuItem;
    private ToolStripButton toolStripButtonInfo;
    private StatusStrip statusStripMain;
    private ToolStripStatusLabel toolStripStatusLabelFile;
    private ToolStripStatusLabel toolStripStatusLabelPatient;
    private ToolStripStatusLabel toolStripStatusLabelDetails;
    private ToolStripStatusLabel toolStripStatusLabelFrame;
    private Panel panelImageHost;
    private ImageScrollPanel panelScroll;
    private ZoomPictureBox pictureBoxImage;
    private Label labelZoomPercent;
    private TrackBar trackBarFrames;
    private OpenFileDialog openFileDialogDicom;
}
