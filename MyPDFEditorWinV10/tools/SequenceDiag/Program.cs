using MyPDFEditorWinV10.Services;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

string pdfPath = @"c:\Home\Projects\TestSimulator\MyPDFEditorWinV10\[린AI그룹] AI기본법 및 시행령 실무 Q&A 가이드.pdf";
using PdfDocument doc = PdfDocument.Open(pdfPath);
Dictionary<string, Dictionary<char, byte[]>> maps = new Dictionary<string, Dictionary<char, byte[]>>(StringComparer.OrdinalIgnoreCase);

foreach (Page page in doc.GetPages())
{
	Dictionary<int, byte[]> bytesBySequence = PdfTextSequenceByteCollector.Collect(page);
	foreach (Letter letter in page.Letters)
	{
		if (letter.FontName?.Contains("Type3", StringComparison.OrdinalIgnoreCase) != true)
		{
			continue;
		}

		if (!maps.TryGetValue(letter.FontName, out Dictionary<char, byte[]> map))
		{
			map = new Dictionary<char, byte[]>();
			maps[letter.FontName] = map;
		}

		if (!bytesBySequence.TryGetValue(letter.TextSequence, out byte[] sourceBytes) || sourceBytes.Length == 0)
		{
			continue;
		}

		foreach (char c in letter.Value)
		{
			map.TryAdd(c, sourceBytes);
		}
	}
}

foreach ((string font, Dictionary<char, byte[]> map) in maps.OrderBy(entry => entry.Key))
{
	bool hasY = Type3GlyphCatalog.TryGetGlyphBytes(map, 'y', out _);
	Console.WriteLine($"{font}: chars={map.Count}, has y={hasY}");
	Console.WriteLine("  " + Type3GlyphCatalog.FormatAvailableCharacters(map, 100));
}
