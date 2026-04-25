using LibVLCSharp.WinForms;

namespace VideoPlayerV10.App;

partial class MainForm
{
    private System.ComponentModel.IContainer components = null!;
    private TableLayoutPanel rootLayout;
    private Panel headerPanel;
    private Label titleLabel;
    private Label subtitleLabel;
    private Panel playerHostPanel;
    private VideoView videoView;
    private Panel controlPanel;
    private Button openFileButton;
    private TextBox inputTextBox;
    private Button playButton;
    private Button pauseButton;
    private Button stopButton;
    private Button downloadButton;
    private SeekBarControl seekBar;
    private Label timeLabel;
    private Label volumeLabel;
    private TrackBar volumeBar;
    private Label volumeValueLabel;
    private Label speedLabel;
    private ComboBox speedComboBox;
    private Panel statusPanel;
    private Label statusLabel;
    private Label mediaInfoLabel;
    private System.Windows.Forms.Timer updateTimer;
    private PictureBox playPauseIconPictureBox;
    private System.Windows.Forms.Timer iconFadeTimer;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
        {
            components.Dispose();
        }

        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MainForm));
        rootLayout = new TableLayoutPanel();
        headerPanel = new Panel();
        subtitleLabel = new Label();
        titleLabel = new Label();
        playerHostPanel = new Panel();
        videoView = new VideoView();
        playPauseIconPictureBox = new PictureBox();
        controlPanel = new Panel();
        volumeValueLabel = new Label();
        speedComboBox = new ComboBox();
        speedLabel = new Label();
        volumeBar = new TrackBar();
        volumeLabel = new Label();
        timeLabel = new Label();
        seekBar = new SeekBarControl();
        stopButton = new Button();
        pauseButton = new Button();
        playButton = new Button();
        downloadButton = new Button();
        inputTextBox = new TextBox();
        openFileButton = new Button();
        statusPanel = new Panel();
        mediaInfoLabel = new Label();
        statusLabel = new Label();
        updateTimer = new System.Windows.Forms.Timer(components);
        iconFadeTimer = new System.Windows.Forms.Timer(components);
        rootLayout.SuspendLayout();
        headerPanel.SuspendLayout();
        playerHostPanel.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)videoView).BeginInit();
        controlPanel.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)volumeBar).BeginInit();
        ((System.ComponentModel.ISupportInitialize)playPauseIconPictureBox).BeginInit();
        statusPanel.SuspendLayout();
        SuspendLayout();
        // 
        // rootLayout
        // 
        rootLayout.BackColor = Color.FromArgb(245, 247, 250);
        rootLayout.ColumnCount = 1;
        rootLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        rootLayout.Controls.Add(headerPanel, 0, 0);
        rootLayout.Controls.Add(playerHostPanel, 0, 1);
        rootLayout.Controls.Add(controlPanel, 0, 2);
        rootLayout.Controls.Add(statusPanel, 0, 3);
        rootLayout.Dock = DockStyle.Fill;
        rootLayout.Location = new Point(0, 0);
        rootLayout.Name = "rootLayout";
        rootLayout.RowCount = 4;
        rootLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 72F));
        rootLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        rootLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 140F));
        rootLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 52F));
        rootLayout.Size = new Size(1200, 760);
        rootLayout.TabIndex = 0;
        // 
        // headerPanel
        // 
        headerPanel.BackColor = Color.White;
        headerPanel.Controls.Add(subtitleLabel);
        headerPanel.Controls.Add(titleLabel);
        headerPanel.Dock = DockStyle.Fill;
        headerPanel.Location = new Point(12, 8);
        headerPanel.Margin = new Padding(12, 8, 12, 6);
        headerPanel.Name = "headerPanel";
        headerPanel.Padding = new Padding(14, 10, 14, 6);
        headerPanel.Size = new Size(1176, 58);
        headerPanel.TabIndex = 0;
        // 
        // subtitleLabel
        // 
        subtitleLabel.AutoSize = true;
        subtitleLabel.Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point, 129);
        subtitleLabel.ForeColor = Color.FromArgb(94, 102, 113);
        subtitleLabel.Location = new Point(16, 33);
        subtitleLabel.Name = "subtitleLabel";
        subtitleLabel.Size = new Size(186, 15);
        subtitleLabel.TabIndex = 1;
        subtitleLabel.Text = "Files, RTSP, HTTP/HLS, YouTube...";
        // 
        // titleLabel
        // 
        titleLabel.AutoSize = true;
        titleLabel.Font = new Font("Segoe UI Semibold", 12F, FontStyle.Bold, GraphicsUnit.Point, 129);
        titleLabel.ForeColor = Color.FromArgb(32, 37, 45);
        titleLabel.Location = new Point(14, 8);
        titleLabel.Name = "titleLabel";
        titleLabel.Size = new Size(157, 21);
        titleLabel.TabIndex = 0;
        titleLabel.Text = "Video Stream Player";
        // 
        // playerHostPanel
        // 
        playerHostPanel.BackColor = Color.FromArgb(24, 26, 29);
        playerHostPanel.Controls.Add(playPauseIconPictureBox);
        playerHostPanel.Controls.Add(videoView);
        playerHostPanel.Dock = DockStyle.Fill;
        playerHostPanel.Location = new Point(12, 78);
        playerHostPanel.Margin = new Padding(12, 6, 12, 8);
        playerHostPanel.Name = "playerHostPanel";
        playerHostPanel.Padding = new Padding(1);
        playerHostPanel.Size = new Size(1176, 524);
        playerHostPanel.TabIndex = 1;
        // 
        // videoView
        // 
        videoView.BackColor = Color.Black;
        videoView.Dock = DockStyle.Fill;
        videoView.Location = new Point(1, 1);
        videoView.MediaPlayer = null;
        videoView.Name = "videoView";
        videoView.Size = new Size(1174, 522);
        videoView.TabIndex = 0;
        videoView.Text = "videoView";
        videoView.MouseClick += VideoView_MouseClick;
        // 
        // playPauseIconPictureBox
        // 
        playPauseIconPictureBox.Anchor = AnchorStyles.None;
        playPauseIconPictureBox.BackColor = Color.Transparent;
        playPauseIconPictureBox.Location = new Point(487, 201);
        playPauseIconPictureBox.Name = "playPauseIconPictureBox";
        playPauseIconPictureBox.Size = new Size(200, 200);
        playPauseIconPictureBox.SizeMode = PictureBoxSizeMode.CenterImage;
        playPauseIconPictureBox.TabIndex = 1;
        playPauseIconPictureBox.TabStop = false;
        playPauseIconPictureBox.Visible = false;
        playPauseIconPictureBox.Click += PlayPauseIcon_Click;
        // 
        // controlPanel
        // 
        controlPanel.BackColor = Color.White;
        controlPanel.Controls.Add(volumeValueLabel);
        controlPanel.Controls.Add(speedComboBox);
        controlPanel.Controls.Add(speedLabel);
        controlPanel.Controls.Add(volumeBar);
        controlPanel.Controls.Add(volumeLabel);
        controlPanel.Controls.Add(timeLabel);
        controlPanel.Controls.Add(seekBar);
        controlPanel.Controls.Add(stopButton);
        controlPanel.Controls.Add(pauseButton);
        controlPanel.Controls.Add(playButton);
        controlPanel.Controls.Add(downloadButton);
        controlPanel.Controls.Add(inputTextBox);
        controlPanel.Controls.Add(openFileButton);
        controlPanel.Dock = DockStyle.Fill;
        controlPanel.Location = new Point(12, 618);
        controlPanel.Margin = new Padding(12, 8, 12, 6);
        controlPanel.Name = "controlPanel";
        controlPanel.Padding = new Padding(12);
        controlPanel.Size = new Size(1176, 126);
        controlPanel.TabIndex = 2;
        // 
        // volumeValueLabel
        // 
        volumeValueLabel.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        volumeValueLabel.AutoSize = true;
        volumeValueLabel.ForeColor = Color.FromArgb(94, 102, 113);
        volumeValueLabel.Location = new Point(1118, 67);
        volumeValueLabel.Name = "volumeValueLabel";
        volumeValueLabel.Size = new Size(31, 15);
        volumeValueLabel.TabIndex = 11;
        volumeValueLabel.Text = "80%";
        // 
        // speedComboBox
        // 
        speedComboBox.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        speedComboBox.DropDownStyle = ComboBoxStyle.DropDownList;
        speedComboBox.FormattingEnabled = true;
        speedComboBox.Items.AddRange(new object[] { "0.5x", "0.75x", "1.0x", "1.25x", "1.5x", "2.0x" });
        speedComboBox.Location = new Point(965, 67);
        speedComboBox.Name = "speedComboBox";
        speedComboBox.Size = new Size(99, 23);
        speedComboBox.TabIndex = 10;
        speedComboBox.SelectedIndexChanged += SpeedComboBox_SelectedIndexChanged;
        // 
        // speedLabel
        // 
        speedLabel.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        speedLabel.AutoSize = true;
        speedLabel.ForeColor = Color.FromArgb(94, 102, 113);
        speedLabel.Location = new Point(910, 71);
        speedLabel.Name = "speedLabel";
        speedLabel.Size = new Size(40, 15);
        speedLabel.TabIndex = 9;
        speedLabel.Text = "Speed";
        // 
        // volumeBar
        // 
        volumeBar.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        volumeBar.AutoSize = false;
        volumeBar.Location = new Point(1070, 38);
        volumeBar.Maximum = 100;
        volumeBar.Name = "volumeBar";
        volumeBar.Size = new Size(99, 26);
        volumeBar.TabIndex = 8;
        volumeBar.TickFrequency = 10;
        volumeBar.Value = 80;
        volumeBar.Scroll += VolumeBar_Scroll;
        // 
        // volumeLabel
        // 
        volumeLabel.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        volumeLabel.AutoSize = true;
        volumeLabel.ForeColor = Color.FromArgb(94, 102, 113);
        volumeLabel.Location = new Point(1070, 19);
        volumeLabel.Name = "volumeLabel";
        volumeLabel.Size = new Size(52, 15);
        volumeLabel.TabIndex = 7;
        volumeLabel.Text = "Volume:";
        // 
        // timeLabel
        // 
        timeLabel.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        timeLabel.AutoSize = true;
        timeLabel.ForeColor = Color.FromArgb(94, 102, 113);
        timeLabel.Location = new Point(742, 69);
        timeLabel.Name = "timeLabel";
        timeLabel.Size = new Size(82, 15);
        timeLabel.TabIndex = 6;
        timeLabel.Text = "00:00 / 00:00";
        // 
        // seekBar
        // 
        seekBar.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        seekBar.BackColor = Color.White;
        seekBar.Location = new Point(12, 62);
        seekBar.Name = "seekBar";
        seekBar.Size = new Size(724, 30);
        seekBar.TabIndex = 5;
        seekBar.MouseDown += SeekBar_MouseDown;
        seekBar.MouseUp += SeekBar_MouseUp;
        // 
        // downloadButton
        // 
        downloadButton.Anchor = AnchorStyles.Top | AnchorStyles.Left;
        downloadButton.BackColor = Color.FromArgb(156, 163, 175);
        downloadButton.FlatAppearance.BorderSize = 0;
        downloadButton.FlatStyle = FlatStyle.Flat;
        downloadButton.Font = new Font("Segoe UI", 8.5F, FontStyle.Regular, GraphicsUnit.Point, 129);
        downloadButton.ForeColor = Color.White;
        downloadButton.Location = new Point(12, 98);
        downloadButton.Name = "downloadButton";
        downloadButton.Size = new Size(110, 26);
        downloadButton.TabIndex = 12;
        downloadButton.Text = "⬇ Download";
        downloadButton.UseVisualStyleBackColor = false;
        downloadButton.Click += DownloadButton_Click;
        // 
        // stopButton
        // 
        stopButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        stopButton.BackColor = Color.FromArgb(244, 246, 248);
        stopButton.FlatAppearance.BorderColor = Color.FromArgb(220, 224, 228);
        stopButton.FlatStyle = FlatStyle.Flat;
        stopButton.Font = new Font("Segoe UI Symbol", 16F, FontStyle.Regular, GraphicsUnit.Point, 129);
        stopButton.Location = new Point(924, 12);
        stopButton.Name = "stopButton";
        stopButton.Size = new Size(80, 36);
        stopButton.TabIndex = 4;
        stopButton.Text = "⏹";
        stopButton.UseVisualStyleBackColor = false;
        stopButton.Click += StopButton_Click;
        // 
        // pauseButton
        // 
        pauseButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        pauseButton.BackColor = Color.FromArgb(244, 246, 248);
        pauseButton.FlatAppearance.BorderColor = Color.FromArgb(220, 224, 228);
        pauseButton.FlatStyle = FlatStyle.Flat;
        pauseButton.Font = new Font("Segoe UI Symbol", 16F, FontStyle.Regular, GraphicsUnit.Point, 129);
        pauseButton.Location = new Point(838, 12);
        pauseButton.Name = "pauseButton";
        pauseButton.Size = new Size(80, 36);
        pauseButton.TabIndex = 3;
        pauseButton.Text = "⏸";
        pauseButton.UseVisualStyleBackColor = false;
        pauseButton.Click += PauseButton_Click;
        // 
        // playButton
        // 
        playButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        playButton.BackColor = Color.FromArgb(28, 132, 246);
        playButton.FlatAppearance.BorderSize = 0;
        playButton.FlatStyle = FlatStyle.Flat;
        playButton.Font = new Font("Segoe UI Symbol", 11F, FontStyle.Regular, GraphicsUnit.Point, 129);
        playButton.ForeColor = Color.White;
        playButton.Location = new Point(752, 12);
        playButton.Name = "playButton";
        playButton.Size = new Size(80, 36);
        playButton.TabIndex = 2;
        playButton.Text = "▶";
        playButton.UseVisualStyleBackColor = false;
        playButton.Click += PlayButton_Click;
        // 
        // inputTextBox
        // 
        inputTextBox.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        inputTextBox.BorderStyle = BorderStyle.FixedSingle;
        inputTextBox.Location = new Point(132, 18);
        inputTextBox.Name = "inputTextBox";
        inputTextBox.PlaceholderText = "Enter file path / RTSP URL / YouTube URL";
        inputTextBox.Size = new Size(612, 23);
        inputTextBox.TabIndex = 1;
        inputTextBox.TextChanged += InputTextBox_TextChanged;
        // 
        // openFileButton
        // 
        openFileButton.BackColor = Color.FromArgb(244, 246, 248);
        openFileButton.FlatAppearance.BorderColor = Color.FromArgb(220, 224, 228);
        openFileButton.FlatStyle = FlatStyle.Flat;
        openFileButton.Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point, 129);
        openFileButton.Location = new Point(12, 12);
        openFileButton.Name = "openFileButton";
        openFileButton.Size = new Size(110, 36);
        openFileButton.TabIndex = 0;
        openFileButton.Text = "Open File";
        openFileButton.UseVisualStyleBackColor = false;
        openFileButton.Click += OpenFileButton_Click;
        // 
        // statusPanel
        // 
        statusPanel.BackColor = Color.White;
        statusPanel.Controls.Add(mediaInfoLabel);
        statusPanel.Controls.Add(statusLabel);
        statusPanel.Dock = DockStyle.Fill;
        statusPanel.Location = new Point(12, 732);
        statusPanel.Margin = new Padding(12, 6, 12, 8);
        statusPanel.Name = "statusPanel";
        statusPanel.Padding = new Padding(12, 8, 12, 8);
        statusPanel.Size = new Size(1176, 38);
        statusPanel.TabIndex = 3;
        // 
        // mediaInfoLabel
        // 
        mediaInfoLabel.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        mediaInfoLabel.AutoSize = true;
        mediaInfoLabel.ForeColor = Color.FromArgb(94, 102, 113);
        mediaInfoLabel.Location = new Point(217, 3);
        mediaInfoLabel.Name = "mediaInfoLabel";
        mediaInfoLabel.Size = new Size(308, 15);
        mediaInfoLabel.TabIndex = 1;
        mediaInfoLabel.Text = "Codec: -  Bitrate: -  Resolution: -  FPS: -  Playback: 1.0x";
        mediaInfoLabel.TextAlign = ContentAlignment.MiddleRight;
        // 
        // statusLabel
        // 
        statusLabel.AutoSize = true;
        statusLabel.ForeColor = Color.FromArgb(94, 102, 113);
        statusLabel.Location = new Point(12, 1);
        statusLabel.Name = "statusLabel";
        statusLabel.Size = new Size(160, 15);
        statusLabel.TabIndex = 0;
        statusLabel.Text = "Ready - Select media source";
        // 
        // updateTimer
        // 
        updateTimer.Interval = 500;
        updateTimer.Tick += UpdateTimer_Tick;
        // 
        // iconFadeTimer
        // 
        iconFadeTimer.Interval = 800;
        iconFadeTimer.Tick += IconFadeTimer_Tick;
        // 
        // MainForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        BackColor = Color.FromArgb(245, 247, 250);
        ClientSize = new Size(1200, 760);
        Controls.Add(rootLayout);
        Icon = (Icon)resources.GetObject("$this.Icon");
        KeyPreview = true;
        MinimumSize = new Size(900, 560);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "My Video Player";
        KeyDown += MainForm_KeyDown;
        rootLayout.ResumeLayout(false);
        headerPanel.ResumeLayout(false);
        headerPanel.PerformLayout();
        playerHostPanel.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)videoView).EndInit();
        controlPanel.ResumeLayout(false);
        controlPanel.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)volumeBar).EndInit();
        statusPanel.ResumeLayout(false);
        statusPanel.PerformLayout();
        ResumeLayout(false);
    }
}
