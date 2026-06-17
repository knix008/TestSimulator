using System;
using System.ComponentModel;
using System.Drawing;
using System.IO;
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
			string text = Path.Combine(AppContext.BaseDirectory, "Assets", "AppIcon.ico");
			if (File.Exists(text))
			{
				pictureBoxIcon.Image = new Icon(text, 64, 64).ToBitmap();
			}
			else
			{
				pictureBoxIcon.Image = IconProvider.Get("Default", 64);
			}
		}
		catch
		{
			pictureBoxIcon.Image = IconProvider.Get("Default", 64);
		}
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
		base.SuspendLayout();
		this.panelHeader = new System.Windows.Forms.Panel();
		this.panelHeader.Name = "panelHeader";
		this.panelHeader.Dock = System.Windows.Forms.DockStyle.Top;
		this.panelHeader.Height = 90;
		this.panelHeader.BackColor = System.Drawing.Color.FromArgb(26, 38, 68);
		this.pictureBoxIcon = new System.Windows.Forms.PictureBox();
		this.pictureBoxIcon.Name = "pictureBoxIcon";
		this.pictureBoxIcon.Size = new System.Drawing.Size(64, 64);
		this.pictureBoxIcon.Location = new System.Drawing.Point(16, 13);
		this.pictureBoxIcon.SizeMode = System.Windows.Forms.PictureBoxSizeMode.Zoom;
		((System.ComponentModel.ISupportInitialize)this.pictureBoxIcon).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.pictureBoxIcon).EndInit();
		this.lblAppName = new System.Windows.Forms.Label();
		this.lblAppName.Name = "lblAppName";
		this.lblAppName.Text = "DBTools v1.0";
		this.lblAppName.Font = new System.Drawing.Font("맑은 고딕", 18f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point);
		this.lblAppName.ForeColor = System.Drawing.Color.White;
		this.lblAppName.AutoSize = true;
		this.lblAppName.Location = new System.Drawing.Point(92, 18);
		this.lblVersion = new System.Windows.Forms.Label();
		this.lblVersion.Name = "lblVersion";
		this.lblVersion.Text = "버전 1.0.0  |  .NET 10 WinForms";
		this.lblVersion.Font = new System.Drawing.Font("맑은 고딕", 9f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point);
		this.lblVersion.ForeColor = System.Drawing.Color.FromArgb(160, 190, 230);
		this.lblVersion.AutoSize = true;
		this.lblVersion.Location = new System.Drawing.Point(94, 52);
		this.panelHeader.Controls.Add(this.lblVersion);
		this.panelHeader.Controls.Add(this.lblAppName);
		this.panelHeader.Controls.Add(this.pictureBoxIcon);
		this.lblDescription = new System.Windows.Forms.Label();
		this.lblDescription.Name = "lblDescription";
		this.lblDescription.Text = "DB 테이블 설계 및 ER 다이어그램 편집 도구\r\n\r\n지원 데이터베이스: PostgreSQL, MySQL, MariaDB, SQLite, SQL Server\r\n기능: ER 다이어그램 편집, Crow's Foot 표기법, 정규화 분석,\r\n         SQL DDL 내보내기, JSON 직렬화";
		this.lblDescription.Font = new System.Drawing.Font("맑은 고딕", 9.5f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point);
		this.lblDescription.ForeColor = System.Drawing.Color.FromArgb(50, 60, 80);
		this.lblDescription.Location = new System.Drawing.Point(16, 108);
		this.lblDescription.Size = new System.Drawing.Size(368, 100);
		this.lblCopyright = new System.Windows.Forms.Label();
		this.lblCopyright.Name = "lblCopyright";
		this.lblCopyright.Text = "© 2026 DBTools. All rights reserved.";
		this.lblCopyright.Font = new System.Drawing.Font("맑은 고딕", 8.5f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point);
		this.lblCopyright.ForeColor = System.Drawing.Color.Gray;
		this.lblCopyright.Location = new System.Drawing.Point(16, 218);
		this.lblCopyright.AutoSize = true;
		this.btnOk = new System.Windows.Forms.Button();
		this.btnOk.Name = "btnOk";
		this.btnOk.Text = "확인";
		this.btnOk.DialogResult = System.Windows.Forms.DialogResult.OK;
		this.btnOk.Size = new System.Drawing.Size(88, 30);
		this.btnOk.Location = new System.Drawing.Point(152, 248);
		this.btnOk.Font = new System.Drawing.Font("맑은 고딕", 9f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point);
		this.Text = "프로그램 정보";
		base.Name = "AboutDialog";
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedDialog;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterParent;
		base.Size = new System.Drawing.Size(400, 320);
		base.AcceptButton = this.btnOk;
		base.Controls.Add(this.btnOk);
		base.Controls.Add(this.lblCopyright);
		base.Controls.Add(this.lblDescription);
		base.Controls.Add(this.panelHeader);
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
