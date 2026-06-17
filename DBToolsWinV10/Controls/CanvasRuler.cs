using System;
using System.ComponentModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.Windows.Forms;

namespace DBToolsWinV10.Controls;

public sealed class CanvasRuler : Control
{
	private static readonly Color BgColor = Color.FromArgb(248, 249, 251);

	private static readonly Color TickColor = Color.FromArgb(180, 186, 195);

	private static readonly Color MajorTickColor = Color.FromArgb(107, 114, 128);

	private static readonly Color TextColor = Color.FromArgb(75, 85, 99);

	private static readonly Color BorderColor = Color.FromArgb(209, 213, 219);

	[Browsable(false)]
	[DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
	public RulerOrientation Orientation { get; set; } = RulerOrientation.Horizontal;

	[Browsable(false)]
	[DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
	public float Zoom { get; set; } = 1f;

	[Browsable(false)]
	[DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
	public int ScrollOffset { get; set; }

	public CanvasRuler()
	{
		DoubleBuffered = true;
		SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, value: true);
		BackColor = BgColor;
	}

	protected override void OnPaint(PaintEventArgs e)
	{
		Graphics graphics = e.Graphics;
		graphics.SmoothingMode = SmoothingMode.AntiAlias;
		graphics.Clear(BgColor);
		if (Zoom <= 0.001f)
		{
			return;
		}
		float num = PickCanvasInterval(56f / Zoom);
		float num2 = (float)ScrollOffset / Zoom;
		float num3 = ((Orientation == RulerOrientation.Horizontal) ? base.Width : base.Height);
		float num4 = num2 + num3 / Zoom;
		float num5 = (float)(Math.Floor(num2 / num) * (double)num);
		using Pen pen = new Pen(TickColor);
		using Pen pen2 = new Pen(MajorTickColor);
		using Font font = new Font("Segoe UI", 7f);
		using SolidBrush brush = new SolidBrush(TextColor);
		using Pen pen3 = new Pen(BorderColor);
		for (float num6 = num5; num6 <= num4 + num; num6 += num)
		{
			float num7 = num6 * Zoom - (float)ScrollOffset;
			bool flag = IsMajorInterval(num, num6);
			if (Orientation == RulerOrientation.Horizontal)
			{
				if (!(num7 < -2f) && !(num7 > (float)(base.Width + 2)))
				{
					int num8 = (int)Math.Round(num7);
					int num9 = Math.Max(10, base.Height / 2);
					int num10 = (flag ? (base.Height - num9) : ((base.Height - num9) / 2));
					int y = base.Height - num10;
					graphics.DrawLine(flag ? pen2 : pen, num8, base.Height - 1, num8, y);
					if (flag)
					{
						string text = FormatCoord(num6);
						SizeF sizeF = graphics.MeasureString(text, font);
						float val = (float)num8 - sizeF.Width / 2f;
						val = Math.Max(1f, Math.Min(val, (float)base.Width - sizeF.Width - 1f));
						graphics.DrawString(text, font, brush, val, 1f);
					}
				}
			}
			else
			{
				if (num7 < -2f || num7 > (float)(base.Height + 2))
				{
					continue;
				}
				int num11 = (int)Math.Round(num7);
				int num12 = Math.Max(14, base.Width * 3 / 5);
				int num13 = (flag ? (base.Width - num12) : Math.Max(3, (base.Width - num12) / 2));
				int x = base.Width - num13;
				graphics.DrawLine(flag ? pen2 : pen, base.Width - 1, num11, x, num11);
				if (flag)
				{
					string s = FormatCoord(num6);
					GraphicsState gstate = graphics.Save();
					graphics.TranslateTransform((float)num12 / 2f, num11);
					graphics.RotateTransform(-90f);
					using StringFormat format = new StringFormat
					{
						Alignment = StringAlignment.Center,
						LineAlignment = StringAlignment.Center,
						FormatFlags = StringFormatFlags.NoWrap
					};
					graphics.DrawString(s, font, brush, 0f, 0f, format);
					graphics.Restore(gstate);
				}
			}
		}
		if (Orientation == RulerOrientation.Horizontal)
		{
			graphics.DrawLine(pen3, 0, base.Height - 1, base.Width, base.Height - 1);
		}
		else
		{
			graphics.DrawLine(pen3, 0, 0, 0, base.Height);
			graphics.DrawLine(pen3, base.Width - 1, 0, base.Width - 1, base.Height);
		}
	}

	private static float PickCanvasInterval(float minCanvasUnits)
	{
		ReadOnlySpan<float> readOnlySpan = new float[10] { 5f, 10f, 20f, 25f, 50f, 100f, 200f, 250f, 500f, 1000f };
		ReadOnlySpan<float> readOnlySpan2 = readOnlySpan;
		for (int i = 0; i < readOnlySpan2.Length; i++)
		{
			float num = readOnlySpan2[i];
			if (num >= minCanvasUnits)
			{
				return num;
			}
		}
		return 1000f;
	}

	private static bool IsMajorInterval(float interval, float coord)
	{
		return Math.Abs(coord % (interval * 5f)) < 0.01f || interval >= 100f;
	}

	private static string FormatCoord(float c)
	{
		return ((long)Math.Round(c)).ToString("N0", CultureInfo.CurrentCulture);
	}
}
