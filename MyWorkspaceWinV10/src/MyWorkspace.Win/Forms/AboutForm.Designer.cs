namespace MyWorkspace.Win.Forms;

partial class AboutForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        picAppIcon = new PictureBox();
        lblAppName = new Label();
        lblVersion = new Label();
        lblDescription = new Label();
        lblCopyright = new Label();
        btnClose = new Button();
        ((System.ComponentModel.ISupportInitialize)picAppIcon).BeginInit();
        SuspendLayout();

        picAppIcon.Location = new Point(24, 24);
        picAppIcon.Name = "picAppIcon";
        picAppIcon.Size = new Size(64, 64);
        picAppIcon.SizeMode = PictureBoxSizeMode.Zoom;
        picAppIcon.TabStop = false;

        lblAppName.AutoSize = true;
        lblAppName.Font = new Font("Segoe UI Semibold", 14F);
        lblAppName.Location = new Point(104, 28);
        lblAppName.Name = "lblAppName";
        lblAppName.Text = "MyWorkspace";

        lblVersion.AutoSize = true;
        lblVersion.Location = new Point(104, 58);
        lblVersion.Name = "lblVersion";
        lblVersion.Text = "Version 1.0.0";

        lblDescription.AutoSize = true;
        lblDescription.Location = new Point(24, 100);
        lblDescription.MaximumSize = new Size(376, 0);
        lblDescription.Name = "lblDescription";
        lblDescription.Text = "Description";

        lblCopyright.AutoSize = true;
        lblCopyright.ForeColor = SystemColors.GrayText;
        lblCopyright.Location = new Point(24, 164);
        lblCopyright.Name = "lblCopyright";
        lblCopyright.Text = "Copyright";

        btnClose.Location = new Point(316, 200);
        btnClose.Size = new Size(84, 32);
        btnClose.Text = "Close";
        btnClose.Click += btnClose_Click;

        AcceptButton = btnClose;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(424, 248);
        Controls.Add(btnClose);
        Controls.Add(lblCopyright);
        Controls.Add(lblDescription);
        Controls.Add(lblVersion);
        Controls.Add(lblAppName);
        Controls.Add(picAppIcon);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "AboutForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "About";
        Load += AboutForm_Load;
        ((System.ComponentModel.ISupportInitialize)picAppIcon).EndInit();
        ResumeLayout(false);
        PerformLayout();
    }

    private PictureBox picAppIcon;
    private Label lblAppName;
    private Label lblVersion;
    private Label lblDescription;
    private Label lblCopyright;
    private Button btnClose;
}
