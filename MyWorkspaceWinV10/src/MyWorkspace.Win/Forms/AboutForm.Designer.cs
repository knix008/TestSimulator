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
        lblAppName = new Label();
        lblVersion = new Label();
        lblDescription = new Label();
        lblCopyright = new Label();
        btnClose = new Button();
        SuspendLayout();

        lblAppName.AutoSize = true;
        lblAppName.Font = new Font("Segoe UI Semibold", 14F);
        lblAppName.Location = new Point(24, 24);
        lblAppName.Name = "lblAppName";
        lblAppName.Text = "MyWorkspace";

        lblVersion.AutoSize = true;
        lblVersion.Location = new Point(24, 56);
        lblVersion.Name = "lblVersion";
        lblVersion.Text = "Version 1.0.0";

        lblDescription.Location = new Point(24, 88);
        lblDescription.Name = "lblDescription";
        lblDescription.Size = new Size(376, 56);
        lblDescription.Text = "Description";

        lblCopyright.AutoSize = true;
        lblCopyright.ForeColor = SystemColors.GrayText;
        lblCopyright.Location = new Point(24, 152);
        lblCopyright.Name = "lblCopyright";
        lblCopyright.Text = "Copyright";

        btnClose.Location = new Point(316, 188);
        btnClose.Size = new Size(84, 32);
        btnClose.Text = "Close";
        btnClose.Click += btnClose_Click;

        AcceptButton = btnClose;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(424, 236);
        Controls.Add(btnClose);
        Controls.Add(lblCopyright);
        Controls.Add(lblDescription);
        Controls.Add(lblVersion);
        Controls.Add(lblAppName);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "AboutForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "About";
        Load += AboutForm_Load;
        ResumeLayout(false);
        PerformLayout();
    }

    private Label lblAppName;
    private Label lblVersion;
    private Label lblDescription;
    private Label lblCopyright;
    private Button btnClose;
}
