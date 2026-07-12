using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using NeoSolve.ImageSharp.AVIF;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Formats.Gif;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.PixelFormats;

namespace DBToolsWinV10.Export;

public static class DiagramImageExporter
{
	public static void Export(Bitmap bitmap, string filePath, DiagramImageFormat format)
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
		case DiagramImageFormat.Png:
			bitmap.Save(filePath, ImageFormat.Png);
			return;
		case DiagramImageFormat.Jpeg:
			SaveJpeg(bitmap, filePath);
			return;
		case DiagramImageFormat.Gif:
			SaveWithImageSharp(bitmap, filePath, new GifEncoder());
			return;
		case DiagramImageFormat.Webp:
			SaveWithImageSharp(bitmap, filePath, new WebpEncoder { Quality = 92, Method = WebpEncodingMethod.Level4 });
			return;
		case DiagramImageFormat.Avif:
			SaveAvif(bitmap, filePath);
			return;
		default:
			throw new NotSupportedException($"지원하지 않는 이미지 형식입니다: {format}");
		}
	}

	public static string GetFileFilter(DiagramImageFormat format)
	{
		return format switch
		{
			DiagramImageFormat.Png => "PNG 이미지 (*.png)|*.png",
			DiagramImageFormat.Jpeg => "JPEG 이미지 (*.jpg;*.jpeg)|*.jpg;*.jpeg",
			DiagramImageFormat.Webp => "WebP 이미지 (*.webp)|*.webp",
			DiagramImageFormat.Gif => "GIF 이미지 (*.gif)|*.gif",
			DiagramImageFormat.Avif => "AVIF 이미지 (*.avif)|*.avif",
			_ => "이미지 파일 (*.*)|*.*"
		};
	}

	public static string GetDefaultExtension(DiagramImageFormat format)
	{
		return format switch
		{
			DiagramImageFormat.Png => "png",
			DiagramImageFormat.Jpeg => "jpg",
			DiagramImageFormat.Webp => "webp",
			DiagramImageFormat.Gif => "gif",
			DiagramImageFormat.Avif => "avif",
			_ => "png"
		};
	}

	public static string GetDisplayName(DiagramImageFormat format)
	{
		return format switch
		{
			DiagramImageFormat.Png => "PNG",
			DiagramImageFormat.Jpeg => "JPEG",
			DiagramImageFormat.Webp => "WebP",
			DiagramImageFormat.Gif => "GIF",
			DiagramImageFormat.Avif => "AVIF",
			_ => format.ToString()
		};
	}

	public static bool SupportsTransparency(DiagramImageFormat format)
	{
		return format is DiagramImageFormat.Png or DiagramImageFormat.Webp or DiagramImageFormat.Gif or DiagramImageFormat.Avif;
	}

	private static void SaveJpeg(Bitmap bitmap, string filePath)
	{
		using Bitmap flattened = FlattenOnColor(bitmap, System.Drawing.Color.White);
		ImageCodecInfo encoder = ImageCodecInfo.GetImageEncoders().First(c => c.FormatID == ImageFormat.Jpeg.Guid);
		using EncoderParameters parameters = new EncoderParameters(1);
		parameters.Param[0] = new EncoderParameter(Encoder.Quality, 92L);
		flattened.Save(filePath, encoder, parameters);
	}

	private static Bitmap FlattenOnColor(Bitmap source, System.Drawing.Color background)
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
