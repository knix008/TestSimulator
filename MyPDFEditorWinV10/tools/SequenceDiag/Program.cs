using MyPDFEditorWinV10.Services;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Graphics.Operations;
using UglyToad.PdfPig.Graphics.Operations.TextShowing;

string pdfPath = @"c:\Home\Projects\TestSimulator\MyPDFEditorWinV10\[린AI그룹] AI기본법 및 시행령 실무 Q&A 가이드.pdf";
int pageNum = int.Parse(args[0]);

using PdfDocument doc = PdfDocument.Open(pdfPath);
Page page = doc.GetPage(pageNum);
var block = MyPDFEditorWinV10.Services.PdfContentExtractor.ExtractTextBlocks(pdfPath)
	.First(b => b.PageIndex == pageNum - 1 && b.Text.Contains("CONTENTS", StringComparison.OrdinalIgnoreCase));

Console.WriteLine($"Block seqs: {string.Join(",", block.SourceTextSequences.OrderBy(x => x))}");

int textSequence = 0;
foreach (var op in page.Operations)
{
	int count = op switch
	{
		ShowText => 1,
		MoveToNextLineShowText => 1,
		MoveToNextLineShowTextWithSpacing => 1,
		ShowTextsWithPositioning => 1,
		_ => 0
	};
	if (count == 0) continue;

	if (block.SourceTextSequences.Contains(textSequence))
	{
		string opText = op switch
		{
			ShowText st => st.Text,
			MoveToNextLineShowText m => m.Text,
			_ => op.GetType().Name
		};
		Console.WriteLine($"  match seq {textSequence}: '{opText}'");
	}

	textSequence += count;
}
Console.WriteLine($"Total counted sequences: {textSequence}, max letter seq: {page.Letters.Max(l => l.TextSequence)}");
