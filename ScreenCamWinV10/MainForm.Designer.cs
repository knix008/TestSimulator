namespace ScreenCamWin;

partial class MainForm
{
    private System.ComponentModel.IContainer components = null!;

    // ── Title bar ────────────────────────────────────────────────────────────
    private Panel  pnlTitle;
    private Label  lblAppName;
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
        components = new System.ComponentModel.Container();

        // ── instantiate ──────────────────────────────────────────────────────
        pnlTitle        = new Panel();
        lblAppName      = new Label();
        btnMinimize     = new Button();
        btnClose        = new Button();

        pnlSource       = new Panel();
        lblSourceTitle  = new Label();
        cboWindow       = new ComboBox();
        btnRefresh      = new Button();

        pnlPreview      = new Panel();
        lblPreviewTitle = new Label();
        btnTogglePreview= new Button();
        picPreview      = new PictureBox();

        pnlCodec        = new Panel();
        lblCodecTitle   = new Label();
        cboCodec        = new ComboBox();
        lblCodecStatus  = new Label();
        btnInstallCodec = new Button();

        pnlSettings     = new Panel();
        lblSettingsTitle= new Label();
        lblFps          = new Label();
        trkFps          = new TrackBar();
        lblFpsVal       = new Label();
        lblQuality      = new Label();
        trkQuality      = new TrackBar();
        lblQualityVal   = new Label();
        lblOutput       = new Label();
        txtOutput       = new TextBox();
        btnBrowse       = new Button();
        chkCursor       = new CheckBox();

        pnlRecord       = new Panel();
        btnRecord       = new Button();
        lblTimer        = new Label();
        lblStatus       = new Label();

        // ── load resources (icon via ComponentResourceManager → designer-editable) ──
        System.ComponentModel.ComponentResourceManager resources =
            new System.ComponentModel.ComponentResourceManager(typeof(MainForm));

