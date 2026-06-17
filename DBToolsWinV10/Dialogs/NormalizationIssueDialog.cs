using System;
using System.Drawing;
using System.Windows.Forms;
using DBToolsWinV10.Analysis;
using DBToolsWinV10.App;

namespace DBToolsWinV10.Dialogs;

public sealed class NormalizationIssueDialog : Form
{
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

		Panel panelHeader = new Panel
		{
			Dock = DockStyle.Top,
			Height = 72,
			BackColor = GetSeverityHeaderColor(issue.Severity),
			Padding = new Padding(16, 14, 16, 10)
		};
		Label lblTitle = new Label
		{
			AutoSize = false,
			Dock = DockStyle.Top,
			Font = new Font(ModernTheme.UiFont.FontFamily, 13f, FontStyle.Bold),
			ForeColor = Color.White,
			Height = 28,
			Text = NormalizationLabels.GetLevelGroupTitle(issue.Level)
		};
		Label lblSeverity = new Label
		{
			AutoSize = false,
			Dock = DockStyle.Top,
			Font = ModernTheme.UiFontSmall,
			ForeColor = Color.FromArgb(235, 240, 250),
			Height = 20,
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
			Location = new Point(16, 88),
			Margin = new Padding(16, 16, 16, 0),
			Padding = new Padding(0),
			Width = 432
		};
		layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 88F));
		layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));

		AddFieldRow(layout, "단계", levelLabel);
		AddFieldRow(layout, "심각도", severityLabel);
		AddFieldRow(layout, "테이블", issue.Table);
		AddFieldRow(layout, "영향 컬럼", affectedColumns);

		Label lblMessageCaption = CreateCaptionLabel("문제");
		TextBox txtMessage = CreateReadOnlyTextBox(issue.Message, 72);
		Label lblHintCaption = CreateCaptionLabel("권장 조치");
		TextBox txtHint = CreateReadOnlyTextBox(issue.Hint, 96);

		layout.Controls.Add(lblMessageCaption, 0, layout.RowCount);
		layout.SetColumnSpan(lblMessageCaption, 2);
		layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
		layout.RowCount++;
		layout.Controls.Add(txtMessage, 0, layout.RowCount);
		layout.SetColumnSpan(txtMessage, 2);
		layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
		layout.RowCount++;

		layout.Controls.Add(lblHintCaption, 0, layout.RowCount);
		layout.SetColumnSpan(lblHintCaption, 2);
		layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
		layout.RowCount++;
		layout.Controls.Add(txtHint, 0, layout.RowCount);
		layout.SetColumnSpan(txtHint, 2);
		layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
		layout.RowCount++;

		Button btnOk = new Button
		{
			DialogResult = DialogResult.OK,
			Font = ModernTheme.UiFont,
			Location = new Point(184, 0),
			Size = new Size(96, 32),
			Text = "확인"
		};

		Panel panelFooter = new Panel
		{
			Dock = DockStyle.Bottom,
			Height = 56,
			Padding = new Padding(16, 8, 16, 12)
		};
		panelFooter.Controls.Add(btnOk);
		btnOk.Anchor = AnchorStyles.Top;
		btnOk.Left = (panelFooter.ClientSize.Width - btnOk.Width) / 2;
		panelFooter.Resize += (_, _) =>
		{
			btnOk.Left = Math.Max(16, (panelFooter.ClientSize.Width - btnOk.Width) / 2);
		};

		AutoScaleMode = AutoScaleMode.Font;
		BackColor = ModernTheme.PanelBackground;
		ClientSize = new Size(464, 420);
		Controls.Add(panelFooter);
		Controls.Add(layout);
		Controls.Add(panelHeader);
		Font = ModernTheme.UiFont;
		FormBorderStyle = FormBorderStyle.FixedDialog;
		MaximizeBox = false;
		MinimizeBox = false;
		Name = "NormalizationIssueDialog";
		StartPosition = FormStartPosition.CenterParent;
		Text = $"정규화 분석 — {levelLabel} ({severityLabel})";
		AcceptButton = btnOk;
	}

	private static void AddFieldRow(TableLayoutPanel layout, string caption, string value)
	{
		layout.Controls.Add(CreateCaptionLabel(caption), 0, layout.RowCount);
		layout.Controls.Add(CreateValueLabel(value), 1, layout.RowCount);
		layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
		layout.RowCount++;
	}

	private static Label CreateCaptionLabel(string text)
	{
		return new Label
		{
			AutoSize = true,
			ForeColor = ModernTheme.TextSecondary,
			Margin = new Padding(0, 0, 8, 10),
			Text = text
		};
	}

	private static Label CreateValueLabel(string text)
	{
		return new Label
		{
			AutoSize = true,
			ForeColor = ModernTheme.TextPrimary,
			Margin = new Padding(0, 0, 0, 10),
			Text = text
		};
	}

	private static TextBox CreateReadOnlyTextBox(string text, int height)
	{
		return new TextBox
		{
			BackColor = ModernTheme.AppBackground,
			BorderStyle = BorderStyle.FixedSingle,
			Dock = DockStyle.Top,
			Font = ModernTheme.UiFontSmall,
			ForeColor = ModernTheme.TextPrimary,
			Margin = new Padding(0, 0, 0, 12),
			Multiline = true,
			ReadOnly = true,
			ScrollBars = ScrollBars.Vertical,
			Size = new Size(432, height),
			TabStop = false,
			Text = text ?? string.Empty
		};
	}

	private static Color GetSeverityHeaderColor(IssueSeverity severity) => severity switch
	{
		IssueSeverity.Error => Color.FromArgb(185, 28, 28),
		IssueSeverity.Warning => Color.FromArgb(180, 83, 9),
		_ => Color.FromArgb(67, 56, 202)
	};
}
