using System;
using System.Drawing;
using System.Windows.Forms;
using DBToolsWinV10.App;

namespace DBToolsWinV10.Controls;

/// <summary>
/// Owner-drawn dialog button that always follows ModernTheme colors.
/// </summary>
public sealed class ThemedDialogButton : Button
{
	private bool _hover;
	private bool _pressed;

	public ThemedDialogButton()
	{
		FlatStyle = FlatStyle.Flat;
		UseVisualStyleBackColor = false;
		SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
		Cursor = Cursors.Hand;
	}

	protected override bool ShowFocusCues => false;

	public void RefreshTheme()
	{
		Font = ModernTheme.UiFont;
		Invalidate(true);
	}

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
		_pressed = false;
		Invalidate();
	}

	protected override void OnMouseDown(MouseEventArgs mevent)
	{
		base.OnMouseDown(mevent);
		if (mevent.Button == MouseButtons.Left)
		{
			_pressed = true;
			Invalidate();
		}
	}

	protected override void OnMouseUp(MouseEventArgs mevent)
	{
		base.OnMouseUp(mevent);
		_pressed = false;
		Invalidate();
	}

	protected override void OnEnabledChanged(EventArgs e)
	{
		base.OnEnabledChanged(e);
		Invalidate();
	}

	protected override void OnTextChanged(EventArgs e)
	{
		base.OnTextChanged(e);
		Invalidate();
	}

	protected override void OnPaint(PaintEventArgs pevent)
	{
		Graphics g = pevent.Graphics;
		Rectangle bounds = ClientRectangle;

		bool enabled = Enabled;
		Color bg = enabled ? ModernTheme.PanelBackground : ModernTheme.SidebarBackground;
		if (enabled && _pressed)
			bg = ModernTheme.AccentMuted;
		else if (enabled && _hover)
			bg = ModernTheme.ToolHover;

		Color border = ModernTheme.Border;
		Color fg = enabled ? ModernTheme.TextPrimary : ModernTheme.TextMuted;

		using (var fillBrush = new SolidBrush(bg))
			g.FillRectangle(fillBrush, bounds);

		using (var borderPen = new Pen(border))
			g.DrawRectangle(borderPen, bounds.X, bounds.Y, bounds.Width - 1, bounds.Height - 1);

		int x = 8;
		if (Image != null)
		{
			int imageY = (bounds.Height - Image.Height) / 2;
			g.DrawImage(Image, x, imageY, Image.Width, Image.Height);
			x += Image.Width + 4;
		}

		var textRect = new Rectangle(x, 0, Math.Max(0, bounds.Width - x - 6), bounds.Height);
		TextRenderer.DrawText(
			g,
			Text,
			Font,
			textRect,
			fg,
			TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis);
	}
}
