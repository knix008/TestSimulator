using MyWorkspace.Core.Models;

namespace MyWorkspace.Core.Templates;

public static class PageTemplateParser
{
    public static string GetTemplateFileStem(string filePath)
    {
        var name = Path.GetFileName(filePath);
        if (name.EndsWith(".page.md", StringComparison.OrdinalIgnoreCase))
            return name[..^8];

        if (name.EndsWith(".mdtemplate", StringComparison.OrdinalIgnoreCase))
            return name[..^11];

        return Path.GetFileNameWithoutExtension(name);
    }

    public static PageTemplate ParseFile(string filePath, bool isUserDefined)
    {
        var text = File.ReadAllText(filePath);
        var template = Parse(text, GetTemplateFileStem(filePath), isUserDefined, filePath);
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

    public static PageTemplate Parse(string text, string fallbackName, bool isUserDefined, string? sourcePath = null)
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
        if (string.Equals(id, "template", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(sourcePath))
            id = Slugify(GetTemplateFileStem(sourcePath));
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

    internal static string SlugifyForId(string value) => Slugify(value);

    private static string Slugify(string value)
    {
        var builder = new System.Text.StringBuilder(value.Length);
        foreach (var ch in value)
        {
            if (char.IsAsciiLetterOrDigit(ch) || ch is '-' or '_')
                builder.Append(char.IsAsciiLetter(ch) ? char.ToLowerInvariant(ch) : ch);
            else if (char.IsLetter(ch))
                builder.Append(ch);
        }

        var slug = builder.ToString().Trim('-', '_');
        return string.IsNullOrEmpty(slug) ? "template" : slug;
    }
}
