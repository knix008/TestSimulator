using System.Drawing.Imaging;
using System.Text;
using MyAgileBoardWinV10.Models;
using MyAgileBoardWinV10.Utils;

namespace MyAgileBoardWinV10.Services;

public enum ImageExportFormat
{
    Png,
    Jpeg,
    Bmp,
    Gif,
    Tiff
}

public static class ColumnCardImageExporter
{
    public static int Export(KanbanProject project, string outputFolder, ImageExportFormat format)
    {
        Directory.CreateDirectory(outputFolder);
        string ext = GetExtension(format);
        int saved = 0;

        foreach (var column in project.Columns)
        {
            string columnFolder = Path.Combine(outputFolder, SanitizeFileName(column.Name));
            Directory.CreateDirectory(columnFolder);
            int columnWidth = Math.Max(ColumnWidthDefaults.Min, column.ColumnWidth > 0 ? column.ColumnWidth : ColumnWidthDefaults.Default);

            using (var overview = ColumnImageRenderer.RenderColumn(column, columnWidth))
            {
                SaveImage(overview, Path.Combine(columnFolder, $"_column_overview{ext}"), format);
                saved++;
            }

            int index = 1;
            foreach (var card in column.Cards.OrderBy(c => c.ZIndex).ThenBy(c => c.Title))
            {
                using var bmp = ColumnImageRenderer.RenderCard(card, columnWidth);
                string fileName = $"{index:D3}_{SanitizeFileName(card.Title)}{ext}";
                SaveImage(bmp, Path.Combine(columnFolder, fileName), format);
                index++;
                saved++;
            }
        }

        return saved;
    }

    public static string GetExtension(ImageExportFormat format) => format switch
    {
        ImageExportFormat.Jpeg => ".jpg",
        ImageExportFormat.Bmp => ".bmp",
        ImageExportFormat.Gif => ".gif",
        ImageExportFormat.Tiff => ".tif",
        _ => ".png"
    };

    public static string GetFilter(ImageExportFormat format) => format switch
    {
        ImageExportFormat.Jpeg => "JPEG 이미지 (*.jpg)|*.jpg",
        ImageExportFormat.Bmp => "비트맵 (*.bmp)|*.bmp",
        ImageExportFormat.Gif => "GIF 이미지 (*.gif)|*.gif",
        ImageExportFormat.Tiff => "TIFF 이미지 (*.tif)|*.tif",
        _ => "PNG 이미지 (*.png)|*.png"
    };

    public static string GetDisplayName(ImageExportFormat format) => format switch
    {
        ImageExportFormat.Jpeg => "JPEG (.jpg)",
        ImageExportFormat.Bmp => "비트맵 (.bmp)",
        ImageExportFormat.Gif => "GIF (.gif)",
        ImageExportFormat.Tiff => "TIFF (.tif)",
        _ => "PNG (.png)"
    };

    private static void SaveImage(Image image, string path, ImageExportFormat format)
    {
        if (format == ImageExportFormat.Jpeg)
        {
            using var clone = new Bitmap(image.Width, image.Height);
            using (var g = Graphics.FromImage(clone))
            {
                g.Clear(Color.White);
                g.DrawImage(image, 0, 0);
            }

            var codec = ImageCodecInfo.GetImageEncoders().First(c => c.FormatID == ImageFormat.Jpeg.Guid);
            using var encoderParams = new EncoderParameters(1);
            encoderParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 92L);
            clone.Save(path, codec, encoderParams);
            return;
        }

        var imageFormat = format switch
        {
            ImageExportFormat.Bmp => ImageFormat.Bmp,
            ImageExportFormat.Gif => ImageFormat.Gif,
            ImageExportFormat.Tiff => ImageFormat.Tiff,
            _ => ImageFormat.Png
        };
        image.Save(path, imageFormat);
    }

    private static string SanitizeFileName(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "untitled";
        var invalid = Path.GetInvalidFileNameChars();
        var sb = new StringBuilder(name.Length);
        foreach (char ch in name.Trim())
        {
            if (Array.IndexOf(invalid, ch) >= 0 || ch is '"' or '*' or '?' or '<' or '>' or '|')
                sb.Append('_');
            else
                sb.Append(ch);
        }

        var result = sb.ToString().Trim().TrimEnd('.');
        return string.IsNullOrWhiteSpace(result) ? "untitled" : result[..Math.Min(result.Length, 80)];
    }
}
