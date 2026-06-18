using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;

namespace MyPDFEditorWinV10.App;

public static class IconProvider
{
	private static readonly Dictionary<string, Image> Cache = new Dictionary<string, Image>();

	public static Image Get(string name, int size = 16)
	{
		string key = $"{name}_{size}";
		if (Cache.TryGetValue(key, out Image cached))
		{
			return cached;
		}

		Image image = Draw(name, size);
		Cache[key] = image;
		return image;
	}

	private static Image Draw(string name, int size)
	{
		return name switch
		{
			"File" => DrawFile(size),
			"Open" => DrawOpen(size),
			"Save" => DrawSave(size),
			"Pdf" => DrawBadge(size, Color.FromArgb(200, 50, 45), "PDF"),
			"Markdown" => DrawBadge(size, Color.FromArgb(70, 70, 90), "MD"),
			"Word" => DrawBadge(size, Color.FromArgb(40, 90, 180), "W"),
			"Exit" => DrawExit(size),
			"Edit" => DrawEdit(size),
			"ImportText" => DrawImportText(size),
			"SelectText" => DrawSelectText(size),
			"Copy" => DrawCopy(size),
			"SelectImage" => DrawSelectImage(size),
			"Image" => DrawImageIcon(size),
			"InsertImage" => DrawInsertImage(size),
			"ExtractImage" => DrawExtractImage(size),
			"SaveImages" => DrawSaveImages(size),
			"View" => DrawView(size),
			"ZoomIn" => DrawZoom(size, plus: true),
			"ZoomOut" => DrawZoom(size, plus: false),
			"PrevPage" => DrawPageNav(size, forward: false),
			"NextPage" => DrawPageNav(size, forward: true),
			"About" => DrawAbout(size),
			_ => DrawDefault(size)
		};
	}

	private static Bitmap NewBitmap(int size) => new Bitmap(size, size, PixelFormat.Format32bppArgb);

	private static Graphics Setup(Bitmap bitmap)
	{
		Graphics graphics = Graphics.FromImage(bitmap);
		graphics.SmoothingMode = SmoothingMode.AntiAlias;
		graphics.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
		graphics.Clear(Color.Transparent);
		return graphics;
	}

	private static float P(int size, float units) => units * size / 16f;

	private static Image DrawFile(int size)
	{
		Bitmap bitmap = NewBitmap(size);
		using Graphics g = Setup(bitmap);
		float m = P(size, 1f);
		using SolidBrush folder = new SolidBrush(Color.FromArgb(240, 180, 50));
		using SolidBrush tab = new SolidBrush(Color.FromArgb(255, 210, 80));
		using Pen pen = new Pen(Color.FromArgb(180, 130, 20), P(size, 1f));
		g.FillRectangle(folder, m, m + P(size, 3f), size - m * 2f, size - m - P(size, 3f) - m);
		g.FillRectangle(tab, m, m + P(size, 1f), P(size, 5f), P(size, 3f));
		g.DrawRectangle(pen, m, m + P(size, 4f), size - m * 2f, size - m * 2f - P(size, 4f));
		return bitmap;
	}

	private static Image DrawOpen(int size)
	{
		Bitmap bitmap = NewBitmap(size);
		using Graphics g = Setup(bitmap);
		float m = P(size, 1f);
		using SolidBrush folder = new SolidBrush(Color.FromArgb(240, 180, 50));
		using SolidBrush inside = new SolidBrush(Color.FromArgb(255, 210, 80));
		using Pen pen = new Pen(Color.FromArgb(180, 130, 20), P(size, 1f));
		g.FillRectangle(folder, m, m + P(size, 3f), size - m * 2f, size - m - P(size, 3f) - m);
		g.FillRectangle(inside, m, m + P(size, 4f), size - m * 2f, size - m * 2f - P(size, 4f));
		g.DrawRectangle(pen, m, m + P(size, 4f), size - m * 2f, size - m * 2f - P(size, 4f));
		float ax = size - P(size, 4f);
		float ay = m + P(size, 5f);
		using Pen arrow = new Pen(Color.White, P(size, 1.5f)) { StartCap = LineCap.Round, EndCap = LineCap.Round };
		g.DrawLine(arrow, ax, ay + P(size, 3f), ax, ay);
		g.DrawLine(arrow, ax - P(size, 2f), ay + P(size, 2f), ax, ay);
		g.DrawLine(arrow, ax + P(size, 2f), ay + P(size, 2f), ax, ay);
		return bitmap;
	}

