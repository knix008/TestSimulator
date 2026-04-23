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
    private TrackBar seekBar;
    private Label timeLabel;
    private Label volumeLabel;
    private TrackBar volumeBar;
    private Label speedLabel;
    private ComboBox speedComboBox;
    private Panel statusPanel;
    private Label statusLabel;
    private Label mediaInfoLabel;
    private System.Windows.Forms.Timer updateTimer;

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
        rootLayout = new TableLayoutPanel();
        headerPanel = new Panel();
        titleLabel = new Label();
        subtitleLabel = new Label();
        playerHostPanel = new Panel();
        videoView = new VideoView();
        controlPanel = new Panel();
        openFileButton = new Button();
        inputTextBox = new TextBox();
        playButton = new Button();
        pauseButton = new Button();
        stopButton = new Button();
        seekBar = new TrackBar();
        timeLabel = new Label();
        volumeLabel = new Label();
        volumeBar = new TrackBar();
        speedLabel = new Label();
        speedComboBox = new ComboBox();
        statusPanel = new Panel();
        statusLabel = new Label();
        mediaInfoLabel = new Label();
        updateTimer = new System.Windows.Forms.Timer(components);
        rootLayout.SuspendLayout();
        headerPanel.SuspendLayout();
        playerHostPanel.SuspendLayout();
        controlPanel.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)seekBar).BeginInit();
        ((System.ComponentModel.ISupportInitialize)volumeBar).BeginInit();
        statusPanel.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)videoView).BeginInit();
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
        rootLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 110F));
        rootLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34F));
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
        // titleLabel
        // 
        titleLabel.AutoSize = true;
        titleLabel.Font = new Font("Segoe UI Semibold", 12F, FontStyle.Bold, GraphicsUnit.Point, 129);
        titleLabel.ForeColor = Color.FromArgb(32, 37, 45);
        titleLabel.Location = new Point(14, 8);
        titleLabel.Name = "titleLabel";
        titleLabel.Size = new Size(205, 21);
        titleLabel.TabIndex = 0;
        titleLabel.Text = "Video Player V10 (Modern)";
        // 
        // subtitleLabel
        // 
        subtitleLabel.AutoSize = true;
        subtitleLabel.Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point, 129);
        subtitleLabel.ForeColor = Color.FromArgb(94, 102, 113);
        subtitleLabel.Location = new Point(16, 33);
        subtitleLabel.Name = "subtitleLabel";
        subtitleLabel.Size = new Size(324, 15);
        subtitleLabel.TabIndex = 1;
        subtitleLabel.Text = "Files, RTSP, HTTP/HLS, YouTube (Designer-editable UI)";
        // 
        // playerHostPanel
        // 
        playerHostPanel.BackColor = Color.FromArgb(24, 26, 29);
        playerHostPanel.Controls.Add(videoView);
        playerHostPanel.Dock = DockStyle.Fill;
        playerHostPanel.Location = new Point(12, 78);
        playerHostPanel.Margin = new Padding(12, 6, 12, 8);
        playerHostPanel.Name = "playerHostPanel";
        playerHostPanel.Padding = new Padding(1);
        playerHostPanel.Size = new Size(1176, 562);
        playerHostPanel.TabIndex = 1;
        // 
        // videoView
        // 
        videoView.BackColor = Color.Black;
        videoView.Dock = DockStyle.Fill;
        videoView.Location = new Point(1, 1);
        videoView.Name = "videoView";
        videoView.Size = new Size(1174, 560);
        videoView.TabIndex = 0;
        videoView.Text = "videoView";
        // 
        // controlPanel
        // 
        controlPanel.BackColor = Color.White;
        controlPanel.Controls.Add(speedComboBox);
        controlPanel.Controls.Add(speedLabel);
        controlPanel.Controls.Add(volumeBar);
        controlPanel.Controls.Add(volumeLabel);
        controlPanel.Controls.Add(timeLabel);
        controlPanel.Controls.Add(seekBar);
        controlPanel.Controls.Add(stopButton);
        controlPanel.Controls.Add(pauseButton);
        controlPanel.Controls.Add(playButton);
        controlPanel.Controls.Add(inputTextBox);
        controlPanel.Controls.Add(openFileButton);
        controlPanel.Dock = DockStyle.Fill;
        controlPanel.Location = new Point(12, 656);
        controlPanel.Margin = new Padding(12, 8, 12, 6);
        controlPanel.Name = "controlPanel";
        controlPanel.Padding = new Padding(12);
        controlPanel.Size = new Size(1176, 96);
        controlPanel.TabIndex = 2;
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
        // inputTextBox
        // 
        inputTextBox.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        inputTextBox.BorderStyle = BorderStyle.FixedSingle;
        inputTextBox.Location = new Point(132, 18);
        inputTextBox.Name = "inputTextBox";
        inputTextBox.PlaceholderText = "Enter file path / RTSP URL / YouTube URL";
        inputTextBox.Size = new Size(612, 23);
        inputTextBox.TabIndex = 1;
        // 
        // playButton
        // 
        playButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        playButton.BackColor = Color.FromArgb(28, 132, 246);
        playButton.FlatAppearance.BorderSize = 0;
        playButton.FlatStyle = FlatStyle.Flat;
        playButton.Font = new Font("Segoe UI Semibold", 9F, FontStyle.Bold, GraphicsUnit.Point, 129);
        playButton.ForeColor = Color.White;
        playButton.Location = new Point(752, 12);
        playButton.Name = "playButton";
        playButton.Size = new Size(80, 36);
        playButton.TabIndex = 2;
        playButton.Text = "Play";
        playButton.UseVisualStyleBackColor = false;
        playButton.Click += PlayButton_Click;
        // 
        // pauseButton
        // 
        pauseButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        pauseButton.BackColor = Color.FromArgb(244, 246, 248);
        pauseButton.FlatAppearance.BorderColor = Color.FromArgb(220, 224, 228);
        pauseButton.FlatStyle = FlatStyle.Flat;
        pauseButton.Location = new Point(838, 12);
        pauseButton.Name = "pauseButton";
        pauseButton.Size = new Size(80, 36);
        pauseButton.TabIndex = 3;
        pauseButton.Text = "Pause";
        pauseButton.UseVisualStyleBackColor = false;
        pauseButton.Click += PauseButton_Click;
        // 
        // stopButton
        // 
        stopButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        stopButton.BackColor = Color.FromArgb(244, 246, 248);
        stopButton.FlatAppearance.BorderColor = Color.FromArgb(220, 224, 228);
        stopButton.FlatStyle = FlatStyle.Flat;
        stopButton.Location = new Point(924, 12);
        stopButton.Name = "stopButton";
        stopButton.Size = new Size(80, 36);
        stopButton.TabIndex = 4;
        stopButton.Text = "Stop";
        stopButton.UseVisualStyleBackColor = false;
        stopButton.Click += StopButton_Click;
        // 
        // seekBar
        // 
        seekBar.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        seekBar.AutoSize = false;
        seekBar.LargeChange = 10;
        seekBar.Location = new Point(12, 56);
        seekBar.Maximum = 1000;
        seekBar.Name = "seekBar";
        seekBar.Size = new Size(824, 24);
        seekBar.SmallChange = 1;
        seekBar.TabIndex = 5;
        seekBar.TickStyle = TickStyle.None;
        seekBar.MouseDown += SeekBar_MouseDown;
        seekBar.MouseUp += SeekBar_MouseUp;
        // 
        // timeLabel
        // 
        timeLabel.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        timeLabel.AutoSize = true;
        timeLabel.ForeColor = Color.FromArgb(94, 102, 113);
        timeLabel.Location = new Point(842, 60);
        timeLabel.Name = "timeLabel";
        timeLabel.Size = new Size(79, 15);
        timeLabel.TabIndex = 6;
        timeLabel.Text = "00:00 / 00:00";
        // 
        // volumeLabel
        // 
        volumeLabel.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        volumeLabel.AutoSize = true;
        volumeLabel.ForeColor = Color.FromArgb(94, 102, 113);
        volumeLabel.Location = new Point(1010, 19);
        volumeLabel.Name = "volumeLabel";
        volumeLabel.Size = new Size(49, 15);
        volumeLabel.TabIndex = 7;
        volumeLabel.Text = "Volume";
        // 
        // volumeBar
        // 
        volumeBar.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        volumeBar.AutoSize = false;
        volumeBar.Location = new Point(1065, 14);
        volumeBar.Maximum = 120;
        volumeBar.Name = "volumeBar";
        volumeBar.Size = new Size(99, 26);
        volumeBar.TabIndex = 8;
        volumeBar.TickStyle = TickStyle.None;
        volumeBar.Value = 80;
        volumeBar.Scroll += VolumeBar_Scroll;
        // 
        // speedLabel
        // 
        speedLabel.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        speedLabel.AutoSize = true;
        speedLabel.ForeColor = Color.FromArgb(94, 102, 113);
        speedLabel.Location = new Point(1010, 60);
        speedLabel.Name = "speedLabel";
        speedLabel.Size = new Size(40, 15);
        speedLabel.TabIndex = 9;
        speedLabel.Text = "Speed";
        // 
        // speedComboBox
        // 
        speedComboBox.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        speedComboBox.DropDownStyle = ComboBoxStyle.DropDownList;
        speedComboBox.FormattingEnabled = true;
        speedComboBox.Items.AddRange(new object[] { "0.5x", "0.75x", "1.0x", "1.25x", "1.5x", "2.0x" });
        speedComboBox.Location = new Point(1065, 56);
        speedComboBox.Name = "speedComboBox";
        speedComboBox.Size = new Size(99, 23);
        speedComboBox.TabIndex = 10;
        speedComboBox.SelectedIndexChanged += SpeedComboBox_SelectedIndexChanged;
        // 
        // statusPanel
        // 
        statusPanel.BackColor = Color.White;
        statusPanel.Controls.Add(mediaInfoLabel);
        statusPanel.Controls.Add(statusLabel);
        statusPanel.Dock = DockStyle.Fill;
        statusPanel.Location = new Point(12, 728);
        statusPanel.Margin = new Padding(12, 6, 12, 8);
        statusPanel.Name = "statusPanel";
        statusPanel.Padding = new Padding(12, 8, 12, 8);
        statusPanel.Size = new Size(1176, 24);
        statusPanel.TabIndex = 3;
        // 
        // statusLabel
        // 
        statusLabel.AutoSize = true;
        statusLabel.ForeColor = Color.FromArgb(94, 102, 113);
        statusLabel.Location = new Point(12, 1);
        statusLabel.Name = "statusLabel";
        statusLabel.Size = new Size(154, 15);
        statusLabel.TabIndex = 0;
        statusLabel.Text = "Ready - Select media source";
        // 
        // mediaInfoLabel
        // 
        mediaInfoLabel.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        mediaInfoLabel.AutoSize = true;
        mediaInfoLabel.ForeColor = Color.FromArgb(94, 102, 113);
        mediaInfoLabel.Location = new Point(913, 1);
        mediaInfoLabel.Name = "mediaInfoLabel";
        mediaInfoLabel.Size = new Size(251, 15);
        mediaInfoLabel.TabIndex = 1;
        mediaInfoLabel.Text = "Codec: -  Bitrate: -  Resolution: -  FPS: -  Playback: 1.0x";
        // 
        // updateTimer
        // 
        updateTimer.Enabled = true;
        updateTimer.Interval = 500;
        updateTimer.Tick += UpdateTimer_Tick;
        // 
        // MainForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        BackColor = Color.FromArgb(245, 247, 250);
        ClientSize = new Size(1200, 760);
        Controls.Add(rootLayout);
        MinimumSize = new Size(900, 560);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "Video Player V10 (WinForms Designer)";
        rootLayout.ResumeLayout(false);
        headerPanel.ResumeLayout(false);
        headerPanel.PerformLayout();
        playerHostPanel.ResumeLayout(false);
        controlPanel.ResumeLayout(false);
        controlPanel.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)seekBar).EndInit();
        ((System.ComponentModel.ISupportInitialize)volumeBar).EndInit();
        statusPanel.ResumeLayout(false);
        statusPanel.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)videoView).EndInit();
        ResumeLayout(false);
    }
}
