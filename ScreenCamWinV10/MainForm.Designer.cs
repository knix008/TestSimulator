namespace ScreenCamWin;

partial class MainForm
{
    private System.ComponentModel.IContainer components = null!;

    // ── Title bar ────────────────────────────────────────────────────────────
    private Panel       pnlTitle;
    private PictureBox  picAppIcon;
    private Label       lblAppName;
    private Button btnMinimize;
    private Button btnClose;

    // ── Source section ───────────────────────────────────────────────────────
    private Panel     pnlSource;
    private Label     lblSourceTitle;
    private ComboBox  cboWindow;
    private Button    btnRefresh;

    // ── Preview section ──────────────────────────────────────────────────────
    private Panel      pnlPreview;
    private Label      lblPreviewTitle;
    private Button     btnTogglePreview;
    private PictureBox picPreview;

    // ── Codec section ────────────────────────────────────────────────────────
    private Panel  pnlCodec;
    private Label  lblCodecTitle;
    private ComboBox cboCodec;
    private Label  lblCodecStatus;
    private Button btnInstallCodec;

    // ── Settings section ─────────────────────────────────────────────────────
    private Panel    pnlSettings;
    private Label    lblSettingsTitle;
    private Label    lblFps;
    private TrackBar trkFps;
    private Label    lblFpsVal;
    private Label    lblQuality;
    private TrackBar trkQuality;
    private Label    lblQualityVal;
    private Label    lblOutput;
    private TextBox  txtOutput;
    private Button   btnBrowse;
    private CheckBox chkCursor;

