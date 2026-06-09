using System.Text.Json;
using System.Text.Json.Serialization;

namespace MDMakerWinV10;

public class MdmProjectFileEntry
{
    public string RelativePath { get; set; } = "";
    public bool Checked { get; set; } = true;
}

/// <summary>
/// MD Maker 작업 상태(.mdm). 소스/출력, 병합 옵션, 파일 선택, 보내기 서식을 저장합니다.
/// </summary>
public class MdmProject
{
    public const int FormatVersion = 3;
    public const string Extension = ".mdm";
    public const string FileFilter = "MD Maker 프로젝트 (*.mdm)|*.mdm|모든 파일 (*.*)|*.*";

    public int FormatVersionNumber { get; set; } = FormatVersion;
    public DateTime SavedAt { get; set; } = DateTime.Now;

    // 병합 대상
    public string SourceDirectory { get; set; } = "";
    public string OutputFile { get; set; } = "";
    public bool Recursive { get; set; } = true;
    public FileSortOrder SortOrder { get; set; } = FileSortOrder.NameAsc;
    public string ExcludePatterns { get; set; } = "";
    public bool NumberHeadings { get; set; } = true;

    // HTML/Word/PDF 보내기 서식
    public PdfSettings ExportSettings { get; set; } = PdfSettings.CreateDefault();

    // 파일 목록(상대 경로·포함 여부·직접 지정 순서)
    public List<MdmProjectFileEntry> Files { get; set; } = [];

    static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    public static MdmProject Load(string path)
    {
        var json = File.ReadAllText(path);
        var project = JsonSerializer.Deserialize<MdmProject>(json, JsonOptions)
            ?? throw new InvalidDataException("프로젝트 파일을 읽을 수 없습니다.");
        project.Normalize();
        return project;
    }

    public void Save(string path)
    {
        SavedAt = DateTime.Now;
        Normalize();
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);
        File.WriteAllText(path, JsonSerializer.Serialize(this, JsonOptions));
    }

    public void Normalize()
    {
        ExportSettings ??= PdfSettings.CreateDefault();
        Files ??= [];
        if (FormatVersionNumber < FormatVersion)
            FormatVersionNumber = FormatVersion;
        ExportSettings.MigrateLegacyDefaults();
        ExportSettings.NumberHeadings = NumberHeadings;
        NumberHeadings = ExportSettings.NumberHeadings;
    }

    public MergeOptions ToMergeOptions(bool forRefresh = false)
    {
        var sort = SortOrder;
        if (forRefresh && sort == FileSortOrder.Custom)
            sort = FileSortOrder.NameAsc;

        return new MergeOptions
        {
            SourceDirectory = SourceDirectory.Trim(),
            Recursive = Recursive,
            SortOrder = sort,
            ExcludePatterns = ParseExcludePatterns(ExcludePatterns),
            OutputFile = OutputFile.Trim()
        };
    }

    public static string[] ParseExcludePatterns(string text) =>
        (text ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    public static MdmProject FromUi(
        string sourceDirectory,
        string outputFile,
        bool recursive,
        FileSortOrder sortOrder,
        string excludePatterns,
        bool numberHeadings,
        PdfSettings exportSettings,
        IEnumerable<(string FullPath, bool Checked)> files)
    {
        var source = sourceDirectory.Trim();
        var export = exportSettings.Clone();
        export.MigrateLegacyDefaults();
        export.NumberHeadings = numberHeadings;

        var project = new MdmProject
        {
            SourceDirectory = source,
            OutputFile = outputFile.Trim(),
            Recursive = recursive,
            SortOrder = sortOrder,
            ExcludePatterns = excludePatterns.Trim(),
            NumberHeadings = numberHeadings,
            ExportSettings = export,
            Files = string.IsNullOrEmpty(source) || !Directory.Exists(source)
                ? []
                : files.Select(f => new MdmProjectFileEntry
                {
                    RelativePath = Path.GetRelativePath(source, f.FullPath),
                    Checked = f.Checked
                }).ToList()
        };
        project.Normalize();
        return project;
    }
}
