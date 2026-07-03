using iText.Kernel.Geom;
using iText.Kernel.Pdf.Canvas.Parser;
using iText.Kernel.Pdf.Canvas.Parser.Data;
using iText.Kernel.Pdf.Canvas.Parser.Listener;
using PDFEditor.Core.Models;

namespace PDFEditor.Core.Services;

internal sealed class PageElementCollector : IEventListener
{
    private readonly int _pageIndex;
    private readonly List<TextElement> _textElements = [];
    private readonly List<ImageElementModel> _imageElements = [];
    private int _textCounter;
    private int _imageCounter;

    public PageElementCollector(int pageIndex) => _pageIndex = pageIndex;

    public IReadOnlyList<TextElement> TextElements => _textElements;
    public IReadOnlyList<ImageElementModel> ImageElements => _imageElements;

    public ICollection<EventType> GetSupportedEvents() =>
        new HashSet<EventType> { EventType.RENDER_TEXT, EventType.RENDER_IMAGE };

    public void EventOccurred(IEventData data, EventType type)
    {
        if (type == EventType.RENDER_TEXT && data is TextRenderInfo renderInfo)
        {
            CollectText(renderInfo);
        }
        else if (type == EventType.RENDER_IMAGE && data is ImageRenderInfo imageInfo)
        {
            CollectImage(imageInfo);
        }
    }

    private void CollectText(TextRenderInfo renderInfo)
    {
        var text = renderInfo.GetText();
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        var descent = renderInfo.GetDescentLine().GetBoundingRectangle();
        var ascent = renderInfo.GetAscentLine().GetBoundingRectangle();

        var bounds = new PdfBounds
        {
            Left = descent.GetX(),
            Bottom = descent.GetY(),
            Right = ascent.GetX() + ascent.GetWidth(),
            Top = ascent.GetY() + ascent.GetHeight()
        };

        var font = renderInfo.GetFont();
        var fontName = font?.GetFontProgram()?.GetFontNames()?.GetFontName();
        var fontRefId = font?.GetPdfObject()?.GetIndirectReference()?.ToString()
                        ?? fontName;

        _textElements.Add(new TextElement
        {
            Id = $"p{_pageIndex}-t{_textCounter++}",
            PageIndex = _pageIndex,
            Text = text,
            OriginalText = text,
            Bounds = bounds,
            FontName = fontName,
            FontRefId = fontRefId,
            FontSize = renderInfo.GetFontSize(),
            ContentStreamIndex = 0
        });
    }

    private void CollectImage(ImageRenderInfo imageInfo)
    {
        var ctm = imageInfo.GetImageCtm();
        var bounds = new PdfBounds
        {
            Left = ctm.Get(6),
            Bottom = ctm.Get(7),
            Right = ctm.Get(6) + ctm.Get(0),
            Top = ctm.Get(7) + ctm.Get(4)
        };

        _imageElements.Add(new ImageElementModel
        {
            Id = $"p{_pageIndex}-img{_imageCounter++}",
            PageIndex = _pageIndex,
            XObjectName = imageInfo.GetImageResourceName()?.GetValue() ?? string.Empty,
            Bounds = bounds,
            OriginalBounds = PdfBounds.Clone(bounds),
            Transform = [ctm.Get(0), ctm.Get(1), ctm.Get(2), ctm.Get(3), ctm.Get(4), ctm.Get(5)],
            OriginalTransform = [ctm.Get(0), ctm.Get(1), ctm.Get(2), ctm.Get(3), ctm.Get(4), ctm.Get(5)],
            ContentStreamIndex = 0
        });
    }
}

public sealed class PdfTextExtractor
{
    public (IReadOnlyList<TextElement> Text, IReadOnlyList<ImageElementModel> Images) ExtractPage(
        iText.Kernel.Pdf.PdfPage page,
        int pageIndex)
    {
        var collector = new PageElementCollector(pageIndex);
        var processor = new PdfCanvasProcessor(collector);
        processor.ProcessPageContent(page);
        return (collector.TextElements, collector.ImageElements);
    }
}
