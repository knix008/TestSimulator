using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

internal static class StructureTypeIdResolver
{
    public static bool IsSyntheticCallDependencyType(string typeId) =>
        typeId.StartsWith("dep-type:", StringComparison.Ordinal);

    public static bool IsShortPlaceholderId(string typeId, out string languageId, out string displayName)
    {
        languageId = string.Empty;
        displayName = string.Empty;

        var typePrefixIndex = typeId.IndexOf("-type:", StringComparison.Ordinal);
        if (typePrefixIndex <= 0)
        {
            return false;
        }

        languageId = typeId[..typePrefixIndex];
        var namePart = typeId[(typePrefixIndex + "-type:".Length)..];
        if (namePart.Contains("::", StringComparison.Ordinal))
        {
            return false;
        }

        displayName = namePart;
        return !string.IsNullOrWhiteSpace(displayName);
    }

    public static string? FindByDisplayName(
        IEnumerable<StructureTypeNode> types,
        string languageId,
        string displayName)
    {
        return types
            .Where(type => type.Id.StartsWith(languageId + "-type:", StringComparison.Ordinal))
            .Where(type => string.Equals(type.DisplayName, displayName, StringComparison.Ordinal))
            .OrderByDescending(type => !string.IsNullOrWhiteSpace(type.FilePath))
            .ThenByDescending(type => type.Attributes.Count + type.Operations.Count)
            .Select(type => type.Id)
            .FirstOrDefault();
    }

    public static string? FindByDisplayNameAny(IEnumerable<StructureTypeNode> types, string displayName) =>
        types
            .Where(type => string.Equals(type.DisplayName, displayName, StringComparison.Ordinal))
            .OrderByDescending(type => !string.IsNullOrWhiteSpace(type.FilePath))
            .ThenByDescending(type => type.Attributes.Count + type.Operations.Count)
            .Select(type => type.Id)
            .FirstOrDefault();

    public static string ResolveOrCreatePlaceholder(
        string languageId,
        string displayPrefix,
        string baseName,
        string baseKind,
        IDictionary<string, StructureTypeNode> types)
    {
        var existing = FindByDisplayName(types.Values, languageId, baseName);
        if (existing is not null)
        {
            return existing;
        }

        var id = $"{languageId}-type:{baseName}";
        types.TryAdd(id, new StructureTypeNode
        {
            Id = id,
            DisplayName = baseName,
            FullName = $"{displayPrefix} {baseName}",
            FilePath = string.Empty,
            LineNumber = 0,
            Kind = baseKind
        });

        return id;
    }

    public static string? GetLanguageIdFromCallGraphNodeId(string nodeId)
    {
        var separator = nodeId.IndexOf(':');
        return separator > 0 ? nodeId[..separator] : null;
    }
}
