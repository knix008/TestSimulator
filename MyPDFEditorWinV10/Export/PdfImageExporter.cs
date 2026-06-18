using System.Drawing;
using System.Drawing.Imaging;
using NeoSolve.ImageSharp.AVIF;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Formats.Gif;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.PixelFormats;

namespace MyPDFEditorWinV10.Export;

public static class PdfImageExporter
{
	public const string CombinedFileFilter =
		"PNG 이미지 (*.png)|*.png|" +
		"JPEG 이미지 (*.jpg;*.jpeg)|*.jpg;*.jpeg|" +
		"GIF 이미지 (*.gif)|*.gif|" +
		"WebP 이미지 (*.webp)|*.webp|" +
		"AVIF 이미지 (*.avif)|*.avif|" +
		"모든 지원 형식|*.png;*.jpg;*.jpeg;*.gif;*.webp;*.avif";

	public static void Save(Bitmap bitmap, string filePath)
	{
		if (!TryResolveFormat(filePath, out PdfImageFormat format))
		{
			throw new NotSupportedException($"지원하지 않는 이미지 확장자입니다: {Path.GetExtension(filePath)}");
		}

		Save(bitmap, filePath, format);
	}

	public static void Save(Bitmap bitmap, string filePath, PdfImageFormat format)
	{
		if (bitmap == null)
		{
			throw new ArgumentNullException(nameof(bitmap));
		}

		if (string.IsNullOrWhiteSpace(filePath))
		{
			throw new ArgumentException("파일 경로가 필요합니다.", nameof(filePath));
		}

		switch (format)
		{
		case PdfImageFormat.Png:
			bitmap.Save(filePath, ImageFormat.Png);
			return;
		case PdfImageFormat.Jpeg:
			SaveJpeg(bitmap, filePath);
			return;
		case PdfImageFormat.Gif:
			SaveWithImageSharp(bitmap, filePath, new GifEncoder());
			return;
		case PdfImageFormat.Webp:
			SaveWithImageSharp(bitmap, filePath, new WebpEncoder { Quality = 92, Method = WebpEncodingMethod.Level4 });
			return;
		case PdfImageFormat.Avif:
			SaveAvif(bitmap, filePath);
			return;
		default:
			throw new NotSupportedException($"지원하지 않는 이미지 형식입니다: {format}");
		}
	}

	public static bool TryResolveFormat(string filePath, out PdfImageFormat format)
	{
		format = PdfImageFormat.Png;
		if (string.IsNullOrWhiteSpace(filePath))
		{
			return false;
		}

		return Path.GetExtension(filePath).ToLowerInvariant() switch
		{
			".png" => Set(PdfImageFormat.Png, out format),
			".jpg" or ".jpeg" => Set(PdfImageFormat.Jpeg, out format),
			".gif" => Set(PdfImageFormat.Gif, out format),
			".webp" => Set(PdfImageFormat.Webp, out format),
			".avif" => Set(PdfImageFormat.Avif, out format),
			_ => false
		};
	}

	public static string GetDefaultExtension(PdfImageFormat format)
	{
		return format switch
		{
			PdfImageFormat.Png => "png",
			PdfImageFormat.Jpeg => "jpg",
			PdfImageFormat.Gif => "gif",
			PdfImageFormat.Webp => "webp",
			PdfImageFormat.Avif => "avif",
			_ => "png"
		};
	}

	public static string GetDisplayName(PdfImageFormat format)
	{
		return format switch
		{
			PdfImageFormat.Png => "PNG",
			PdfImageFormat.Jpeg => "JPEG",
			PdfImageFormat.Gif => "GIF",
			PdfImageFormat.Webp => "WebP",
			PdfImageFormat.Avif => "AVIF",
			_ => format.ToString()
		};
	}

	public static string BuildFileName(string baseName, PdfImageFormat format)
	{
		string safeName = string.IsNullOrWhiteSpace(baseName) ? "image" : baseName;
		foreach (char invalid in Path.GetInvalidFileNameChars())
		{
			safeName = safeName.Replace(invalid, '_');
		}

		return $"{safeName}.{GetDefaultExtension(format)}";
	}

	private static bool Set(PdfImageFormat value, out PdfImageFormat format)
	{
		format = value;
		return true;
	}

	private static void SaveJpeg(Bitmap bitmap, string filePath)
	{
		using Bitmap flattened = FlattenOnColor(bitmap, Color.White);
		ImageCodecInfo encoder = ImageCodecInfo.GetImageEncoders().First(c => c.FormatID == ImageFormat.Jpeg.Guid);
		using EncoderParameters parameters = new EncoderParameters(1);
		parameters.Param[0] = new EncoderParameter(Encoder.Quality, 92L);
		flattened.Save(filePath, encoder, parameters);
	}

	private static Bitmap FlattenOnColor(Bitmap source, Color background)
	{
		Bitmap flattened = new Bitmap(source.Width, source.Height, PixelFormat.Format24bppRgb);
		using Graphics graphics = Graphics.FromImage(flattened);
		graphics.Clear(background);
		graphics.DrawImage(source, 0, 0, source.Width, source.Height);
		return flattened;
	}

	private static void SaveAvif(Bitmap bitmap, string filePath)
	{
		using SixLabors.ImageSharp.Image<Rgba32> image = ConvertToImageSharp(bitmap);
		using FileStream stream = File.Create(filePath);
		image.Save(stream, new AVIFEncoder { CQLevel = 32 });
	}

	private static void SaveWithImageSharp(Bitmap bitmap, string filePath, IImageEncoder encoder)
	{
		using SixLabors.ImageSharp.Image<Rgba32> image = ConvertToImageSharp(bitmap);
		using FileStream stream = File.Create(filePath);
		image.Save(stream, encoder);
	}

	private static SixLabors.ImageSharp.Image<Rgba32> ConvertToImageSharp(Bitmap bitmap)
	{
		using MemoryStream memoryStream = new MemoryStream();
		bitmap.Save(memoryStream, ImageFormat.Png);
		memoryStream.Position = 0;
		return SixLabors.ImageSharp.Image.Load<Rgba32>(memoryStream);
	}
}