	private static Image DrawSave(int size)
	{
		Bitmap bitmap = NewBitmap(size);
		using Graphics g = Setup(bitmap);
		float m = P(size, 1f);
		float w = size - m * 2f;
		float h = size - m * 2f;
		using SolidBrush body = new SolidBrush(Color.FromArgb(90, 110, 150));
		using SolidBrush label = new SolidBrush(Color.FromArgb(200, 220, 255));
		using SolidBrush slot = new SolidBrush(Color.FromArgb(60, 80, 120));
		using Pen pen = new Pen(Color.FromArgb(50, 70, 110), P(size, 1f));
		g.FillRectangle(body, m, m, w, h);
		g.FillRectangle(label, m + P(size, 1f), m + P(size, 1f), w - P(size, 2f), h * 0.45f);
		g.FillRectangle(slot, m + w * 0.3f, m + P(size, 1.5f), w * 0.25f, P(size, 3f));
		g.FillRectangle(body, m + P(size, 2f), m + h * 0.55f, w - P(size, 4f), h * 0.4f);
		g.DrawRectangle(pen, m, m, w, h);
		return bitmap;
	}

	private static Image DrawExit(int size)
	{
		Bitmap bitmap = NewBitmap(size);
		using Graphics g = Setup(bitmap);
		float m = P(size, 1.5f);
		using Pen door = new Pen(Color.FromArgb(100, 120, 150), P(size, 1f));
		using Pen arrow = new Pen(Color.FromArgb(200, 60, 60), P(size, 1.5f)) { StartCap = LineCap.Round, EndCap = LineCap.Round };
		g.DrawRectangle(door, m, m, size * 0.6f, size - m * 2f);
		float x = size - m;
		float y = size / 2f;
		g.DrawLine(arrow, x - P(size, 5f), y, x, y);
		g.DrawLine(arrow, x - P(size, 2.5f), y - P(size, 2.5f), x, y);
		g.DrawLine(arrow, x - P(size, 2.5f), y + P(size, 2.5f), x, y);
		return bitmap;
	}

	private static Image DrawEdit(int size)
	{
		Bitmap bitmap = NewBitmap(size);
		using Graphics g = Setup(bitmap);
		using Pen pen = new Pen(Color.FromArgb(60, 120, 200), P(size, 1.5f)) { StartCap = LineCap.Round, EndCap = LineCap.Round };
		using SolidBrush tip = new SolidBrush(Color.FromArgb(80, 180, 80));
		PointF[] nib = { new(P(size, 3f), size - P(size, 3f)), new(P(size, 1.5f), size - P(size, 1.5f)), new(P(size, 3.5f), size - P(size, 1.5f)) };
		g.FillPolygon(tip, nib);
		PointF[] body = { new(P(size, 3f), size - P(size, 3f)), new(size - P(size, 3f), P(size, 3f)), new(size - P(size, 1.5f), P(size, 4.5f)), new(size - P(size, 4.5f), size - P(size, 1.5f)) };
		g.DrawPolygon(pen, body);
		return bitmap;
	}

