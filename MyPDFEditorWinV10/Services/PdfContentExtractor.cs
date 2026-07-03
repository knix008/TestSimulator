using MyPDFEditorWinV10.Models;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

namespace MyPDFEditorWinV10.Services;

public static class PdfContentExtractor
{
	private const double LineGroupingThreshold = 3d;
	private const double MinColumnGapThreshold = 20d;

	private static PdfDocument OpenDocument(string filePath, string password)
	{
		ParsingOptions options = new ParsingOptions();
		if (!string.IsNullOrEmpty(password))
		{
			options.Password = password;
		}

		return PdfDocument.Open(filePath, options);
	}

	public static IReadOnlyList<PdfTextBlock> ExtractTextBlocks(string filePath, string password = null)
	{
		List<PdfTextBlock> blocks = new List<PdfTextBlock>();
		using PdfDocument document = OpenDocument(filePath, password);
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
		Dictionary<int, byte[]> bytesBySequence = PdfTextSequenceByteCollector.Collect(page);
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
			foreach (PdfTextBlock block in CreateBlocksFromLineClusters(line, pageIndex, bytesBySequence, page))
			{
				yield return block;
			}
		}
	}

	private static IEnumerable<PdfTextBlock> CreateBlocksFromLineClusters(
		List<Word> sortedLine,
		int pageIndex,
		IReadOnlyDictionary<int, byte[]> bytesBySequence,
		Page page)
	{
		double avgWordHeight = sortedLine.Average(w => w.BoundingBox.Height);
		double gapThreshold = Math.Max(MinColumnGapThreshold, avgWordHeight * 2.0d);

		List<List<Word>> clusters = new List<List<Word>>();
		List<Word> current = new List<Word> { sortedLine[0] };
		for (int i = 1; i < sortedLine.Count; i++)
		{
			double gap = sortedLine[i].BoundingBox.Left - sortedLine[i - 1].BoundingBox.Right;
			if (gap > gapThreshold)
			{
				clusters.Add(current);
				current = new List<Word>();
			}
			current.Add(sortedLine[i]);
		}
		clusters.Add(current);

		foreach (List<Word> cluster in clusters)
		{
			string text = string.Join(" ", cluster.Select(w => w.Text)).Trim();
			if (string.IsNullOrEmpty(text))
			{
				continue;
			}

			List<Letter> letters = cluster.SelectMany(word => word.Letters).ToList();
			double left = cluster.Min(w => w.BoundingBox.Left);
			double bottom = cluster.Min(w => w.BoundingBox.Bottom);
			double right = cluster.Max(w => w.BoundingBox.Right);
			double top = cluster.Max(w => w.BoundingBox.Top);
			Letter sampleLetter = SelectRepresentativeLetter(letters);
			string fontName = sampleLetter?.FontName;
			letters.AddRange(CollectWhitespaceLetters(page, letters, left, right, top, bottom, fontName));
			double fontSize = letters.Count > 0
				? letters.Average(letter => letter.PointSize)
				: Math.Max(8d, (cluster.Max(word => word.BoundingBox.Top) - cluster.Min(word => word.BoundingBox.Bottom)) * 0.85d);
			bool isType3Font = IsType3FontName(fontName);
			bool isBold = sampleLetter?.FontDetails?.IsBold ?? false;
			bool isItalic = sampleLetter?.FontDetails?.IsItalic ?? false;
			string fontFamilyName = sampleLetter?.FontDetails?.Name;
			PdfTextBlockRenderHelper.ApplyFontStyleFromNames(fontName, fontFamilyName, ref isBold, ref isItalic, ref fontFamilyName);
			(byte fillColorR, byte fillColorG, byte fillColorB) = ExtractFillColor(sampleLetter);
			double originalLeft = letters.Min(letter => letter.GlyphRectangleLoose.Left);
			double originalBottom = letters.Min(letter => letter.GlyphRectangleLoose.Bottom);
			double originalRight = letters.Max(letter => letter.GlyphRectangleLoose.Right);
			double originalTop = letters.Max(letter => letter.GlyphRectangleLoose.Top);
			Letter baselineLetter = letters.OrderBy(letter => letter.StartBaseLine.X).First();
			PdfTextBlock block = new PdfTextBlock
			{
				PageIndex = pageIndex,
				Text = text,
				OriginalText = text,
				Left = left,
				Bottom = bottom,
				Right = right,
				Top = top,
				OriginalLeft = originalLeft,
				OriginalBottom = originalBottom,
				OriginalRight = originalRight,
				OriginalTop = originalTop,
				BaselineX = baselineLetter.StartBaseLine.X,
				BaselineY = baselineLetter.StartBaseLine.Y,
				FontSize = fontSize,
				FontName = fontName,
				FontFamilyName = fontFamilyName,
				IsType3Font = isType3Font,
				IsBold = isBold,
				IsItalic = isItalic,
				FillColorR = fillColorR,
				FillColorG = fillColorG,
				FillColorB = fillColorB
			};

			foreach (int sequence in letters.Select(letter => letter.TextSequence).Distinct())
			{
				block.SourceTextSequences.Add(sequence);
			}

			foreach (IGrouping<int, Letter> sequenceGroup in letters.GroupBy(letter => letter.TextSequence).OrderBy(group => group.Key))
			{
				int sequence = sequenceGroup.Key;
				bytesBySequence.TryGetValue(sequence, out byte[] sourceBytes);
				block.SourceSequenceParts.Add(new PdfTextSequencePart
				{
					Sequence = sequence,
					Text = string.Concat(sequenceGroup
						.OrderBy(letter => letter.GlyphRectangleLoose.Left)
						.Select(letter => letter.Value)),
					SourceBytes = sourceBytes
				});
			}

			if (isType3Font)
			{
				Type3GlyphCatalog.PopulateBlock(block, page, bytesBySequence);
			}

			yield return block;
		}
	}

	public static IReadOnlyList<string> ExtractTextByPage(string filePath, string password = null)
	{
		List<string> pages = new List<string>();
		using PdfDocument document = OpenDocument(filePath, password);
		foreach (Page page in document.GetPages())
		{
			pages.Add(page.Text?.Trim() ?? string.Empty);
		}

		return pages;
	}

	public static string ExtractText(string filePath, string password = null)
	{
		System.Text.StringBuilder builder = new System.Text.StringBuilder();
		using PdfDocument document = OpenDocument(filePath, password);
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

	public static IReadOnlyList<PdfImageBlock> ExtractImageRegions(string filePath, string password = null)
	{
		List<PdfImageBlock> images = new List<PdfImageBlock>();
		using PdfDocument document = OpenDocument(filePath, password);
		int pageIndex = 0;
		int pageCount = document.NumberOfPages;
		for (int pageNumber = 1; pageNumber <= pageCount; pageNumber++)
		{
			try
			{
				Page page = document.GetPage(pageNumber);
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
			}
			catch
			{
			}

			pageIndex++;
		}

		return images;
	}

	public static IReadOnlyList<Bitmap> ExtractImages(string filePath, int? pageIndex = null, string password = null)
	{
		List<Bitmap> images = new List<Bitmap>();
		using PdfDocument document = OpenDocument(filePath, password);
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

	private static IEnumerable<Letter> CollectWhitespaceLetters(
		Page page,
		IReadOnlyList<Letter> blockLetters,
		double left,
		double right,
		double top,
		double bottom,
		string fontName)
	{
		if (page == null || blockLetters == null || blockLetters.Count == 0 || string.IsNullOrEmpty(fontName))
		{
			yield break;
		}

		HashSet<int> knownSequences = blockLetters.Select(letter => letter.TextSequence).ToHashSet();
		foreach (Letter letter in page.Letters)
		{
			if (knownSequences.Contains(letter.TextSequence))
			{
				continue;
			}

			if (!string.Equals(letter.FontName, fontName, StringComparison.OrdinalIgnoreCase))
			{
				continue;
			}

			if (letter.Value.Length != 1 || !char.IsWhiteSpace(letter.Value[0]))
			{
				continue;
			}

			if (letter.GlyphRectangleLoose.Left < left - 1 || letter.GlyphRectangleLoose.Right > right + 1)
			{
				continue;
			}

			if (letter.GlyphRectangleLoose.Top > top + LineGroupingThreshold ||
				letter.GlyphRectangleLoose.Bottom < bottom - LineGroupingThreshold)
			{
				continue;
			}

			yield return letter;
		}
	}

	private static bool IsType3FontName(string fontName)
	{
		return !string.IsNullOrEmpty(fontName) &&
			fontName.Contains("Type3", StringComparison.OrdinalIgnoreCase);
	}

	private static Letter SelectRepresentativeLetter(IReadOnlyList<Letter> letters)
	{
		if (letters == null || letters.Count == 0)
		{
			return null;
		}

		return letters
			.OrderByDescending(letter => letter.PointSize)
			.ThenByDescending(letter => letter.BoundingBox.Width)
			.FirstOrDefault();
	}

	private static (byte R, byte G, byte B) ExtractFillColor(Letter letter)
	{
		if (letter?.FillColor == null)
		{
			return (0, 0, 0);
		}

		try
		{
			(double red, double green, double blue) = letter.FillColor.ToRGBValues();
			return (
				(byte)Math.Clamp(Math.Round(red * 255d), 0d, 255d),
				(byte)Math.Clamp(Math.Round(green * 255d), 0d, 255d),
				(byte)Math.Clamp(Math.Round(blue * 255d), 0d, 255d));
		}
		catch
		{
			return (0, 0, 0);
		}
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
