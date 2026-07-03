using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

internal sealed class DirectorySelectionTreeView : UserControl
{
    private readonly TreeView _tree = new()
    {
        Dock = DockStyle.Fill,
        CheckBoxes = true,
        HideSelection = false,
        ShowLines = true,
        ShowPlusMinus = true,
        ShowRootLines = true,
        ShowNodeToolTips = true,
        BorderStyle = BorderStyle.FixedSingle
    };

    private readonly HashSet<string> _includedPaths = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, TreeNode> _nodesByPath = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> _knownPaths = new(StringComparer.OrdinalIgnoreCase) { "." };
    private bool _suppressCheckEvents;

    public DirectorySelectionTreeView()
    {
        Controls.Add(_tree);
        _tree.AfterCheck += OnAfterCheck;
    }

    public event EventHandler? SelectionChanged;

    public void LoadDirectories(string rootPath, IReadOnlyList<string> subdirectories, IReadOnlyList<string> includedPaths)
    {
        _suppressCheckEvents = true;
        try
        {
            _tree.Nodes.Clear();
            _nodesByPath.Clear();
            _knownPaths.Clear();
            _knownPaths.Add(".");
            _includedPaths.Clear();

            var rootNode = CreateNode(".", "(루트)");
            _tree.Nodes.Add(rootNode);
            _nodesByPath["."] = rootNode;

            foreach (var relativePath in subdirectories.OrderBy(path => path, StringComparer.OrdinalIgnoreCase))
            {
                var normalized = DirectoryPathHelper.Normalize(relativePath);
                if (normalized == "." || !_knownPaths.Add(normalized))
                {
                    continue;
                }

                InsertPathNode(normalized);
            }

            SetIncludedPaths(includedPaths);
            rootNode.Expand();
        }
        finally
        {
            _suppressCheckEvents = false;
        }
    }

    public IReadOnlyList<string> GetIncludedPaths() =>
        _includedPaths
            .Select(DirectoryPathHelper.Normalize)
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .ToList();

    public IReadOnlyList<string> GetAllKnownPaths() =>
        _knownPaths
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .ToList();

    public void SetIncludedPaths(IReadOnlyList<string> includedPaths)
    {
        _suppressCheckEvents = true;
        try
        {
            _includedPaths.Clear();
            foreach (var path in DirectoryPathHelper.NormalizeIncludedPaths(includedPaths))
            {
                if (_knownPaths.Contains(path))
                {
                    _includedPaths.Add(path);
                }
            }

            if (_includedPaths.Count == 0 && _knownPaths.Contains("."))
            {
                _includedPaths.Add(".");
            }

            RefreshAllChecks();
        }
        finally
        {
            _suppressCheckEvents = false;
        }
    }

    public void SelectAll()
    {
        _suppressCheckEvents = true;
        try
        {
            _includedPaths.Clear();
            _includedPaths.Add(".");
            RefreshAllChecks();
        }
        finally
        {
            _suppressCheckEvents = false;
        }

        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public void DeselectAll()
    {
        _suppressCheckEvents = true;
        try
        {
            _includedPaths.Clear();
            RefreshAllChecks();
        }
        finally
        {
            _suppressCheckEvents = false;
        }

        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    private void InsertPathNode(string relativePath)
    {
        if (_nodesByPath.ContainsKey(relativePath))
        {
            return;
        }

        var parentPath = DirectoryPathHelper.GetParentPath(relativePath) ?? ".";
        if (!_nodesByPath.TryGetValue(parentPath, out var parentNode))
        {
            if (parentPath != ".")
            {
                InsertPathNode(parentPath);
                parentNode = _nodesByPath[parentPath];
            }
            else
            {
                parentNode = _nodesByPath["."];
            }
        }

        var displayName = relativePath.Contains(Path.DirectorySeparatorChar)
            ? relativePath[(relativePath.LastIndexOf(Path.DirectorySeparatorChar) + 1)..]
            : relativePath;

        var node = CreateNode(relativePath, displayName);
        parentNode.Nodes.Add(node);
        _nodesByPath[relativePath] = node;
    }

    private static TreeNode CreateNode(string path, string displayName) =>
        new(displayName)
        {
            Tag = path,
            ToolTipText = path == "." ? "(루트)" : path
        };

    private void OnAfterCheck(object? sender, TreeViewEventArgs e)
    {
        if (_suppressCheckEvents || e.Node?.Tag is not string path)
        {
            return;
        }

        _suppressCheckEvents = true;
        try
        {
            if (e.Node.Checked)
            {
                ApplyCheck(path);
            }
            else
            {
                ApplyUncheck(path);
            }

            RefreshAllChecks();
        }
        finally
        {
            _suppressCheckEvents = false;
        }

        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    private void ApplyCheck(string path)
    {
        if (FindIncludedAncestor(path) is not null)
        {
            return;
        }

        RemoveDescendantPaths(path);
        _includedPaths.Add(path);
    }

    private void ApplyUncheck(string path)
    {
        if (FindIncludedAncestor(path) is { } ancestor)
        {
            _includedPaths.Remove(ancestor);
            AddSiblingBranchesExcept(ancestor, path);
            return;
        }

        if (_includedPaths.Remove(path))
        {
            RemoveDescendantPaths(path);
            return;
        }

        RemoveMatchingPaths(existing =>
            DirectoryPathHelper.IsSamePath(existing, path)
            || DirectoryPathHelper.IsStrictDescendantPath(path, existing));
    }

    private void RemoveDescendantPaths(string path)
    {
        RemoveMatchingPaths(existing => DirectoryPathHelper.IsStrictDescendantPath(path, existing));
    }

    private void RemoveMatchingPaths(Func<string, bool> predicate)
    {
        foreach (var existing in _includedPaths.Where(predicate).ToList())
        {
            _includedPaths.Remove(existing);
        }
    }

    private void AddSiblingBranchesExcept(string parentPath, string excludedPath)
    {
        if (!_nodesByPath.TryGetValue(parentPath, out var parentNode))
        {
            return;
        }

        foreach (TreeNode childNode in parentNode.Nodes)
        {
            if (childNode.Tag is not string childPath)
            {
                continue;
            }

            if (DirectoryPathHelper.IsSamePath(childPath, excludedPath))
            {
                continue;
            }

            if (DirectoryPathHelper.IsStrictDescendantPath(childPath, excludedPath))
            {
                continue;
            }

            if (DirectoryPathHelper.IsStrictDescendantPath(excludedPath, childPath))
            {
                AddSiblingBranchesExcept(childPath, excludedPath);
            }
            else
            {
                _includedPaths.Add(childPath);
            }
        }
    }

    private string? FindIncludedAncestor(string path)
    {
        var current = DirectoryPathHelper.GetParentPath(path);
        while (current is not null)
        {
            if (_includedPaths.Contains(current))
            {
                return current;
            }

            current = DirectoryPathHelper.GetParentPath(current);
        }

        return null;
    }

    private bool ShouldShowChecked(string path)
    {
        if (_includedPaths.Contains(path))
        {
            return true;
        }

        if (FindIncludedAncestor(path) is not null)
        {
            return true;
        }

        return _includedPaths.Any(existing => DirectoryPathHelper.IsStrictDescendantPath(path, existing));
    }

    private void RefreshAllChecks()
    {
        foreach (var node in _nodesByPath.Values)
        {
            if (node.Tag is not string path)
            {
                continue;
            }

            node.Checked = ShouldShowChecked(path);
        }
    }
}
