using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

internal static class StructureTypeNodeMerger
{
    public static StructureTypeNode Merge(StructureTypeNode existing, StructureTypeNode incoming)
    {
        var primary = Score(incoming) >= Score(existing) ? incoming : existing;
        var secondary = ReferenceEquals(primary, incoming) ? existing : incoming;

        return new StructureTypeNode
        {
            Id = primary.Id,
            DisplayName = primary.DisplayName,
            FullName = ChooseLonger(primary.FullName, secondary.FullName),
            FilePath = ChooseNonEmpty(primary.FilePath, secondary.FilePath),
            LineNumber = primary.LineNumber > 0 ? primary.LineNumber : secondary.LineNumber,
            Kind = primary.Kind,
            IsAbstract = primary.IsAbstract || secondary.IsAbstract,
            Attributes = ChooseMembers(primary.Attributes, secondary.Attributes),
            Operations = ChooseMembers(primary.Operations, secondary.Operations),
            Members = ChooseMembers(primary.Members, secondary.Members)
        };
    }

    private static int Score(StructureTypeNode type) =>
        (string.IsNullOrWhiteSpace(type.FilePath) ? 0 : 4)
        + type.Attributes.Count
        + type.Operations.Count
        + type.Members.Count;

    private static string ChooseLonger(string left, string right) =>
        right.Length > left.Length ? right : left;

    private static string ChooseNonEmpty(string left, string right) =>
        string.IsNullOrWhiteSpace(left) ? right : left;

    private static IReadOnlyList<string> ChooseMembers(IReadOnlyList<string> left, IReadOnlyList<string> right) =>
        left.Count >= right.Count ? left : right;
}
