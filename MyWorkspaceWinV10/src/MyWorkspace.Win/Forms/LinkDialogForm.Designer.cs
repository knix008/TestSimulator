namespace MyWorkspace.Win.Forms;

partial class LinkDialogForm
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
        lblLinkText = new Label();
        txtLinkText = new TextBox();
        lblLinkUrl = new Label();
        txtLinkUrl = new TextBox();
        btnOk = new ThemedDialogButton();
        btnCancel = new ThemedDialogButton();
        SuspendLayout();

        lblLinkText.AutoSize = true;
        lblLinkText.Location = new Point(16, 16);
        lblLinkText.Name = "lblLinkText";
        lblLinkText.Size = new Size(59, 15);
        lblLinkText.Text = "표시 이름";

        txtLinkText.Location = new Point(16, 36);
        txtLinkText.Name = "txtLinkText";
        txtLinkText.Size = new Size(360, 23);
        txtLinkText.TabIndex = 0;

        lblLinkUrl.AutoSize = true;
        lblLinkUrl.Location = new Point(16, 68);
        lblLinkUrl.Name = "lblLinkUrl";
        lblLinkUrl.Size = new Size(31, 15);
        lblLinkUrl.Text = "URL";

        txtLinkUrl.Location = new Point(16, 88);
        txtLinkUrl.Name = "txtLinkUrl";
        txtLinkUrl.Size = new Size(360, 23);
        txtLinkUrl.TabIndex = 1;

        btnOk.Location = new Point(180, 128);
        btnOk.Name = "btnOk";
        btnOk.Size = new Size(96, 32);
        btnOk.TabIndex = 2;
        btnOk.Text = "확인";
        btnOk.UseVisualStyleBackColor = true;
        btnOk.Click += btnOk_Click;

        btnCancel.DialogResult = DialogResult.Cancel;
        btnCancel.Location = new Point(280, 128);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(96, 32);
        btnCancel.TabIndex = 3;
        btnCancel.Text = "취소";
        btnCancel.UseVisualStyleBackColor = true;
        btnCancel.Click += btnCancel_Click;

        AcceptButton = btnOk;
        CancelButton = btnCancel;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(394, 176);
        Controls.Add(btnCancel);
        Controls.Add(btnOk);
        Controls.Add(txtLinkUrl);
        Controls.Add(lblLinkUrl);
        Controls.Add(txtLinkText);
        Controls.Add(lblLinkText);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "LinkDialogForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "링크";
        ResumeLayout(false);
        PerformLayout();
    }

    private Label lblLinkText;
    private TextBox txtLinkText;
    private Label lblLinkUrl;
    private TextBox txtLinkUrl;
    private Button btnOk;
    private Button btnCancel;
}
