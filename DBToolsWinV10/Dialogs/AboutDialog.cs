using System;
using System.ComponentModel;
using System.Drawing;
using System.Windows.Forms;
using DBToolsWinV10.App;

namespace DBToolsWinV10.Dialogs;

public class AboutDialog : Form
{
    private IContainer components = null;

    private PictureBox pictureBoxIcon;

    private Label lblAppName;

    private Label lblVersion;

    private Label lblDescription;

    private Label lblCopyright;

    private Button btnOk;

    private Panel panelHeader;

    public AboutDialog()
    {
        InitializeComponent();
        try
        {
            using var icon = new Icon(Application.ExecutablePath, 64, 64);
            pictureBoxIcon.Image = icon.ToBitmap();
        }
        catch { }
        ModernTheme.ApplyThemeToForm(this);
        panelHeader.BackColor = Color.FromArgb(26, 38, 68);
        lblAppName.ForeColor = Color.White;
        lblVersion.ForeColor = Color.FromArgb(160, 190, 230);
        Localize();
    }

    private void Localize()
    {
        Text              = L.S("AboutTitle",       "프로그램 정보");
        lblVersion.Text   = L.S("AboutVersion",     "버전 1.0.0  |  .NET 10 WinForms");
        lblDescription.Text = L.S("AboutDescription",
            "DB 테이블 설계 및 ER 다이어그램 편집 도구\r\n\r\n지원 데이터베이스: PostgreSQL, MySQL, MariaDB, SQLite, SQL Server\r\n기능: ER 다이어그램 편집, Crow's Foot 표기법, 정규화 분석,\r\n         SQL DDL 내보내기, JSON 직렬화");
        btnOk.Text        = L.S("BtnOk",            "확인");
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
        {
            components.Dispose();
        }
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        ComponentResourceManager resources = new ComponentResourceManager(typeof(AboutDialog));
        panelHeader = new Panel();
        lblVersion = new Label();
        lblAppName = new Label();
        pictureBoxIcon = new PictureBox();
        lblDescription = new Label();
        lblCopyright = new Label();
        btnOk = new Button();
        panelHeader.SuspendLayout();
        ((ISupportInitialize)pictureBoxIcon).BeginInit();
        SuspendLayout();
        // 
        // panelHeader
        // 
        panelHeader.BackColor = Color.FromArgb(26, 38, 68);
        panelHeader.Controls.Add(lblVersion);
        panelHeader.Controls.Add(lblAppName);
        panelHeader.Controls.Add(pictureBoxIcon);
        panelHeader.Dock = DockStyle.Top;
        panelHeader.Location = new Point(0, 0);
        panelHeader.Name = "panelHeader";
        panelHeader.Size = new Size(384, 90);
        panelHeader.TabIndex = 3;
        // 
        // lblVersion
        // 
        lblVersion.AutoSize = true;
        lblVersion.Font = new Font("맑은 고딕", 9F);
        lblVersion.ForeColor = Color.FromArgb(160, 190, 230);
        lblVersion.Location = new Point(94, 52);
        lblVersion.Name = "lblVersion";
        lblVersion.Size = new Size(181, 15);
        lblVersion.TabIndex = 0;
        lblVersion.Text = "버전 1.0.0  |  .NET 10 WinForms";
        // 
        // lblAppName
        // 
        lblAppName.AutoSize = true;
        lblAppName.Font = new Font("맑은 고딕", 18F, FontStyle.Bold);
        lblAppName.ForeColor = Color.White;
        lblAppName.Location = new Point(92, 18);
        lblAppName.Name = "lblAppName";
        lblAppName.Size = new Size(164, 32);
        lblAppName.TabIndex = 1;
        lblAppName.Text = "DBTools v1.0";
        // 
        // pictureBoxIcon
        // 
        pictureBoxIcon.ErrorImage = (Image)resources.GetObject("pictureBoxIcon.ErrorImage");
        pictureBoxIcon.Image = (Image)resources.GetObject("pictureBoxIcon.Image");
        pictureBoxIcon.InitialImage = (Image)resources.GetObject("pictureBoxIcon.InitialImage");
        pictureBoxIcon.Location = new Point(16, 13);
        pictureBoxIcon.Name = "pictureBoxIcon";
        pictureBoxIcon.Size = new Size(64, 64);
        pictureBoxIcon.SizeMode = PictureBoxSizeMode.Zoom;
        pictureBoxIcon.TabIndex = 2;
        pictureBoxIcon.TabStop = false;
        // 
        // lblDescription
        // 
        lblDescription.Font = new Font("맑은 고딕", 9.5F);
        lblDescription.ForeColor = Color.FromArgb(50, 60, 80);
        lblDescription.Location = new Point(16, 108);
        lblDescription.Name = "lblDescription";
        lblDescription.Size = new Size(368, 100);
        lblDescription.TabIndex = 2;
        lblDescription.Text = "DB 테이블 설계 및 ER 다이어그램 편집 도구\r\n\r\n지원 데이터베이스: PostgreSQL, MySQL, MariaDB, SQLite, SQL Server\r\n기능: ER 다이어그램 편집, Crow's Foot 표기법, 정규화 분석,\r\n         SQL DDL 내보내기, JSON 직렬화";
        // 
        // lblCopyright
        // 
        lblCopyright.AutoSize = true;
        lblCopyright.Font = new Font("맑은 고딕", 8.5F);
        lblCopyright.ForeColor = Color.Gray;
        lblCopyright.Location = new Point(16, 218);
        lblCopyright.Name = "lblCopyright";
        lblCopyright.Size = new Size(340, 15);
        lblCopyright.TabIndex = 1;
        lblCopyright.Text = "Copyright © 2026 DBTools. SH KWON(knix008@naver.com).";
        lblCopyright.Click += lblCopyright_Click;
        // 
        // btnOk
        // 
        btnOk.DialogResult = DialogResult.OK;
        btnOk.Font = new Font("맑은 고딕", 9F);
        btnOk.Location = new Point(152, 248);
        btnOk.Name = "btnOk";
        btnOk.Size = new Size(88, 30);
        btnOk.TabIndex = 0;
        btnOk.Text = "확인";
        ModernTheme.StyleDialogButton(btnOk, "Ok");
        //
        // AboutDialog
        //
        AcceptButton = btnOk;
        ClientSize = new Size(384, 281);
        Controls.Add(btnOk);
        Controls.Add(lblCopyright);
        Controls.Add(lblDescription);
        Controls.Add(panelHeader);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "AboutDialog";
        StartPosition = FormStartPosition.CenterParent;
        Text = "프로그램 정보";
        panelHeader.ResumeLayout(false);
        panelHeader.PerformLayout();
        ((ISupportInitialize)pictureBoxIcon).EndInit();
        ResumeLayout(false);
        PerformLayout();
    }

    private void lblCopyright_Click(object sender, EventArgs e)
    {

    }
}
