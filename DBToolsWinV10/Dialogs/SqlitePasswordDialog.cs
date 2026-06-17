using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using DBToolsWinV10.App;

namespace DBToolsWinV10.Dialogs;

public sealed class SqlitePasswordDialog : Form
{
	private readonly Label lblPrompt;
	private readonly Label lblFile;
	private readonly Label lblError;
	private readonly TextBox txtPassword;
	private readonly CheckBox chkShowPassword;
	private readonly Button btnOk;
	private readonly Button btnCancel;

	public string Password => txtPassword.Text;

	public SqlitePasswordDialog(string filePath, string errorMessage = null)
	{
		Font = ModernTheme.UiFont;
		BackColor = ModernTheme.AppBackground;
		FormBorderStyle = FormBorderStyle.FixedDialog;
		MaximizeBox = false;
		MinimizeBox = false;
		ShowIcon = false;
		ShowInTaskbar = false;
		StartPosition = FormStartPosition.CenterParent;
		Text = "데이터베이스 암호";
		ClientSize = new Size(420, 196);
		MinimumSize = new Size(360, 196);

		lblPrompt = new Label
		{
			AutoSize = false,
			Location = new Point(16, 14),
			Size = new Size(388, 36),
			Text = "SQLCipher로 암호화된 SQLite 데이터베이스입니다.\n암호를 입력하세요.",
			ForeColor = ModernTheme.TextPrimary
		};

		lblFile = new Label
		{
			AutoSize = false,
			Location = new Point(16, 52),
			Size = new Size(388, 18),
			Text = Path.GetFileName(filePath),
			ForeColor = ModernTheme.TextSecondary,
			Font = ModernTheme.UiFontSmall
		};

		lblError = new Label
		{
			AutoSize = false,
			Location = new Point(16, 72),
			Size = new Size(388, 18),
			ForeColor = ModernTheme.Danger,
			Font = ModernTheme.UiFontSmall,
			Visible = !string.IsNullOrWhiteSpace(errorMessage),
			Text = errorMessage ?? string.Empty
		};

		var lblPassword = new Label
		{
			AutoSize = true,
			Location = new Point(16, 98),
			Text = "암호",
			ForeColor = ModernTheme.TextPrimary
		};

		txtPassword = new TextBox
		{
			Location = new Point(16, 118),
			Size = new Size(388, 23),
			UseSystemPasswordChar = true
		};

		chkShowPassword = new CheckBox
		{
			AutoSize = true,
			Location = new Point(16, 146),
			Text = "암호 표시",
			ForeColor = ModernTheme.TextSecondary,
			Font = ModernTheme.UiFontSmall
		};
		chkShowPassword.CheckedChanged += (_, _) =>
		{
			txtPassword.UseSystemPasswordChar = !chkShowPassword.Checked;
		};

		btnOk = new Button
		{
			DialogResult = DialogResult.OK,
			Location = new Point(248, 158),
			Size = new Size(75, 28),
			Text = "확인"
		};
		btnOk.Click += (_, _) =>
		{
			if (string.IsNullOrEmpty(txtPassword.Text))
			{
				MessageBox.Show(this, "암호를 입력하세요.", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
				DialogResult = DialogResult.None;
			}
		};

		btnCancel = new Button
		{
			DialogResult = DialogResult.Cancel,
			Location = new Point(329, 158),
			Size = new Size(75, 28),
			Text = "취소"
		};

		AcceptButton = btnOk;
		CancelButton = btnCancel;
		Controls.AddRange(new Control[]
		{
			lblPrompt, lblFile, lblError, lblPassword, txtPassword, chkShowPassword, btnOk, btnCancel
		});
	}

	public static bool TryPrompt(IWin32Window owner, string filePath, string errorMessage, out string password)
	{
		using var dialog = new SqlitePasswordDialog(filePath, errorMessage);
		if (dialog.ShowDialog(owner) == DialogResult.OK)
		{
			password = dialog.Password;
			return true;
		}

		password = null;
		return false;
	}

	protected override void OnShown(EventArgs e)
	{
		base.OnShown(e);
		txtPassword.Focus();
	}
}