    // ── Record section ───────────────────────────────────────────────────────
    private Panel  pnlRecord;
    private Button btnRecord;
    private Label  lblTimer;
    private Label  lblStatus;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        pnlTitle = new Panel();
        picAppIcon = new PictureBox();
        lblAppName = new Label();
        btnMinimize = new Button();
        btnClose = new Button();
        pnlSource = new Panel();
        lblSourceTitle = new Label();
        cboWindow = new ComboBox();
        btnRefresh = new Button();
        pnlPreview = new Panel();
        lblPreviewTitle = new Label();
        btnTogglePreview = new Button();
        picPreview = new PictureBox();
        pnlCodec = new Panel();
        lblCodecTitle = new Label();
        cboCodec = new ComboBox();
        lblCodecStatus = new Label();
        btnInstallCodec = new Button();
        pnlSettings = new Panel();
        lblSettingsTitle = new Label();
        lblFps = new Label();
        trkFps = new TrackBar();
        lblFpsVal = new Label();
        lblQuality = new Label();
        trkQuality = new TrackBar();
        lblQualityVal = new Label();
        lblOutput = new Label();
        txtOutput = new TextBox();
        btnBrowse = new Button();
        chkCursor = new CheckBox();
        pnlRecord = new Panel();
        btnRecord = new Button();
        lblTimer = new Label();
        lblStatus = new Label();
        pnlTitle.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)picAppIcon).BeginInit();
        pnlSource.SuspendLayout();
        pnlPreview.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)picPreview).BeginInit();
        pnlCodec.SuspendLayout();
        pnlSettings.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)trkFps).BeginInit();
        ((System.ComponentModel.ISupportInitialize)trkQuality).BeginInit();
        pnlRecord.SuspendLayout();
        SuspendLayout();
        // 
        // pnlTitle
        // 
        pnlTitle.BackColor = Color.FromArgb(18, 18, 36);
        pnlTitle.Controls.Add(picAppIcon);
        pnlTitle.Controls.Add(lblAppName);
        pnlTitle.Controls.Add(btnMinimize);
        pnlTitle.Controls.Add(btnClose);
        pnlTitle.Dock = DockStyle.Top;
        pnlTitle.Location = new Point(0, 0);
        pnlTitle.Name = "pnlTitle";
        pnlTitle.Size = new Size(540, 44);
        pnlTitle.TabIndex = 0;
        pnlTitle.MouseDown += TitleBar_MouseDown;
        pnlTitle.MouseMove += TitleBar_MouseMove;
        // 
        // picAppIcon
        // 
        picAppIcon.BackColor = Color.FromArgb(18, 18, 36);
        picAppIcon.Location = new Point(14, 11);
        picAppIcon.Name = "picAppIcon";
        picAppIcon.Size = new Size(22, 22);
        picAppIcon.SizeMode = PictureBoxSizeMode.Zoom;
        picAppIcon.TabIndex = 0;
        picAppIcon.TabStop = false;
        picAppIcon.MouseDown += TitleBar_MouseDown;
        picAppIcon.MouseMove += TitleBar_MouseMove;
        // 
        // lblAppName
        // 
        lblAppName.AutoSize = true;
        lblAppName.Font = new Font("Segoe UI", 11F, FontStyle.Bold);
        lblAppName.ForeColor = Color.FromArgb(248, 250, 252);
        lblAppName.Location = new Point(44, 11);
        lblAppName.Name = "lblAppName";
        lblAppName.Size = new Size(108, 20);
        lblAppName.TabIndex = 1;
        lblAppName.Text = "ScreenCamWin";
        lblAppName.MouseDown += TitleBar_MouseDown;
        lblAppName.MouseMove += TitleBar_MouseMove;
        // 
        // btnMinimize
        // 
        btnMinimize.BackColor = Color.Transparent;
        btnMinimize.Cursor = Cursors.Hand;
        btnMinimize.FlatAppearance.BorderSize = 0;
        btnMinimize.FlatStyle = FlatStyle.Flat;
        btnMinimize.Font = new Font("Segoe UI", 11F);
        btnMinimize.ForeColor = Color.FromArgb(148, 163, 184);
        btnMinimize.Location = new Point(452, 0);
        btnMinimize.Name = "btnMinimize";
        btnMinimize.Size = new Size(44, 44);
        btnMinimize.TabIndex = 1;
        btnMinimize.Text = "─";
        btnMinimize.UseVisualStyleBackColor = false;
        btnMinimize.Click += BtnMinimize_Click;
        // 
        // btnClose
        // 
        btnClose.BackColor = Color.Transparent;
        btnClose.Cursor = Cursors.Hand;
        btnClose.FlatAppearance.BorderSize = 0;
        btnClose.FlatAppearance.MouseOverBackColor = Color.FromArgb(239, 68, 68);
        btnClose.FlatStyle = FlatStyle.Flat;
        btnClose.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        btnClose.ForeColor = Color.FromArgb(248, 250, 252);
        btnClose.Location = new Point(496, 0);
        btnClose.Name = "btnClose";
        btnClose.Size = new Size(44, 44);
        btnClose.TabIndex = 2;
        btnClose.Text = "✕";
        btnClose.UseVisualStyleBackColor = false;
        btnClose.Click += BtnClose_Click;
        // 
        // pnlSource
        // 
        pnlSource.BackColor = Color.FromArgb(22, 22, 40);
        pnlSource.Controls.Add(lblSourceTitle);
        pnlSource.Controls.Add(cboWindow);
        pnlSource.Controls.Add(btnRefresh);
        pnlSource.Location = new Point(14, 52);
        pnlSource.Name = "pnlSource";
        pnlSource.Size = new Size(512, 80);
        pnlSource.TabIndex = 1;
        // 
        // lblSourceTitle
        // 
        lblSourceTitle.AutoSize = true;
        lblSourceTitle.Font = new Font("Segoe UI", 8F, FontStyle.Bold);
        lblSourceTitle.ForeColor = Color.FromArgb(99, 102, 241);
        lblSourceTitle.Location = new Point(10, 10);
        lblSourceTitle.Name = "lblSourceTitle";
        lblSourceTitle.Size = new Size(54, 13);
        lblSourceTitle.TabIndex = 0;
        lblSourceTitle.Text = "캡처 대상";
        // 
        // cboWindow
        // 
        cboWindow.BackColor = Color.FromArgb(30, 30, 52);
        cboWindow.DropDownStyle = ComboBoxStyle.DropDownList;
        cboWindow.FlatStyle = FlatStyle.Flat;
        cboWindow.Font = new Font("Segoe UI", 9F);
        cboWindow.ForeColor = Color.FromArgb(248, 250, 252);
        cboWindow.Location = new Point(10, 30);
        cboWindow.Name = "cboWindow";
        cboWindow.Size = new Size(416, 23);
        cboWindow.TabIndex = 1;
        // 
        // btnRefresh
        // 
        btnRefresh.BackColor = Color.FromArgb(30, 30, 52);
        btnRefresh.Cursor = Cursors.Hand;
        btnRefresh.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);
        btnRefresh.FlatStyle = FlatStyle.Flat;
        btnRefresh.Font = new Font("Segoe UI", 8.5F);
        btnRefresh.ForeColor = Color.FromArgb(148, 163, 184);
        btnRefresh.Location = new Point(430, 30);
        btnRefresh.Name = "btnRefresh";
        btnRefresh.Size = new Size(82, 30);
        btnRefresh.TabIndex = 2;
        btnRefresh.Text = "↻ 새로고침";
        btnRefresh.UseVisualStyleBackColor = false;
        btnRefresh.Click += BtnRefresh_Click;
        // 
        // pnlPreview
        // 
        pnlPreview.BackColor = Color.FromArgb(22, 22, 40);
        pnlPreview.Controls.Add(lblPreviewTitle);
        pnlPreview.Controls.Add(btnTogglePreview);
        pnlPreview.Controls.Add(picPreview);
        pnlPreview.Location = new Point(14, 140);
        pnlPreview.Name = "pnlPreview";
        pnlPreview.Size = new Size(512, 170);
        pnlPreview.TabIndex = 2;
        // 
        // lblPreviewTitle
        // 
        lblPreviewTitle.AutoSize = true;
        lblPreviewTitle.Font = new Font("Segoe UI", 8F, FontStyle.Bold);
        lblPreviewTitle.ForeColor = Color.FromArgb(99, 102, 241);
        lblPreviewTitle.Location = new Point(10, 10);
        lblPreviewTitle.Name = "lblPreviewTitle";
        lblPreviewTitle.Size = new Size(51, 13);
        lblPreviewTitle.TabIndex = 0;
        lblPreviewTitle.Text = "미리보기";
        // 
        // btnTogglePreview
        // 
        btnTogglePreview.BackColor = Color.FromArgb(30, 30, 52);
        btnTogglePreview.Cursor = Cursors.Hand;
        btnTogglePreview.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);
        btnTogglePreview.FlatStyle = FlatStyle.Flat;
        btnTogglePreview.Font = new Font("Segoe UI", 8F);
        btnTogglePreview.ForeColor = Color.FromArgb(148, 163, 184);
        btnTogglePreview.Location = new Point(448, 7);
        btnTogglePreview.Name = "btnTogglePreview";
        btnTogglePreview.Size = new Size(54, 22);
        btnTogglePreview.TabIndex = 1;
        btnTogglePreview.Text = "켜기";
        btnTogglePreview.UseVisualStyleBackColor = false;
        btnTogglePreview.Click += BtnTogglePreview_Click;
        // 
        // picPreview
        // 
        picPreview.BackColor = Color.FromArgb(13, 13, 26);
        picPreview.Location = new Point(10, 34);
        picPreview.Name = "picPreview";
        picPreview.Size = new Size(492, 126);
        picPreview.SizeMode = PictureBoxSizeMode.Zoom;
        picPreview.TabIndex = 2;
        picPreview.TabStop = false;
        // 
        // pnlCodec
        // 
        pnlCodec.BackColor = Color.FromArgb(22, 22, 40);
        pnlCodec.Controls.Add(lblCodecTitle);
        pnlCodec.Controls.Add(cboCodec);
        pnlCodec.Controls.Add(lblCodecStatus);
        pnlCodec.Controls.Add(btnInstallCodec);
        pnlCodec.Location = new Point(14, 318);
        pnlCodec.Name = "pnlCodec";
        pnlCodec.Size = new Size(512, 80);
        pnlCodec.TabIndex = 3;
        // 
        // lblCodecTitle
        // 
        lblCodecTitle.AutoSize = true;
        lblCodecTitle.Font = new Font("Segoe UI", 8F, FontStyle.Bold);
        lblCodecTitle.ForeColor = Color.FromArgb(99, 102, 241);
        lblCodecTitle.Location = new Point(10, 10);
        lblCodecTitle.Name = "lblCodecTitle";
        lblCodecTitle.Size = new Size(65, 13);
        lblCodecTitle.TabIndex = 0;
        lblCodecTitle.Text = "비디오 코덱";
        // 
        // cboCodec
        // 
        cboCodec.BackColor = Color.FromArgb(30, 30, 52);
        cboCodec.DropDownStyle = ComboBoxStyle.DropDownList;
        cboCodec.FlatStyle = FlatStyle.Flat;
        cboCodec.Font = new Font("Segoe UI", 9F);
        cboCodec.ForeColor = Color.FromArgb(248, 250, 252);
        cboCodec.Location = new Point(10, 30);
        cboCodec.Name = "cboCodec";
        cboCodec.Size = new Size(200, 23);
        cboCodec.TabIndex = 1;
        cboCodec.SelectedIndexChanged += CboCodec_SelectedIndexChanged;
        // 
        // lblCodecStatus
        // 
        lblCodecStatus.AutoSize = true;
        lblCodecStatus.Font = new Font("Segoe UI", 8.5F);
        lblCodecStatus.ForeColor = Color.FromArgb(34, 197, 94);
        lblCodecStatus.Location = new Point(218, 36);
        lblCodecStatus.Name = "lblCodecStatus";
        lblCodecStatus.Size = new Size(68, 15);
        lblCodecStatus.TabIndex = 2;
        lblCodecStatus.Text = "● 사용 가능";
        // 
        // btnInstallCodec
        // 
        btnInstallCodec.BackColor = Color.FromArgb(99, 102, 241);
        btnInstallCodec.Cursor = Cursors.Hand;
        btnInstallCodec.FlatAppearance.BorderSize = 0;
        btnInstallCodec.FlatStyle = FlatStyle.Flat;
        btnInstallCodec.Font = new Font("Segoe UI", 8.5F);
        btnInstallCodec.ForeColor = Color.FromArgb(248, 250, 252);
        btnInstallCodec.Location = new Point(430, 30);
        btnInstallCodec.Name = "btnInstallCodec";
        btnInstallCodec.Size = new Size(72, 30);
        btnInstallCodec.TabIndex = 3;
        btnInstallCodec.Text = "설치";
        btnInstallCodec.UseVisualStyleBackColor = false;
        btnInstallCodec.Visible = false;
        btnInstallCodec.Click += BtnInstallCodec_Click;
        // 
        // pnlSettings
        // 
        pnlSettings.BackColor = Color.FromArgb(22, 22, 40);
        pnlSettings.Controls.Add(lblSettingsTitle);
        pnlSettings.Controls.Add(lblFps);
        pnlSettings.Controls.Add(trkFps);
        pnlSettings.Controls.Add(lblFpsVal);
        pnlSettings.Controls.Add(lblQuality);
        pnlSettings.Controls.Add(trkQuality);
        pnlSettings.Controls.Add(lblQualityVal);
        pnlSettings.Controls.Add(lblOutput);
        pnlSettings.Controls.Add(txtOutput);
        pnlSettings.Controls.Add(btnBrowse);
        pnlSettings.Location = new Point(14, 406);
        pnlSettings.Name = "pnlSettings";
        pnlSettings.Size = new Size(512, 168);
        pnlSettings.TabIndex = 4;
        // 
        // lblSettingsTitle
        // 
        lblSettingsTitle.AutoSize = true;
        lblSettingsTitle.Font = new Font("Segoe UI", 8F, FontStyle.Bold);
        lblSettingsTitle.ForeColor = Color.FromArgb(99, 102, 241);
        lblSettingsTitle.Location = new Point(10, 10);
        lblSettingsTitle.Name = "lblSettingsTitle";
        lblSettingsTitle.Size = new Size(54, 13);
        lblSettingsTitle.TabIndex = 0;
        lblSettingsTitle.Text = "녹화 설정";
        // 
        // lblFps
        // 
        lblFps.AutoSize = true;
        lblFps.Font = new Font("Segoe UI", 8.5F);
        lblFps.ForeColor = Color.FromArgb(148, 163, 184);
        lblFps.Location = new Point(10, 40);
        lblFps.Name = "lblFps";
        lblFps.Size = new Size(26, 15);
        lblFps.TabIndex = 1;
        lblFps.Text = "FPS";
        // 
        // trkFps
        // 
        trkFps.BackColor = Color.FromArgb(22, 22, 40);
        trkFps.Location = new Point(60, 34);
        trkFps.Maximum = 60;
        trkFps.Minimum = 5;
        trkFps.Name = "trkFps";
        trkFps.Size = new Size(382, 45);
        trkFps.TabIndex = 2;
        trkFps.TickStyle = TickStyle.None;
        trkFps.Value = 30;
        trkFps.ValueChanged += TrkFps_ValueChanged;
        // 
        // lblFpsVal
        // 
        lblFpsVal.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        lblFpsVal.AutoSize = true;
        lblFpsVal.Font = new Font("Segoe UI", 8.5F, FontStyle.Bold);
        lblFpsVal.ForeColor = Color.FromArgb(248, 250, 252);
        lblFpsVal.Location = new Point(454, 40);
        lblFpsVal.Name = "lblFpsVal";
        lblFpsVal.Size = new Size(41, 15);
        lblFpsVal.TabIndex = 3;
        lblFpsVal.Text = "30 fps";
        // 
        // lblQuality
        // 
        lblQuality.AutoSize = true;
        lblQuality.Font = new Font("Segoe UI", 8.5F);
        lblQuality.ForeColor = Color.FromArgb(148, 163, 184);
        lblQuality.Location = new Point(10, 76);
        lblQuality.Name = "lblQuality";
        lblQuality.Size = new Size(31, 15);
        lblQuality.TabIndex = 4;
        lblQuality.Text = "화질";
        // 
        // trkQuality
        // 
        trkQuality.BackColor = Color.FromArgb(22, 22, 40);
        trkQuality.Location = new Point(60, 70);
        trkQuality.Maximum = 100;
        trkQuality.Minimum = 10;
        trkQuality.Name = "trkQuality";
        trkQuality.Size = new Size(382, 45);
        trkQuality.TabIndex = 5;
        trkQuality.TickStyle = TickStyle.None;
        trkQuality.Value = 70;
        trkQuality.ValueChanged += TrkQuality_ValueChanged;
        // 
        // lblQualityVal
        // 
        lblQualityVal.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        lblQualityVal.AutoSize = true;
        lblQualityVal.Font = new Font("Segoe UI", 8.5F, FontStyle.Bold);
        lblQualityVal.ForeColor = Color.FromArgb(248, 250, 252);
        lblQualityVal.Location = new Point(454, 76);
        lblQualityVal.Name = "lblQualityVal";
        lblQualityVal.Size = new Size(31, 15);
        lblQualityVal.TabIndex = 6;
        lblQualityVal.Text = "70%";
        // 
        // lblOutput
        // 
        lblOutput.Font = new Font("Segoe UI", 9F);
        lblOutput.ForeColor = Color.FromArgb(148, 163, 184);
        lblOutput.Location = new Point(10, 112);
        lblOutput.Name = "lblOutput";
        lblOutput.Size = new Size(62, 34);
        lblOutput.TabIndex = 7;
        lblOutput.Text = "저장 경로";
        lblOutput.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // txtOutput
        // 
        txtOutput.BackColor = Color.FromArgb(30, 30, 52);
        txtOutput.BorderStyle = BorderStyle.FixedSingle;
        txtOutput.Font = new Font("Segoe UI", 9F);
        txtOutput.ForeColor = Color.FromArgb(248, 250, 252);
        txtOutput.Location = new Point(78, 117);
        txtOutput.Name = "txtOutput";
        txtOutput.Size = new Size(352, 23);
        txtOutput.TabIndex = 8;
        // 
        // btnBrowse
        // 
        btnBrowse.BackColor = Color.FromArgb(30, 30, 52);
        btnBrowse.Cursor = Cursors.Hand;
        btnBrowse.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);
        btnBrowse.FlatStyle = FlatStyle.Flat;
        btnBrowse.Font = new Font("Segoe UI", 8F);
        btnBrowse.ForeColor = Color.FromArgb(148, 163, 184);
        btnBrowse.Location = new Point(436, 112);
        btnBrowse.Name = "btnBrowse";
        btnBrowse.Size = new Size(66, 34);
        btnBrowse.TabIndex = 9;
        btnBrowse.Text = "찾기";
        btnBrowse.UseVisualStyleBackColor = false;
        btnBrowse.Click += BtnBrowse_Click;
        // 
        // chkCursor
        // 
        chkCursor.AutoSize = true;
        chkCursor.BackColor = Color.FromArgb(13, 13, 26);
        chkCursor.Checked = true;
        chkCursor.CheckState = CheckState.Checked;
        chkCursor.Cursor = Cursors.Hand;
        chkCursor.Font = new Font("Segoe UI", 9F);
        chkCursor.ForeColor = Color.FromArgb(248, 250, 252);
        chkCursor.Location = new Point(14, 582);
        chkCursor.Name = "chkCursor";
        chkCursor.Size = new Size(116, 19);
        chkCursor.TabIndex = 5;
        chkCursor.Text = "마우스 커서 포함";
        chkCursor.UseVisualStyleBackColor = false;
        // 
        // pnlRecord
        // 
        pnlRecord.BackColor = Color.FromArgb(22, 22, 40);
        pnlRecord.Controls.Add(btnRecord);
        pnlRecord.Controls.Add(lblTimer);
        pnlRecord.Location = new Point(14, 612);
        pnlRecord.Name = "pnlRecord";
        pnlRecord.Size = new Size(512, 64);
        pnlRecord.TabIndex = 6;
        // 
        // btnRecord
        // 
        btnRecord.BackColor = Color.FromArgb(34, 197, 94);
        btnRecord.Cursor = Cursors.Hand;
        btnRecord.FlatAppearance.BorderSize = 0;
        btnRecord.FlatStyle = FlatStyle.Flat;
        btnRecord.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
        btnRecord.ForeColor = Color.FromArgb(255, 255, 255);
        btnRecord.Location = new Point(10, 10);
        btnRecord.Name = "btnRecord";
        btnRecord.Size = new Size(342, 44);
        btnRecord.TabIndex = 0;
        btnRecord.Text = "● 녹화 시작";
        btnRecord.UseVisualStyleBackColor = false;
        btnRecord.Click += BtnRecord_Click;
        // 
        // lblTimer
        // 
        lblTimer.AutoSize = true;
        lblTimer.Font = new Font("Consolas", 16F, FontStyle.Bold);
        lblTimer.ForeColor = Color.FromArgb(248, 250, 252);
        lblTimer.Location = new Point(357, 17);
        lblTimer.Name = "lblTimer";
        lblTimer.Size = new Size(108, 26);
        lblTimer.TabIndex = 1;
        lblTimer.Text = "00:00:00";
        // 
        // lblStatus
        // 
        lblStatus.AutoSize = true;
        lblStatus.Font = new Font("Segoe UI", 8.5F);
        lblStatus.ForeColor = Color.FromArgb(148, 163, 184);
        lblStatus.Location = new Point(14, 684);
        lblStatus.Name = "lblStatus";
        lblStatus.Size = new Size(43, 15);
        lblStatus.TabIndex = 7;
        lblStatus.Text = "준비됨";
        // 
        // MainForm
        // 
        BackColor = Color.FromArgb(13, 13, 26);
        ClientSize = new Size(540, 758);
        Controls.Add(pnlTitle);
        Controls.Add(pnlSource);
        Controls.Add(pnlPreview);
        Controls.Add(pnlCodec);
        Controls.Add(pnlSettings);
        Controls.Add(chkCursor);
        Controls.Add(pnlRecord);
        Controls.Add(lblStatus);
        FormBorderStyle = FormBorderStyle.None;
        MinimumSize = new Size(540, 758);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "ScreenCamWin";
        Load += MainForm_Load;
        ((System.ComponentModel.ISupportInitialize)picAppIcon).EndInit();
        pnlTitle.ResumeLayout(false);
        pnlTitle.PerformLayout();
        pnlSource.ResumeLayout(false);
        pnlSource.PerformLayout();
        pnlPreview.ResumeLayout(false);
        pnlPreview.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)picPreview).EndInit();
        pnlCodec.ResumeLayout(false);
        pnlCodec.PerformLayout();
        pnlSettings.ResumeLayout(false);
        pnlSettings.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)trkFps).EndInit();
        ((System.ComponentModel.ISupportInitialize)trkQuality).EndInit();
        pnlRecord.ResumeLayout(false);
        pnlRecord.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }
}
