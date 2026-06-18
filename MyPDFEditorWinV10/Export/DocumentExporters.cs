using System.Collections.Generic;
using System.IO;
using System.Text;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using MyPDFEditorWinV10.Models;
using PdfSharp.Drawing;
using PdfSharp.Pdf;
using A = DocumentFormat.OpenXml.Drawing;
using DW = DocumentFormat.OpenXml.Drawing.Wordprocessing;
using PIC = DocumentFormat.OpenXml.Drawing.Pictures;

namespace MyPDFEditorWinV10.Export;

public static class EditorPdfExporter
{
	private const double Margin = 40d;
	private const double LineHeight = 18d;

	private static double PageWidth(PdfPage page) => page.Width.Point;

	private static double PageHeight(PdfPage page) => page.Height.Point;

	public static void Export(EditableDocument document, string filePath)
	{
		EditorPdfFontResolver.EnsureInitialized();
		using PdfDocument pdf = new PdfDocument();
		pdf.Info.Title = Path.GetFileNameWithoutExtension(filePath);
		PdfPage page = pdf.AddPage();
		XGraphics gfx = XGraphics.FromPdfPage(page);
		XFont bodyFont = new XFont("Malgun Gothic", 11, XFontStyleEx.Regular);
		double y = Margin;
		string[] lines = (document.TextContent ?? string.Empty).Replace("\r\n", "\n").Split('\n');
		foreach (string line in lines)
		{
			(page, gfx, y) = EnsureSpace(pdf, page, gfx, y);
			y = DrawWrappedLine(gfx, page, bodyFont, line, Margin, y, PageWidth(page) - Margin * 2d);
		}

		foreach (EmbeddedImage image in document.Images)
		{
			if (image?.Bitmap == null)
			{
				continue;
			}

			(page, gfx, y) = EnsureSpace(pdf, page, gfx, y + 12d);
			y = DrawImage(gfx, pdf, ref page, ref gfx, image.Bitmap, Margin, y, PageWidth(page) - Margin * 2d);
			y += 12d;
		}

		pdf.Save(filePath);
	}

	private static (PdfPage page, XGraphics gfx, double y) EnsureSpace(PdfDocument document, PdfPage page, XGraphics gfx, double y)
	{
		if (y <= PageHeight(page) - Margin)
		{
			return (page, gfx, y);
		}

		gfx.Dispose();
		page = document.AddPage();
		gfx = XGraphics.FromPdfPage(page);
		return (page, gfx, Margin);
	}

	private static double DrawWrappedLine(XGraphics gfx, PdfPage page, XFont font, string text, double x, double y, double maxWidth)
	{
		if (string.IsNullOrEmpty(text))
		{
			return y + LineHeight;
		}

		string remaining = text;
		while (!string.IsNullOrEmpty(remaining))
		{
			int length = MeasureWrapLength(gfx, font, remaining, maxWidth);
			if (length <= 0)
			{
				length = 1;
			}

			string chunk = remaining[..length];
			gfx.DrawString(chunk, font, XBrushes.Black, new XPoint(x, y));
			y += LineHeight;
			remaining = remaining[length..].TrimStart();
		}

		return y;
	}

	private static int MeasureWrapLength(XGraphics gfx, XFont font, string text, double maxWidth)
	{
		for (int i = text.Length; i > 0; i--)
		{
			if (gfx.MeasureString(text[..i], font).Width <= maxWidth)
			{
				return i;
			}
		}

		return text.Length;
	}

	private static double DrawImage(XGraphics gfx, PdfDocument document, ref PdfPage page, ref XGraphics currentGfx, Bitmap bitmap, double x, double y, double maxWidth)
	{
		using MemoryStream stream = new MemoryStream();
		bitmap.Save(stream, System.Drawing.Imaging.ImageFormat.Png);
		stream.Position = 0;
		XImage image = XImage.FromStream(stream);
		double width = image.PixelWidth;
		double height = image.PixelHeight;
		if (width > maxWidth)
		{
			double scale = maxWidth / width;
			width = maxWidth;
			height *= scale;
		}

		if (y + height > PageHeight(page) - Margin)
		{
			currentGfx.Dispose();
			page = document.AddPage();
			currentGfx = XGraphics.FromPdfPage(page);
			y = Margin;
		}

		currentGfx.DrawImage(image, x, y, width, height);
		return y + height;
	}
}

