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
        progressBar = new ProgressBar();
        stopButton = new Button();
        SuspendLayout();
        //
        // messageLabel
        //
        messageLabel.AutoEllipsis = true;
        messageLabel.Location = new Point(20, 20);
        messageLabel.Name = "messageLabel";
        messageLabel.Size = new Size(380, 40);
        messageLabel.Text = "Working...";
        //
        // progressBar
        //
        progressBar.Location = new Point(20, 68);
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
        stopButton.Location = new Point(325, 98);
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
        ClientSize = new Size(420, 140);
        ControlBox = false;
        Controls.Add(stopButton);
        Controls.Add(progressBar);
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
    private ProgressBar progressBar;
    private Button stopButton;
}
