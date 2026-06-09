using System.Text.Json;

namespace MDMakerWinV10;

public enum PageNumberPosition
{
    None         = 0,
    BottomLeft   = 1,
    BottomCenter = 2,
    BottomRight  = 3,
    TopLeft      = 4,
    TopCenter    = 5,
    TopRight     = 6,
}

public class PdfSettings
{
    public string  FontFamily          { get; set; } = "'Malgun Gothic','Segoe UI',Helvetica,Arial,sans-serif";
    public double  FontSizePt          { get; set; } = 10;
    public double  LineHeight          { get; set; } = 1.0;
    public double  ParagraphSpacingEm  { get; set; } = 0.5;
    public double  MarginVerticalInch  { get; set; } = 0.75;
    public double  MarginHorizontalInch{ get; set; } = 1.0;
    public bool                NumberHeadings { get; set; } = false;
    public PageNumberPosition  PageNumbers    { get; set; } = PageNumberPosition.None;
}

class AppSettings
{
    private static readonly string FilePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "MDMakerWinV10", "settings.json");

    public string     LastSourceDir  { get; set; } = "";
    public string     LastOutputFile { get; set; } = "";
    public PdfSettings PdfSettings   { get; set; } = new();

    public static AppSettings Load()
    {
        try
        {
            if (File.Exists(FilePath))
                return JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(FilePath)) ?? new();
        }
        catch { }
        return new();
    }

    public void Save()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
            File.WriteAllText(FilePath,
                JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { }
    }
}
