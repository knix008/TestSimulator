using ReqTrace.Models;

namespace ReqTrace.Importing;

public static class EnumImportParser
{
    private static readonly Dictionary<string, Priority> PriorityAliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["low"] = Priority.Low,
        ["medium"] = Priority.Medium,
        ["high"] = Priority.High,
        ["critical"] = Priority.Critical,
        ["낮음"] = Priority.Low,
        ["보통"] = Priority.Medium,
        ["높음"] = Priority.High,
        ["긴급"] = Priority.Critical,
    };

    private static readonly Dictionary<string, RequirementStatus> StatusAliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["draft"] = RequirementStatus.Draft,
        ["approved"] = RequirementStatus.Approved,
        ["inprogress"] = RequirementStatus.InProgress,
        ["in progress"] = RequirementStatus.InProgress,
        ["implemented"] = RequirementStatus.Implemented,
        ["deprecated"] = RequirementStatus.Deprecated,
        ["초안"] = RequirementStatus.Draft,
        ["승인됨"] = RequirementStatus.Approved,
        ["진행 중"] = RequirementStatus.InProgress,
        ["진행중"] = RequirementStatus.InProgress,
        ["구현됨"] = RequirementStatus.Implemented,
        ["폐기됨"] = RequirementStatus.Deprecated,
    };

    public static bool TryParsePriority(string value, out Priority result) =>
        TryParse(value, PriorityAliases, out result);

    public static bool TryParseStatus(string value, out RequirementStatus result) =>
        TryParse(value, StatusAliases, out result);

    public static Priority ParsePriorityOrDefault(string value, Priority defaultValue) =>
        TryParsePriority(value, out var parsed) ? parsed : defaultValue;

    public static RequirementStatus ParseStatusOrDefault(string value, RequirementStatus defaultValue) =>
        TryParseStatus(value, out var parsed) ? parsed : defaultValue;

    private static bool TryParse<TEnum>(string value, Dictionary<string, TEnum> aliases, out TEnum result)
        where TEnum : struct, Enum
    {
        result = default;
        if (string.IsNullOrWhiteSpace(value))
            return false;

        var trimmed = value.Trim();
        if (Enum.TryParse(trimmed, ignoreCase: true, out result))
            return true;

        if (aliases.TryGetValue(trimmed, out result))
            return true;

        var compact = trimmed.Replace(" ", string.Empty, StringComparison.Ordinal);
        return aliases.TryGetValue(compact, out result);
    }
}
