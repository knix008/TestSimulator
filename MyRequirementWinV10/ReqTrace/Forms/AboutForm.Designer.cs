namespace ReqTrace.Forms;

partial class AboutForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
            components.Dispose();
        base.Dispose(disposing);
    }

    private PictureBox picAppIcon;
    private Label lblAboutText;
    private Label lblCopyright;
    private Button btnClose;

    private void InitializeComponent()
    {
        picAppIcon = new PictureBox();
        lblAboutText = new Label();
        lblCopyright = new Label();
        btnClose = new Button();
        ((System.ComponentModel.ISupportInitialize)picAppIcon).BeginInit();
        SuspendLayout();
        // 
        // picAppIcon
        // 
        picAppIcon.Location = new Point(12, 12);
        picAppIcon.Name = "picAppIcon";
        picAppIcon.Size = new Size(48, 48);
        picAppIcon.SizeMode = PictureBoxSizeMode.Zoom;
        picAppIcon.TabIndex = 2;
        picAppIcon.TabStop = false;
        // 
        // lblAboutText
        // 
        lblAboutText.AutoSize = false;
        lblAboutText.Location = new Point(72, 8);
        lblAboutText.Name = "lblAboutText";
        lblAboutText.Padding = new Padding(0, 4, 10, 10);
        lblAboutText.Size = new Size(336, 180);
        lblAboutText.TabIndex = 0;
        lblAboutText.Text = "Requirements Traceability Manager\r\nVersion 1.0";
        // 
        // lblCopyright
        // 
        lblCopyright.AutoSize = false;
        lblCopyright.Location = new Point(72, 196);
        lblCopyright.Name = "lblCopyright";
        lblCopyright.Size = new Size(336, 20);
        lblCopyright.TabIndex = 3;
        lblCopyright.Text = "Copyright";
        // 
        // btnClose
        // 
        btnClose.DialogResult = DialogResult.OK;
        btnClose.Location = new Point(333, 224);
        btnClose.Name = "btnClose";
        btnClose.Size = new Size(75, 25);
        btnClose.TabIndex = 1;
        btnClose.Text = "Close";
        btnClose.UseVisualStyleBackColor = true;
        // 
        // AboutForm
        // 
        AcceptButton = btnClose;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(420, 260);
        Controls.Add(lblCopyright);
        Controls.Add(picAppIcon);
        Controls.Add(btnClose);
        Controls.Add(lblAboutText);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "AboutForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "About Requirements Traceability Manager";
        ((System.ComponentModel.ISupportInitialize)picAppIcon).EndInit();
        ResumeLayout(false);
    }
}
