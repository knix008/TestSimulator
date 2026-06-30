namespace MyWorkspace.Win.Forms;

partial class EmailSettingsForm
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
        chkEnabled = new CheckBox();
        lblSmtpHost = new Label();
        txtSmtpHost = new TextBox();
        lblPort = new Label();
        numPort = new NumericUpDown();
        chkEnableSsl = new CheckBox();
        lblUsername = new Label();
        txtUsername = new TextBox();
        lblPassword = new Label();
        txtPassword = new TextBox();
        lblFromAddress = new Label();
        txtFromAddress = new TextBox();
        lblFromDisplayName = new Label();
        txtFromDisplayName = new TextBox();
        btnSave = new Button();
        btnCancel = new Button();
        lblHint = new Label();
        ((System.ComponentModel.ISupportInitialize)numPort).BeginInit();
        SuspendLayout();

        lblHint.AutoSize = true;
        lblHint.Location = new Point(16, 12);
        lblHint.MaximumSize = new Size(420, 0);
        lblHint.Text = "이메일 서버 설정은 선택 사항입니다. 설정하지 않아도 애플리케이션을 사용할 수 있습니다.";

        chkEnabled.AutoSize = true;
        chkEnabled.Location = new Point(16, 58);
        chkEnabled.Text = "이메일 알림 사용";

        lblSmtpHost.AutoSize = true;
        lblSmtpHost.Location = new Point(16, 80);
        lblSmtpHost.Text = "SMTP 서버";

        txtSmtpHost.Location = new Point(120, 76);
        txtSmtpHost.Size = new Size(220, 23);

        lblPort.AutoSize = true;
        lblPort.Location = new Point(350, 80);
        lblPort.Text = "포트";

        numPort.Location = new Point(390, 76);
        numPort.Maximum = 65535;
        numPort.Minimum = 1;
        numPort.Size = new Size(70, 23);
        numPort.Value = 587;

        chkEnableSsl.AutoSize = true;
        chkEnableSsl.Location = new Point(120, 108);
        chkEnableSsl.Text = "SSL/TLS 사용";

        lblUsername.AutoSize = true;
        lblUsername.Location = new Point(16, 140);
        lblUsername.Text = "사용자";

        txtUsername.Location = new Point(120, 136);
        txtUsername.Size = new Size(340, 23);

        lblPassword.AutoSize = true;
        lblPassword.Location = new Point(16, 172);
        lblPassword.Text = "비밀번호";

        txtPassword.Location = new Point(120, 168);
        txtPassword.PasswordChar = '●';
        txtPassword.Size = new Size(340, 23);

        lblFromAddress.AutoSize = true;
        lblFromAddress.Location = new Point(16, 204);
        lblFromAddress.Text = "발신 주소";

        txtFromAddress.Location = new Point(120, 200);
        txtFromAddress.Size = new Size(340, 23);

        lblFromDisplayName.AutoSize = true;
        lblFromDisplayName.Location = new Point(16, 236);
        lblFromDisplayName.Text = "발신 이름";

        txtFromDisplayName.Location = new Point(120, 232);
        txtFromDisplayName.Size = new Size(340, 23);

        btnSave.Location = new Point(280, 276);
        btnSave.Size = new Size(96, 32);
        btnSave.Text = "저장";
        btnSave.Click += btnSave_Click;

        btnCancel.Location = new Point(375, 276);
        btnCancel.Size = new Size(96, 32);
        btnCancel.Text = "취소";
        btnCancel.Click += btnCancel_Click;

        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(480, 324);
        Controls.Add(btnCancel);
        Controls.Add(btnSave);
        Controls.Add(txtFromDisplayName);
        Controls.Add(lblFromDisplayName);
        Controls.Add(txtFromAddress);
        Controls.Add(lblFromAddress);
        Controls.Add(txtPassword);
        Controls.Add(lblPassword);
        Controls.Add(txtUsername);
        Controls.Add(lblUsername);
        Controls.Add(chkEnableSsl);
        Controls.Add(numPort);
        Controls.Add(lblPort);
        Controls.Add(txtSmtpHost);
        Controls.Add(lblSmtpHost);
        Controls.Add(chkEnabled);
        Controls.Add(lblHint);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "EmailSettingsForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "이메일 서버 설정";
        Load += EmailSettingsForm_Load;
        ((System.ComponentModel.ISupportInitialize)numPort).EndInit();
        ResumeLayout(false);
        PerformLayout();
    }

    private Label lblHint;
    private CheckBox chkEnabled;
    private Label lblSmtpHost;
    private TextBox txtSmtpHost;
    private Label lblPort;
    private NumericUpDown numPort;
    private CheckBox chkEnableSsl;
    private Label lblUsername;
    private TextBox txtUsername;
    private Label lblPassword;
    private TextBox txtPassword;
    private Label lblFromAddress;
    private TextBox txtFromAddress;
    private Label lblFromDisplayName;
    private TextBox txtFromDisplayName;
    private Button btnSave;
    private Button btnCancel;
}
