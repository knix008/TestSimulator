namespace MyGitWinV10.App.Dialogs;

partial class DelayedProgressForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components is not null)
        {
            components.Dispose();
        }

        base.Dispose(disposing);
    }

    #region Windows Form Designer generated code

    private void InitializeComponent()
    {
        messageLabel = new Label();
        detailLabel = new Label();
        progressBar = new ProgressBar();
        percentLabel = new Label();
        stopButton = new Button();
        SuspendLayout();
        //
        // messageLabel
        //
        messageLabel.AutoEllipsis = true;
        messageLabel.Location = new Point(20, 20);
        messageLabel.Name = "messageLabel";
        messageLabel.Size = new Size(380, 32);
        messageLabel.Text = "Working...";
        //
        // detailLabel
        //
        detailLabel.AutoEllipsis = true;
        detailLabel.ForeColor = Color.FromArgb(100, 116, 139);
        detailLabel.Location = new Point(20, 54);
        detailLabel.Name = "detailLabel";
        detailLabel.Size = new Size(380, 20);
        detailLabel.Text = string.Empty;
        //
        // percentLabel
        //
        percentLabel.Location = new Point(20, 76);
        percentLabel.Name = "percentLabel";
        percentLabel.Size = new Size(380, 16);
        percentLabel.Text = string.Empty;
        percentLabel.TextAlign = ContentAlignment.MiddleCenter;
        percentLabel.Visible = false;
        //
        // progressBar
        //
        progressBar.Location = new Point(20, 96);
        progressBar.MarqueeAnimationSpeed = 30;
        progressBar.Name = "progressBar";
        progressBar.Size = new Size(380, 18);
        progressBar.Style = ProgressBarStyle.Marquee;
        //
        // stopButton
        //
        stopButton.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
        stopButton.BackColor = Color.FromArgb(220, 38, 38);
        stopButton.FlatStyle = FlatStyle.Flat;
        stopButton.ForeColor = Color.White;
        stopButton.Location = new Point(325, 126);
        stopButton.Name = "stopButton";
        stopButton.Size = new Size(75, 28);
        stopButton.TabIndex = 0;
        stopButton.Text = "Stop";
        stopButton.UseVisualStyleBackColor = false;
        stopButton.Click += StopButton_Click;
        //
        // DelayedProgressForm
        //
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        BackColor = Color.FromArgb(250, 250, 251);
        ClientSize = new Size(420, 168);
        ControlBox = false;
        Controls.Add(stopButton);
        Controls.Add(progressBar);
        Controls.Add(percentLabel);
        Controls.Add(detailLabel);
        Controls.Add(messageLabel);
        Font = new Font("Segoe UI", 9F);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "DelayedProgressForm";
        ShowIcon = false;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        Text = "Please wait";
        ResumeLayout(false);
    }

    #endregion

    private Label messageLabel;
    private Label detailLabel;
    private ProgressBar progressBar;
    private Label percentLabel;
    private Button stopButton;
}
