namespace DCMViewer;

internal sealed class MultiSelectTreeView : TreeView
{
    private static readonly Color DefaultMultiSelectBackColor = Color.FromArgb(0, 99, 177);
    private static readonly Color DefaultMultiSelectForeColor = Color.White;

    public Color MultiSelectBackColor { get; set; } = DefaultMultiSelectBackColor;
    public Color MultiSelectForeColor { get; set; } = DefaultMultiSelectForeColor;

    private readonly List<TreeNode> _selectedNodes = [];
    private TreeNode? _anchorNode;

    public Func<TreeNode, bool>? CanMultiSelect { get; set; }

    public IReadOnlyList<TreeNode> SelectedNodes => _selectedNodes;

    public event EventHandler<TreeNode>? FileNodeClick;

    public MultiSelectTreeView()
    {
        LabelEdit = false;
        ImeMode = ImeMode.Disable;
    }

    protected override bool CanEnableIme => false;

    protected override void OnGotFocus(EventArgs e)
    {
        base.OnGotFocus(e);
        SuppressIme();
    }

    protected override void OnEnter(EventArgs e)
    {
        base.OnEnter(e);
        SuppressIme();
    }

    private void SuppressIme()
    {
        if (IsHandleCreated)
            ImeContext.SetImeStatus(ImeMode.Off, Handle);
    }

    public void ClearMultiSelect()
    {
        ResetNodeColors(_selectedNodes);
        _selectedNodes.Clear();
        _anchorNode = null;
    }

    protected override void OnHandleDestroyed(EventArgs e)
    {
        _selectedNodes.Clear();
        _anchorNode = null;
        base.OnHandleDestroyed(e);
    }

    public void SelectSingleNode(TreeNode node, bool raiseFileClick)
    {
        ClearMultiSelect();
        _selectedNodes.Add(node);
        _anchorNode = node;
        ApplySelectedColors(node);
        SelectedNode = node;

        if (raiseFileClick)
            FileNodeClick?.Invoke(this, node);
    }

    protected override void OnBeforeSelect(TreeViewCancelEventArgs e)
    {
        if (e.Action == TreeViewAction.Unknown)
        {
            base.OnBeforeSelect(e);
            return;
        }

        var modifiers = ModifierKeys;
        if ((modifiers & (Keys.Control | Keys.Shift)) != 0 && e.Node is not null && IsMultiSelectable(e.Node))
        {
            e.Cancel = true;
            return;
        }

        base.OnBeforeSelect(e);
    }

    protected override void OnNodeMouseClick(TreeNodeMouseClickEventArgs e)
    {
        if (e.Button == MouseButtons.Left && e.Node is not null)
        {
            var modifiers = ModifierKeys;
            if ((modifiers & Keys.Control) != 0 && IsMultiSelectable(e.Node))
                ToggleSelect(e.Node);
            else if ((modifiers & Keys.Shift) != 0 && IsMultiSelectable(e.Node))
                SelectRange(e.Node);
            else
                SelectSingleNode(e.Node, raiseFileClick: true);
        }

        base.OnNodeMouseClick(e);
    }

    private void ToggleSelect(TreeNode node)
    {
        if (_selectedNodes.Contains(node))
        {
            ResetNodeColors(node);
            _selectedNodes.Remove(node);
            _anchorNode = _selectedNodes.Count > 0 ? _selectedNodes[^1] : null;
            SelectedNode = _anchorNode ?? node;
            return;
        }

        if (_selectedNodes.Count == 0)
        {
            SelectSingleNode(node, raiseFileClick: false);
            return;
        }

        _selectedNodes.Add(node);
        _anchorNode = node;
        ApplySelectedColors(node);
        SelectedNode = node;
    }

    private void SelectRange(TreeNode node)
    {
        if (_anchorNode is null || _anchorNode.Parent != node.Parent)
        {
            SelectSingleNode(node, raiseFileClick: false);
            return;
        }

        var siblings = _anchorNode.Parent!.Nodes;
        var start = Math.Min(_anchorNode.Index, node.Index);
        var end = Math.Max(_anchorNode.Index, node.Index);

        ClearMultiSelect();
        for (var i = start; i <= end; i++)
        {
            if (siblings[i] is not TreeNode sibling || !IsMultiSelectable(sibling))
                continue;

            _selectedNodes.Add(sibling);
            ApplySelectedColors(sibling);
        }

        _anchorNode = node;
        SelectedNode = node;
    }

    private bool IsMultiSelectable(TreeNode node) => CanMultiSelect?.Invoke(node) ?? false;

    private void ApplySelectedColors(TreeNode node)
    {
        node.BackColor = MultiSelectBackColor;
        node.ForeColor = MultiSelectForeColor;
    }

    private static void ResetNodeColors(IEnumerable<TreeNode> nodes)
    {
        foreach (var node in nodes)
            ResetNodeColors(node);
    }

    private static void ResetNodeColors(TreeNode node)
    {
        node.BackColor = Color.Empty;
        node.ForeColor = Color.Empty;
    }
}
