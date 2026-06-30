namespace MyWorkspace.Win.Forms;

partial class DatabaseSettingsForm
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
        lblProvider = new Label();
        cboProvider = new ComboBox();
        pnlServerFields = new Panel();
        lblServer = new Label();
        lblPort = new Label();
        lblDatabase = new Label();
        lblUser = new Label();
        lblPassword = new Label();
        txtServer = new TextBox();
        txtPort = new TextBox();
        txtDatabase = new TextBox();
        txtUser = new TextBox();
        txtPassword = new TextBox();
        pnlSqliteFields = new Panel();
        lblSqliteFile = new Label();
        txtSqliteFilePath = new TextBox();
        btnBrowseSqlite = new Button();
        btnTest = new Button();
        btnSave = new Button();
        btnCancel = new Button();
        lblResult = new Label();
        pnlServerFields.SuspendLayout();
        pnlSqliteFields.SuspendLayout();
        SuspendLayout();

        lblProvider.AutoSize = true;
        lblProvider.Location = new Point(16, 18);
        lblProvider.Text = "DB 종류";

        cboProvider.DropDownStyle = ComboBoxStyle.DropDownList;
        cboProvider.Location = new Point(120, 14);
        cboProvider.Size = new Size(280, 23);
        cboProvider.SelectedIndexChanged += cboProvider_SelectedIndexChanged;

        pnlServerFields.Controls.Add(txtPassword);
        pnlServerFields.Controls.Add(lblPassword);
        pnlServerFields.Controls.Add(txtUser);
        pnlServerFields.Controls.Add(lblUser);
        pnlServerFields.Controls.Add(txtDatabase);
        pnlServerFields.Controls.Add(lblDatabase);
        pnlServerFields.Controls.Add(txtPort);
        pnlServerFields.Controls.Add(lblPort);
        pnlServerFields.Controls.Add(txtServer);
        pnlServerFields.Controls.Add(lblServer);
        pnlServerFields.Location = new Point(0, 48);
        pnlServerFields.Size = new Size(420, 176);

        lblServer.AutoSize = true;
        lblServer.Location = new Point(16, 12);
        lblServer.Text = "서버";

        txtServer.Location = new Point(120, 8);
        txtServer.Size = new Size(280, 23);

        lblPort.AutoSize = true;
        lblPort.Location = new Point(16, 44);
        lblPort.Text = "포트";

        txtPort.Location = new Point(120, 40);
        txtPort.Size = new Size(80, 23);

        lblDatabase.AutoSize = true;
        lblDatabase.Location = new Point(16, 76);
        lblDatabase.Text = "데이터베이스";

        txtDatabase.Location = new Point(120, 72);
        txtDatabase.Size = new Size(280, 23);

        lblUser.AutoSize = true;
        lblUser.Location = new Point(16, 108);
        lblUser.Text = "사용자";

        txtUser.Location = new Point(120, 104);
        txtUser.Size = new Size(280, 23);

        lblPassword.AutoSize = true;
        lblPassword.Location = new Point(16, 140);
        lblPassword.Text = "비밀번호";

        txtPassword.Location = new Point(120, 136);
        txtPassword.PasswordChar = '●';
        txtPassword.Size = new Size(280, 23);

        pnlSqliteFields.Controls.Add(btnBrowseSqlite);
        pnlSqliteFields.Controls.Add(txtSqliteFilePath);
        pnlSqliteFields.Controls.Add(lblSqliteFile);
        pnlSqliteFields.Location = new Point(0, 48);
        pnlSqliteFields.Size = new Size(420, 80);
        pnlSqliteFields.Visible = false;

        lblSqliteFile.AutoSize = true;
        lblSqliteFile.Location = new Point(16, 16);
        lblSqliteFile.Text = "DB 파일";

        txtSqliteFilePath.Location = new Point(120, 12);
        txtSqliteFilePath.Size = new Size(220, 23);

        btnBrowseSqlite.Location = new Point(346, 11);
        btnBrowseSqlite.Size = new Size(54, 25);
        btnBrowseSqlite.Text = "...";
        btnBrowseSqlite.UseVisualStyleBackColor = true;
        btnBrowseSqlite.Click += btnBrowseSqlite_Click;

        btnTest.Location = new Point(120, 232);
        btnTest.Size = new Size(100, 30);
        btnTest.Text = "연결 테스트";
        btnTest.Click += btnTest_Click;

        lblResult.AutoSize = true;
        lblResult.Location = new Point(228, 238);
        lblResult.MaximumSize = new Size(172, 0);
        lblResult.Text = string.Empty;

        btnSave.Location = new Point(220, 276);
        btnSave.Size = new Size(85, 30);
        btnSave.Text = "저장";
        btnSave.Click += btnSave_Click;

        btnCancel.Location = new Point(315, 276);
        btnCancel.Size = new Size(85, 30);
        btnCancel.Text = "취소";
        btnCancel.Click += btnCancel_Click;

        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(420, 324);
        Controls.Add(lblResult);
        Controls.Add(btnCancel);
        Controls.Add(btnSave);
        Controls.Add(btnTest);
        Controls.Add(pnlSqliteFields);
        Controls.Add(pnlServerFields);
        Controls.Add(cboProvider);
        Controls.Add(lblProvider);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "DatabaseSettingsForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "데이터베이스 연결 설정";
        Load += DatabaseSettingsForm_Load;
        pnlServerFields.ResumeLayout(false);
        pnlServerFields.PerformLayout();
        pnlSqliteFields.ResumeLayout(false);
        pnlSqliteFields.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }

    private Label lblProvider;
    private ComboBox cboProvider;
    private Panel pnlServerFields;
    private Label lblServer;
    private Label lblPort;
    private Label lblDatabase;
    private Label lblUser;
    private Label lblPassword;
    private TextBox txtServer;
    private TextBox txtPort;
    private TextBox txtDatabase;
    private TextBox txtUser;
    private TextBox txtPassword;
    private Panel pnlSqliteFields;
    private Label lblSqliteFile;
    private TextBox txtSqliteFilePath;
    private Button btnBrowseSqlite;
    private Button btnTest;
    private Button btnSave;
    private Button btnCancel;
    private Label lblResult;
}
