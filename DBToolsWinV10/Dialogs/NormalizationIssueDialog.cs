using System;
using System.Drawing;
using System.Windows.Forms;
using DBToolsWinV10.Analysis;
using DBToolsWinV10.App;

namespace DBToolsWinV10.Dialogs;

public sealed class NormalizationIssueDialog : Form
{
	private const int ContentWidth = 448;

	private const int HorizontalPadding = 20;

	private const int FooterHeight = 44;

	private const int FooterButtonTop = 4;

	private const int MaxDialogHeight = 720;

	private NormalizationIssueDialog(NormalizationIssue issue)
	{
		InitializeComponent(issue);
	}

	public static void Show(IWin32Window owner, NormalizationIssue issue)
	{
		if (issue == null)
		{
			return;
		}

		using NormalizationIssueDialog dialog = new NormalizationIssueDialog(issue);
		dialog.ShowDialog(owner);
	}

	private void InitializeComponent(NormalizationIssue issue)
	{
		string levelLabel = NormalizationLabels.GetLevelLabel(issue.Level);
		string severityLabel = NormalizationLabels.GetSeverityLabel(issue.Severity);
		string affectedColumns = string.IsNullOrWhiteSpace(issue.AffectedColumns) ? "-" : issue.AffectedColumns;
		int valueColumnWidth = ContentWidth - 92;

		Panel panelHeader = new Panel
		{
			Dock = DockStyle.Top,
			Height = 76,
			BackColor = GetSeverityHeaderColor(issue.Severity),
			Padding = new Padding(HorizontalPadding, 14, HorizontalPadding, 10)
		};
		Label lblTitle = new Label
		{
			AutoSize = false,
			Dock = DockStyle.Top,
			Font = new Font(ModernTheme.UiFont.FontFamily, 13f, FontStyle.Bold),
			ForeColor = Color.White,
			Height = 30,
			Text = NormalizationLabels.GetLevelGroupTitle(issue.Level)
		};
		Label lblSeverity = new Label
		{
			AutoSize = false,
			Dock = DockStyle.Top,
			Font = ModernTheme.UiFontSmall,
			ForeColor = Color.FromArgb(235, 240, 250),
			Height = 22,
			Text = severityLabel
		};
		panelHeader.Controls.Add(lblSeverity);
		panelHeader.Controls.Add(lblTitle);

		TableLayoutPanel layout = new TableLayoutPanel
		{
			AutoSize = true,
			AutoSizeMode = AutoSizeMode.GrowAndShrink,
			ColumnCount = 2,
			Dock = DockStyle.Top,
			Location = new Point(0, 0),
			Margin = Padding.Empty,
			Padding = Padding.Empty,
			Width = ContentWidth
		};
		layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 84F));
		layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));

		AddFieldRow(layout, L.S("NormLevel",       "단계"),    levelLabel,    valueColumnWidth);
		AddFieldRow(layout, L.S("NormSeverity",    "심각도"),  severityLabel, valueColumnWidth);
		AddFieldRow(layout, L.S("NormTableField",  "테이블"),  issue.Table,   valueColumnWidth);
		AddFieldRow(layout, L.S("NormColumnField", "영향 컬럼"), affectedColumns, valueColumnWidth);

		AddSectionCaption(layout, L.S("NormIssueField",  "문제"));
		AddSectionText(layout, issue.Message, ContentWidth, minHeight: 72, maxHeight: 140);
		AddSectionCaption(layout, L.S("NormActionField", "권장 조치"));
		AddSectionText(layout, issue.Hint, ContentWidth, minHeight: 88, maxHeight: 180);

		Panel panelContent = new Panel
		{
			BackColor = ModernTheme.PanelBackground,
			Dock = DockStyle.Top,
			Padding = new Padding(HorizontalPadding, 16, HorizontalPadding, 4)
		};
		panelContent.Controls.Add(layout);

		Button btnOk = new Button
		{
			DialogResult = DialogResult.OK,
			Font = ModernTheme.UiFont,
			Size = new Size(96, 32),
			Text = L.S("BtnOk", "확인")
		};
		ModernTheme.StyleDialogButton(btnOk, "Ok");
		Panel panelFooter = new Panel
		{
			Dock = DockStyle.Bottom,
			Height = FooterHeight,
			Padding = new Padding(0, FooterButtonTop, 0, 8)
		};
		panelFooter.Controls.Add(btnOk);
		panelFooter.Resize += (_, _) => PositionFooterButton(panelFooter, btnOk);

		AutoScaleMode = AutoScaleMode.Font;
		BackColor = ModernTheme.PanelBackground;
		Controls.Add(panelContent);
		Controls.Add(panelFooter);
		Controls.Add(panelHeader);
		Font = ModernTheme.UiFont;
		FormBorderStyle = FormBorderStyle.FixedDialog;
		MaximizeBox = false;
		MinimizeBox = false;
		Name = "NormalizationIssueDialog";
		StartPosition = FormStartPosition.CenterParent;
		Text = L.S("TabAnalysis", "정규화") + $" — {levelLabel} ({severityLabel})";
		AcceptButton = btnOk;

		layout.PerformLayout();
		int contentHeight = layout.PreferredSize.Height + panelContent.Padding.Vertical;
		int desiredClientHeight = panelHeader.Height + contentHeight + panelFooter.Height;
		if (desiredClientHeight > MaxDialogHeight)
		{
			panelContent.AutoScroll = true;
			panelContent.Dock = DockStyle.Fill;
			panelContent.Height = MaxDialogHeight - panelHeader.Height - panelFooter.Height;
			ClientSize = new Size(ContentWidth + HorizontalPadding * 2, MaxDialogHeight);
		}
		else
		{
			panelContent.Height = contentHeight;
			ClientSize = new Size(ContentWidth + HorizontalPadding * 2, desiredClientHeight);
		}

		PositionFooterButton(panelFooter, btnOk);
		ModernTheme.ApplyThemeToForm(this);
	}

	private static void PositionFooterButton(Control parent, Control child)
	{
		child.Left = Math.Max(0, (parent.ClientSize.Width - child.Width) / 2);
		child.Top = FooterButtonTop;
	}

	private static void AddFieldRow(TableLayoutPanel layout, string caption, string value, int valueWidth)
	{
		layout.Controls.Add(CreateCaptionLabel(caption), 0, layout.RowCount);
		layout.Controls.Add(CreateWrappedValueLabel(value, valueWidth), 1, layout.RowCount);
		layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
		layout.RowCount++;
	}

	private static void AddSectionCaption(TableLayoutPanel layout, string caption)
	{
		Label label = CreateCaptionLabel(caption);
		label.Margin = new Padding(0, 4, 0, 6);
		layout.Controls.Add(label, 0, layout.RowCount);
		layout.SetColumnSpan(label, 2);
		layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
		layout.RowCount++;
	}

	private static void AddSectionText(TableLayoutPanel layout, string text, int width, int minHeight, int maxHeight)
	{
		TextBox textBox = CreateReadOnlyTextBox(text, width, minHeight, maxHeight);
		layout.Controls.Add(textBox, 0, layout.RowCount);
		layout.SetColumnSpan(textBox, 2);
		layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
		layout.RowCount++;
	}

	private static Label CreateCaptionLabel(string text)
	{
		return new Label
		{
			AutoSize = true,
			ForeColor = ModernTheme.TextSecondary,
			Margin = new Padding(0, 0, 8, 8),
			Text = text
		};
	}

	private static Label CreateWrappedValueLabel(string text, int width)
	{
		Font font = ModernTheme.UiFont;
		Size measured = TextRenderer.MeasureText(
			text ?? string.Empty,
			font,
			new Size(width, int.MaxValue),
			TextFormatFlags.WordBreak | TextFormatFlags.Left);
		return new Label
		{
			AutoSize = false,
			ForeColor = ModernTheme.TextPrimary,
			Margin = new Padding(0, 0, 0, 8),
			Size = new Size(width, Math.Max(font.Height + 4, measured.Height)),
			Text = text ?? string.Empty
		};
	}

	private static TextBox CreateReadOnlyTextBox(string text, int width, int minHeight, int maxHeight)
	{
		Font font = ModernTheme.UiFontSmall;
		string value = text ?? string.Empty;
		int textWidth = Math.Max(40, width - 6);
		Size measured = TextRenderer.MeasureText(
			value,
			font,
			new Size(textWidth, int.MaxValue),
			TextFormatFlags.WordBreak | TextFormatFlags.Left | TextFormatFlags.TextBoxControl);
		int height = Math.Clamp(measured.Height + 10, minHeight, maxHeight);
		return new TextBox
		{
			Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
			BackColor = ModernTheme.AppBackground,
			BorderStyle = BorderStyle.FixedSingle,
			Font = font,
			ForeColor = ModernTheme.TextPrimary,
			Margin = new Padding(0, 0, 0, 10),
			Multiline = true,
			ReadOnly = true,
			ScrollBars = height >= maxHeight ? ScrollBars.Vertical : ScrollBars.None,
			Size = new Size(width, height),
			TabStop = false,
			Text = value,
			WordWrap = true
		};
	}

	private static Color GetSeverityHeaderColor(IssueSeverity severity) => severity switch
	{
		IssueSeverity.Error => Color.FromArgb(185, 28, 28),
		IssueSeverity.Warning => Color.FromArgb(180, 83, 9),
		_ => Color.FromArgb(67, 56, 202)
	};
}
