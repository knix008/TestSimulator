using System.Text;
using System.Windows.Forms;

namespace MyPDFEditorWinV10.Dialogs;

public sealed class ErrorDialog : Form
{
	private readonly TextBox _messageBox;
	private readonly string _copyText;

	public static void Show(IWin32Window owner, string title, string message)
	{
		using ErrorDialog dialog = new ErrorDialog(title, message);
		dialog.ShowDialog(owner);
	}

	public static void Show(IWin32Window owner, string title, Exception ex)
	{
		Show(owner, title, ex.Message, ex);
	}

	public static void Show(IWin32Window owner, string title, string summary, Exception ex)
	{
		using ErrorDialog dialog = new ErrorDialog(title, summary, FormatException(ex));
		dialog.ShowDialog(owner);
	}

	private static string FormatException(Exception ex)
	{
		StringBuilder builder = new StringBuilder();
		int depth = 0;
		for (Exception current = ex; current != null; current = current.InnerException, depth++)
		{
			if (depth > 0)
			{
				builder.AppendLine();
				builder.AppendLine("--- 내부 예외 ---");
				builder.AppendLine();
			}

			builder.AppendLine($"유형: {current.GetType().FullName}");
			builder.AppendLine($"메시지: {current.Message}");
			if (!string.IsNullOrWhiteSpace(current.StackTrace))
			{
				builder.AppendLine();
				builder.AppendLine("스택 추적:");
				builder.AppendLine(current.StackTrace);
			}
		}

		return builder.ToString().TrimEnd();
	}

	private ErrorDialog(string title, string message)
		: this(title, message, message)
	{
	}

	private ErrorDialog(string title, string summary, string details)
	{
		string displayText = string.Equals(summary.Trim(), details.Trim(), StringComparison.Ordinal)
			? details
			: $"{summary}{Environment.NewLine}{Environment.NewLine}{details}";
		_copyText = BuildCopyText(title, summary, details);

		Text = title;
		StartPosition = FormStartPosition.CenterParent;
		MinimumSize = new Size(420, 220);
		Size = new Size(560, 320);
		ShowInTaskbar = false;
		MaximizeBox = false;
		MinimizeBox = false;
		Font = new Font("Malgun Gothic", 9F);
		BackColor = SystemColors.Control;

		_messageBox = new TextBox
		{
			Multiline = true,
			ReadOnly = true,
			ScrollBars = ScrollBars.Both,
			WordWrap = true,
			Dock = DockStyle.Fill,
			Font = new Font("Malgun Gothic", 9F),
			BackColor = Color.White,
			ForeColor = Color.Black,
			BorderStyle = BorderStyle.FixedSingle,
			Text = displayText,
			ShortcutsEnabled = true,
			HideSelection = false
		};

		Button btnClose = new Button
		{
			Text = "닫기",
			AutoSize = true,
			MinimumSize = new Size(88, 30),
			DialogResult = DialogResult.OK
		};

		Button btnCopy = new Button
		{
			Text = "전체 복사",
			AutoSize = true,
			MinimumSize = new Size(88, 30),
			Margin = new Padding(0, 0, 8, 0)
		};
		btnCopy.Click += (_, _) => CopyToClipboard(btnCopy);

		FlowLayoutPanel buttonPanel = new FlowLayoutPanel
		{
			Dock = DockStyle.Bottom,
			Height = 48,
			FlowDirection = FlowDirection.RightToLeft,
			WrapContents = false,
			Padding = new Padding(12, 8, 12, 8)
		};
		buttonPanel.Controls.Add(btnClose);
		buttonPanel.Controls.Add(btnCopy);

		Panel contentPanel = new Panel
		{
			Dock = DockStyle.Fill,
			Padding = new Padding(12, 12, 12, 4)
		};
		contentPanel.Controls.Add(_messageBox);

		Controls.Add(contentPanel);
		Controls.Add(buttonPanel);

		AcceptButton = btnClose;
		CancelButton = btnClose;
	}

	private void CopyToClipboard(Button copyButton)
	{
		Clipboard.SetText(_copyText);
		copyButton.Text = "복사됨";
		using System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer { Interval = 1500 };
		timer.Tick += (_, _) =>
		{
			copyButton.Text = "전체 복사";
			timer.Stop();
		};
		timer.Start();
	}

	private static string BuildCopyText(string title, string summary, string details)
	{
		StringBuilder builder = new StringBuilder();
		builder.AppendLine(title);
		builder.AppendLine();
		if (!string.IsNullOrWhiteSpace(summary))
		{
			builder.AppendLine(summary);
			builder.AppendLine();
		}

		if (!string.Equals(summary.Trim(), details.Trim(), StringComparison.Ordinal))
		{
			builder.Append(details);
		}
		else if (string.IsNullOrWhiteSpace(summary))
		{
			builder.Append(details);
		}

		return builder.ToString().TrimEnd();
	}
}
