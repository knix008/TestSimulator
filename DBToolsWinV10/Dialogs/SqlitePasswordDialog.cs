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
		Text = L.S("SqlitePasswordTitle", "데이터베이스 암호");
		ClientSize = new Size(420, 196);
		MinimumSize = new Size(360, 196);

		lblPrompt = new Label
		{
			AutoSize = false,
			Location = new Point(16, 14),
			Size = new Size(388, 36),
			Text = L.S("SqlitePasswordPrompt", "SQLCipher로 암호화된 SQLite 데이터베이스입니다.\n암호를 입력하세요."),
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
			Text = L.S("SqlitePasswordLabel", "암호"),
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
			Text = L.S("SqliteShowPassword", "암호 표시"),
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
			Location = new Point(228, 158),
			Size = new Size(88, 28),
			Text = L.S("BtnOk", "확인")
		};
		btnOk.Click += (_, _) =>
		{
			if (string.IsNullOrEmpty(txtPassword.Text))
			{
				MessageBox.Show(this, L.S("SqliteEnterPassword", "암호를 입력하세요."), Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
				DialogResult = DialogResult.None;
			}
		};

		btnCancel = new Button
		{
			DialogResult = DialogResult.Cancel,
			Location = new Point(324, 158),
			Size = new Size(88, 28),
			Text = L.S("BtnCancel", "취소")
		};

		ModernTheme.StyleDialogButton(btnOk, "Ok");
		ModernTheme.StyleDialogButton(btnCancel, "Cancel");
		AcceptButton = btnOk;
		CancelButton = btnCancel;
		Controls.AddRange(new Control[]
		{
			lblPrompt, lblFile, lblError, lblPassword, txtPassword, chkShowPassword, btnOk, btnCancel
		});
		ModernTheme.ApplyThemeToForm(this);
		lblError.ForeColor = ModernTheme.Danger;
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
