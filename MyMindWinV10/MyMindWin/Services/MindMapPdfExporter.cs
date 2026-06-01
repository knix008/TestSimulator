using System;
using MyMindWin.Models;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace MyMindWin.Services
{
    public static class MindMapPdfExporter
    {
        public static void Export(MindMapNode root, string title, string filePath, MindMapExportOptions options)
        {
            Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Size(PageSizes.A4);
                    page.Margin(40);
                    page.DefaultTextStyle(x => x.FontSize(11).FontFamily("Malgun Gothic"));

                    page.Content().Column(column =>
                    {
                        column.Spacing(6);
                        column.Item().Text(title).FontSize(20).Bold().FontColor(Colors.Blue.Darken2);
                        column.Item().PaddingTop(8);
                        AppendNode(column, root, level: 0, options);
                    });
                });
            }).GeneratePdf(filePath);
        }

        private static void AppendNode(ColumnDescriptor column, MindMapNode node, int level, MindMapExportOptions options)
        {
            column.Item().PaddingLeft(level * 14).Row(row =>
            {
                row.RelativeItem().Text(text =>
                {
                    if (level == 0)
                        text.Span("• ").SemiBold();
                    else
                        text.Span($"{new string(' ', Math.Max(0, level - 1))}◦ ");

                    var span = text.Span(node.Text);
                    if (level == 0)
                        span.SemiBold();
                });
            });

            if (options.IncludeNotes && !string.IsNullOrWhiteSpace(node.Note))
            {
                column.Item().PaddingLeft(level * 14 + 12).Text(node.Note)
                    .FontSize(9)
                    .Italic()
                    .FontColor(Colors.Grey.Darken1);
            }

            if (options.IncludeImages)
            {
                var bytes = MindMapExportImageHelper.TryDecode(node.Image);
                if (bytes != null)
                {
                    column.Item().PaddingLeft(level * 14 + 8).MaxWidth(360).Image(bytes);
                }
            }

            foreach (var child in node.Children)
                AppendNode(column, child, level + 1, options);
        }
    }
}
