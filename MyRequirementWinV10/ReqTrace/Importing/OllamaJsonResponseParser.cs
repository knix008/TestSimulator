using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace ReqTrace.Importing;

internal static class OllamaJsonResponseParser
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    internal static string? ParseDescription(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return null;

        var json = ExtractJsonPayload(raw);
        if (string.IsNullOrWhiteSpace(json))
            return null;

        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;

        if (root.ValueKind == JsonValueKind.Object)
        {
            var direct = ReadString(root, "description", "Description", "desc", "details", "text", "설명", "내용", "상세", "요구사항내용");
            if (!string.IsNullOrWhiteSpace(direct))
                return direct.Trim();

            foreach (var key in new[] { "requirements", "requirement", "items", "data", "results" })
            {
                if (!root.TryGetProperty(key, out var nested))
                    continue;

                if (nested.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in nested.EnumerateArray())
                    {
                        var nestedDescription = ReadString(item, "description", "Description", "desc", "details", "text", "설명", "내용", "상세", "요구사항내용");
                        if (!string.IsNullOrWhiteSpace(nestedDescription))
                            return nestedDescription.Trim();
                    }
                }
                else if (nested.ValueKind == JsonValueKind.Object)
                {
                    var nestedDescription = ReadString(nested, "description", "Description", "desc", "details", "text", "설명", "내용", "상세", "요구사항내용");
                    if (!string.IsNullOrWhiteSpace(nestedDescription))
                        return nestedDescription.Trim();
                }
            }
        }

        var parsed = Parse(raw);
        return parsed.FirstOrDefault(item => !string.IsNullOrWhiteSpace(item.Description))?.Description?.Trim();
    }

    internal static List<ExtractedRequirementDto> Parse(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return [];

        var json = ExtractJsonPayload(raw);
        if (string.IsNullOrWhiteSpace(json))
            return [];

        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        var items = ExtractFromElement(root);
        return items.Select(NormalizeItem).Where(i => !string.IsNullOrWhiteSpace(i.Title)).ToList();
    }

    private static string ExtractJsonPayload(string raw)
    {
        var trimmed = raw.Trim();

        var fenced = Regex.Match(trimmed, @"```(?:json)?\s*([\s\S]*?)```", RegexOptions.IgnoreCase);
        if (fenced.Success)
            trimmed = fenced.Groups[1].Value.Trim();

        var objectStart = trimmed.IndexOf('{');
        var arrayStart = trimmed.IndexOf('[');
        if (objectStart < 0 && arrayStart < 0)
            return trimmed;

        if (arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart))
            return ExtractBalanced(trimmed, arrayStart, '[', ']');

        if (objectStart >= 0)
            return ExtractBalanced(trimmed, objectStart, '{', '}');

        return trimmed;
    }

    private static string ExtractBalanced(string text, int start, char open, char close)
    {
        var depth = 0;
        for (var i = start; i < text.Length; i++)
        {
            if (text[i] == open)
                depth++;
            else if (text[i] == close)
            {
                depth--;
                if (depth == 0)
                    return text[start..(i + 1)];
            }
        }

        return text[start..];
    }

    private static List<ExtractedRequirementDto> ExtractFromElement(JsonElement root)
    {
        switch (root.ValueKind)
        {
            case JsonValueKind.Array:
                return DeserializeList(root);
            case JsonValueKind.Object:
                foreach (var key in new[] { "requirements", "requirement", "items", "data", "results" })
                {
                    if (root.TryGetProperty(key, out var nested))
                        return ExtractFromElement(nested);
                }

                if (LooksLikeRequirement(root))
                    return [DeserializeItem(root)];

                return [];
            default:
                return [];
        }
    }

    private static bool LooksLikeRequirement(JsonElement element)
    {
        foreach (var name in new[] { "title", "Title", "제목", "name", "Name", "요구사항", "요구사항명" })
        {
            if (element.TryGetProperty(name, out _))
                return true;
        }

        return false;
    }

    private static List<ExtractedRequirementDto> DeserializeList(JsonElement array)
    {
        var result = new List<ExtractedRequirementDto>();
        foreach (var item in array.EnumerateArray())
        {
            if (item.ValueKind == JsonValueKind.Object)
                result.Add(DeserializeItem(item));
        }

        return result;
    }

    private static ExtractedRequirementDto DeserializeItem(JsonElement element)
    {
        var dto = new ExtractedRequirementDto
        {
            Code = ReadString(element, "code", "Code", "id", "Id", "코드", "요구사항id", "요구사항번호", "식별자", "번호"),
            Title = ReadString(element, "title", "Title", "name", "Name", "summary", "제목", "요구사항명", "요구사항", "기능명", "항목"),
            Description = ReadString(element, "description", "Description", "desc", "details", "text", "설명", "내용", "상세", "요구사항내용"),
            Category = ReadString(element, "category", "Category", "module", "area", "분류", "카테고리", "모듈", "영역"),
            Priority = ReadString(element, "priority", "Priority", "severity", "우선순위", "중요도"),
            Status = ReadString(element, "status", "Status", "state", "상태", "진행상태"),
            ParentCode = ReadString(element, "parentCode", "ParentCode", "parent", "parentId", "상위", "부모", "상위코드", "상위요구사항")
        };

        if (string.IsNullOrWhiteSpace(dto.Title))
            dto.Title = dto.Description;

        return dto;
    }

    private static string? ReadString(JsonElement element, params string[] names)
    {
        foreach (var name in names)
        {
            if (!element.TryGetProperty(name, out var value))
                continue;

            return value.ValueKind switch
            {
                JsonValueKind.String => value.GetString(),
                JsonValueKind.Number => value.GetRawText(),
                JsonValueKind.True => "true",
                JsonValueKind.False => "false",
                _ => null
            };
        }

        return null;
    }

    private static ExtractedRequirementDto NormalizeItem(ExtractedRequirementDto item) =>
        new()
        {
            Code = item.Code?.Trim(),
            Title = item.Title?.Trim(),
            Description = item.Description?.Trim(),
            Category = item.Category?.Trim(),
            Priority = item.Priority?.Trim(),
            Status = item.Status?.Trim(),
            ParentCode = item.ParentCode?.Trim()
        };
}

internal sealed class ExtractedRequirementDto
{
    [JsonPropertyName("code")]
    public string? Code { get; set; }

    [JsonPropertyName("title")]
    public string? Title { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("category")]
    public string? Category { get; set; }

    [JsonPropertyName("priority")]
    public string? Priority { get; set; }

    [JsonPropertyName("status")]
    public string? Status { get; set; }

    [JsonPropertyName("parentCode")]
    public string? ParentCode { get; set; }
}