        // ── suspend layout ───────────────────────────────────────────────────
        SuspendLayout();
        pnlTitle.SuspendLayout();
        pnlSource.SuspendLayout();
        pnlPreview.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)picPreview).BeginInit();
        pnlCodec.SuspendLayout();
        pnlSettings.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)trkFps).BeginInit();
        ((System.ComponentModel.ISupportInitialize)trkQuality).BeginInit();
        pnlRecord.SuspendLayout();

        // ════════════════════════════════════════════════════════════════════
        // Form
        // ════════════════════════════════════════════════════════════════════
        Name            = "MainForm";
        Text            = "ScreenCamWin";
        FormBorderStyle = FormBorderStyle.None;
        StartPosition   = FormStartPosition.CenterScreen;
        Size            = new Size(540, 758);
        MinimumSize     = new Size(540, 758);
        BackColor       = System.Drawing.Color.FromArgb(13, 13, 26);

        // ════════════════════════════════════════════════════════════════════
        // Title bar
        // ════════════════════════════════════════════════════════════════════
        pnlTitle.Dock      = DockStyle.Top;
        pnlTitle.Height    = 44;
        pnlTitle.BackColor = System.Drawing.Color.FromArgb(18, 18, 36);

        lblAppName.Text      = "⏺  ScreenCamWin";
        lblAppName.ForeColor = System.Drawing.Color.FromArgb(248, 250, 252);
        lblAppName.Font      = new System.Drawing.Font("Segoe UI", 11f, System.Drawing.FontStyle.Bold);
        lblAppName.AutoSize  = true;
        lblAppName.Location  = new Point(14, 11);

        btnMinimize.Text      = "─";
        btnMinimize.Size      = new Size(44, 44);
        btnMinimize.Location  = new Point(452, 0);
        btnMinimize.FlatStyle = FlatStyle.Flat;
        btnMinimize.ForeColor = System.Drawing.Color.FromArgb(148, 163, 184);
        btnMinimize.BackColor = System.Drawing.Color.Transparent;
        btnMinimize.FlatAppearance.BorderSize = 0;
        btnMinimize.Font   = new System.Drawing.Font("Segoe UI", 11f);
        btnMinimize.Cursor = Cursors.Hand;
        btnMinimize.Name   = "btnMinimize";

        btnClose.Text      = "✕";
        btnClose.Size      = new Size(44, 44);
        btnClose.Location  = new Point(496, 0);
        btnClose.FlatStyle = FlatStyle.Flat;
        btnClose.ForeColor = System.Drawing.Color.FromArgb(248, 250, 252);
        btnClose.BackColor = System.Drawing.Color.Transparent;
        btnClose.FlatAppearance.BorderSize          = 0;
        btnClose.FlatAppearance.MouseOverBackColor  = System.Drawing.Color.FromArgb(239, 68, 68);
        btnClose.Font   = new System.Drawing.Font("Segoe UI", 10f, System.Drawing.FontStyle.Bold);
        btnClose.Cursor = Cursors.Hand;
        btnClose.Name   = "btnClose";

        pnlTitle.Controls.Add(lblAppName);
        pnlTitle.Controls.Add(btnMinimize);
        pnlTitle.Controls.Add(btnClose);

        // ════════════════════════════════════════════════════════════════════
        // Content panels layout helper: vertical stack starting at y=52
        // ════════════════════════════════════════════════════════════════════
        const int PAD = 14;
        const int CW  = 540 - PAD * 2;  // 512
        int y = 52;

        // ════════════════════════════════════════════════════════════════════
        // Source section
        // ════════════════════════════════════════════════════════════════════
        pnlSource.Location  = new Point(PAD, y);
        pnlSource.Size      = new Size(CW, 80);
        pnlSource.BackColor = System.Drawing.Color.FromArgb(22, 22, 40);

        lblSourceTitle.Text      = "캡처 대상";
        lblSourceTitle.ForeColor = System.Drawing.Color.FromArgb(99, 102, 241);
        lblSourceTitle.Font      = new System.Drawing.Font("Segoe UI", 8f, System.Drawing.FontStyle.Bold);
        lblSourceTitle.AutoSize  = true;
        lblSourceTitle.Location  = new Point(10, 10);

        cboWindow.Location        = new Point(10, 30);
        cboWindow.Size            = new Size(CW - 96, 30);
        cboWindow.DropDownStyle   = ComboBoxStyle.DropDownList;
        cboWindow.BackColor       = System.Drawing.Color.FromArgb(30, 30, 52);
        cboWindow.ForeColor       = System.Drawing.Color.FromArgb(248, 250, 252);
        cboWindow.FlatStyle       = FlatStyle.Flat;
        cboWindow.Font            = new System.Drawing.Font("Segoe UI", 9f);
        cboWindow.Name            = "cboWindow";

        btnRefresh.Text      = "↻ 새로고침";
        btnRefresh.Location  = new Point(CW - 82, 30);
        btnRefresh.Size      = new Size(82, 30);
        btnRefresh.FlatStyle = FlatStyle.Flat;
        btnRefresh.BackColor = System.Drawing.Color.FromArgb(30, 30, 52);
        btnRefresh.ForeColor = System.Drawing.Color.FromArgb(148, 163, 184);
        btnRefresh.FlatAppearance.BorderSize  = 1;
        btnRefresh.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(51, 65, 85);
        btnRefresh.Font   = new System.Drawing.Font("Segoe UI", 8.5f);
        btnRefresh.Cursor = Cursors.Hand;
        btnRefresh.Name   = "btnRefresh";

        pnlSource.Controls.Add(lblSourceTitle);
        pnlSource.Controls.Add(cboWindow);
        pnlSource.Controls.Add(btnRefresh);

        y += pnlSource.Height + 8;

        // ════════════════════════════════════════════════════════════════════
        // Preview section
        // ════════════════════════════════════════════════════════════════════
        pnlPreview.Location  = new Point(PAD, y);
        pnlPreview.Size      = new Size(CW, 170);
        pnlPreview.BackColor = System.Drawing.Color.FromArgb(22, 22, 40);

        lblPreviewTitle.Text      = "미리보기";
        lblPreviewTitle.ForeColor = System.Drawing.Color.FromArgb(99, 102, 241);
        lblPreviewTitle.Font      = new System.Drawing.Font("Segoe UI", 8f, System.Drawing.FontStyle.Bold);
        lblPreviewTitle.AutoSize  = true;
        lblPreviewTitle.Location  = new Point(10, 10);

        btnTogglePreview.Text      = "켜기";
        btnTogglePreview.Size      = new Size(54, 22);
        btnTogglePreview.Location  = new Point(CW - 64, 7);
        btnTogglePreview.FlatStyle = FlatStyle.Flat;
        btnTogglePreview.BackColor = System.Drawing.Color.FromArgb(30, 30, 52);
        btnTogglePreview.ForeColor = System.Drawing.Color.FromArgb(148, 163, 184);
        btnTogglePreview.FlatAppearance.BorderSize  = 1;
        btnTogglePreview.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(51, 65, 85);
        btnTogglePreview.Font   = new System.Drawing.Font("Segoe UI", 8f);
        btnTogglePreview.Cursor = Cursors.Hand;
        btnTogglePreview.Name   = "btnTogglePreview";

        picPreview.Location    = new Point(10, 34);
        picPreview.Size        = new Size(CW - 20, 126);
        picPreview.BorderStyle = BorderStyle.None;
        picPreview.BackColor   = System.Drawing.Color.FromArgb(13, 13, 26);
        picPreview.SizeMode    = PictureBoxSizeMode.Zoom;
        picPreview.Name        = "picPreview";

        pnlPreview.Controls.Add(lblPreviewTitle);
        pnlPreview.Controls.Add(btnTogglePreview);
        pnlPreview.Controls.Add(picPreview);

        y += pnlPreview.Height + 8;

        // ════════════════════════════════════════════════════════════════════
        // Codec section
        // ════════════════════════════════════════════════════════════════════
        pnlCodec.Location  = new Point(PAD, y);
        pnlCodec.Size      = new Size(CW, 80);
        pnlCodec.BackColor = System.Drawing.Color.FromArgb(22, 22, 40);

        lblCodecTitle.Text      = "비디오 코덱";
        lblCodecTitle.ForeColor = System.Drawing.Color.FromArgb(99, 102, 241);
        lblCodecTitle.Font      = new System.Drawing.Font("Segoe UI", 8f, System.Drawing.FontStyle.Bold);
        lblCodecTitle.AutoSize  = true;
        lblCodecTitle.Location  = new Point(10, 10);

        cboCodec.Location      = new Point(10, 30);
        cboCodec.Size          = new Size(200, 30);
        cboCodec.DropDownStyle = ComboBoxStyle.DropDownList;
        cboCodec.BackColor     = System.Drawing.Color.FromArgb(30, 30, 52);
        cboCodec.ForeColor     = System.Drawing.Color.FromArgb(248, 250, 252);
        cboCodec.FlatStyle     = FlatStyle.Flat;
        cboCodec.Font          = new System.Drawing.Font("Segoe UI", 9f);
        cboCodec.Name          = "cboCodec";

        lblCodecStatus.Text      = "● 사용 가능";
        lblCodecStatus.ForeColor = System.Drawing.Color.FromArgb(34, 197, 94);
        lblCodecStatus.Font      = new System.Drawing.Font("Segoe UI", 8.5f);
        lblCodecStatus.AutoSize  = true;
        lblCodecStatus.Anchor    = AnchorStyles.Top | AnchorStyles.Left;
        lblCodecStatus.Location  = new Point(218, 36);
        lblCodecStatus.Name      = "lblCodecStatus";

        btnInstallCodec.Text      = "설치";
        btnInstallCodec.Size      = new Size(72, 30);
        btnInstallCodec.Location  = new Point(CW - 82, 30);
        btnInstallCodec.FlatStyle = FlatStyle.Flat;
        btnInstallCodec.BackColor = System.Drawing.Color.FromArgb(99, 102, 241);
        btnInstallCodec.ForeColor = System.Drawing.Color.FromArgb(248, 250, 252);
        btnInstallCodec.FlatAppearance.BorderSize = 0;
        btnInstallCodec.Font      = new System.Drawing.Font("Segoe UI", 8.5f);
        btnInstallCodec.Cursor    = Cursors.Hand;
        btnInstallCodec.Visible   = false;
        btnInstallCodec.Name      = "btnInstallCodec";

        pnlCodec.Controls.Add(lblCodecTitle);
        pnlCodec.Controls.Add(cboCodec);
        pnlCodec.Controls.Add(lblCodecStatus);
        pnlCodec.Controls.Add(btnInstallCodec);

        y += pnlCodec.Height + 8;

        // ════════════════════════════════════════════════════════════════════
        // Settings section
        // ════════════════════════════════════════════════════════════════════
        pnlSettings.Location  = new Point(PAD, y);
        pnlSettings.Size      = new Size(CW, 168);
        pnlSettings.BackColor = System.Drawing.Color.FromArgb(22, 22, 40);

        lblSettingsTitle.Text      = "녹화 설정";
        lblSettingsTitle.ForeColor = System.Drawing.Color.FromArgb(99, 102, 241);
        lblSettingsTitle.Font      = new System.Drawing.Font("Segoe UI", 8f, System.Drawing.FontStyle.Bold);
        lblSettingsTitle.AutoSize  = true;
        lblSettingsTitle.Location  = new Point(10, 10);

        // FPS row
        lblFps.Text      = "FPS";
        lblFps.ForeColor = System.Drawing.Color.FromArgb(148, 163, 184);
        lblFps.Font      = new System.Drawing.Font("Segoe UI", 8.5f);
        lblFps.AutoSize  = true;
        lblFps.Location  = new Point(10, 40);

        trkFps.Location    = new Point(60, 34);
        trkFps.Size        = new Size(CW - 130, 28);
        trkFps.Minimum     = 5;
        trkFps.Maximum     = 60;
        trkFps.Value       = 30;
        trkFps.TickStyle   = TickStyle.None;
        trkFps.BackColor   = System.Drawing.Color.FromArgb(22, 22, 40);
        trkFps.Name        = "trkFps";

        lblFpsVal.Text      = "30 fps";
        lblFpsVal.ForeColor = System.Drawing.Color.FromArgb(248, 250, 252);
        lblFpsVal.Font      = new System.Drawing.Font("Segoe UI", 8.5f, System.Drawing.FontStyle.Bold);
        lblFpsVal.AutoSize  = true;
        lblFpsVal.Anchor    = AnchorStyles.Top | AnchorStyles.Right;
        lblFpsVal.Location  = new Point(CW - 58, 40);
        lblFpsVal.Name      = "lblFpsVal";

        // Quality row
        lblQuality.Text      = "화질";
        lblQuality.ForeColor = System.Drawing.Color.FromArgb(148, 163, 184);
        lblQuality.Font      = new System.Drawing.Font("Segoe UI", 8.5f);
        lblQuality.AutoSize  = true;
        lblQuality.Location  = new Point(10, 76);

        trkQuality.Location  = new Point(60, 70);
        trkQuality.Size      = new Size(CW - 130, 28);
        trkQuality.Minimum   = 10;
        trkQuality.Maximum   = 100;
        trkQuality.Value     = 70;
        trkQuality.TickStyle = TickStyle.None;
        trkQuality.BackColor = System.Drawing.Color.FromArgb(22, 22, 40);
        trkQuality.Name      = "trkQuality";

        lblQualityVal.Text      = "70%";
        lblQualityVal.ForeColor = System.Drawing.Color.FromArgb(248, 250, 252);
        lblQualityVal.Font      = new System.Drawing.Font("Segoe UI", 8.5f, System.Drawing.FontStyle.Bold);
        lblQualityVal.AutoSize  = true;
        lblQualityVal.Anchor    = AnchorStyles.Top | AnchorStyles.Right;
        lblQualityVal.Location  = new Point(CW - 58, 76);
        lblQualityVal.Name      = "lblQualityVal";

        // Output path row (extra height avoids DPI text clipping)
        lblOutput.Text      = "저장 경로";
        lblOutput.ForeColor = System.Drawing.Color.FromArgb(148, 163, 184);
        lblOutput.Font      = new System.Drawing.Font("Segoe UI", 9f);
        lblOutput.AutoSize  = true;
        lblOutput.Location  = new Point(10, 120);

        txtOutput.Location    = new Point(78, 114);
        txtOutput.Size        = new Size(CW - 160, 34);
        txtOutput.BackColor   = System.Drawing.Color.FromArgb(30, 30, 52);
        txtOutput.ForeColor   = System.Drawing.Color.FromArgb(248, 250, 252);
        txtOutput.BorderStyle = BorderStyle.FixedSingle;
        txtOutput.Font        = new System.Drawing.Font("Segoe UI", 9f);
        txtOutput.Name        = "txtOutput";

        btnBrowse.Text      = "찾기";
        btnBrowse.Location  = new Point(CW - 76, 114);
        btnBrowse.Size      = new Size(66, 34);
        btnBrowse.FlatStyle = FlatStyle.Flat;
        btnBrowse.BackColor = System.Drawing.Color.FromArgb(30, 30, 52);
        btnBrowse.ForeColor = System.Drawing.Color.FromArgb(148, 163, 184);
        btnBrowse.FlatAppearance.BorderSize  = 1;
        btnBrowse.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(51, 65, 85);
        btnBrowse.Font   = new System.Drawing.Font("Segoe UI", 8f);
        btnBrowse.Cursor = Cursors.Hand;
        btnBrowse.Name   = "btnBrowse";

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

        y += pnlSettings.Height + 8;

        // cursor checkbox — BackColor must NOT be Transparent on a dark form;
        // Transparent + FlatStyle.Flat breaks WinForms hit-test on dark backgrounds.
        chkCursor.Text      = "마우스 커서 포함";
        chkCursor.ForeColor = System.Drawing.Color.FromArgb(248, 250, 252);
        chkCursor.BackColor = System.Drawing.Color.FromArgb(13, 13, 26); // same as form BG
        chkCursor.FlatStyle = FlatStyle.Standard;
        chkCursor.Font      = new System.Drawing.Font("Segoe UI", 9f);
        chkCursor.Checked   = true;
        chkCursor.Location  = new Point(PAD, y);
        chkCursor.AutoSize  = true;
        chkCursor.Cursor    = Cursors.Hand;
        chkCursor.Name      = "chkCursor";

        y += 30;

        // ════════════════════════════════════════════════════════════════════
        // Record section
        // ════════════════════════════════════════════════════════════════════
        pnlRecord.Location  = new Point(PAD, y);
        pnlRecord.Size      = new Size(CW, 64);
        pnlRecord.BackColor = System.Drawing.Color.FromArgb(22, 22, 40);

        btnRecord.Text      = "● 녹화 시작";
        btnRecord.Location  = new Point(10, 10);
        btnRecord.Size      = new Size(CW - 170, 44);
        btnRecord.FlatStyle = FlatStyle.Flat;
        btnRecord.BackColor = System.Drawing.Color.FromArgb(34, 197, 94);
        btnRecord.ForeColor = System.Drawing.Color.FromArgb(255, 255, 255);
        btnRecord.FlatAppearance.BorderSize = 0;
        btnRecord.Font      = new System.Drawing.Font("Segoe UI", 12f, System.Drawing.FontStyle.Bold);
        btnRecord.Cursor    = Cursors.Hand;
        btnRecord.Name      = "btnRecord";

        lblTimer.Text      = "00:00:00";
        lblTimer.ForeColor = System.Drawing.Color.FromArgb(248, 250, 252);
        lblTimer.Font      = new System.Drawing.Font("Consolas", 16f, System.Drawing.FontStyle.Bold);
        lblTimer.AutoSize  = true;
        lblTimer.Location  = new Point(CW - 155, 17);
        lblTimer.Name      = "lblTimer";

        pnlRecord.Controls.Add(btnRecord);
        pnlRecord.Controls.Add(lblTimer);

        y += pnlRecord.Height + 8;

        // ── Status label ──────────────────────────────────────────────────
        lblStatus.Text      = "준비됨";
        lblStatus.ForeColor = System.Drawing.Color.FromArgb(148, 163, 184);
        lblStatus.Font      = new System.Drawing.Font("Segoe UI", 8.5f);
        lblStatus.AutoSize  = true;
        lblStatus.Location  = new Point(PAD, y);
        lblStatus.Name      = "lblStatus";

        // ════════════════════════════════════════════════════════════════════
        // Add everything to the form
        // ════════════════════════════════════════════════════════════════════
        Controls.Add(pnlTitle);
        Controls.Add(pnlSource);
        Controls.Add(pnlPreview);
        Controls.Add(pnlCodec);
        Controls.Add(pnlSettings);
        Controls.Add(chkCursor);
        Controls.Add(pnlRecord);
        Controls.Add(lblStatus);

        // ── wire up events ───────────────────────────────────────────────────
        btnClose.Click          += BtnClose_Click;
        btnMinimize.Click       += BtnMinimize_Click;
        pnlTitle.MouseDown      += TitleBar_MouseDown;
        pnlTitle.MouseMove      += TitleBar_MouseMove;
        lblAppName.MouseDown    += TitleBar_MouseDown;
        lblAppName.MouseMove    += TitleBar_MouseMove;
        btnRefresh.Click        += BtnRefresh_Click;
        btnTogglePreview.Click  += BtnTogglePreview_Click;
        cboCodec.SelectedIndexChanged += CboCodec_SelectedIndexChanged;
        btnInstallCodec.Click   += BtnInstallCodec_Click;
        trkFps.ValueChanged     += TrkFps_ValueChanged;
        trkQuality.ValueChanged += TrkQuality_ValueChanged;
        btnBrowse.Click         += BtnBrowse_Click;
        btnRecord.Click         += BtnRecord_Click;
        Load                    += MainForm_Load;

        // ── resume layout ────────────────────────────────────────────────────
        ((System.ComponentModel.ISupportInitialize)trkFps).EndInit();
        ((System.ComponentModel.ISupportInitialize)trkQuality).EndInit();
        ((System.ComponentModel.ISupportInitialize)picPreview).EndInit();
        pnlRecord.ResumeLayout(false);
        pnlSettings.ResumeLayout(false);
        pnlCodec.ResumeLayout(false);
        pnlPreview.ResumeLayout(false);
        pnlSource.ResumeLayout(false);
        pnlTitle.ResumeLayout(false);
        ResumeLayout(false);
    }
}
