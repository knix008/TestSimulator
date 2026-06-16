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
    public const double DefaultLineHeight = 1.5;

    public string  FontFamily          { get; set; } = "'Malgun Gothic','Segoe UI',Helvetica,Arial,sans-serif";
    public double  FontSizePt          { get; set; } = 10;
    public double  LineHeight          { get; set; } = DefaultLineHeight;
    public double  ParagraphSpacingEm  { get; set; } = 0.5;
    public double  MarginVerticalInch  { get; set; } = 0.75;
    public double  MarginHorizontalInch{ get; set; } = 1.0;
    public bool                NumberHeadings { get; set; } = true;
    public PageNumberPosition  PageNumbers    { get; set; } = PageNumberPosition.BottomCenter;

    /// <summary>Word 보내기용 DOTX/DOTM 템플릿 경로. 비어 있으면 HTML 변환 방식을 사용합니다.</summary>
    public string WordTemplatePath { get; set; } = "";

    /// <summary>머리글 Confidential 문구. 비어 있으면 표시하지 않습니다.</summary>
    public string Confidential { get; set; } = "";

    /// <summary>Confidential 표시 위치 (상·하단 좌/중앙/우 중 하단 우측 제외).</summary>
    public PageNumberPosition ConfidentialPosition { get; set; } = PageNumberPosition.TopCenter;

    /// <summary>바닥글 Copyright 문구 (하단 좌측 고정). 비어 있으면 표시하지 않습니다.</summary>
    public string Copyright { get; set; } = "";

    public static PageNumberPosition DefaultPageNumbers => PageNumberPosition.BottomCenter;

    public static PdfSettings CreateDefault() => new();

    /// <summary>누락·손상된 값을 기본값으로 보정합니다.</summary>
    public void ApplyDefaults()
    {
        if (string.IsNullOrWhiteSpace(FontFamily))
            FontFamily = CreateDefault().FontFamily;
        if (FontSizePt <= 0)
            FontSizePt = 10;
        if (LineHeight < 1.0)
            LineHeight = DefaultLineHeight;
        if (ParagraphSpacingEm < 0)
            ParagraphSpacingEm = 0.5;
        if (MarginVerticalInch <= 0)
            MarginVerticalInch = 0.75;
        if (MarginHorizontalInch <= 0)
            MarginHorizontalInch = 1.0;
        ConfidentialPosition = ExportMarginLayout.NormalizeConfidentialPosition(ConfidentialPosition);
    }

    /// <summary>이전 버전 기본값(줄간격 1.0 등)을 현재 기본값으로 올립니다.</summary>
    public void MigrateLegacyDefaults()
    {
        ApplyDefaults();
        if (Math.Abs(LineHeight - 1.0) < 0.001)
            LineHeight = DefaultLineHeight;
    }

    public PdfSettings Clone() => new()
    {
        FontFamily           = FontFamily,
        FontSizePt           = FontSizePt,
        LineHeight           = LineHeight,
        ParagraphSpacingEm   = ParagraphSpacingEm,
        MarginVerticalInch   = MarginVerticalInch,
        MarginHorizontalInch = MarginHorizontalInch,
        NumberHeadings       = NumberHeadings,
        PageNumbers          = PageNumbers,
        WordTemplatePath     = WordTemplatePath,
        Confidential         = Confidential,
        ConfidentialPosition = ConfidentialPosition,
        Copyright            = Copyright,
    };

    public bool Matches(PdfSettings other) =>
        NumberHeadings == other.NumberHeadings
        && PageNumbers == other.PageNumbers
        && ConfidentialPosition == other.ConfidentialPosition
        && FontFamily == other.FontFamily
        && WordTemplatePath == other.WordTemplatePath
        && Confidential == other.Confidential
        && Copyright == other.Copyright
        && Math.Abs(LineHeight - other.LineHeight) < 0.001
        && Math.Abs(FontSizePt - other.FontSizePt) < 0.001
        && Math.Abs(ParagraphSpacingEm - other.ParagraphSpacingEm) < 0.001
        && Math.Abs(MarginVerticalInch - other.MarginVerticalInch) < 0.001
        && Math.Abs(MarginHorizontalInch - other.MarginHorizontalInch) < 0.001;
}

class AppSettings
{
    const int CurrentSettingsVersion = 4;

    private static readonly string FilePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "MDMakerWinV10", "settings.json");

    public int        SettingsVersion { get; set; } = CurrentSettingsVersion;
    public string     LastSourceDir   { get; set; } = "";
    public string     LastOutputFile  { get; set; } = "";
    public string     LastProjectPath { get; set; } = "";
    public PdfSettings PdfSettings    { get; set; } = PdfSettings.CreateDefault();

    public static AppSettings Load()
    {
        try
        {
            if (File.Exists(FilePath))
            {
                var settings = JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(FilePath)) ?? new();
                UpgradeLegacyPdfSettings(settings);
                settings.PdfSettings ??= PdfSettings.CreateDefault();
                settings.PdfSettings.ApplyDefaults();
                return settings;
            }
        }
        catch { }
        return new();
    }

    public static PdfSettings GetPdfSettings()
    {
        var pdf = Load().PdfSettings.Clone();
        pdf.MigrateLegacyDefaults();
        return pdf;
    }

    public static void SavePdfSettings(PdfSettings pdf)
    {
        var settings = Load();
        var copy = pdf.Clone();
        copy.MigrateLegacyDefaults();
        settings.PdfSettings = copy;
        settings.Save();
    }

    public static void SetNumberHeadings(bool enabled)
    {
        var settings = Load();
        var pdf = (settings.PdfSettings ?? PdfSettings.CreateDefault()).Clone();
        pdf.MigrateLegacyDefaults();
        if (pdf.NumberHeadings == enabled) return;
        pdf.NumberHeadings = enabled;
        settings.PdfSettings = pdf;
        settings.Save();
    }

    static void UpgradeLegacyPdfSettings(AppSettings settings)
    {
        if (settings.SettingsVersion >= CurrentSettingsVersion)
            return;

        if (settings.SettingsVersion < 2)
        {
            var pdf = settings.PdfSettings ??= PdfSettings.CreateDefault();
            if (Math.Abs(pdf.LineHeight - 1.0) < 0.001)
                pdf.LineHeight = PdfSettings.DefaultLineHeight;
            if (pdf.PageNumbers == PageNumberPosition.None)
                pdf.PageNumbers = PdfSettings.DefaultPageNumbers;
        }

        if (settings.SettingsVersion < 3)
            settings.PdfSettings = PdfSettings.CreateDefault();

        if (settings.SettingsVersion < 4)
            (settings.PdfSettings ??= PdfSettings.CreateDefault()).MigrateLegacyDefaults();

        settings.SettingsVersion = CurrentSettingsVersion;
        settings.Save();
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
