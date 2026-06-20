using System.Text.RegularExpressions;

namespace ReqTrace.Importing;

public static class ColumnMappingHeuristics
{
    private static readonly Dictionary<string, string[]> Synonyms = new()
    {
        ["Code"] = new[] { "id", "reqid", "requirementid", "reqnum", "key", "code", "코드", "요구사항id", "요구사항번호", "식별자", "번호" },
        ["Title"] = new[] { "title", "name", "summary", "requirement", "제목", "요구사항명", "요구사항", "기능명", "항목" },
        ["Description"] = new[] { "description", "desc", "details", "text", "설명", "내용", "상세", "요구사항내용" },
        ["Category"] = new[] { "category", "module", "component", "area", "분류", "카테고리", "모듈", "영역" },
        ["Priority"] = new[] { "priority", "severity", "우선순위", "중요도" },
        ["Status"] = new[] { "status", "state", "상태", "진행상태" },
        ["Source"] = new[] { "source", "origin", "reference", "출처", "원본" },
        ["ParentCode"] = new[] { "parent", "parentid", "parentrequirement", "parentcode", "상위", "부모", "상위요구사항", "상위코드", "상위 코드" }
    };

    public static ColumnMapping Infer(IReadOnlyList<string> headers)
    {
        var normalized = headers.Select(Normalize).ToList();
        var rawLower = headers.Select(h => h.Trim().ToLowerInvariant()).ToList();
        var mapping = new ColumnMapping
        {
            CodeColumn = FindColumn(normalized, rawLower, "Code"),
            TitleColumn = FindColumn(normalized, rawLower, "Title"),
            DescriptionColumn = FindColumn(normalized, rawLower, "Description"),
            CategoryColumn = FindColumn(normalized, rawLower, "Category"),
            PriorityColumn = FindColumn(normalized, rawLower, "Priority"),
            StatusColumn = FindColumn(normalized, rawLower, "Status"),
            SourceColumn = FindColumn(normalized, rawLower, "Source"),
            ParentCodeColumn = FindColumn(normalized, rawLower, "ParentCode")
        };
        return mapping;
    }

    private static int? FindColumn(List<string> normalizedHeaders, List<string> rawLowerHeaders, string field)
    {
        var candidates = Synonyms[field];

        for (var i = 0; i < normalizedHeaders.Count; i++)
        {
            if (candidates.Contains(normalizedHeaders[i]))
                return i;
        }

        for (var i = 0; i < rawLowerHeaders.Count; i++)
        {
            if (candidates.Any(c => rawLowerHeaders[i].Contains(c, StringComparison.Ordinal)))
                return i;
        }

        for (var i = 0; i < normalizedHeaders.Count; i++)
        {
            if (candidates.Any(c => normalizedHeaders[i].Contains(c, StringComparison.Ordinal)))
                return i;
        }

        return null;
    }

    private static string Normalize(string header)
    {
        var trimmed = header.Trim().ToLowerInvariant();
        var ascii = Regex.Replace(trimmed, "[^a-z0-9]", "");
        return string.IsNullOrEmpty(ascii) ? trimmed : ascii;
    }
}
