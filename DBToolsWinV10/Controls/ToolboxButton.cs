using System;
using System.Drawing;
using System.Windows.Forms;

namespace DBToolsWinV10.Controls;

/// <summary>
/// Borderless icon button for the left toolbox. Fully owner-drawn to avoid native BUTTON chrome.
/// </summary>
public sealed class ToolboxButton : Button
{
	private bool _hover;
	private bool _pressed;

	public ToolboxButton()
	{
		FlatStyle = FlatStyle.Flat;
		UseVisualStyleBackColor = false;
		FlatAppearance.BorderSize = 0;
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

	protected override void OnBackColorChanged(EventArgs e)
	{
		base.OnBackColorChanged(e);
		Invalidate();
	}

	protected override void OnForeColorChanged(EventArgs e)
	{
		base.OnForeColorChanged(e);
		Invalidate();
	}

	protected override void OnPaint(PaintEventArgs pevent)
	{
		Color bg = BackColor;
		if (_pressed)
			bg = FlatAppearance.MouseDownBackColor;
		else if (_hover)
			bg = FlatAppearance.MouseOverBackColor;

		pevent.Graphics.Clear(bg);

		if (Image != null)
		{
			int x = (Width - Image.Width) / 2;
			int y = (Height - Image.Height) / 2;
			pevent.Graphics.DrawImage(Image, x, y, Image.Width, Image.Height);
		}
		else if (!string.IsNullOrEmpty(Text))
		{
			TextRenderer.DrawText(
				pevent.Graphics,
				Text,
				Font,
				ClientRectangle,
				ForeColor,
				TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine);
		}
	}
}
