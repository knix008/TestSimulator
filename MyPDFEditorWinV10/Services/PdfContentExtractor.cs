using System.Drawing;
using MyPDFEditorWinV10.Models;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

namespace MyPDFEditorWinV10.Services;

public static class PdfContentExtractor
{
	private const double LineGroupingThreshold = 3d;

	public static IReadOnlyList<PdfTextBlock> ExtractTextBlocks(string filePath)
	{
		List<PdfTextBlock> blocks = new List<PdfTextBlock>();
		using PdfDocument document = PdfDocument.Open(filePath);
		int pageIndex = 0;
		foreach (Page page in document.GetPages())
		{
			blocks.AddRange(ExtractPageTextBlocks(page, pageIndex));
			pageIndex++;
		}

		return blocks;
	}

	private static IEnumerable<PdfTextBlock> ExtractPageTextBlocks(Page page, int pageIndex)
	{
		List<Word> words = page.GetWords()
			.OrderByDescending(w => w.BoundingBox.Top)
			.ThenBy(w => w.BoundingBox.Left)
			.ToList();
		if (words.Count == 0)
		{
			yield break;
		}

		List<List<Word>> lines = new List<List<Word>>();
		foreach (Word word in words)
		{
			if (lines.Count == 0 || Math.Abs(lines[^1][0].BoundingBox.Top - word.BoundingBox.Top) > LineGroupingThreshold)
			{
				lines.Add(new List<Word> { word });
			}
			else
			{
				lines[^1].Add(word);
			}
		}

		foreach (List<Word> line in lines)
		{
			line.Sort((a, b) => a.BoundingBox.Left.CompareTo(b.BoundingBox.Left));
			string text = string.Join(" ", line.Select(w => w.Text)).Trim();
			if (string.IsNullOrEmpty(text))
			{
				continue;
			}

			yield return new PdfTextBlock
			{
				PageIndex = pageIndex,
				Text = text,
				Left = line.Min(w => w.BoundingBox.Left),
				Bottom = line.Min(w => w.BoundingBox.Bottom),
				Right = line.Max(w => w.BoundingBox.Right),
				Top = line.Max(w => w.BoundingBox.Top)
			};
		}
	}

	public static IReadOnlyList<string> ExtractTextByPage(string filePath)
	{
		List<string> pages = new List<string>();
		using PdfDocument document = PdfDocument.Open(filePath);
		foreach (Page page in document.GetPages())
		{
			pages.Add(page.Text?.Trim() ?? string.Empty);
		}

		return pages;
	}

	public static string ExtractText(string filePath)
	{
		System.Text.StringBuilder builder = new System.Text.StringBuilder();
		using PdfDocument document = PdfDocument.Open(filePath);
		int pageNumber = 0;
		foreach (Page page in document.GetPages())
		{
			pageNumber++;
			string pageText = page.Text?.Trim();
			if (string.IsNullOrEmpty(pageText))
			{
				continue;
			}

			if (builder.Length > 0)
			{
				builder.AppendLine();
				builder.AppendLine();
			}

			builder.AppendLine($"--- 페이지 {pageNumber} ---");
			builder.AppendLine(pageText);
		}

		return builder.ToString().TrimEnd();
	}

	public static IReadOnlyList<PdfImageBlock> ExtractImageRegions(string filePath)
	{
		List<PdfImageBlock> images = new List<PdfImageBlock>();
		using PdfDocument document = PdfDocument.Open(filePath);
		int pageIndex = 0;
		foreach (Page page in document.GetPages())
		{
			foreach (IPdfImage image in page.GetImages())
			{
				var bounds = image.BoundingBox;
				if (bounds.Width <= 0 || bounds.Height <= 0)
				{
					continue;
				}

				Bitmap bitmap = TryCreateBitmap(image);
				images.Add(new PdfImageBlock
				{
					PageIndex = pageIndex,
					Left = bounds.Left,
					Bottom = bounds.Bottom,
					Right = bounds.Right,
					Top = bounds.Top,
					Bitmap = bitmap
				});
			}

			pageIndex++;
		}

		return images;
	}

	public static IReadOnlyList<Bitmap> ExtractImages(string filePath, int? pageIndex = null)
	{
		List<Bitmap> images = new List<Bitmap>();
		using PdfDocument document = PdfDocument.Open(filePath);
		int index = 0;
		foreach (Page page in document.GetPages())
		{
			if (pageIndex.HasValue && index != pageIndex.Value)
			{
				index++;
				continue;
			}

			foreach (IPdfImage image in page.GetImages())
			{
				Bitmap bitmap = TryCreateBitmap(image);
				if (bitmap != null)
				{
					images.Add(bitmap);
				}
			}

			if (pageIndex.HasValue)
			{
				break;
			}

			index++;
		}

		return images;
	}

	private static Bitmap TryCreateBitmap(IPdfImage image)
	{
		try
		{
			if (image.TryGetPng(out byte[] pngBytes) && pngBytes != null && pngBytes.Length > 0)
			{
				using MemoryStream stream = new MemoryStream(pngBytes);
				return new Bitmap(stream);
			}

			if (image.TryGetBytesAsMemory(out Memory<byte> memory) && memory.Length > 0)
			{
				using MemoryStream stream = new MemoryStream(memory.ToArray());
				return new Bitmap(stream);
			}
		}
		catch
		{
		}

		return null;
	}
}
