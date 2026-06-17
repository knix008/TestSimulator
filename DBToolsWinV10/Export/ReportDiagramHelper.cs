using System.Drawing;
using System.Drawing.Imaging;

namespace DBToolsWinV10.Export;

internal static class ReportDiagramHelper
{
	public const int DefaultMaxImageWidth = 900;

	public static byte[] ToPngBytes(Bitmap bitmap)
	{
		using MemoryStream stream = new MemoryStream();
		bitmap.Save(stream, ImageFormat.Png);
		return stream.ToArray();
	}

	public static string SaveCompanionImage(Bitmap bitmap, string reportFilePath)
	{
		string directory = Path.GetDirectoryName(reportFilePath) ?? Environment.CurrentDirectory;
		string fileName = Path.GetFileNameWithoutExtension(reportFilePath) + "_erd.png";
		string fullPath = Path.Combine(directory, fileName);
		bitmap.Save(fullPath, ImageFormat.Png);
		return fileName;
	}

	public static Size ScaleToMaxWidth(Bitmap bitmap, int maxWidth)
	{
		if (bitmap == null || bitmap.Width <= 0 || bitmap.Height <= 0)
		{
			return Size.Empty;
		}

		if (bitmap.Width <= maxWidth)
		{
			return new Size(bitmap.Width, bitmap.Height);
		}

		double scale = maxWidth / (double)bitmap.Width;
		return new Size(maxWidth, Math.Max(1, (int)Math.Round(bitmap.Height * scale)));
	}
}
