using MyWorkspace.Core.Models;

namespace MyWorkspace.Core.Templates;

public static class PageTemplateParser
{
    public static PageTemplate ParseFile(string filePath, bool isUserDefined)
    {
        var text = File.ReadAllText(filePath);
        var template = Parse(text, Path.GetFileNameWithoutExtension(filePath), isUserDefined);
        return new PageTemplate
        {
            Id = template.Id,
            Name = template.Name,
            DefaultTitle = template.DefaultTitle,
            Description = template.Description,
            ContentPattern = template.ContentPattern,
            Order = template.Order,
            IsUserDefined = template.IsUserDefined,
            SourcePath = filePath
        };
    }

    public static PageTemplate Parse(string text, string fallbackName, bool isUserDefined)
    {
        var metadata = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var content = text;

        if (text.StartsWith("---", StringComparison.Ordinal))
        {
            var end = text.IndexOf("\n---", 3, StringComparison.Ordinal);
            if (end > 0)
            {
                var frontMatter = text[4..end];
                content = text[(end + 4)..].TrimStart('\r', '\n');

                foreach (var line in frontMatter.Split('\n', '\r'))
                {
                    var trimmed = line.Trim();
                    if (string.IsNullOrEmpty(trimmed) || trimmed.StartsWith('#'))
                        continue;

                    var colon = trimmed.IndexOf(':');
                    if (colon <= 0)
                        continue;

                    var key = trimmed[..colon].Trim();
                    var value = trimmed[(colon + 1)..].Trim();
                    metadata[key] = value;
                }
            }
        }

        var id = GetMeta(metadata, "id") ?? Slugify(fallbackName);
        var name = GetMeta(metadata, "name") ?? fallbackName;
        var defaultTitle = GetMeta(metadata, "defaultTitle") ?? GetMeta(metadata, "title") ?? name;
        var description = GetMeta(metadata, "description") ?? string.Empty;
        var order = int.TryParse(GetMeta(metadata, "order"), out var parsedOrder) ? parsedOrder : 100;

        if (string.IsNullOrWhiteSpace(content))
            content = "# {title}\n\n내용을 입력하세요.";

        return new PageTemplate
        {
            Id = id,
            Name = name,
            DefaultTitle = defaultTitle,
            Description = description,
            ContentPattern = content,
            Order = order,
            IsUserDefined = isUserDefined
        };
    }

    private static string? GetMeta(IReadOnlyDictionary<string, string> metadata, string key) =>
        metadata.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value) ? value : null;

    private static string Slugify(string value)
    {
        var chars = value.Where(ch => char.IsLetterOrDigit(ch) || ch is '-' or '_').ToArray();
        var slug = new string(chars).Trim('-', '_').ToLowerInvariant();
        return string.IsNullOrEmpty(slug) ? "template" : slug;
    }
}
