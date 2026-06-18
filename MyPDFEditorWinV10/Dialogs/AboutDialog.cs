using System.ComponentModel;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using MyPDFEditorWinV10.App;

namespace MyPDFEditorWinV10.Dialogs;

public sealed class AboutDialog : Form
{
	private readonly Panel _panelHeader;
	private readonly PictureBox _pictureBoxIcon;
	private readonly Label _lblAppName;
	private readonly Label _lblVersion;
	private readonly Label _lblDescription;
	private readonly Label _lblCopyright;
	private readonly Button _btnOk;

	public AboutDialog()
	{
		_panelHeader = new Panel();
		_lblVersion = new Label();
		_lblAppName = new Label();
		_pictureBoxIcon = new PictureBox();
		_lblDescription = new Label();
		_lblCopyright = new Label();
		_btnOk = new Button();
		InitializeComponent();
		BindProgramInfo();
		LoadAppIcon();
	}

	private void LoadAppIcon()
	{
		try
		{
			string iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "AppIcon.ico");
			if (File.Exists(iconPath))
			{
				_pictureBoxIcon.Image = new Icon(iconPath, 64, 64).ToBitmap();
				return;
			}
		}
		catch
		{
		}

		_pictureBoxIcon.Image = IconProvider.Get("Pdf", 64);
	}

	private void BindProgramInfo()
	{
		Assembly assembly = Assembly.GetExecutingAssembly();
		AssemblyName assemblyName = assembly.GetName();
		Version version = assemblyName.Version ?? new Version(1, 0, 0, 0);
		string product = assembly.GetCustomAttribute<AssemblyProductAttribute>()?.Product ?? "MyPDF Editor";
		string description = assembly.GetCustomAttribute<AssemblyDescriptionAttribute>()?.Description ?? "PDF viewer and text editor";

		_lblAppName.Text = product;
		_lblVersion.Text = $"버전 {version.Major}.{version.Minor}.{version.Build}  |  .NET 10 WinForms";
		_lblDescription.Text =
			$"{description}\r\n\r\n" +
			"기능: PDF 보기, 텍스트 추출 및 편집, 이미지 선택·복사·저장,\r\n" +
			"         PDF / Markdown / Word 내보내기\r\n" +
			"이미지 저장 형식: PNG, JPEG, GIF, WebP, AVIF";
		_lblCopyright.Text = $"Copyright © {DateTime.Now.Year} {product}.";
	}

	private void InitializeComponent()
	{
		_panelHeader.SuspendLayout();
		((ISupportInitialize)_pictureBoxIcon).BeginInit();
		SuspendLayout();

		_panelHeader.BackColor = Color.FromArgb(26, 38, 68);
		_panelHeader.Controls.Add(_lblVersion);
		_panelHeader.Controls.Add(_lblAppName);
		_panelHeader.Controls.Add(_pictureBoxIcon);
		_panelHeader.Dock = DockStyle.Top;
		_panelHeader.Location = new Point(0, 0);
		_panelHeader.Name = "panelHeader";
		_panelHeader.Size = new Size(420, 90);
		_panelHeader.TabIndex = 0;

		_lblVersion.AutoSize = true;
		_lblVersion.Font = new Font("Malgun Gothic", 9F);
		_lblVersion.ForeColor = Color.FromArgb(160, 190, 230);
		_lblVersion.Location = new Point(94, 52);
		_lblVersion.Name = "lblVersion";
		_lblVersion.Size = new Size(200, 15);
		_lblVersion.TabIndex = 0;

		_lblAppName.AutoSize = true;
		_lblAppName.Font = new Font("Malgun Gothic", 18F, FontStyle.Bold);
		_lblAppName.ForeColor = Color.White;
		_lblAppName.Location = new Point(92, 18);
		_lblAppName.Name = "lblAppName";
		_lblAppName.Size = new Size(220, 32);
		_lblAppName.TabIndex = 1;

		_pictureBoxIcon.Location = new Point(16, 13);
		_pictureBoxIcon.Name = "pictureBoxIcon";
		_pictureBoxIcon.Size = new Size(64, 64);
		_pictureBoxIcon.SizeMode = PictureBoxSizeMode.Zoom;
		_pictureBoxIcon.TabIndex = 2;
		_pictureBoxIcon.TabStop = false;

		_lblDescription.Font = new Font("Malgun Gothic", 9.5F);
		_lblDescription.ForeColor = Color.FromArgb(50, 60, 80);
		_lblDescription.Location = new Point(16, 108);
		_lblDescription.Name = "lblDescription";
		_lblDescription.Size = new Size(388, 120);
		_lblDescription.TabIndex = 1;

		_lblCopyright.AutoSize = true;
		_lblCopyright.Font = new Font("Malgun Gothic", 8.5F);
		_lblCopyright.ForeColor = Color.Gray;
		_lblCopyright.Location = new Point(16, 232);
		_lblCopyright.Name = "lblCopyright";
		_lblCopyright.Size = new Size(180, 15);
		_lblCopyright.TabIndex = 2;

		_btnOk.DialogResult = DialogResult.OK;
		_btnOk.Font = new Font("Malgun Gothic", 9F);
		_btnOk.Location = new Point(166, 262);
		_btnOk.Name = "btnOk";
		_btnOk.Size = new Size(88, 30);
		_btnOk.TabIndex = 3;
		_btnOk.Text = "확인";

		AcceptButton = _btnOk;
		ClientSize = new Size(420, 308);
		Controls.Add(_btnOk);
		Controls.Add(_lblCopyright);
		Controls.Add(_lblDescription);
		Controls.Add(_panelHeader);
		FormBorderStyle = FormBorderStyle.FixedDialog;
		MaximizeBox = false;
		MinimizeBox = false;
		Name = "AboutDialog";
		StartPosition = FormStartPosition.CenterParent;
		Text = "프로그램 정보";

		_panelHeader.ResumeLayout(false);
		_panelHeader.PerformLayout();
		((ISupportInitialize)_pictureBoxIcon).EndInit();
		ResumeLayout(false);
		PerformLayout();
	}
}
