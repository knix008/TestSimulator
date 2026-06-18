using MyPDFEditorWinV10.Export;

namespace MyPDFEditorWinV10.Dialogs;

public sealed class ImageFormatPickerDialog : Form
{
	private readonly ComboBox _formatCombo;

	public PdfImageFormat SelectedFormat =>
		((FormatItem)_formatCombo.SelectedItem)?.Format ?? PdfImageFormat.Png;

	public ImageFormatPickerDialog(string title, string message, PdfImageFormat defaultFormat = PdfImageFormat.Png)
	{
		Text = title;
		FormBorderStyle = FormBorderStyle.FixedDialog;
		StartPosition = FormStartPosition.CenterParent;
		MaximizeBox = false;
		MinimizeBox = false;
		ShowInTaskbar = false;
		ClientSize = new Size(360, 150);
		Font = new Font("Segoe UI", 9F);

		Label messageLabel = new Label
		{
			Text = message,
			AutoSize = false,
			Left = 16,
			Top = 16,
			Width = 328,
			Height = 40
		};

		Label formatLabel = new Label
		{
			Text = "저장 형식:",
			AutoSize = true,
			Left = 16,
			Top = 64
		};

		_formatCombo = new ComboBox
		{
			Left = 96,
			Top = 60,
			Width = 248,
			DropDownStyle = ComboBoxStyle.DropDownList
		};
		foreach (PdfImageFormat format in Enum.GetValues<PdfImageFormat>())
		{
			_formatCombo.Items.Add(new FormatItem(format));
		}

		for (int i = 0; i < _formatCombo.Items.Count; i++)
		{
			if (((FormatItem)_formatCombo.Items[i]).Format == defaultFormat)
			{
				_formatCombo.SelectedIndex = i;
				break;
			}
		}

		if (_formatCombo.SelectedIndex < 0 && _formatCombo.Items.Count > 0)
		{
			_formatCombo.SelectedIndex = 0;
		}

		Button okButton = new Button
		{
			Text = "확인",
			DialogResult = DialogResult.OK,
			Left = 168,
			Top = 104,
			Width = 80
		};
		Button cancelButton = new Button
		{
			Text = "취소",
			DialogResult = DialogResult.Cancel,
			Left = 256,
			Top = 104,
			Width = 80
		};

		AcceptButton = okButton;
		CancelButton = cancelButton;
		Controls.AddRange([messageLabel, formatLabel, _formatCombo, okButton, cancelButton]);
	}

	private sealed class FormatItem(PdfImageFormat format)
	{
		public PdfImageFormat Format { get; } = format;

		public override string ToString() => PdfImageExporter.GetDisplayName(Format);
	}
}