	private static Image DrawImportText(int size)
	{
		Bitmap bitmap = NewBitmap(size);
		using Graphics g = Setup(bitmap);
		float m = P(size, 1.5f);
		using Pen pen = new Pen(Color.FromArgb(80, 120, 200), P(size, 1f));
		using Pen arrow = new Pen(Color.FromArgb(40, 160, 80), P(size, 1.5f)) { StartCap = LineCap.Round, EndCap = LineCap.Round };
		g.DrawRectangle(pen, m, m, size * 0.45f, size - m * 2f);
		for (int i = 0; i < 3; i++)
		{
			float y = m + P(size, 3f) + i * P(size, 3f);
			g.DrawLine(pen, m + P(size, 2f), y, m + size * 0.35f, y);
		}

		float cx = size * 0.72f;
		float cy = size / 2f;
		g.DrawLine(arrow, cx - P(size, 4f), cy, cx, cy);
		g.DrawLine(arrow, cx - P(size, 2f), cy - P(size, 2f), cx, cy);
		g.DrawLine(arrow, cx - P(size, 2f), cy + P(size, 2f), cx, cy);
		return bitmap;
	}

	private static Image DrawSelectText(int size)
	{
		Bitmap bitmap = NewBitmap(size);
		using Graphics g = Setup(bitmap);
		float m = P(size, 1.5f);
		using Pen dashed = new Pen(Color.FromArgb(40, 120, 220), P(size, 1.1f))
		{
			DashStyle = DashStyle.Dash
		};
		using SolidBrush textBrush = new SolidBrush(Color.FromArgb(60, 110, 190));
		using Font font = new Font("Segoe UI", P(size, 7f), FontStyle.Bold, GraphicsUnit.Point);
		g.DrawRectangle(dashed, m, m, size - m * 2f, size - m * 2f);
		StringFormat format = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
		g.DrawString("T", font, textBrush, new RectangleF(0, 0, size, size), format);
		return bitmap;
	}

	private static Image DrawCopy(int size)
	{
		Bitmap bitmap = NewBitmap(size);
		using Graphics g = Setup(bitmap);
		float m = P(size, 2f);
		float w = size * 0.5f;
		float h = size * 0.55f;
		using Pen pen = new Pen(Color.FromArgb(80, 120, 200), P(size, 1f));
		using SolidBrush fill = new SolidBrush(Color.FromArgb(220, 232, 252));
		g.FillRectangle(fill, m + P(size, 2f), m, w, h);
		g.DrawRectangle(pen, m + P(size, 2f), m, w, h);
		g.DrawRectangle(pen, m, m + P(size, 2f), w, h);
		return bitmap;
	}

	private static Image DrawSelectImage(int size)
	{
		Bitmap bitmap = NewBitmap(size);
		using Graphics g = Setup(bitmap);
		float m = P(size, 1.5f);
		float w = size - m * 2f;
		float h = size - m * 2f;
		using Pen dashed = new Pen(Color.FromArgb(40, 120, 220), P(size, 1.2f))
		{
			DashStyle = DashStyle.Dash
		};
		using SolidBrush sun = new SolidBrush(Color.FromArgb(255, 200, 60));
		using SolidBrush hill = new SolidBrush(Color.FromArgb(80, 170, 100));
		g.DrawRectangle(dashed, m, m, w, h);
		g.FillEllipse(sun, m + P(size, 1.5f), m + P(size, 1.5f), P(size, 2.5f), P(size, 2.5f));
		PointF[] hills = { new(m + P(size, 1f), m + h - P(size, 1f)), new(m + w * 0.45f, m + h * 0.55f), new(m + w - P(size, 1f), m + h - P(size, 1f)) };
		g.FillPolygon(hill, hills);
		return bitmap;
	}

	private static Image DrawImageIcon(int size)
	{
		Bitmap bitmap = NewBitmap(size);
		using Graphics g = Setup(bitmap);
		float m = P(size, 1.5f);
		using Pen pen = new Pen(Color.FromArgb(80, 120, 200), P(size, 1f));
		using SolidBrush sun = new SolidBrush(Color.FromArgb(255, 200, 60));
		using SolidBrush hill = new SolidBrush(Color.FromArgb(80, 170, 100));
		g.DrawRectangle(pen, m, m, size - m * 2f, size - m * 2f);
		g.FillEllipse(sun, m + P(size, 2f), m + P(size, 2f), P(size, 3f), P(size, 3f));
		PointF[] hills = { new(m + P(size, 1f), size - m - P(size, 1f)), new(size / 2f, size / 2f), new(size - m - P(size, 1f), size - m - P(size, 1f)) };
		g.FillPolygon(hill, hills);
		return bitmap;
	}

