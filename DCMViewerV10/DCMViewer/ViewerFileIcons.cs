namespace DCMViewer;

internal static class ViewerFileIcons
{
    public const int TreeIconSize = 16;

    public static Image ForExtension(string extension)
    {
        return extension.ToLowerInvariant() switch
        {
            ".dcm" or ".dicm" => Create("DCM", Color.FromArgb(0, 122, 204)),
            ".png" => Create("PNG", Color.FromArgb(66, 133, 244)),
            ".jpg" or ".jpeg" => Create("JPG", Color.FromArgb(251, 140, 0)),
            ".bmp" => Create("BMP", Color.FromArgb(126, 87, 194)),
            ".tif" or ".tiff" => Create("TIF", Color.FromArgb(0, 150, 136)),
            ".gif" => Create("GIF", Color.FromArgb(233, 30, 99)),
            ".webp" => Create("WEB", Color.FromArgb(67, 160, 71)),
            ".ico" => Create("ICO", Color.FromArgb(117, 117, 117)),
            _ => Create("?", Color.FromArgb(120, 120, 125)),
        };
    }

    private static Image Create(string label, Color accent) =>
        ExportFormatIcons.CreateTreeIcon(label, accent, TreeIconSize);
}
