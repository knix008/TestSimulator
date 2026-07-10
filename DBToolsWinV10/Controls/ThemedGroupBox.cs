using System;
using System.Drawing;
using System.Windows.Forms;
using DBToolsWinV10.App;

namespace DBToolsWinV10.Controls;

internal sealed class ThemedGroupBox : GroupBox
{
	public ThemedGroupBox()
	{
		DoubleBuffered = true;
		SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
	}

	protected override void OnPaint(PaintEventArgs e)
	{
		Graphics g = e.Graphics;
		Rectangle rc = ClientRectangle;
		if (rc.Width <= 0 || rc.Height <= 0)
			return;

		int headerY = Math.Max(8, Font.Height / 2);
		g.Clear(BackColor);

		using var pen = new Pen(ModernTheme.BorderLight);
		const int textX = 10;
		Size textSize = TextRenderer.MeasureText(Text, Font, new Size(rc.Width - 20, Font.Height),
			TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis);
		int lineEndBefore = Math.Max(0, textX - 4);
		int lineStartAfter = Math.Min(rc.Width - 1, textX + textSize.Width + 4);

		g.DrawLine(pen, 0, headerY, lineEndBefore, headerY);
		g.DrawLine(pen, lineStartAfter, headerY, rc.Width - 1, headerY);
		g.DrawLine(pen, 0, headerY, 0, rc.Height - 1);
		g.DrawLine(pen, rc.Width - 1, headerY, rc.Width - 1, rc.Height - 1);
		g.DrawLine(pen, 0, rc.Height - 1, rc.Width - 1, rc.Height - 1);

		using var textBrush = new SolidBrush(ForeColor);
		using var bgBrush = new SolidBrush(BackColor);
		g.FillRectangle(bgBrush, textX - 2, 0, textSize.Width + 4, Font.Height);
		TextRenderer.DrawText(g, Text, Font, new Point(textX, 0), ForeColor,
			TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis);
	}
}