	private static Image DrawInsertImage(int size)
	{
		Bitmap bitmap = NewBitmap(size);
		using Graphics g = Setup(bitmap);
		using Image inner = DrawImageIcon((int)(size * 0.65f));
		g.DrawImage(inner, P(size, 1f), P(size, 1f));
		float cx = size - P(size, 3f);
		float cy = size - P(size, 3f);
		using SolidBrush plusBg = new SolidBrush(Color.FromArgb(40, 160, 80));
		g.FillEllipse(plusBg, cx - P(size, 2.5f), cy - P(size, 2.5f), P(size, 5f), P(size, 5f));
		using Pen plus = new Pen(Color.White, P(size, 1.5f)) { StartCap = LineCap.Round, EndCap = LineCap.Round };
		g.DrawLine(plus, cx, cy - P(size, 1.5f), cx, cy + P(size, 1.5f));
		g.DrawLine(plus, cx - P(size, 1.5f), cy, cx + P(size, 1.5f), cy);
		return bitmap;
	}

	private static Image DrawExtractImage(int size)
	{
		Bitmap bitmap = NewBitmap(size);
		using Graphics g = Setup(bitmap);
		using Image inner = DrawImageIcon((int)(size * 0.65f));
		g.DrawImage(inner, P(size, 1f), P(size, 1f));
		float cx = size - P(size, 3f);
		float cy = size - P(size, 3f);
		using Pen arrow = new Pen(Color.FromArgb(60, 160, 60), P(size, 1.5f)) { StartCap = LineCap.Round, EndCap = LineCap.Round };
		g.DrawLine(arrow, cx - P(size, 3f), cy, cx, cy);
		g.DrawLine(arrow, cx - P(size, 2f), cy - P(size, 2f), cx, cy);
		g.DrawLine(arrow, cx - P(size, 2f), cy + P(size, 2f), cx, cy);
		return bitmap;
	}

	private static Image DrawSaveImages(int size)
	{
		Bitmap bitmap = NewBitmap(size);
		using Graphics g = Setup(bitmap);
		using Image disk = DrawSave((int)(size * 0.75f));
		g.DrawImage(disk, 0, P(size, 2f));
		using Image pic = DrawImageIcon((int)(size * 0.55f));
		g.DrawImage(pic, size * 0.42f, 0);
		return bitmap;
	}

	private static Image DrawView(int size)
	{
		Bitmap bitmap = NewBitmap(size);
		using Graphics g = Setup(bitmap);
		float cx = size / 2f;
		float cy = size / 2f;
		float rx = size * 0.38f;
		float ry = size * 0.24f;
		using Pen pen = new Pen(Color.FromArgb(60, 110, 190), P(size, 1.5f));
		using SolidBrush pupil = new SolidBrush(Color.FromArgb(40, 80, 150));
		g.DrawEllipse(pen, cx - rx, cy - ry, rx * 2f, ry * 2f);
		g.FillEllipse(pupil, cx - P(size, 2f), cy - P(size, 2f), P(size, 4f), P(size, 4f));
		return bitmap;
	}

	private static Image DrawZoom(int size, bool plus)
	{
		Bitmap bitmap = NewBitmap(size);
		using Graphics g = Setup(bitmap);
		float r = size * 0.33f;
		float cx = size * 0.38f;
		float cy = size * 0.38f;
		using Pen glass = new Pen(Color.FromArgb(60, 110, 190), P(size, 1.8f)) { StartCap = LineCap.Round, EndCap = LineCap.Round };
		using Pen sign = new Pen(plus ? Color.FromArgb(34, 150, 80) : Color.FromArgb(220, 70, 60), P(size, 2f)) { StartCap = LineCap.Round, EndCap = LineCap.Round };
		g.DrawEllipse(glass, cx - r, cy - r, r * 2f, r * 2f);
		g.DrawLine(glass, cx + r * 0.7f, cy + r * 0.7f, size - P(size, 1.5f), size - P(size, 1.5f));
		float d = r * 0.55f;
		if (plus)
		{
			g.DrawLine(sign, cx - d, cy, cx + d, cy);
			g.DrawLine(sign, cx, cy - d, cx, cy + d);
		}
		else
		{
			g.DrawLine(sign, cx - d, cy, cx + d, cy);
		}

		return bitmap;
	}

