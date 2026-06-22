namespace MyGitWinV10.App.Controls;

internal static class SplitContainerLayoutHelper
{
    /// <summary>
    /// Clamps <paramref name="preferredDistance"/> to the splitter's current client span.
    /// WinForms can throw on first layout (especially with DPI scaling) when design-time
    /// distances no longer fit the real control size.
    /// </summary>
    public static void SafeSetSplitterDistance(SplitContainer split, int preferredDistance)
    {
        if (!split.IsHandleCreated)
        {
            return;
        }

        int span = split.Orientation == Orientation.Vertical ? split.Width : split.Height;
        if (span <= split.SplitterWidth)
        {
            return;
        }

        int minDistance = split.Panel1MinSize;
        int maxDistance = span - split.Panel2MinSize - split.SplitterWidth;
        if (maxDistance < minDistance)
        {
            return;
        }

        try
        {
            split.SplitterDistance = Math.Clamp(preferredDistance, minDistance, maxDistance);
        }
        catch (ArgumentOutOfRangeException)
        {
            // Transient layout: a later resize/Shown pass will retry.
        }
    }

    public static void Stabilize(params SplitContainer[] splits)
    {
        foreach (SplitContainer split in splits)
        {
            SafeSetSplitterDistance(split, split.SplitterDistance);
        }
    }
}
