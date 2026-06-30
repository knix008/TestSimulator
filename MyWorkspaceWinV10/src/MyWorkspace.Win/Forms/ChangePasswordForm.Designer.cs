namespace MyWorkspace.Win.Forms;

partial class ChangePasswordForm
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
        lblCurrent = new Label();
        lblNew = new Label();
        lblConfirm = new Label();
        txtCurrent = new TextBox();
        txtNew = new TextBox();
        txtConfirm = new TextBox();
        btnSave = new Button();
        btnCancel = new Button();
        SuspendLayout();

        lblCurrent.AutoSize = true;
        lblCurrent.Location = new Point(16, 20);
        lblCurrent.Text = "현재 비밀번호";

        txtCurrent.Location = new Point(140, 16);
        txtCurrent.PasswordChar = '●';
        txtCurrent.Size = new Size(220, 23);

        lblNew.AutoSize = true;
        lblNew.Location = new Point(16, 56);
        lblNew.Text = "새 비밀번호";

        txtNew.Location = new Point(140, 52);
        txtNew.PasswordChar = '●';
        txtNew.Size = new Size(220, 23);

        lblConfirm.AutoSize = true;
        lblConfirm.Location = new Point(16, 92);
        lblConfirm.Text = "새 비밀번호 확인";

        txtConfirm.Location = new Point(140, 88);
        txtConfirm.PasswordChar = '●';
        txtConfirm.Size = new Size(220, 23);

        btnSave.Location = new Point(140, 128);
        btnSave.Name = "btnSave";
        btnSave.Size = new Size(96, 32);
        btnSave.Text = "변경";
        btnSave.Click += btnSave_Click;

        btnCancel.Location = new Point(270, 128);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(96, 32);
        btnCancel.Text = "취소";
        btnCancel.Click += btnCancel_Click;

        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(384, 174);
        Controls.Add(btnCancel);
        Controls.Add(btnSave);
        Controls.Add(txtConfirm);
        Controls.Add(lblConfirm);
        Controls.Add(txtNew);
        Controls.Add(lblNew);
        Controls.Add(txtCurrent);
        Controls.Add(lblCurrent);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "ChangePasswordForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "비밀번호 변경";
        Load += ChangePasswordForm_Load;
        ResumeLayout(false);
        PerformLayout();
    }

    private Label lblCurrent;
    private Label lblNew;
    private Label lblConfirm;
    private TextBox txtCurrent;
    private TextBox txtNew;
    private TextBox txtConfirm;
    private Button btnSave;
    private Button btnCancel;
}
