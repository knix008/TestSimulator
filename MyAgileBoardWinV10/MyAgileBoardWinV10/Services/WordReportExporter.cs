using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using A = DocumentFormat.OpenXml.Drawing;
using DW = DocumentFormat.OpenXml.Drawing.Wordprocessing;
using PIC = DocumentFormat.OpenXml.Drawing.Pictures;

namespace MyAgileBoardWinV10.Services;

public static class WordReportExporter
{
    private static uint _imageId;

    public static void Export(ProjectReportSnapshot report, string filePath)
    {
        _imageId = 0;
        using var doc = WordprocessingDocument.Create(filePath, WordprocessingDocumentType.Document);
        var mainPart = doc.AddMainDocumentPart();
        mainPart.Document = new Document(new Body());
        var body = mainPart.Document.Body!;

        AppendParagraph(body, report.ProjectName, bold: true, size: 32);
        AppendParagraph(body, $"생성일: {report.GeneratedAt:yyyy-MM-dd HH:mm}");
        if (!string.IsNullOrWhiteSpace(report.ProjectFilePath))
            AppendParagraph(body, $"프로젝트 파일: {report.ProjectFilePath}");
        AppendParagraph(body, $"프로젝트 생성일: {report.ProjectCreatedAt:yyyy-MM-dd}");
        AppendParagraph(body, string.Empty);

        AppendParagraph(body, "요약", bold: true, size: 26);
        AppendBullet(body, $"전체 카드: {report.TotalCards}");
        AppendBullet(body, $"완료: {report.DoneCards}");
        AppendBullet(body, $"진행중/대기: {report.RemainingCards}");
        AppendBullet(body, $"전체 포인트: {report.TotalPoints}");
        AppendBullet(body, $"완료 포인트: {report.DonePoints}");
        AppendBullet(body, $"기한 초과: {report.OverdueCards}");
        AppendBullet(body, $"아카이브: {report.ArchivedCount}");
        AppendParagraph(body, string.Empty);

        if (report.Charts.HasCharts)
        {
            AppendParagraph(body, "차트", bold: true, size: 26);
            AppendParagraph(body, string.Empty);

            if (report.Charts.ColumnPieChartPng.Length > 0)
            {
                AppendParagraph(body, "컬럼별 카드 분포", bold: true, size: 22);
                AppendImage(body, mainPart, report.Charts.ColumnPieChartPng, 520, 280);
                AppendParagraph(body, string.Empty);
            }

            if (report.Charts.PriorityBarChartPng.Length > 0)
            {
                AppendParagraph(body, "우선순위별 카드 분포", bold: true, size: 22);
                AppendImage(body, mainPart, report.Charts.PriorityBarChartPng, 520, 180);
                AppendParagraph(body, string.Empty);
            }

            if (report.Charts.BurndownChartPng.Length > 0)
            {
                AppendParagraph(body, "Burn Down 차트", bold: true, size: 22);
                if (!string.IsNullOrWhiteSpace(report.Charts.BurndownCaption))
                    AppendParagraph(body, report.Charts.BurndownCaption);
                AppendImage(body, mainPart, report.Charts.BurndownChartPng, 640, 340);
                AppendParagraph(body, string.Empty);
            }
        }

        foreach (var column in report.Columns)
        {
            AppendParagraph(body, column.Name, bold: true, size: 24);
            AppendBullet(body, $"카드 수: {column.Cards.Count}");
            AppendBullet(body, column.IsCompletionColumn ? "완료 컬럼" : "일반 컬럼");
            AppendParagraph(body, string.Empty);

            foreach (var card in column.Cards)
            {
                AppendParagraph(body, card.Title, bold: true, size: 22);
                AppendBullet(body, $"우선순위: {card.Priority}, 포인트: {card.Points}");
                if (!string.IsNullOrWhiteSpace(card.Assignee))
                    AppendBullet(body, $"담당자: {card.Assignee}");
                if (!string.IsNullOrWhiteSpace(card.DueDate))
                    AppendBullet(body, $"기한: {card.DueDate}");
                if (!string.IsNullOrWhiteSpace(card.Tags))
                    AppendBullet(body, $"태그: {card.Tags}");
                if (!string.IsNullOrWhiteSpace(card.CompletedAt))
                    AppendBullet(body, $"완료일: {card.CompletedAt}");
                if (!string.IsNullOrWhiteSpace(card.Description))
                    AppendParagraph(body, card.Description);
                AppendParagraph(body, string.Empty);
            }
        }

        mainPart.Document.Save();
    }

    private static void AppendParagraph(Body body, string text, bool bold = false, int size = 20)
    {
        var run = new Run();
        var props = new RunProperties();
        if (bold) props.Append(new Bold());
        props.Append(new FontSize { Val = size.ToString() });
        run.Append(props);
        run.Append(new Text(text) { Space = SpaceProcessingModeValues.Preserve });
        body.Append(new Paragraph(run));
    }

    private static void AppendBullet(Body body, string text)
        => AppendParagraph(body, $"• {text}");

    private static void AppendImage(Body body, MainDocumentPart mainPart, byte[] imageBytes, int widthPx, int heightPx)
    {
        var imagePart = mainPart.AddImagePart(ImagePartType.Png);
        using (var ms = new MemoryStream(imageBytes))
            imagePart.FeedData(ms);

        string relationshipId = mainPart.GetIdOfPart(imagePart);
        long cx = widthPx * 9525L;
        long cy = heightPx * 9525L;
        _imageId++;

        var element = new Drawing(
            new DW.Inline(
                new DW.Extent { Cx = cx, Cy = cy },
                new DW.EffectExtent
                {
                    LeftEdge = 0L,
                    TopEdge = 0L,
                    RightEdge = 0L,
                    BottomEdge = 0L
                },
                new DW.DocProperties { Id = _imageId, Name = $"Chart{_imageId}" },
                new DW.NonVisualGraphicFrameDrawingProperties(
                    new A.GraphicFrameLocks { NoChangeAspect = true }),
                new A.Graphic(
                    new A.GraphicData(
                        new PIC.Picture(
                            new PIC.NonVisualPictureProperties(
                                new PIC.NonVisualDrawingProperties { Id = 0U, Name = "Chart.png" },
                                new PIC.NonVisualPictureDrawingProperties()),
                            new PIC.BlipFill(
                                new A.Blip { Embed = relationshipId },
                                new A.Stretch(new A.FillRectangle())),
                            new PIC.ShapeProperties(
                                new A.Transform2D(
                                    new A.Offset { X = 0L, Y = 0L },
                                    new A.Extents { Cx = cx, Cy = cy }),
                                new A.PresetGeometry(new A.AdjustValueList())
                                {
                                    Preset = A.ShapeTypeValues.Rectangle
                                })))
                    {
                        Uri = "http://schemas.openxmlformats.org/drawingml/2006/picture"
                    }))
            {
                DistanceFromTop = 0U,
                DistanceFromBottom = 0U,
                DistanceFromLeft = 0U,
                DistanceFromRight = 0U
            });

        body.Append(new Paragraph(new Run(element)));
    }
}
