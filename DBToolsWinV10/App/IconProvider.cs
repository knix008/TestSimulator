using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;

namespace DBToolsWinV10.App;

public static class IconProvider
{
	private static readonly Dictionary<string, Image> _cache = new Dictionary<string, Image>();

	public static Image Get(string name, int size = 16)
	{
		string key = $"{name}_{size}";
		if (_cache.TryGetValue(key, out Image value))
		{
			return value;
		}
		Image image = Draw(name, size);
		_cache[key] = image;
		return image;
	}

	private static Image Draw(string name, int size)
	{
		if (1 == 0)
		{
		}
		Image result = name switch
		{
			"New" => DrawNew(size), 
			"Open" => DrawOpen(size), 
			"Save" => DrawSave(size), 
			"SaveAs" => DrawSaveAs(size), 
			"Recent" => DrawRecent(size), 
			"Export" => DrawExport(size), 
			"ExportSql" => DrawExportSql(size), 
			"Exit" => DrawExit(size), 
			"AddTable" => DrawAddTable(size), 
			"AddColumn" => DrawAddColumn(size), 
			"AddRelation" => DrawAddRelation(size), 
			"Rel11" => DrawRel(size, "1:1"), 
			"Rel1N" => DrawRel(size, "1:N"), 
			"RelNM" => DrawRel(size, "N:M"), 
			"Delete" => DrawDelete(size), 
			"Edit" => DrawEdit(size), 
			"ZoomIn" => DrawZoomIn(size), 
			"ZoomOut" => DrawZoomOut(size), 
			"FitAll" => DrawFitAll(size), 
			"PanelCollapse" => DrawRightPanelLayout(size, panelOpen: true), 
			"PanelExpand" => DrawRightPanelLayout(size, panelOpen: false), 
			"Analyze" => DrawAnalyze(size), 
			"Report" => DrawReport(size), 
			"ImportDb" => DrawOpenDbFile(size), 
			"OpenDbFile" => DrawOpenDbFile(size), 
			"About" => DrawAbout(size), 
			"Select" => DrawSelect(size), 
			"PostgreSQL" => DrawDbBadge(size, Color.FromArgb(52, 101, 164), "PG"), 
			"MySQL" => DrawDbBadge(size, Color.FromArgb(0, 114, 66), "MY"), 
			"MariaDB" => DrawDbBadge(size, Color.FromArgb(194, 63, 63), "MA"), 
			"SQLite" => DrawDbBadge(size, Color.FromArgb(90, 90, 140), "SQ"), 
			"SqlServer" => DrawDbBadge(size, Color.FromArgb(204, 41, 39), "MS"), 
			_ => DrawDefault(size), 
		};
		if (1 == 0)
		{
		}
		return result;
	}

	private static Bitmap New32(int size)
	{
		return new Bitmap(size, size, PixelFormat.Format32bppArgb);
	}

	private static Graphics Setup(Bitmap bmp)
	{
		Graphics graphics = Graphics.FromImage(bmp);
		graphics.SmoothingMode = SmoothingMode.AntiAlias;
		graphics.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
		graphics.Clear(Color.Transparent);
		return graphics;
	}

	private static float P(int sz, float units)
	{
		return units * (float)sz / 16f;
	}

