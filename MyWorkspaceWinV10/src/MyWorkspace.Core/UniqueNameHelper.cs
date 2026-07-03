namespace MyWorkspace.Core;

public static class UniqueNameHelper
{
    public static string MakeUnique(string desiredName, IEnumerable<string> existingNames, StringComparer? comparer = null)
    {
        comparer ??= StringComparer.OrdinalIgnoreCase;

        var trimmed = desiredName.Trim();
        if (string.IsNullOrEmpty(trimmed))
            throw new ArgumentException("Name must not be empty.", nameof(desiredName));

        var existing = existingNames as IReadOnlyCollection<string> ?? existingNames.ToList();
        if (!Contains(existing, trimmed, comparer))
            return trimmed;

        var root = GetRootName(trimmed);

        for (var index = 2; index < int.MaxValue; index++)
        {
            var candidate = $"{root} ({index})";
            if (!Contains(existing, candidate, comparer))
                return candidate;
        }

        return $"{root} ({Guid.NewGuid():N[..8]})";
    }

    internal static string GetRootName(string name)
    {
        if (name.Length < 4)
            return name;

        if (name[^1] != ')')
            return name;

        var open = name.LastIndexOf(" (", StringComparison.Ordinal);
        if (open <= 0)
            return name;

        var suffix = name[(open + 2)..^1];
        if (suffix.Length == 0 || !suffix.All(char.IsDigit))
            return name;

        return name[..open];
    }

    private static bool Contains(IEnumerable<string> names, string value, StringComparer comparer)
    {
        foreach (var name in names)
        {
            if (comparer.Equals(name, value))
                return true;
        }

        return false;
    }
}
