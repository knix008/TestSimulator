using MyWorkspace.Core.Models;

namespace MyWorkspace.Core.Templates;

public static class PageTemplateProvider
{
    private static readonly object Sync = new();
    private static string _builtInDirectory = string.Empty;
    private static string _userDirectory = string.Empty;
    private static List<PageTemplate> _templates = [];

    public static string BuiltInDirectory => _builtInDirectory;
    public static string UserDirectory => _userDirectory;

    public static IReadOnlyList<PageTemplate> All
    {
        get
        {
            lock (Sync)
                return _templates;
        }
    }

    public static void Initialize(string builtInDirectory, string userDirectory)
    {
        _builtInDirectory = builtInDirectory;
        _userDirectory = userDirectory;
        Directory.CreateDirectory(userDirectory);
        EnsureExampleTemplate(userDirectory);
        Reload();
    }

    public static void Reload()
    {
        lock (Sync)
        {
            var merged = new Dictionary<string, PageTemplate>(StringComparer.OrdinalIgnoreCase);

            LoadDirectory(_builtInDirectory, isUserDefined: false, merged);
            LoadDirectory(_userDirectory, isUserDefined: true, merged);

            _templates = merged.Values
                .OrderBy(t => t.Order)
                .ThenBy(t => t.Name, StringComparer.CurrentCultureIgnoreCase)
                .ToList();
        }
    }

    public static PageTemplate? GetById(string id)
    {
        lock (Sync)
            return _templates.FirstOrDefault(t => string.Equals(t.Id, id, StringComparison.OrdinalIgnoreCase));
    }

    public static string BuildContent(PageTemplate template, string title)
    {
        var trimmed = title.Trim();
        if (string.IsNullOrEmpty(trimmed))
            trimmed = "새 Page";

        return template.ContentPattern.Replace("{title}", trimmed, StringComparison.Ordinal);
    }

    public static string BuildContent(string templateId, string title)
    {
        var template = GetById(templateId) ?? All.FirstOrDefault()
            ?? throw new InvalidOperationException("사용 가능한 Page 양식이 없습니다.");

        return BuildContent(template, title);
    }

    private static void LoadDirectory(string directory, bool isUserDefined, IDictionary<string, PageTemplate> merged)
    {
        if (!Directory.Exists(directory))
            return;

        foreach (var file in Directory.EnumerateFiles(directory, "*.*", SearchOption.TopDirectoryOnly)
                     .Where(IsTemplateFile)
                     .OrderBy(f => f, StringComparer.OrdinalIgnoreCase))
        {
            try
            {
                var template = PageTemplateParser.ParseFile(file, isUserDefined);
                MergeTemplate(merged, template);
            }
            catch
            {
                // 손상된 양식 파일은 건너뜁니다.
            }
        }
    }

    private static void MergeTemplate(IDictionary<string, PageTemplate> merged, PageTemplate template)
    {
        var id = template.Id;
        if (!merged.TryGetValue(id, out var existing))
        {
            merged[id] = template;
            return;
        }

        if (string.Equals(existing.SourcePath, template.SourcePath, StringComparison.OrdinalIgnoreCase))
        {
            merged[id] = template;
            return;
        }

        if (template.IsUserDefined && !existing.IsUserDefined)
        {
            merged[id] = template;
            return;
        }

        if (!template.IsUserDefined && existing.IsUserDefined)
            return;

        var uniqueId = AllocateUniqueTemplateId(id, template.SourcePath, merged);
        merged[uniqueId] = new PageTemplate
        {
            Id = uniqueId,
            Name = template.Name,
            DefaultTitle = template.DefaultTitle,
            Description = template.Description,
            ContentPattern = template.ContentPattern,
            Order = template.Order,
            IsUserDefined = template.IsUserDefined,
            SourcePath = template.SourcePath
        };
    }

    private static string AllocateUniqueTemplateId(
        string baseId,
        string? sourcePath,
        IDictionary<string, PageTemplate> merged)
    {
        var stem = sourcePath != null ? PageTemplateParser.GetTemplateFileStem(sourcePath) : baseId;
        var candidate = PageTemplateParser.SlugifyForId(stem);
        if (!string.IsNullOrEmpty(candidate)
            && !string.Equals(candidate, baseId, StringComparison.OrdinalIgnoreCase)
            && !merged.ContainsKey(candidate))
        {
            return candidate;
        }

        for (var index = 2; ; index++)
        {
            candidate = $"{baseId}-{index}";
            if (!merged.ContainsKey(candidate))
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

    private static void EnsureExampleTemplate(string userDirectory)
    {
        var examplePath = Path.Combine(userDirectory, "_example.page.md");
        if (File.Exists(examplePath))
            return;

        File.WriteAllText(examplePath, """
            ---
            id: my-custom-template
            name: 내 사용자 양식 예제
            description: 이 파일을 복사하여 새 Page 양식을 추가할 수 있습니다.
            order: 900
            ---

            # {title}

            ## 사용자 정의 섹션
            - 항목 1
            - 항목 2

            ## 메모
            내용을 입력하세요.
            """);
    }
}