	private static Image DrawPageNav(int size, bool forward)
	{
		Bitmap bitmap = NewBitmap(size);
		using Graphics g = Setup(bitmap);
		float m = P(size, 1.5f);
		using Pen page = new Pen(Color.FromArgb(100, 120, 150), P(size, 1f));
		using SolidBrush fill = new SolidBrush(Color.FromArgb(230, 240, 255));
		g.FillRectangle(fill, m, m, size * 0.55f, size - m * 2f);
		g.DrawRectangle(page, m, m, size * 0.55f, size - m * 2f);
		using SolidBrush arrowBrush = new SolidBrush(forward ? Color.FromArgb(60, 110, 190) : Color.FromArgb(100, 120, 150));
		float cx = forward ? size * 0.72f : size * 0.28f;
		float cy = size / 2f;
		float d = P(size, 3f);
		PointF[] tri = forward
			? new[] { new PointF(cx - d, cy - d), new PointF(cx + d, cy), new PointF(cx - d, cy + d) }
			: new[] { new PointF(cx + d, cy - d), new PointF(cx - d, cy), new PointF(cx + d, cy + d) };
		g.FillPolygon(arrowBrush, tri);
		return bitmap;
	}

	private static Image DrawBadge(int size, Color color, string text)
	{
		Bitmap bitmap = NewBitmap(size);
		using Graphics g = Setup(bitmap);
		float m = P(size, 1f);
		using SolidBrush brush = new SolidBrush(color);
		using Pen pen = new Pen(Color.FromArgb(60, color), P(size, 0.8f));
		g.FillRectangle(brush, m, m, size - m * 2f, size - m * 2f);
		g.DrawRectangle(pen, m, m, size - m * 2f, size - m * 2f);
		using Font font = new Font("Segoe UI", P(size, 4.5f), FontStyle.Bold, GraphicsUnit.Point);
		using SolidBrush textBrush = new SolidBrush(Color.White);
		StringFormat format = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
		g.DrawString(text, font, textBrush, new RectangleF(0, 0, size, size), format);
		return bitmap;
	}

	private static Image DrawAbout(int size)
	{
		Bitmap bitmap = NewBitmap(size);
		using Graphics g = Setup(bitmap);
		float r = size / 2f - P(size, 1.5f);
		float cx = size / 2f;
		float cy = size / 2f;
		using SolidBrush fill = new SolidBrush(Color.FromArgb(40, 100, 200));
		using Pen pen = new Pen(Color.FromArgb(20, 70, 160), P(size, 1f));
		using SolidBrush text = new SolidBrush(Color.White);
		using Font font = new Font("Segoe UI", P(size, 7f), FontStyle.Bold, GraphicsUnit.Point);
		g.FillEllipse(fill, cx - r, cy - r, r * 2f, r * 2f);
		g.DrawEllipse(pen, cx - r, cy - r, r * 2f, r * 2f);
		StringFormat format = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
		g.DrawString("i", font, text, new RectangleF(0, 0, size, size), format);
		return bitmap;
	}

	private static Image DrawDefault(int size)
	{
		Bitmap bitmap = NewBitmap(size);
		using Graphics g = Setup(bitmap);
		float m = P(size, 2f);
		using Pen pen = new Pen(Color.FromArgb(120, 130, 150), P(size, 1.5f));
		g.DrawRectangle(pen, m, m, size - m * 2f, size - m * 2f);
		return bitmap;
	}
}
