using MyPDFEditorWinV10.Export;
using MyPDFEditorWinV10.Models;
using MyPDFEditorWinV10.Services;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

string pdfPath = @"c:\Home\Projects\TestSimulator\MyPDFEditorWinV10\[린AI그룹] AI기본법 및 시행령 실무 Q&A 가이드.pdf";
EditableDocument doc = new EditableDocument { SourcePdfPath = pdfPath };
doc.TextBlocks.AddRange(PdfContentExtractor.ExtractTextBlocks(pdfPath));
PdfTextBlock block = doc.TextBlocks.First(b => b.PageIndex == 1 && b.Text.Contains("CONTENTS", StringComparison.OrdinalIgnoreCase));
block.Text = "TEST CONTENTS";
string outPath = Path.Combine(Path.GetTempPath(), "type3-edit-test.pdf");
LayoutPreservingPdfExporter.Export(doc, outPath);

using PdfDocument source = PdfDocument.Open(pdfPath);
Page sourcePage = source.GetPage(2);
Dictionary<int, byte[]> bytesBySequence = PdfTextSequenceByteCollector.Collect(sourcePage);
foreach (PdfTextBlock type3Block in doc.TextBlocks.Where(b => b.IsType3Font))
{
	EnrichType3Glyphs(sourcePage, type3Block, bytesBySequence);
}

using PdfDocument edited = PdfDocument.Open(outPath);
Page editPage = edited.GetPage(2);
Dictionary<int, byte[]> editBytes = PdfTextSequenceByteCollector.Collect(editPage);

List<int> ordered = block.SourceTextSequences.OrderBy(s => s).ToList();
string glyphs = string.Concat(block.Text.Where(c => !char.IsWhiteSpace(c)));
int mismatches = 0;

Console.WriteLine("Sequence | Expected | Actual | OK");
foreach (int seq in ordered)
{
	string expectedPart = TextReplacementDistribution.GetReplacementPart(block, seq) ?? "(skip)";
	byte[] expected = Type3TextReplacementEncoder.GetReplacementBytes(block, seq, expectedPart);
	editBytes.TryGetValue(seq, out byte[] actual);
	string eHex = FormatBytes(expected);
	string aHex = FormatBytes(actual);
	bool ok = BytesEqual(expected, actual);
	if (!ok)
	{
		mismatches++;
	}

	Console.WriteLine($"{seq,8} | {eHex,8} | {aHex,8} | {(ok ? "OK" : "FAIL")}");
}

Console.WriteLine();
Console.WriteLine(mismatches == 0 ? "All title glyph bytes match." : mismatches + " mismatches.");
Console.WriteLine("PDF reopen: OK (no InvalidFontFormatException)");

static void EnrichType3Glyphs(Page page, PdfTextBlock block, Dictionary<int, byte[]> bytesBySequence)
{
	HashSet<int> known = block.SourceSequenceParts.Select(p => p.Sequence).ToHashSet();
	foreach (Letter letter in page.Letters)
	{
		if (known.Contains(letter.TextSequence) ||
			string.IsNullOrEmpty(letter.FontName) ||
			(!letter.FontName.Contains("Type3", StringComparison.OrdinalIgnoreCase) &&
			 !string.Equals(letter.FontName, block.FontName, StringComparison.OrdinalIgnoreCase)))
		{
			continue;
		}

		bytesBySequence.TryGetValue(letter.TextSequence, out byte[] sourceBytes);
		block.SourceSequenceParts.Add(new PdfTextSequencePart
		{
			Sequence = letter.TextSequence,
			Text = letter.Value,
			SourceBytes = sourceBytes
		});
		known.Add(letter.TextSequence);
	}
}

static string FormatBytes(byte[] bytes)
{
	if (bytes == null || bytes.Length == 0)
	{
		return "--";
	}

	return string.Join("", bytes.Select(b => b.ToString("X2")));
}

static bool BytesEqual(byte[] left, byte[] right)
{
	left ??= Array.Empty<byte>();
	right ??= Array.Empty<byte>();
	if (left.Length != right.Length)
	{
		return false;
	}

	for (int i = 0; i < left.Length; i++)
	{
		if (left[i] != right[i])
		{
			return false;
		}
	}

	return true;
}
