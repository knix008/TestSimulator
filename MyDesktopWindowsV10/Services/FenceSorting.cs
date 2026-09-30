using System.Collections.ObjectModel;
using MyDesktop.Interop;
using MyDesktop.Models;

namespace MyDesktop.Services;

public static class FenceSorting
{
    /// <summary>Explorer's ordering: folders first, then names compared the way the shell does.</summary>
    public static IComparer<FenceItem> ComparerFor(FenceSort sort) => sort switch
    {
        FenceSort.Name => Comparer<FenceItem>.Create(CompareByName),
        FenceSort.Kind => Comparer<FenceItem>.Create((left, right) =>
        {
            var byKind = string.Compare(
                Path.GetExtension(left.Path), Path.GetExtension(right.Path), StringComparison.OrdinalIgnoreCase);
            return byKind != 0 ? byKind : CompareByName(left, right);
        }),
        FenceSort.Modified => Comparer<FenceItem>.Create((left, right) =>
        {
            var byDate = LastWrite(right.Path).CompareTo(LastWrite(left.Path));
            return byDate != 0 ? byDate : CompareByName(left, right);
        }),
        _ => Comparer<FenceItem>.Create((_, _) => 0)
    };

    public static void Apply(ObservableCollection<FenceItem> items, FenceSort sort)
    {
        if (sort == FenceSort.Manual || items.Count < 2)
        {
            return;
        }

        var ordered = items.OrderBy(item => item, ComparerFor(sort)).ToList();
        for (var target = 0; target < ordered.Count; target++)
        {
            var current = items.IndexOf(ordered[target]);
            if (current != target)
            {
                items.Move(current, target);
            }
        }
    }

    private static int CompareByName(FenceItem left, FenceItem right)
    {
        var leftIsFolder = Directory.Exists(left.Path);
        var rightIsFolder = Directory.Exists(right.Path);
        if (leftIsFolder != rightIsFolder)
        {
            return leftIsFolder ? -1 : 1;
        }

        return NativeMethods.StrCmpLogicalW(left.Name, right.Name);
    }

    private static DateTime LastWrite(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                return File.GetLastWriteTimeUtc(path);
            }

            if (Directory.Exists(path))
            {
                return Directory.GetLastWriteTimeUtc(path);
            }
        }
        catch (IOException)
        {
        }

        return DateTime.MinValue;
    }
}
