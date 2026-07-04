using MyWorkspace.Core.Models;

namespace MyWorkspace.Core.Templates;

public static class PageTemplateProvider
{
    private static readonly object Sync = new();
    private static string _builtInDirectory = string.Empty;
    private static string _userDirectory = string.Empty;
    private static List<PageTemplate> _templates = [];
    private static string _filterLanguage = TemplateLanguage.Korean;

    public static string BuiltInDirectory => _builtInDirectory;
    public static string UserDirectory => _userDirectory;
    public static string FilterLanguage => _filterLanguage;

    public static Func<string> UntitledPageTitle { get; set; } = () => "새 Page";

    public static IReadOnlyList<PageTemplate> All
    {
        get
        {
            lock (Sync)
                return FilterTemplates(_templates);
        }
    }

    public static void Initialize(string builtInDirectory, string userDirectory)
    {
        _builtInDirectory = builtInDirectory;
        _userDirectory = userDirectory;
        Directory.CreateDirectory(userDirectory);
        EnsureExampleTemplates(userDirectory);
        Reload();
    }

    public static void SetFilterLanguage(string languageCode)
    {
        lock (Sync)
            _filterLanguage = TemplateLanguage.Normalize(languageCode);
    }

    public static void Reload()
    {
        lock (Sync)
        {
            var merged = new List<PageTemplate>();

            LoadDirectory(_builtInDirectory, isUserDefined: false, merged);
            LoadDirectory(_userDirectory, isUserDefined: true, merged);

            _templates = merged
                .OrderBy(t => t.Order)
                .ThenBy(t => t.Name, StringComparer.CurrentCultureIgnoreCase)
                .ToList();
        }
    }

    public static PageTemplate? GetById(string id)
    {
        lock (Sync)
            return FilterTemplates(_templates)
                .FirstOrDefault(t => string.Equals(t.Id, id, StringComparison.OrdinalIgnoreCase));
    }

    public static string BuildContent(PageTemplate template, string title)
    {
        var trimmed = title.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            trimmed = template.DefaultTitle.Trim();
            if (string.IsNullOrEmpty(trimmed))
                trimmed = UntitledPageTitle();
        }

