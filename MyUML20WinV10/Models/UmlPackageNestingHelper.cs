namespace MyUML20WinV10.Models;

public static class UmlPackageNestingHelper
{
    /// <summary>
    /// Moves <paramref name="child"/> under <paramref name="parent"/> in the model tree.
    /// </summary>
    public static void SyncNestedPackage(UmlPackage root, UmlPackage parent, UmlPackage child)
    {
        if (parent.Id == child.Id)
            return;

        DetachPackage(root, child);
        if (!parent.NestedPackages.Any(p => p.Id == child.Id))
            parent.NestedPackages.Add(child);
    }

    private static bool DetachPackage(UmlPackage package, UmlPackage target)
    {
        if (package.NestedPackages.RemoveAll(p => p.Id == target.Id) > 0)
            return true;

        foreach (var nested in package.NestedPackages)
        {
            if (DetachPackage(nested, target))
                return true;
        }

        return false;
    }
}
