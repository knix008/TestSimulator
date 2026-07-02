using System.ComponentModel;
using System.Reflection;
using System.Windows.Forms;

namespace MyWorkspace.Win;

internal static class MenuItemClickForwarder
{
    private static readonly object? ClickEventKey =
        typeof(ToolStripItem).GetField("EventClick", BindingFlags.Static | BindingFlags.NonPublic)?.GetValue(null);

    public static void Invoke(ToolStripMenuItem menuItem)
    {
        if (!menuItem.Enabled)
            return;

        if (TryRaiseClickEvent(menuItem))
            return;

        menuItem.PerformClick();
    }

    private static bool TryRaiseClickEvent(ToolStripMenuItem menuItem)
    {
        if (ClickEventKey == null)
            return false;

        if (typeof(Component).GetProperty("Events", BindingFlags.Instance | BindingFlags.NonPublic)?
                .GetValue(menuItem) is not EventHandlerList handlers)
        {
            return false;
        }

        if (handlers[ClickEventKey] is not EventHandler clickHandler)
            return false;

        clickHandler.Invoke(menuItem, EventArgs.Empty);
        return true;
    }
}