        return template.ContentPattern.Replace("{title}", trimmed, StringComparison.Ordinal);
    }

    public static string BuildContent(string templateId, string title)
    {
        var template = GetById(templateId) ?? All.FirstOrDefault()
            ?? throw new InvalidOperationException("사용 가능한 Page 양식이 없습니다.");

        return BuildContent(template, title);
    }

    private static IReadOnlyList<PageTemplate> FilterTemplates(IEnumerable<PageTemplate> templates) =>
        templates
            .Where(t => TemplateLanguage.MatchesFilter(t, _filterLanguage))
            .ToList();

    private static void LoadDirectory(string directory, bool isUserDefined, IList<PageTemplate> merged)
    {
        if (!Directory.Exists(directory))
            return;

        foreach (var language in new[] { TemplateLanguage.Korean, TemplateLanguage.English })
        {
            var languageDirectory = Path.Combine(directory, language);
            if (Directory.Exists(languageDirectory))
                LoadTemplateFiles(languageDirectory, isUserDefined, merged, language);
        }

        LoadTemplateFiles(directory, isUserDefined, merged, TemplateLanguage.Korean, legacyFlatRoot: true);
    }

    private static void LoadTemplateFiles(
        string directory,
        bool isUserDefined,
        IList<PageTemplate> merged,
        string language,
        bool legacyFlatRoot = false)
    {
        foreach (var file in Directory.EnumerateFiles(directory, "*.*", SearchOption.TopDirectoryOnly)
                     .Where(IsTemplateFile)
                     .OrderBy(f => f, StringComparer.OrdinalIgnoreCase))
        {
            if (legacyFlatRoot)
            {
                var parent = Path.GetDirectoryName(file);
                if (!string.Equals(parent, directory, StringComparison.OrdinalIgnoreCase))
                    continue;

                var fileName = Path.GetFileName(file);
                if (fileName.StartsWith("_", StringComparison.Ordinal))
                    continue;
            }

            try
            {
                var template = PageTemplateParser.ParseFile(file, isUserDefined, language);
                MergeTemplate(merged, template);
            }
            catch
            {
                // 손상된 양식 파일은 건너뜁니다.
            }
        }
    }

    private static void MergeTemplate(IList<PageTemplate> merged, PageTemplate template)
    {
        var index = FindTemplateIndex(merged, template.Id, template.Language);
        if (index < 0)
        {
            merged.Add(template);
            return;
        }

        var existing = merged[index];
        if (string.Equals(existing.SourcePath, template.SourcePath, StringComparison.OrdinalIgnoreCase))
        {
            merged[index] = template;
            return;
        }

        if (template.IsUserDefined && !existing.IsUserDefined)
        {
            merged[index] = template;
            return;
        }

        if (!template.IsUserDefined && existing.IsUserDefined)
            return;

        var uniqueId = AllocateUniqueTemplateId(template.Id, template.SourcePath, merged, template.Language);
        merged.Add(new PageTemplate
        {
            Id = uniqueId,
            Name = template.Name,
            DefaultTitle = template.DefaultTitle,
            Description = template.Description,
            ContentPattern = template.ContentPattern,
            Order = template.Order,
            IsUserDefined = template.IsUserDefined,
            SourcePath = template.SourcePath,
            Language = template.Language
        });
    }

    private static int FindTemplateIndex(IList<PageTemplate> merged, string id, string language)
    {
        for (var i = 0; i < merged.Count; i++)
        {
            var candidate = merged[i];
            if (!string.Equals(candidate.Id, id, StringComparison.OrdinalIgnoreCase))
                continue;

            if (!string.Equals(candidate.Language, language, StringComparison.OrdinalIgnoreCase))
                continue;

            return i;
        }

        return -1;
    }

    private static string AllocateUniqueTemplateId(
        string baseId,
        string? sourcePath,
        IList<PageTemplate> merged,
        string language)
    {
        var stem = sourcePath != null ? PageTemplateParser.GetTemplateFileStem(sourcePath) : baseId;
        var candidate = PageTemplateParser.SlugifyForId(stem);
        if (!string.IsNullOrEmpty(candidate)
            && !string.Equals(candidate, baseId, StringComparison.OrdinalIgnoreCase)
            && FindTemplateIndex(merged, candidate, language) < 0)
        {
            return candidate;
        }

        for (var index = 2; ; index++)
        {
            candidate = $"{baseId}-{index}";
            if (FindTemplateIndex(merged, candidate, language) < 0)
                return candidate;
        }
    }

    private static bool IsTemplateFile(string path)
    {
        var name = Path.GetFileName(path);
        if (name.StartsWith('_'))
            return false;

        return path.EndsWith(".mdtemplate", StringComparison.OrdinalIgnoreCase)
            || path.EndsWith(".page.md", StringComparison.OrdinalIgnoreCase);
    }

    private static void EnsureExampleTemplates(string userDirectory)
    {
        EnsureExampleTemplate(
            Path.Combine(userDirectory, TemplateLanguage.Korean),
            """
            ---
            id: my-custom-template
            name: 내 사용자 양식 예제
            description: 이 파일을 복사하여 새 Page 양식을 추가할 수 있습니다.
            language: ko
            order: 900
            ---

            # {title}

            ## 사용자 정의 섹션
            - 항목 1
            - 항목 2

            ## 메모
            내용을 입력하세요.
            """);

        EnsureExampleTemplate(
            Path.Combine(userDirectory, TemplateLanguage.English),
            """
            ---
            id: my-custom-template
            name: My Custom Template Example
            description: Copy this file to add your own page templates.
            language: en
            order: 900
            ---

            # {title}

            ## Custom Section
            - Item 1
            - Item 2

            ## Notes
            Enter content here.
            """);
    }

    private static void EnsureExampleTemplate(string directory, string contents)
    {
        Directory.CreateDirectory(directory);
        var examplePath = Path.Combine(directory, "_example.page.md");
        if (File.Exists(examplePath))
            return;

        File.WriteAllText(examplePath, contents);
    }
}