	private static Image DrawNew(int sz)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		float num = P(sz, 1.5f);
		float num2 = (float)sz - num * 2f - P(sz, 2f);
		float num3 = (float)sz - num * 2f;
		float num4 = P(sz, 4f);
		using Pen pen = new Pen(Color.FromArgb(80, 120, 180), P(sz, 1f));
		using SolidBrush brush = new SolidBrush(Color.FromArgb(230, 240, 255));
		using SolidBrush brush2 = new SolidBrush(Color.FromArgb(180, 200, 230));
		PointF[] points = new PointF[5]
		{
			new PointF(num, num),
			new PointF(num + num2 - num4, num),
			new PointF(num + num2, num + num4),
			new PointF(num + num2, num + num3),
			new PointF(num, num + num3)
		};
		graphics.FillPolygon(brush, points);
		graphics.DrawPolygon(pen, points);
		PointF[] points2 = new PointF[3]
		{
			new PointF(num + num2 - num4, num),
			new PointF(num + num2, num + num4),
			new PointF(num + num2 - num4, num + num4)
		};
		graphics.FillPolygon(brush2, points2);
		graphics.DrawPolygon(pen, points2);
		float num5 = num + num2 / 2f - P(sz, 0.5f);
		float num6 = num + num3 / 2f + P(sz, 1f);
		float num7 = P(sz, 2f);
		using Pen pen2 = new Pen(Color.FromArgb(40, 140, 200), P(sz, 1.5f))
		{
			StartCap = LineCap.Round,
			EndCap = LineCap.Round
		};
		graphics.DrawLine(pen2, num5, num6 - num7, num5, num6 + num7);
		graphics.DrawLine(pen2, num5 - num7, num6, num5 + num7, num6);
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawOpen(int sz)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		float num = P(sz, 1f);
		using SolidBrush brush = new SolidBrush(Color.FromArgb(240, 180, 50));
		using SolidBrush brush2 = new SolidBrush(Color.FromArgb(255, 210, 80));
		using Pen pen = new Pen(Color.FromArgb(180, 130, 20), P(sz, 1f));
		RectangleF rect = new RectangleF(num, num + P(sz, 3f), (float)sz - num * 2f, (float)sz - num - P(sz, 3f) - num);
		graphics.FillRectangle(brush, rect);
		RectangleF rect2 = new RectangleF(num, num + P(sz, 1f), P(sz, 5f), P(sz, 3f));
		graphics.FillRectangle(brush2, rect2);
		RectangleF rect3 = new RectangleF(num, num + P(sz, 4f), (float)sz - num * 2f, (float)sz - num * 2f - P(sz, 4f));
		graphics.FillRectangle(brush2, rect3);
		graphics.DrawRectangle(pen, rect3.X, rect3.Y, rect3.Width, rect3.Height);
		graphics.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);
		float num2 = (float)sz - P(sz, 4f);
		float num3 = num + P(sz, 5f);
		using Pen pen2 = new Pen(Color.White, P(sz, 1.5f))
		{
			StartCap = LineCap.Round,
			EndCap = LineCap.Round
		};
		graphics.DrawLine(pen2, num2, num3 + P(sz, 3f), num2, num3);
		graphics.DrawLine(pen2, num2 - P(sz, 2f), num3 + P(sz, 2f), num2, num3);
		graphics.DrawLine(pen2, num2 + P(sz, 2f), num3 + P(sz, 2f), num2, num3);
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawSave(int sz)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		float num = P(sz, 1f);
		float num2 = (float)sz - num * 2f;
		float num3 = (float)sz - num * 2f;
		using SolidBrush brush = new SolidBrush(Color.FromArgb(90, 110, 150));
		using SolidBrush brush2 = new SolidBrush(Color.FromArgb(200, 220, 255));
		using SolidBrush brush3 = new SolidBrush(Color.FromArgb(60, 80, 120));
		using Pen pen = new Pen(Color.FromArgb(50, 70, 110), P(sz, 1f));
		graphics.FillRectangle(brush, num, num, num2, num3);
		graphics.FillRectangle(brush2, num + P(sz, 1f), num + P(sz, 1f), num2 - P(sz, 2f), num3 * 0.45f);
		graphics.FillRectangle(brush3, num + num2 * 0.3f, num + P(sz, 1.5f), num2 * 0.25f, P(sz, 3f));
		graphics.FillRectangle(brush, num + P(sz, 2f), num + num3 * 0.55f, num2 - P(sz, 4f), num3 * 0.4f);
		graphics.DrawRectangle(pen, num, num, num2, num3);
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawSaveAs(int sz)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		using Bitmap image = (Bitmap)DrawSave((int)((float)sz * 0.8f));
		graphics.Clear(Color.Transparent);
		graphics.DrawImage(image, 0, 0, (int)((float)sz * 0.8f), (int)((float)sz * 0.8f));
		float num = (float)sz - P(sz, 2.5f);
		float num2 = (float)sz - P(sz, 2.5f);
		using SolidBrush brush = new SolidBrush(Color.FromArgb(40, 180, 80));
		graphics.FillEllipse(brush, num - P(sz, 2.5f), num2 - P(sz, 2.5f), P(sz, 5f), P(sz, 5f));
		using Pen pen = new Pen(Color.White, P(sz, 1.5f))
		{
			StartCap = LineCap.Round,
			EndCap = LineCap.Round
		};
		graphics.DrawLine(pen, num, num2 - P(sz, 1.5f), num, num2 + P(sz, 1.5f));
		graphics.DrawLine(pen, num - P(sz, 1.5f), num2, num + P(sz, 1.5f), num2);
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawRecent(int sz)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		float num = (float)sz / 2f;
		float num2 = (float)sz / 2f;
		float num3 = (float)sz / 2f - P(sz, 1.5f);
		using Pen pen = new Pen(Color.FromArgb(80, 140, 210), P(sz, 1.5f));
		using Pen pen2 = new Pen(Color.FromArgb(255, 160, 30), P(sz, 1.5f))
		{
			StartCap = LineCap.Round,
			EndCap = LineCap.Round
		};
		graphics.DrawEllipse(pen, num - num3, num2 - num3, num3 * 2f, num3 * 2f);
		graphics.DrawLine(pen2, num, num2, num, num2 - num3 * 0.6f);
		graphics.DrawLine(pen2, num, num2, num + num3 * 0.5f, num2);
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawExport(int sz)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		float num = P(sz, 2f);
		using Pen pen = new Pen(Color.FromArgb(60, 160, 60), P(sz, 1.5f))
		{
			StartCap = LineCap.Round,
			EndCap = LineCap.Round
		};
		using (new SolidBrush(Color.FromArgb(60, 160, 60)))
		{
			float x = num;
			float num2 = num + P(sz, 3f);
			float width = (float)sz - num * 2f - P(sz, 3f);
			float height = (float)sz - num * 2f - P(sz, 3f);
			graphics.DrawRectangle(new Pen(Color.FromArgb(100, 160, 100), P(sz, 1f)), x, num2, width, height);
			float num3 = (float)sz - P(sz, 2f);
			float num4 = P(sz, 2f);
			graphics.DrawLine(pen, num3 - P(sz, 4f), num4, num3, num4);
			graphics.DrawLine(pen, num3, num4, num3 - P(sz, 2f), num4 - P(sz, 2f));
			graphics.DrawLine(pen, num3, num4, num3 - P(sz, 2f), num4 + P(sz, 2f));
			graphics.DrawLine(pen, (float)sz / 2f, num2, (float)sz / 2f, num4 + P(sz, 1f));
			graphics.Dispose();
			return bitmap;
		}
	}

	private static Image DrawExportSql(int sz)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		float num = (float)sz * 0.38f;
		float num2 = (float)sz * 0.35f;
		using SolidBrush brush = new SolidBrush(Color.FromArgb(50, 100, 180));
		using SolidBrush brush2 = new SolidBrush(Color.FromArgb(80, 140, 220));
		using Pen pen = new Pen(Color.FromArgb(40, 80, 150), P(sz, 1f));
		float num3 = P(sz, 3f);
		float y = P(sz, 8f);
		float num4 = P(sz, 13f);
		float num5 = num2 * 1.2f;
		float num6 = num2 * 0.4f;
		graphics.FillEllipse(brush, num - num5, num4, num5 * 2f, num6 * 2f);
		graphics.FillRectangle(brush, num - num5, num3 + num6, num5 * 2f, num4 + num6 - (num3 + num6));
		graphics.FillEllipse(brush, num - num5, y, num5 * 2f, num6 * 2f);
		graphics.FillEllipse(brush2, num - num5, num3, num5 * 2f, num6 * 2f);
		graphics.DrawEllipse(pen, num - num5, num3, num5 * 2f, num6 * 2f);
		graphics.DrawLine(pen, num - num5, num3 + num6, num - num5, num4 + num6);
		graphics.DrawLine(pen, num + num5, num3 + num6, num + num5, num4 + num6);
		float num7 = (float)sz - P(sz, 2.5f);
		float num8 = (float)sz * 0.5f;
		using Pen pen2 = new Pen(Color.FromArgb(255, 140, 30), P(sz, 1.5f))
		{
			StartCap = LineCap.Round,
			EndCap = LineCap.Round
		};
		graphics.DrawLine(pen2, num + num5 + P(sz, 1f), num8, num7, num8);
		graphics.DrawLine(pen2, num7 - P(sz, 2f), num8 - P(sz, 2f), num7, num8);
		graphics.DrawLine(pen2, num7 - P(sz, 2f), num8 + P(sz, 2f), num7, num8);
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawExit(int sz)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		float num = P(sz, 1.5f);
		using Pen pen = new Pen(Color.FromArgb(200, 60, 60), P(sz, 1.5f))
		{
			StartCap = LineCap.Round,
			EndCap = LineCap.Round
		};
		using Pen pen2 = new Pen(Color.FromArgb(100, 120, 150), P(sz, 1f));
		float x = num;
		float y = num;
		float width = (float)sz * 0.6f;
		float height = (float)sz - num * 2f;
		graphics.DrawRectangle(pen2, x, y, width, height);
		float num2 = (float)sz - num;
		float num3 = (float)sz / 2f;
		graphics.DrawLine(pen, num2 - P(sz, 5f), num3, num2, num3);
		graphics.DrawLine(pen, num2 - P(sz, 2.5f), num3 - P(sz, 2.5f), num2, num3);
		graphics.DrawLine(pen, num2 - P(sz, 2.5f), num3 + P(sz, 2.5f), num2, num3);
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawAddTable(int sz)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		float num = P(sz, 1f);
		float num2 = (float)sz * 0.6f;
		float num3 = (float)sz * 0.7f;
		using SolidBrush brush = new SolidBrush(Color.FromArgb(50, 100, 180));
		using SolidBrush brush2 = new SolidBrush(Color.FromArgb(220, 232, 252));
		using Pen pen = new Pen(Color.FromArgb(80, 120, 200), P(sz, 1f));
		using Pen pen2 = new Pen(Color.FromArgb(40, 160, 80), P(sz, 2f))
		{
			StartCap = LineCap.Round,
			EndCap = LineCap.Round
		};
		float num4 = num3 * 0.3f;
		graphics.FillRectangle(brush, num, num, num2, num4);
		graphics.FillRectangle(brush2, num, num + num4, num2, num3 - num4);
		graphics.DrawRectangle(pen, num, num, num2, num3);
		graphics.DrawLine(pen, num, num + num4, num + num2, num + num4);
		graphics.DrawLine(pen, num, num + num4 + (num3 - num4) / 2f, num + num2, num + num4 + (num3 - num4) / 2f);
		float num5 = num + num2 + ((float)sz - num - num2) / 2f;
		float num6 = num + num3 / 2f;
		float num7 = P(sz, 2.5f);
		graphics.DrawLine(pen2, num5, num6 - num7, num5, num6 + num7);
		graphics.DrawLine(pen2, num5 - num7, num6, num5 + num7, num6);
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawAddColumn(int sz)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		float num = P(sz, 1f);
		float num2 = (float)sz * 0.55f;
		float num3 = (float)sz - num * 2f;
		using SolidBrush brush = new SolidBrush(Color.FromArgb(50, 100, 180));
		using SolidBrush brush2 = new SolidBrush(Color.FromArgb(220, 232, 252));
		using SolidBrush brush3 = new SolidBrush(Color.FromArgb(255, 230, 150));
		using Pen pen = new Pen(Color.FromArgb(80, 120, 200), P(sz, 1f));
		using Pen pen2 = new Pen(Color.FromArgb(40, 160, 80), P(sz, 2f))
		{
			StartCap = LineCap.Round,
			EndCap = LineCap.Round
		};
		float num4 = num3 / 4f;
		graphics.FillRectangle(brush, num, num, num2, num4);
		graphics.FillRectangle(brush2, num, num + num4, num2, num3 - num4);
		graphics.FillRectangle(brush3, num + P(sz, 0.5f), num + num4 + num4 * 2.1f, num2 - P(sz, 1f), num4 - P(sz, 0.5f));
		graphics.DrawRectangle(pen, num, num, num2, num3);
		for (int i = 1; i <= 3; i++)
		{
			graphics.DrawLine(pen, num, num + num4 * (float)i, num + num2, num + num4 * (float)i);
		}
		float num5 = num + num2 + ((float)sz - num - num2) / 2f;
		float num6 = num + num3 * 0.65f;
		float num7 = P(sz, 2.5f);
		graphics.DrawLine(pen2, num5, num6 - num7, num5, num6 + num7);
		graphics.DrawLine(pen2, num5 - num7, num6, num5 + num7, num6);
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawAddRelation(int sz)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		float num = P(sz, 5f);
		using SolidBrush brush = new SolidBrush(Color.FromArgb(50, 100, 180));
		using Pen pen = new Pen(Color.FromArgb(255, 140, 30), P(sz, 1.5f))
		{
			StartCap = LineCap.Round,
			EndCap = LineCap.Round
		};
		using Pen pen2 = new Pen(Color.FromArgb(40, 160, 80), P(sz, 2f))
		{
			StartCap = LineCap.Round,
			EndCap = LineCap.Round
		};
		graphics.FillRectangle(brush, P(sz, 1f), P(sz, 2f), num, num);
		graphics.FillRectangle(brush, (float)sz - P(sz, 1f) - num, (float)sz - P(sz, 2f) - num, num, num);
		graphics.DrawLine(pen, P(sz, 1f) + num, P(sz, 2f) + num / 2f, (float)sz - P(sz, 1f) - num, (float)sz - P(sz, 2f) - num / 2f);
		float num2 = (float)sz - P(sz, 2f);
		float num3 = (float)sz - P(sz, 2f);
		float num4 = P(sz, 1.8f);
		graphics.DrawLine(pen2, num2, num3 - num4, num2, num3 + num4);
		graphics.DrawLine(pen2, num2 - num4, num3, num2 + num4, num3);
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawRel(int sz, string label)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		float num = P(sz, 4.5f);
		using SolidBrush brush = new SolidBrush(Color.FromArgb(50, 90, 160));
		using Pen pen = new Pen(Color.FromArgb(255, 140, 30), P(sz, 1.3f));
		using Font font = new Font("Consolas", P(sz, 4f), FontStyle.Bold, GraphicsUnit.Point);
		using SolidBrush brush2 = new SolidBrush(Color.White);
		graphics.FillRectangle(brush, P(sz, 0.5f), P(sz, 1f), num, num);
		graphics.FillRectangle(brush, (float)sz - P(sz, 0.5f) - num, (float)sz - P(sz, 1f) - num, num, num);
		graphics.DrawLine(pen, P(sz, 0.5f) + num, P(sz, 1f) + num / 2f, (float)sz - P(sz, 0.5f) - num, (float)sz - P(sz, 1f) - num / 2f);
		StringFormat format = new StringFormat
		{
			Alignment = StringAlignment.Center,
			LineAlignment = StringAlignment.Center
		};
		graphics.DrawString(label, font, brush2, new RectangleF(0f, (float)sz * 0.55f, sz, (float)sz * 0.4f), format);
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawDelete(int sz)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		using Pen pen = new Pen(Color.FromArgb(210, 50, 50), P(sz, 2.2f))
		{
			StartCap = LineCap.Round,
			EndCap = LineCap.Round
		};
		float num = P(sz, 2.5f);
		graphics.DrawLine(pen, num, num, (float)sz - num, (float)sz - num);
		graphics.DrawLine(pen, (float)sz - num, num, num, (float)sz - num);
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawEdit(int sz)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		using Pen pen = new Pen(Color.FromArgb(60, 120, 200), P(sz, 1.5f))
		{
			StartCap = LineCap.Round,
			EndCap = LineCap.Round
		};
		using SolidBrush brush = new SolidBrush(Color.FromArgb(240, 200, 60));
		PointF[] points = new PointF[3]
		{
			new PointF(P(sz, 3f), (float)sz - P(sz, 3f)),
			new PointF(P(sz, 1.5f), (float)sz - P(sz, 1.5f)),
			new PointF(P(sz, 3.5f), (float)sz - P(sz, 1.5f))
		};
		graphics.FillPolygon(new SolidBrush(Color.FromArgb(80, 180, 80)), points);
		PointF[] points2 = new PointF[4]
		{
			new PointF(P(sz, 3f), (float)sz - P(sz, 3f)),
			new PointF((float)sz - P(sz, 3f), P(sz, 3f)),
			new PointF((float)sz - P(sz, 1.5f), P(sz, 4.5f)),
			new PointF((float)sz - P(sz, 4.5f), (float)sz - P(sz, 1.5f))
		};
		graphics.FillPolygon(brush, points2);
		graphics.DrawPolygon(pen, points2);
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawZoomIn(int sz)
	{
		return DrawZoom(sz, plus: true);
	}

	private static Image DrawZoomOut(int sz)
	{
		return DrawZoom(sz, plus: false);
	}

	private static Image DrawZoom(int sz, bool plus)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		float num = (float)sz * 0.33f;
		float num2 = (float)sz * 0.38f;
		float num3 = (float)sz * 0.38f;
		using Pen pen = new Pen(Color.FromArgb(60, 110, 190), P(sz, 1.8f))
		{
			StartCap = LineCap.Round,
			EndCap = LineCap.Round
		};
		using Pen pen2 = new Pen(plus ? Color.FromArgb(34, 150, 80) : Color.FromArgb(220, 70, 60), P(sz, 2f))
		{
			StartCap = LineCap.Round,
			EndCap = LineCap.Round
		};
		graphics.DrawEllipse(pen, num2 - num, num3 - num, num * 2f, num * 2f);
		graphics.DrawLine(pen, num2 + num * 0.7f, num3 + num * 0.7f, (float)sz - P(sz, 1.5f), (float)sz - P(sz, 1.5f));
		float num4 = num * 0.55f;
		if (plus)
		{
			graphics.DrawLine(pen2, num2 - num4, num3, num2 + num4, num3);
			graphics.DrawLine(pen2, num2, num3 - num4, num2, num3 + num4);
		}
		else
		{
			graphics.DrawLine(pen2, num2 - num4, num3, num2 + num4, num3);
		}
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawRightPanelLayout(int sz, bool panelOpen)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		float num = P(sz, 1.5f);
		float num2 = (float)sz - num * 2f;
		float num3 = (float)sz - num * 2f;
		float num4 = num + num2 * 0.62f;
		using SolidBrush brush = new SolidBrush(Color.FromArgb(255, 255, 255));
		using SolidBrush brush2 = new SolidBrush(Color.FromArgb(219, 234, 254));
		using SolidBrush brush3 = new SolidBrush(Color.FromArgb(243, 244, 246));
		using Pen pen = new Pen(Color.FromArgb(100, 116, 139), P(sz, 1f));
		using Pen pen2 = new Pen(Color.FromArgb(148, 163, 184), P(sz, 0.8f));
		using Pen pen3 = new Pen(Color.FromArgb(37, 99, 235), P(sz, 1.6f))
		{
			StartCap = LineCap.Round,
			EndCap = LineCap.Round
		};
		using Pen pen4 = new Pen(Color.FromArgb(107, 114, 128), P(sz, 1.6f))
		{
			StartCap = LineCap.Round,
			EndCap = LineCap.Round
		};
		graphics.FillRectangle(brush, num, num, num4 - num, num3);
		graphics.DrawRectangle(pen, num, num, num4 - num, num3);
		if (panelOpen)
		{
			graphics.FillRectangle(brush2, num4, num, num + num2 - num4, num3);
			graphics.DrawRectangle(pen, num4, num, num + num2 - num4, num3);
			for (int i = 0; i < 3; i++)
			{
				float num5 = num + P(sz, 3f) + (float)i * P(sz, 3.2f);
				graphics.DrawLine(pen2, num4 + P(sz, 1.5f), num5, num + num2 - P(sz, 1.5f), num5);
			}
			float num6 = num + num3 / 2f;
			float x = num4 + P(sz, 0.5f);
			float x2 = num4 - P(sz, 1.8f);
			float num7 = P(sz, 2f);
			graphics.DrawLine(pen3, x2, num6, x, num6 - num7);
			graphics.DrawLine(pen3, x2, num6, x, num6 + num7);
		}
		else
		{
			graphics.FillRectangle(brush3, num4, num, num + num2 - num4, num3);
			using Pen pen5 = new Pen(Color.FromArgb(180, 186, 195), P(sz, 0.8f))
			{
				DashStyle = DashStyle.Dot
			};
			graphics.DrawRectangle(pen5, num4, num, num + num2 - num4, num3);
			float num8 = num + num3 / 2f;
			float x3 = num4 - P(sz, 0.5f);
			float x4 = num4 + P(sz, 1.8f);
			float num9 = P(sz, 2f);
			graphics.DrawLine(pen4, x4, num8, x3, num8 - num9);
			graphics.DrawLine(pen4, x4, num8, x3, num8 + num9);
		}
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawFitAll(int sz)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		using Pen pen = new Pen(Color.FromArgb(60, 130, 200), P(sz, 1.5f))
		{
			StartCap = LineCap.Round,
			EndCap = LineCap.Round
		};
		float num = P(sz, 1.5f);
		float num2 = P(sz, 3f);
		graphics.DrawLine(pen, num, num, num + num2, num);
		graphics.DrawLine(pen, num, num, num, num + num2);
		graphics.DrawLine(pen, (float)sz - num, num, (float)sz - num - num2, num);
		graphics.DrawLine(pen, (float)sz - num, num, (float)sz - num, num + num2);
		graphics.DrawLine(pen, num, (float)sz - num, num + num2, (float)sz - num);
		graphics.DrawLine(pen, num, (float)sz - num, num, (float)sz - num - num2);
		graphics.DrawLine(pen, (float)sz - num, (float)sz - num, (float)sz - num - num2, (float)sz - num);
		graphics.DrawLine(pen, (float)sz - num, (float)sz - num, (float)sz - num, (float)sz - num - num2);
		float num3 = (float)sz * 0.3f;
		float num4 = (float)sz * 0.4f;
		graphics.DrawRectangle(new Pen(Color.FromArgb(255, 150, 40), P(sz, 1f)), num3, num3, num4, num4);
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawAnalyze(int sz)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		float num = P(sz, 1.5f);
		using SolidBrush brush = new SolidBrush(Color.FromArgb(220, 230, 250));
		using Pen pen = new Pen(Color.FromArgb(60, 100, 180), P(sz, 1f));
		using Pen pen2 = new Pen(Color.FromArgb(40, 160, 80), P(sz, 1.5f))
		{
			StartCap = LineCap.Round,
			EndCap = LineCap.Round
		};
		using SolidBrush brush2 = new SolidBrush(Color.FromArgb(240, 160, 30));
		graphics.FillRectangle(brush, num, num, (float)sz - num * 2f, (float)sz - num * 2f);
		graphics.DrawRectangle(pen, num, num, (float)sz - num * 2f, (float)sz - num * 2f);
		for (int i = 0; i < 3; i++)
		{
			float num2 = num + P(sz, 3f) + (float)i * P(sz, 3.5f);
			if (i < 2)
			{
				graphics.DrawLine(pen2, num + P(sz, 1.5f), num2 + P(sz, 1f), num + P(sz, 2.5f), num2 + P(sz, 2f));
				graphics.DrawLine(pen2, num + P(sz, 2.5f), num2 + P(sz, 2f), num + P(sz, 4f), num2);
			}
			else
			{
				graphics.FillEllipse(brush2, num + P(sz, 1.5f), num2, P(sz, 2f), P(sz, 2f));
			}
			graphics.DrawLine(pen, num + P(sz, 5f), num2 + P(sz, 1f), (float)sz - num - P(sz, 1f), num2 + P(sz, 1f));
		}
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawReport(int sz)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		float num = P(sz, 1.5f);
		using SolidBrush brush = new SolidBrush(Color.White);
		using Pen pen = new Pen(Color.FromArgb(60, 90, 140), P(sz, 1f));
		using Pen pen2 = new Pen(Color.FromArgb(120, 140, 170), P(sz, 0.8f));
		using SolidBrush brush2 = new SolidBrush(Color.FromArgb(40, 100, 200));
		graphics.FillRectangle(brush, num, num, (float)sz - num * 2f, (float)sz - num * 2f);
		graphics.DrawRectangle(pen, num, num, (float)sz - num * 2f, (float)sz - num * 2f);
		for (int i = 0; i < 3; i++)
		{
			float num2 = num + P(sz, 3.5f) + (float)i * P(sz, 2.8f);
			graphics.DrawLine(pen2, num + P(sz, 2f), num2, (float)sz - num - P(sz, 2f), num2);
		}
		PointF[] points = new PointF[3]
		{
			new PointF(num + P(sz, 1.5f), (float)sz - num - P(sz, 5f)),
			new PointF(num + P(sz, 4f), (float)sz - num - P(sz, 1.5f)),
			new PointF(num + P(sz, 1.5f), (float)sz - num - P(sz, 1.5f))
		};
		graphics.FillPolygon(brush2, points);
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawOpenDbFile(int sz)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		float m = P(sz, 1.2f);
		float fold = P(sz, 3f);
		float docW = P(sz, 9.5f);
		float docH = P(sz, 11f);
		float docX = m;
		float docY = m + P(sz, 0.5f);
		using SolidBrush docBrush = new SolidBrush(Color.FromArgb(248, 250, 255));
		using SolidBrush foldBrush = new SolidBrush(Color.FromArgb(210, 220, 240));
		using Pen docPen = new Pen(Color.FromArgb(70, 95, 150), P(sz, 1f));
		PointF[] docPts =
		{
			new(docX, docY),
			new(docX + docW - fold, docY),
			new(docX + docW, docY + fold),
			new(docX + docW, docY + docH),
			new(docX, docY + docH)
		};
		graphics.FillPolygon(docBrush, docPts);
		graphics.DrawPolygon(docPen, docPts);
		PointF[] foldPts =
		{
			new(docX + docW - fold, docY),
			new(docX + docW, docY + fold),
			new(docX + docW - fold, docY + fold)
		};
		graphics.FillPolygon(foldBrush, foldPts);
		graphics.DrawPolygon(docPen, foldPts);

		float cx = docX + docW * 0.5f;
		float cylW = P(sz, 3.2f);
		float cylH = P(sz, 1.1f);
		float topY = docY + P(sz, 3.2f);
		float bodyH = P(sz, 4.2f);
		using SolidBrush cylBrush = new SolidBrush(Color.FromArgb(90, 90, 140));
		using SolidBrush cylTopBrush = new SolidBrush(Color.FromArgb(120, 120, 175));
		using Pen cylPen = new Pen(Color.FromArgb(60, 60, 110), P(sz, 0.8f));
		graphics.FillEllipse(cylBrush, cx - cylW, topY + bodyH, cylW * 2f, cylH * 2f);
		graphics.FillRectangle(cylBrush, cx - cylW, topY + cylH, cylW * 2f, bodyH);
		graphics.FillEllipse(cylTopBrush, cx - cylW, topY, cylW * 2f, cylH * 2f);
		graphics.DrawEllipse(cylPen, cx - cylW, topY, cylW * 2f, cylH * 2f);
		graphics.DrawLine(cylPen, cx - cylW, topY + cylH, cx - cylW, topY + bodyH + cylH);
		graphics.DrawLine(cylPen, cx + cylW, topY + cylH, cx + cylW, topY + bodyH + cylH);
		graphics.DrawEllipse(cylPen, cx - cylW, topY + bodyH, cylW * 2f, cylH * 2f);

		float arrowX = docX + docW + P(sz, 0.2f);
		float arrowY = docY + docH - P(sz, 1f);
		using Pen arrowPen = new Pen(Color.FromArgb(37, 99, 235), P(sz, 1.4f))
		{
			StartCap = LineCap.Round,
			EndCap = LineCap.Round
		};
		graphics.DrawLine(arrowPen, arrowX - P(sz, 3.5f), arrowY, arrowX, arrowY);
		graphics.DrawLine(arrowPen, arrowX - P(sz, 2f), arrowY - P(sz, 2f), arrowX, arrowY);
		graphics.DrawLine(arrowPen, arrowX - P(sz, 2f), arrowY + P(sz, 2f), arrowX, arrowY);
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawAbout(int sz)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		float num = (float)sz / 2f - P(sz, 1.5f);
		float num2 = (float)sz / 2f;
		float num3 = (float)sz / 2f;
		using SolidBrush brush = new SolidBrush(Color.FromArgb(40, 100, 200));
		using Pen pen = new Pen(Color.FromArgb(20, 70, 160), P(sz, 1f));
		using SolidBrush brush2 = new SolidBrush(Color.White);
		using Font font = new Font("맑은 고딕", P(sz, 7f), FontStyle.Bold, GraphicsUnit.Point);
		graphics.FillEllipse(brush, num2 - num, num3 - num, num * 2f, num * 2f);
		graphics.DrawEllipse(pen, num2 - num, num3 - num, num * 2f, num * 2f);
		graphics.DrawString("i", font, brush2, new RectangleF(0f, 0f, sz, sz), new StringFormat
		{
			Alignment = StringAlignment.Center,
			LineAlignment = StringAlignment.Center
		});
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawSelect(int sz)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		using SolidBrush brush = new SolidBrush(Color.White);
		using Pen pen = new Pen(Color.FromArgb(60, 80, 120), P(sz, 1.2f));
		PointF[] points = new PointF[7]
		{
			new PointF(P(sz, 2f), P(sz, 1f)),
			new PointF(P(sz, 2f), (float)sz - P(sz, 3f)),
			new PointF(P(sz, 5f), (float)sz - P(sz, 6f)),
			new PointF(P(sz, 7f), (float)sz - P(sz, 2f)),
			new PointF(P(sz, 9f), (float)sz - P(sz, 3f)),
			new PointF(P(sz, 7f), (float)sz - P(sz, 7f)),
			new PointF((float)sz - P(sz, 2f), (float)sz - P(sz, 7f))
		};
		graphics.FillPolygon(brush, points);
		graphics.DrawPolygon(pen, points);
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawDbBadge(int sz, Color color, string label)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		float num = (float)sz / 2f - P(sz, 1f);
		float num2 = (float)sz / 2f;
		float num3 = (float)sz / 2f;
		using SolidBrush brush = new SolidBrush(color);
		using Pen pen = new Pen(Color.FromArgb(Math.Max(0, color.R - 40), Math.Max(0, color.G - 40), Math.Max(0, color.B - 40)), P(sz, 0.8f));
		using SolidBrush brush2 = new SolidBrush(Color.White);
		using Font font = new Font("Consolas", P(sz, 4.5f), FontStyle.Bold, GraphicsUnit.Point);
		graphics.FillEllipse(brush, num2 - num, num3 - num, num * 2f, num * 2f);
		graphics.DrawEllipse(pen, num2 - num, num3 - num, num * 2f, num * 2f);
		graphics.DrawString(label, font, brush2, new RectangleF(0f, 0f, sz, sz), new StringFormat
		{
			Alignment = StringAlignment.Center,
			LineAlignment = StringAlignment.Center
		});
		graphics.Dispose();
		return bitmap;
	}

	private static Image DrawDefault(int sz)
	{
		Bitmap bitmap = New32(sz);
		Graphics graphics = Setup(bitmap);
		using Pen pen = new Pen(Color.Gray, 1f);
		graphics.DrawRectangle(pen, 1, 1, sz - 2, sz - 2);
		graphics.Dispose();
		return bitmap;
	}
}
