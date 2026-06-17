using System;
using System.Drawing;
using System.Windows.Forms;
using DBToolsWinV10.App;

namespace DBToolsWinV10.Controls;

public sealed class ToolboxGroupBox : GroupBox
{
	public ToolboxGroupBox()
	{
		DoubleBuffered = true;
		SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, value: true);
	}

	protected override void OnPaint(PaintEventArgs e)
	{
		Graphics graphics = e.Graphics;
		Rectangle clientRectangle = base.ClientRectangle;
		if (clientRectangle.Width <= 0 || clientRectangle.Height <= 0)
		{
			return;
		}
		int num = Math.Max(8, Font.Height / 2);
		Color borderLight = ModernTheme.BorderLight;
		graphics.Clear(BackColor);
		using Pen pen = new Pen(borderLight);
		graphics.DrawLine(pen, 0, num, 0, clientRectangle.Height - 1);
		graphics.DrawLine(pen, 0, clientRectangle.Height - 1, clientRectangle.Width - 1, clientRectangle.Height - 1);
		graphics.DrawLine(pen, clientRectangle.Width - 1, clientRectangle.Height - 1, clientRectangle.Width - 1, num);
		string text = Text;
		SizeF sizeF = graphics.MeasureString(text, Font);
		int num2 = Math.Max(0, (clientRectangle.Width - (int)Math.Ceiling(sizeF.Width)) / 2);
		using SolidBrush brush = new SolidBrush(BackColor);
		graphics.FillRectangle(brush, num2 - 4, 0, (int)Math.Ceiling(sizeF.Width) + 8, Font.Height);
		using SolidBrush brush2 = new SolidBrush(ForeColor);
		graphics.DrawString(text, Font, brush2, num2, 0f);
		graphics.DrawLine(pen, 0, num, Math.Max(0, num2 - 6), num);
		graphics.DrawLine(pen, num2 + (int)Math.Ceiling(sizeF.Width) + 6, num, clientRectangle.Width - 1, num);
	}
}
