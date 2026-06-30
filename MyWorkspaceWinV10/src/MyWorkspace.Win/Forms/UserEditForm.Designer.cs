namespace MyWorkspace.Win.Forms;

partial class UserEditForm
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
        lblUsername = new Label();
        lblPassword = new Label();
        lblRole = new Label();
        txtUsername = new TextBox();
        txtPassword = new TextBox();
        cboRole = new ThemedComboBox();
        btnSave = new Button();
        btnCancel = new Button();
        SuspendLayout();

        lblUsername.AutoSize = true;
        lblUsername.Location = new Point(16, 20);
        lblUsername.Text = "사용자 ID";

        txtUsername.Location = new Point(120, 16);
        txtUsername.Size = new Size(220, 23);

        lblPassword.AutoSize = true;
        lblPassword.Location = new Point(16, 56);
        lblPassword.Name = "lblPassword";
        lblPassword.Text = "비밀번호";

        txtPassword.Location = new Point(120, 52);
        txtPassword.PasswordChar = '●';
        txtPassword.Size = new Size(220, 23);

        lblRole.AutoSize = true;
        lblRole.Location = new Point(16, 92);
        lblRole.Text = "역할";

        cboRole.DropDownStyle = ComboBoxStyle.DropDownList;
        cboRole.Location = new Point(120, 88);
        cboRole.Size = new Size(220, 23);

        btnSave.Location = new Point(120, 132);
        btnSave.Name = "btnSave";
        btnSave.Size = new Size(96, 32);
        btnSave.Text = "저장";
        btnSave.Click += btnSave_Click;

        btnCancel.Location = new Point(250, 132);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(96, 32);
        btnCancel.Text = "취소";
        btnCancel.Click += btnCancel_Click;

        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(364, 178);
        Controls.Add(btnCancel);
        Controls.Add(btnSave);
        Controls.Add(cboRole);
        Controls.Add(lblRole);
        Controls.Add(txtPassword);
        Controls.Add(lblPassword);
        Controls.Add(txtUsername);
        Controls.Add(lblUsername);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "UserEditForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "사용자";
        Load += UserEditForm_Load;
        ResumeLayout(false);
        PerformLayout();
    }

    private Label lblUsername;
    private Label lblPassword;
    private Label lblRole;
    private TextBox txtUsername;
    private TextBox txtPassword;
    private ThemedComboBox cboRole;
    private Button btnSave;
    private Button btnCancel;
}
