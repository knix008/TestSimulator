using MyDiffWinV10.App.Core;

namespace MyDiffWinV10.App.Controls;

/// <summary>
/// TreeView that syncs expand/collapse and scroll position with a paired buddy tree.
/// </summary>
public sealed class SyncDirTreeView : TreeView
{
    private bool _syncing;

    public SyncDirTreeView? Buddy { get; set; }

    protected override void OnAfterExpand(TreeViewEventArgs e)
    {
        base.OnAfterExpand(e);
        SyncExpandState(e.Node!, expand: true);
    }

    protected override void OnAfterCollapse(TreeViewEventArgs e)
    {
        base.OnAfterCollapse(e);
        SyncExpandState(e.Node!, expand: false);
    }

    protected override void WndProc(ref Message m)
    {
        base.WndProc(ref m);

        const int WM_VSCROLL = 0x0115;
        const int WM_MOUSEWHEEL = 0x020A;
        if (m.Msg != WM_VSCROLL && m.Msg != WM_MOUSEWHEEL || Buddy == null || _syncing)
        {
            return;
        }

        _syncing = true;
        try
        {
            int topIndex = GetTopNodeIndex(this);
            List<TreeNode> buddyVisible = GetVisibleNodes(Buddy.Nodes).ToList();
            if (topIndex >= 0 && topIndex < buddyVisible.Count)
            {
                Buddy.TopNode = buddyVisible[topIndex];
            }
        }
        finally
        {
            _syncing = false;
        }
    }

    private void SyncExpandState(TreeNode node, bool expand)
    {
        if (Buddy == null || _syncing)
        {
            return;
        }

        _syncing = true;
        try
        {
            string[] parts = node.FullPath.Split(PathSeparator[0]);
            TreeNode? buddyNode = parts.Length <= 1
                ? Buddy.Nodes.Count > 0 ? Buddy.Nodes[0] : null
                : FindNodeByPath(Buddy.Nodes.Count > 0 ? Buddy.Nodes[0].Nodes : Buddy.Nodes, parts, depth: 1);

            if (buddyNode == null)
            {
                return;
            }

            if (expand)
            {
                buddyNode.Expand();
            }
            else
            {
                buddyNode.Collapse();
            }
        }
        finally
        {
            _syncing = false;
        }
    }

    private static TreeNode? FindNodeByPath(TreeNodeCollection nodes, string[] parts, int depth)
    {
        if (depth >= parts.Length)
        {
            return null;
        }

        foreach (TreeNode node in nodes)
        {
            if (!string.Equals(node.Text, parts[depth], StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            return depth == parts.Length - 1 ? node : FindNodeByPath(node.Nodes, parts, depth + 1);
        }

        return null;
    }

    private static int GetTopNodeIndex(TreeView tree)
    {
        if (tree.TopNode == null)
        {
            return 0;
        }

        int index = 0;
        foreach (TreeNode node in GetVisibleNodes(tree.Nodes))
        {
            if (ReferenceEquals(node, tree.TopNode))
            {
                return index;
            }

            index++;
        }

        return 0;
    }

    private static IEnumerable<TreeNode> GetVisibleNodes(TreeNodeCollection nodes)
    {
        foreach (TreeNode node in nodes)
        {
            yield return node;
            if (node.IsExpanded)
            {
                foreach (TreeNode child in GetVisibleNodes(node.Nodes))
                {
                    yield return child;
                }
            }
        }
    }
}