public static class EditorMarkdownExporter
{
	public static void Export(EditableDocument document, string filePath)
	{
		StringBuilder builder = new StringBuilder();
		string title = string.IsNullOrWhiteSpace(document.SourcePdfPath)
			? Path.GetFileNameWithoutExtension(filePath)
			: Path.GetFileNameWithoutExtension(document.SourcePdfPath);
		builder.AppendLine($"# {title}");
		builder.AppendLine();
		builder.AppendLine(document.TextContent ?? string.Empty);
		string imageDirectory = Path.Combine(Path.GetDirectoryName(filePath) ?? string.Empty, Path.GetFileNameWithoutExtension(filePath) + "_images");
		if (document.Images.Count > 0)
		{
			Directory.CreateDirectory(imageDirectory);
			builder.AppendLine();
			builder.AppendLine("## 이미지");
			int index = 1;
			foreach (EmbeddedImage image in document.Images)
			{
				if (image?.Bitmap == null)
				{
					continue;
				}

				string imageFileName = $"image_{index:000}.png";
				string imagePath = Path.Combine(imageDirectory, imageFileName);
				image.Bitmap.Save(imagePath, System.Drawing.Imaging.ImageFormat.Png);
				builder.AppendLine($"![{image.Name ?? imageFileName}]({Path.GetRelativePath(Path.GetDirectoryName(filePath) ?? ".", imagePath).Replace('\\', '/')})");
				index++;
			}
		}

		File.WriteAllText(filePath, builder.ToString(), Encoding.UTF8);
	}
}

public static class EditorWordExporter
{
	private static uint _drawingObjectId = 1U;

	public static void Export(EditableDocument document, string filePath)
	{
		if (File.Exists(filePath))
		{
			File.Delete(filePath);
		}

		using WordprocessingDocument wordDocument = WordprocessingDocument.Create(filePath, WordprocessingDocumentType.Document);
		MainDocumentPart mainPart = wordDocument.AddMainDocumentPart();
		mainPart.Document = new Document(new Body());
		Body body = mainPart.Document.Body;
		string title = string.IsNullOrWhiteSpace(document.SourcePdfPath)
			? Path.GetFileNameWithoutExtension(filePath)
			: Path.GetFileNameWithoutExtension(document.SourcePdfPath);
		AppendParagraph(body, title, bold: true, fontSize: 28);
		AppendParagraph(body, string.Empty);
		foreach (string line in (document.TextContent ?? string.Empty).Replace("\r\n", "\n").Split('\n'))
		{
			AppendParagraph(body, line);
		}

		foreach (EmbeddedImage image in document.Images)
		{
			if (image?.Bitmap == null)
			{
				continue;
			}

			AppendParagraph(body, string.Empty);
			AppendImage(body, mainPart, image.Bitmap, image.Name);
		}

		mainPart.Document.Save();
	}

	private static void AppendParagraph(Body body, string text, bool bold = false, int fontSize = 22)
	{
		Run run = new Run(new Text(text ?? string.Empty) { Space = SpaceProcessingModeValues.Preserve });
		RunProperties properties = new RunProperties();
		if (bold)
		{
			properties.Append(new Bold());
		}

		properties.Append(new FontSize { Val = fontSize.ToString() });
		run.PrependChild(properties);
		Paragraph paragraph = new Paragraph(run);
		body.Append(paragraph);
	}

	private static void AppendImage(Body body, MainDocumentPart mainPart, Bitmap bitmap, string title)
	{
		string relationshipId = "img" + _drawingObjectId;
		ImagePart imagePart = mainPart.AddImagePart(ImagePartType.Png, relationshipId);
		using (MemoryStream stream = new MemoryStream())
		{
			bitmap.Save(stream, System.Drawing.Imaging.ImageFormat.Png);
			stream.Position = 0;
			imagePart.FeedData(stream);
		}

		long widthEmus = (long)bitmap.Width * 9525L;
		long heightEmus = (long)bitmap.Height * 9525L;
		uint id = _drawingObjectId++;
		Drawing drawing = new Drawing(
			new DW.Inline(
				new DW.Extent { Cx = widthEmus, Cy = heightEmus },
				new DW.EffectExtent { LeftEdge = 0L, TopEdge = 0L, RightEdge = 0L, BottomEdge = 0L },
				new DW.DocProperties { Id = id, Name = title ?? $"Image {id}" },
				new DW.NonVisualGraphicFrameDrawingProperties(new A.GraphicFrameLocks { NoChangeAspect = true }),
				new A.Graphic(
					new A.GraphicData(
						new PIC.Picture(
							new PIC.NonVisualPictureProperties(
								new PIC.NonVisualDrawingProperties { Id = id, Name = title ?? $"Image {id}" },
								new PIC.NonVisualPictureDrawingProperties()),
							new PIC.BlipFill(
								new A.Blip { Embed = relationshipId },
								new A.Stretch(new A.FillRectangle())),
							new PIC.ShapeProperties(
								new A.Transform2D(
									new A.Offset { X = 0L, Y = 0L },
									new A.Extents { Cx = widthEmus, Cy = heightEmus }),
								new A.PresetGeometry(new A.AdjustValueList()) { Preset = A.ShapeTypeValues.Rectangle })))
					{ Uri = "http://schemas.openxmlformats.org/drawingml/2006/picture" })));
		body.Append(new Paragraph(new Run(drawing)));
	}
}
