using System.Drawing;
using System.Text;
using System.Windows.Forms;

namespace MyPDFEditorWinV10.Dialogs;

public sealed class ErrorDialog : Form
{
	private readonly TextBox _detailsBox;
	private readonly string _copyText;

	public static void Show(IWin32Window owner, string title, string message)
	{
		using ErrorDialog dialog = new ErrorDialog(title, message, null);
		dialog.ShowDialog(owner);
	}

	public static void Show(IWin32Window owner, string title, Exception ex)
	{
		Show(owner, title, "오류가 발생했습니다.", ex);
	}

	public static void Show(IWin32Window owner, string title, string summary, Exception ex)
	{
		using ErrorDialog dialog = new ErrorDialog(title, BuildSummary(summary, ex), FormatException(ex));
		dialog.ShowDialog(owner);
	}

	private static string BuildSummary(string summary, Exception ex)
	{
		string baseSummary = string.IsNullOrWhiteSpace(summary)
			? "오류가 발생했습니다."
			: summary.Trim();

		string exceptionMessage = GetFirstMeaningfulExceptionMessage(ex);
		if (string.IsNullOrWhiteSpace(exceptionMessage))
		{
			return baseSummary;
		}

		if (baseSummary.Contains(exceptionMessage, StringComparison.Ordinal))
		{
			return baseSummary;
		}

		return $"{baseSummary}{Environment.NewLine}원인: {exceptionMessage}";
	}

	private static string GetFirstMeaningfulExceptionMessage(Exception ex)
	{
		for (Exception current = ex; current != null; current = current.InnerException)
		{
			if (!string.IsNullOrWhiteSpace(current.Message))
			{
				return current.Message.Trim();
			}
		}

		return string.Empty;
	}

	private static string FormatException(Exception ex)
	{
		if (ex == null)
		{
			return string.Empty;
		}

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
			if (!string.IsNullOrWhiteSpace(current.Source))
			{
				builder.AppendLine($"소스: {current.Source}");
			}

			if (!string.IsNullOrWhiteSpace(current.StackTrace))
			{
				builder.AppendLine();
				builder.AppendLine("스택 추적:");
				builder.AppendLine(current.StackTrace);
			}
		}

		return builder.ToString().TrimEnd();
	}

	private ErrorDialog(string title, string summary, string details)
	{
		string normalizedSummary = summary?.Trim() ?? string.Empty;
		string normalizedDetails = details?.Trim() ?? string.Empty;
		bool hasDetails = !string.IsNullOrWhiteSpace(normalizedDetails) &&
			!string.Equals(normalizedSummary, normalizedDetails, StringComparison.Ordinal);

		_copyText = BuildCopyText(title, normalizedSummary, hasDetails ? normalizedDetails : string.Empty);

		Text = title;
		StartPosition = FormStartPosition.CenterParent;
		MinimumSize = new Size(480, hasDetails ? 280 : 180);
		Size = new Size(640, hasDetails ? 420 : 240);
		ShowInTaskbar = false;
		MaximizeBox = false;
		MinimizeBox = false;
		Font = new Font("Malgun Gothic", 9F);
		BackColor = SystemColors.Control;
		FormBorderStyle = FormBorderStyle.Sizable;

		PictureBox iconBox = new PictureBox
		{
			Image = SystemIcons.Error.ToBitmap(),
			SizeMode = PictureBoxSizeMode.CenterImage,
			Size = new Size(40, 40),
			Margin = new Padding(0, 0, 12, 0)
		};

		Label summaryLabel = new Label
		{
			AutoSize = true,
			MaximumSize = new Size(540, 0),
			Text = string.IsNullOrWhiteSpace(normalizedSummary) ? "오류가 발생했습니다." : normalizedSummary,
			UseMnemonic = false,
			BackColor = SystemColors.Control,
			ForeColor = SystemColors.ControlText,
			Padding = new Padding(0, 4, 0, 0)
		};

		TableLayoutPanel headerPanel = new TableLayoutPanel
		{
			Dock = DockStyle.Top,
			AutoSize = true,
			AutoSizeMode = AutoSizeMode.GrowAndShrink,
			ColumnCount = 2,
			RowCount = 1,
			Padding = new Padding(0),
			Margin = new Padding(0, 0, 0, hasDetails ? 8 : 0)
		};
		headerPanel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
		headerPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
		headerPanel.Controls.Add(iconBox, 0, 0);
		headerPanel.Controls.Add(summaryLabel, 1, 0);

		Label detailsCaption = null;
		if (hasDetails)
		{
			detailsCaption = new Label
			{
				Text = "상세 내용",
				AutoSize = true,
				Dock = DockStyle.Top,
				Margin = new Padding(0, 0, 0, 4),
				BackColor = SystemColors.Control,
				ForeColor = SystemColors.ControlText
			};
		}

		string detailsText = hasDetails ? normalizedDetails : normalizedSummary;
		_detailsBox = new TextBox
		{
			Multiline = true,
			ReadOnly = true,
			ScrollBars = ScrollBars.Both,
			WordWrap = true,
			Dock = DockStyle.Fill,
			Font = new Font("Consolas", 9F),
			BackColor = Color.White,
			ForeColor = Color.Black,
			BorderStyle = BorderStyle.FixedSingle,
			Text = detailsText,
			ShortcutsEnabled = true,
			HideSelection = false
		};
		_detailsBox.ContextMenuStrip = BuildCopyContextMenu();

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
		btnCopy.Click += (_, _) => CopyAll(btnCopy);

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

		Panel detailsHost = new Panel
		{
			Dock = DockStyle.Fill
		};
		if (detailsCaption != null)
		{
			detailsHost.Controls.Add(_detailsBox);
			detailsHost.Controls.Add(detailsCaption);
		}
		else
		{
			detailsHost.Controls.Add(_detailsBox);
		}

		contentPanel.Controls.Add(detailsHost);
		contentPanel.Controls.Add(headerPanel);

		Controls.Add(contentPanel);
		Controls.Add(buttonPanel);

		AcceptButton = btnClose;
		CancelButton = btnClose;
		Shown += (_, _) => _detailsBox.Select(0, 0);
	}

	private ContextMenuStrip BuildCopyContextMenu()
	{
		ContextMenuStrip menu = new ContextMenuStrip();
		ToolStripMenuItem copyItem = new ToolStripMenuItem("복사", null, (_, _) => CopySelection());
		ToolStripMenuItem copyAllItem = new ToolStripMenuItem("전체 복사", null, (_, _) => CopyAll(null));
		ToolStripMenuItem selectAllItem = new ToolStripMenuItem("모두 선택", null, (_, _) => _detailsBox.SelectAll());
		menu.Items.Add(copyItem);
		menu.Items.Add(copyAllItem);
		menu.Items.Add(new ToolStripSeparator());
		menu.Items.Add(selectAllItem);
		return menu;
	}

	private void CopySelection()
	{
		if (_detailsBox.SelectionLength > 0)
		{
			Clipboard.SetText(_detailsBox.SelectedText);
			return;
		}

		CopyAll(null);
	}

	private void CopyAll(Button copyButton)
	{
		Clipboard.SetText(_copyText);
		if (copyButton == null)
		{
			return;
		}

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

		if (!string.IsNullOrWhiteSpace(details))
		{
			builder.Append(details);
		}

		return builder.ToString().TrimEnd();
	}
}
