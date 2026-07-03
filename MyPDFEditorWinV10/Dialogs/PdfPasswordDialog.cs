using System.Drawing;
using System.Windows.Forms;

namespace MyPDFEditorWinV10.Dialogs;

public sealed class PdfPasswordDialog : Form
{
	private readonly TextBox _passwordBox;
	private readonly Label _errorLabel;

	public string Password => _passwordBox.Text;

	public PdfPasswordDialog(string fileName, bool showInvalidPasswordMessage)
	{
		Text = "PDF 암호";
		FormBorderStyle = FormBorderStyle.FixedDialog;
		MaximizeBox = false;
		MinimizeBox = false;
		ShowInTaskbar = false;
		StartPosition = FormStartPosition.CenterParent;
		ClientSize = new Size(420, 168);
		Font = new Font("Segoe UI", 9F);

		Label message = new Label
		{
			Text = string.IsNullOrWhiteSpace(fileName)
				? "이 PDF는 암호로 보호되어 있습니다. 암호를 입력해 주세요."
				: $"다음 PDF는 암호로 보호되어 있습니다.\n{fileName}",
			Location = new Point(12, 12),
			Size = new Size(396, 40),
			AutoSize = false
		};

		Label passwordLabel = new Label
		{
			Text = "암호:",
			Location = new Point(12, 58),
			Size = new Size(40, 20),
			TextAlign = ContentAlignment.MiddleLeft
		};

		_passwordBox = new TextBox
		{
			Location = new Point(56, 56),
			Size = new Size(352, 23),
			UseSystemPasswordChar = true
		};

		_errorLabel = new Label
		{
			Text = showInvalidPasswordMessage ? "암호가 올바르지 않습니다. 다시 입력해 주세요." : string.Empty,
			ForeColor = Color.Firebrick,
			Location = new Point(56, 82),
			Size = new Size(352, 18),
			AutoSize = false
		};

		Button okButton = new Button
		{
			Text = "확인",
			DialogResult = DialogResult.OK,
			Location = new Point(252, 118),
			Size = new Size(75, 28)
		};

		Button cancelButton = new Button
		{
			Text = "취소",
			DialogResult = DialogResult.Cancel,
			Location = new Point(333, 118),
			Size = new Size(75, 28)
		};

		AcceptButton = okButton;
		CancelButton = cancelButton;
		Controls.Add(message);
		Controls.Add(passwordLabel);
		Controls.Add(_passwordBox);
		Controls.Add(_errorLabel);
		Controls.Add(okButton);
		Controls.Add(cancelButton);
	}

	protected override void OnShown(EventArgs e)
	{
		base.OnShown(e);
		_passwordBox.Focus();
	}
}
