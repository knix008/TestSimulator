using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;
using DBToolsWinV10.App;

namespace DBToolsWinV10.Controls;

/// <summary>
/// Owner-drawn checkbox with high-contrast check marks in light and dark themes.
/// </summary>
public sealed class ThemedCheckBox : CheckBox
{
	private const int BoxSize = 14;
	private const int BoxGap = 6;

	private bool _hover;

	public ThemedCheckBox()
	{
		FlatStyle = FlatStyle.Flat;
		UseVisualStyleBackColor = false;
		SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
	}

	protected override bool ShowFocusCues => false;

	protected override void OnMouseEnter(EventArgs e)
	{
		base.OnMouseEnter(e);
		_hover = true;
		Invalidate();
	}

	protected override void OnMouseLeave(EventArgs e)
	{
		base.OnMouseLeave(e);
		_hover = false;
		Invalidate();
	}

	protected override void OnCheckedChanged(EventArgs e)
	{
		base.OnCheckedChanged(e);
		Invalidate();
	}

	protected override void OnEnabledChanged(EventArgs e)
	{
		base.OnEnabledChanged(e);
		Invalidate();
	}

	protected override void OnFontChanged(EventArgs e)
	{
		base.OnFontChanged(e);
		Invalidate();
	}

	protected override void OnTextChanged(EventArgs e)
	{
		base.OnTextChanged(e);
		Invalidate();
	}

	public override Size GetPreferredSize(Size proposedSize)
	{
		Size textSize = TextRenderer.MeasureText(
			Text,
			Font,
			proposedSize,
			TextFormatFlags.SingleLine);

		int width = BoxSize + BoxGap + textSize.Width + 2;
		int height = Math.Max(BoxSize, textSize.Height) + 4;
		return new Size(width, height);
	}

	protected override void OnPaint(PaintEventArgs e)
	{
		Graphics g = e.Graphics;
		g.SmoothingMode = SmoothingMode.AntiAlias;

		Color surface = Parent?.BackColor ?? ModernTheme.PanelBackground;
		g.Clear(surface);

		int boxY = Math.Max(0, (Height - BoxSize) / 2);
		var boxRect = new Rectangle(0, boxY, BoxSize, BoxSize);

		bool enabled = Enabled;
		bool isChecked = Checked;

		Color boxFill = isChecked
			? (enabled ? ModernTheme.Accent : ModernTheme.Border)
			: (enabled ? ModernTheme.InputBackground : ModernTheme.PanelBackground);

		if (enabled && _hover)
			boxFill = isChecked ? ModernTheme.AccentHover : ModernTheme.ToolHover;

		Color boxBorder = isChecked
			? (enabled ? ModernTheme.Accent : ModernTheme.Border)
			: ModernTheme.Border;

		using (var fillBrush = new SolidBrush(boxFill))
			g.FillRectangle(fillBrush, boxRect);

		using (var borderPen = new Pen(boxBorder))
			g.DrawRectangle(borderPen, boxRect.X, boxRect.Y, boxRect.Width - 1, boxRect.Height - 1);

		if (isChecked)
			DrawCheckMark(g, boxRect, enabled ? Color.White : ModernTheme.TextMuted);

		Color textColor = enabled ? ModernTheme.TextPrimary : ModernTheme.TextMuted;
		var textRect = new Rectangle(BoxSize + BoxGap, 0, Math.Max(0, Width - BoxSize - BoxGap), Height);
		TextRenderer.DrawText(
			g,
			Text,
			Font,
			textRect,
			textColor,
			TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.SingleLine);
	}

	private static void DrawCheckMark(Graphics g, Rectangle box, Color color)
	{
		using var pen = new Pen(color, 2f)
		{
			StartCap = LineCap.Round,
			EndCap = LineCap.Round,
		};

		int x = box.X;
		int y = box.Y;
		int s = box.Width;
		g.DrawLines(pen, new[]
		{
			new Point(x + 3, y + s / 2),
			new Point(x + s / 2 - 1, y + s - 4),
			new Point(x + s - 3, y + 3),
		});
	}
}
