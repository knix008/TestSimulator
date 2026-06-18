using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace MyPDFEditorWinV10.App;

public static class PdfCursorFactory
{
	private const int CursorSize = 32;
	private const int IconSize = 24;
	private const int IconOffset = 4;

	private static Cursor _textCursor;
	private static Cursor _imageCursor;
	private static Cursor _defaultCursor;

	public static Cursor TextHover => _textCursor ??= CreateFromIcon("SelectText");

	public static Cursor ImageHover => _imageCursor ??= CreateFromIcon("SelectImage");

	public static Cursor DefaultHover => _defaultCursor ??= Cursors.Arrow;

	private static Cursor CreateFromIcon(string iconName)
	{
		using Bitmap bitmap = new Bitmap(CursorSize, CursorSize, PixelFormat.Format32bppArgb);
		using Graphics graphics = Graphics.FromImage(bitmap);
		graphics.Clear(Color.Transparent);
		using Image icon = IconProvider.Get(iconName, IconSize);
		graphics.DrawImage(icon, IconOffset, IconOffset, IconSize, IconSize);
		nint handle = bitmap.GetHicon();
		try
		{
			return new Cursor(handle);
		}
		finally
		{
			DestroyIcon(handle);
		}
	}

	[DllImport("user32.dll", CharSet = CharSet.Auto)]
	private static extern bool DestroyIcon(nint handle);
}
