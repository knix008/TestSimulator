namespace MyWorkspace.Core;

public static class NameSortHelper
{
    public static readonly StringComparer Comparer = StringComparer.CurrentCultureIgnoreCase;

    public static List<T> OrderByName<T>(IEnumerable<T> source, Func<T, string> nameSelector) =>
        source.OrderBy(nameSelector, Comparer).ToList();

    public static List<string> OrderNames(IEnumerable<string> names) =>
        names.OrderBy(name => name, Comparer).ToList();
}
