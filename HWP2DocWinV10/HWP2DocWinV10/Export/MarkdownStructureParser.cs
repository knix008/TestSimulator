using System.Text.RegularExpressions;

namespace HWP2DocWinV10.Export;

internal enum MarkdownStructureKind
{
    Section,
    Heading,
    HtmlHeading,
    Table,
    List,
    Image,
    BlockQuote,
    CodeBlock
}

internal sealed class MarkdownStructureNode
{
    public required MarkdownStructureKind Kind { get; init; }
    public required string Title { get; init; }
    public required int LineNumber { get; init; }
    public int HeadingLevel { get; init; }
    public List<MarkdownStructureNode> Children { get; } = [];
}

internal static class MarkdownStructureParser
{
    private static readonly Regex MarkdownHeadingRegex = new(
        @"^(#{1,6})\s+(.+)$",
        RegexOptions.Compiled);

    private static readonly Regex HtmlHeadingRegex = new(
        @"<h([1-6])\b[^>]*>(.*?)</h\1>",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex SectionMarkerRegex = new(
        @"<!--\s*section\s+(\d+)\s*-->",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex ImageRegex = new(
        @"!\[([^\]]*)\]\(([^)]+)\)",
        RegexOptions.Compiled);

    private static readonly Regex TableStartRegex = new(
        @"^\|?.+\|.+\|?\s*$|^<table\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static IReadOnlyList<MarkdownStructureNode> ParseTree(string markdown)
    {
        var flat = ParseFlat(markdown);
        return BuildHeadingTree(flat);
    }

    public static IReadOnlyList<MarkdownStructureNode> ParseFlat(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return [];

        string prepared = MarkdownPreviewNormalizer.Normalize(markdown);
        string[] lines = prepared.Split('\n');
        var nodes = new List<MarkdownStructureNode>();
        bool inTable = false;

        for (int i = 0; i < lines.Length; i++)
        {
            string line = lines[i];
            string trimmed = line.Trim();
            if (trimmed.Length == 0)
            {
                inTable = false;
                continue;
            }

            // 표는 행마다가 아니라 표 하나당 노드 하나만 추가합니다 (연속된 표 행은 건너뜁니다).
            bool isTableLine = TableStartRegex.IsMatch(trimmed) &&
                !trimmed.StartsWith("<!--", StringComparison.Ordinal);
            if (isTableLine)
            {
                if (!inTable)
                {
                    nodes.Add(new MarkdownStructureNode
                    {
                        Kind = MarkdownStructureKind.Table,
                        Title = SummarizeTableLine(trimmed),
                        LineNumber = i,
                        HeadingLevel = 0
                    });
                    inTable = true;
                }

                continue;
            }

            inTable = false;

            var headingMatch = MarkdownHeadingRegex.Match(trimmed);
            if (headingMatch.Success)
            {
                nodes.Add(new MarkdownStructureNode
                {
                    Kind = MarkdownStructureKind.Heading,
                    Title = StripInlineMarkdown(headingMatch.Groups[2].Value),
                    LineNumber = i,
                    HeadingLevel = headingMatch.Groups[1].Value.Length
                });
                continue;
            }

            var htmlHeadingMatch = HtmlHeadingRegex.Match(trimmed);
            if (htmlHeadingMatch.Success)
            {
                nodes.Add(new MarkdownStructureNode
                {
                    Kind = MarkdownStructureKind.HtmlHeading,
                    Title = StripHtml(htmlHeadingMatch.Groups[2].Value),
                    LineNumber = i,
                    HeadingLevel = int.Parse(htmlHeadingMatch.Groups[1].Value)
                });
                continue;
            }

            var sectionMatch = SectionMarkerRegex.Match(trimmed);
            if (sectionMatch.Success)
            {
                nodes.Add(new MarkdownStructureNode
                {
                    Kind = MarkdownStructureKind.Section,
                    Title = $"섹션 {sectionMatch.Groups[1].Value}",
                    LineNumber = i,
                    HeadingLevel = 1
                });
                continue;
            }

            if (trimmed.StartsWith("```", StringComparison.Ordinal))
            {
                nodes.Add(new MarkdownStructureNode
                {
                    Kind = MarkdownStructureKind.CodeBlock,
                    Title = trimmed.Length > 3 ? $"코드: {trimmed[3..].Trim()}" : "코드 블록",
                    LineNumber = i,
                    HeadingLevel = 0
                });
                continue;
            }

            if (trimmed.StartsWith('>'))
            {
                nodes.Add(new MarkdownStructureNode
                {
                    Kind = MarkdownStructureKind.BlockQuote,
                    Title = StripInlineMarkdown(trimmed.TrimStart('>').Trim()),
                    LineNumber = i,
                    HeadingLevel = 0
                });
                continue;
            }

            if (Regex.IsMatch(trimmed, @"^[-*+]\s+\S") || Regex.IsMatch(trimmed, @"^\d+[.)]\s+\S"))
            {
                nodes.Add(new MarkdownStructureNode
                {
                    Kind = MarkdownStructureKind.List,
                    Title = StripInlineMarkdown(trimmed),
                    LineNumber = i,
                    HeadingLevel = 0
                });
                continue;
            }

            var imageMatch = ImageRegex.Match(trimmed);
            if (imageMatch.Success)
            {
                string alt = string.IsNullOrWhiteSpace(imageMatch.Groups[1].Value)
                    ? Path.GetFileName(imageMatch.Groups[2].Value)
                    : imageMatch.Groups[1].Value;
                nodes.Add(new MarkdownStructureNode
                {
                    Kind = MarkdownStructureKind.Image,
                    Title = $"이미지: {alt}",
                    LineNumber = i,
                    HeadingLevel = 0
                });
            }
        }

        return nodes;
    }

    private static List<MarkdownStructureNode> BuildHeadingTree(IReadOnlyList<MarkdownStructureNode> flat)
    {
        var roots = new List<MarkdownStructureNode>();
        var stack = new Stack<MarkdownStructureNode>();

        foreach (MarkdownStructureNode node in flat)
        {
            if (node.Kind is MarkdownStructureKind.Heading or MarkdownStructureKind.HtmlHeading or MarkdownStructureKind.Section)
            {
                while (stack.Count > 0 && stack.Peek().HeadingLevel >= node.HeadingLevel)
                    stack.Pop();

                if (stack.Count == 0)
                    roots.Add(node);
                else
                    stack.Peek().Children.Add(node);

                stack.Push(node);
                continue;
            }

            if (stack.Count == 0)
                roots.Add(node);
            else
                stack.Peek().Children.Add(node);
        }

        return roots;
    }

    private static string SummarizeTableLine(string line)
    {
        if (line.StartsWith("<table", StringComparison.OrdinalIgnoreCase))
            return "HTML 표";

        string[] cells = line.Trim('|').Split('|', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        if (cells.Length == 0)
            return "표";

        string preview = string.Join(" | ", cells.Take(3));
        if (cells.Length > 3)
            preview += " …";

        return $"표: {preview}";
    }

    private static string StripInlineMarkdown(string text)
    {
        string result = Regex.Replace(text, @"!\[[^\]]*\]\([^)]+\)", string.Empty);
        result = Regex.Replace(result, @"\[(.*?)\]\([^)]+\)", "$1");
        result = Regex.Replace(result, @"(\*\*|__|\*|_|~~|`)", string.Empty);
        return CollapseWhitespace(result);
    }

    private static string StripHtml(string text)
        => CollapseWhitespace(Regex.Replace(text, "<[^>]+>", string.Empty));

    private static string CollapseWhitespace(string text)
    {
        text = text.Trim();
        if (text.Length <= 80)
            return text;

        return text[..77] + "…";
    }
}
