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
    private Panel statusPanel;
    private Label statusLabel;

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
        statusPanel = new Panel();
        statusLabel = new Label();
        rootLayout.SuspendLayout();
        headerPanel.SuspendLayout();
        playerHostPanel.SuspendLayout();
        controlPanel.SuspendLayout();
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
        rootLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 78F));
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
        subtitleLabel.Size = new Size(327, 15);
        subtitleLabel.TabIndex = 1;
        subtitleLabel.Text = "Local Files + RTSP/HTTP/HLS streams (Designer-editable UI)";
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
        controlPanel.Size = new Size(1176, 64);
        controlPanel.TabIndex = 2;
        // 
        // openFileButton
        // 
        openFileButton.BackColor = Color.FromArgb(244, 246, 248);
        openFileButton.FlatAppearance.BorderColor = Color.FromArgb(220, 224, 228);
        openFileButton.FlatStyle = FlatStyle.Flat;
        openFileButton.Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point, 129);
        openFileButton.Location = new Point(12, 14);
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
        inputTextBox.Location = new Point(132, 20);
        inputTextBox.Name = "inputTextBox";
        inputTextBox.PlaceholderText = "Enter file path or stream URL (rtsp://, http://, https://)";
        inputTextBox.Size = new Size(711, 23);
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
        playButton.Location = new Point(851, 14);
        playButton.Name = "playButton";
        playButton.Size = new Size(100, 36);
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
        pauseButton.Location = new Point(959, 14);
        pauseButton.Name = "pauseButton";
        pauseButton.Size = new Size(100, 36);
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
        stopButton.Location = new Point(1067, 14);
        stopButton.Name = "stopButton";
        stopButton.Size = new Size(97, 36);
        stopButton.TabIndex = 4;
        stopButton.Text = "Stop";
        stopButton.UseVisualStyleBackColor = false;
        stopButton.Click += StopButton_Click;
        // 
        // statusPanel
        // 
        statusPanel.BackColor = Color.White;
        statusPanel.Controls.Add(statusLabel);
        statusPanel.Dock = DockStyle.Fill;
        statusPanel.Location = new Point(12, 732);
        statusPanel.Margin = new Padding(12, 6, 12, 8);
        statusPanel.Name = "statusPanel";
        statusPanel.Padding = new Padding(12, 8, 12, 8);
        statusPanel.Size = new Size(1176, 20);
        statusPanel.TabIndex = 3;
        // 
        // statusLabel
        // 
        statusLabel.AutoSize = true;
        statusLabel.ForeColor = Color.FromArgb(94, 102, 113);
        statusLabel.Location = new Point(12, 2);
        statusLabel.Name = "statusLabel";
        statusLabel.Size = new Size(154, 15);
        statusLabel.TabIndex = 0;
        statusLabel.Text = "Ready - Select media source";
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
        statusPanel.ResumeLayout(false);
        statusPanel.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)videoView).EndInit();
        ResumeLayout(false);
    }
}
