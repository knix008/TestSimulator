namespace MyWorkspace.Win.Forms;



partial class LoginForm

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

        lblTitle = new Label();

        lblUsername = new Label();

        lblPassword = new Label();

        txtUsername = new TextBox();

        txtPassword = new TextBox();

        btnLogin = new Button();

        btnCancel = new Button();

        lblMessage = new Label();

        SuspendLayout();



        lblTitle.AutoSize = true;

        lblTitle.Font = new Font("Segoe UI", 14F, FontStyle.Bold);

        lblTitle.Location = new Point(32, 24);

        lblTitle.Name = "lblTitle";

        lblTitle.Size = new Size(130, 25);

        lblTitle.Text = "MyWorkspace";



        lblUsername.AutoSize = true;

        lblUsername.Location = new Point(34, 72);

        lblUsername.Name = "lblUsername";

        lblUsername.Size = new Size(43, 15);

        lblUsername.Text = "사용자 ID";



        txtUsername.Location = new Point(120, 68);

        txtUsername.Name = "txtUsername";

        txtUsername.Size = new Size(220, 23);

        txtUsername.TabIndex = 0;



        lblPassword.AutoSize = true;

        lblPassword.Location = new Point(34, 108);

        lblPassword.Name = "lblPassword";

        lblPassword.Size = new Size(55, 15);

        lblPassword.Text = "비밀번호";



        txtPassword.Location = new Point(120, 104);

        txtPassword.Name = "txtPassword";

        txtPassword.PasswordChar = '●';

        txtPassword.Size = new Size(220, 23);

        txtPassword.TabIndex = 1;



        btnLogin.Location = new Point(120, 152);

        btnLogin.Name = "btnLogin";

        btnLogin.Size = new Size(100, 32);

        btnLogin.TabIndex = 2;

        btnLogin.Text = "로그인";

        btnLogin.UseVisualStyleBackColor = true;

        btnLogin.Click += btnLogin_Click;



        btnCancel.Location = new Point(240, 152);

        btnCancel.Name = "btnCancel";

        btnCancel.Size = new Size(100, 32);

        btnCancel.TabIndex = 3;

        btnCancel.Text = "취소";

        btnCancel.UseVisualStyleBackColor = true;

        btnCancel.Click += btnCancel_Click;



        lblMessage.AutoSize = true;

        lblMessage.ForeColor = Color.Firebrick;

        lblMessage.Location = new Point(120, 136);

        lblMessage.Name = "lblMessage";

        lblMessage.Size = new Size(0, 15);



        AutoScaleDimensions = new SizeF(7F, 15F);

        AutoScaleMode = AutoScaleMode.Font;

        ClientSize = new Size(420, 220);

        Controls.Add(lblMessage);

        Controls.Add(btnCancel);

        Controls.Add(btnLogin);

        Controls.Add(txtPassword);

        Controls.Add(lblPassword);

        Controls.Add(txtUsername);

        Controls.Add(lblUsername);

        Controls.Add(lblTitle);

        FormBorderStyle = FormBorderStyle.FixedDialog;

        MaximizeBox = false;

        MinimizeBox = false;

        Name = "LoginForm";

        StartPosition = FormStartPosition.CenterScreen;

        Text = "MyWorkspace - 로그인";

        Load += LoginForm_Load;

        ResumeLayout(false);

        PerformLayout();

    }



    private Label lblTitle;

    private Label lblUsername;

    private Label lblPassword;

    private TextBox txtUsername;

    private TextBox txtPassword;

    private Button btnLogin;

    private Button btnCancel;

    private Label lblMessage;

}


