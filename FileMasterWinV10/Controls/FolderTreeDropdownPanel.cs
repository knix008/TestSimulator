using FileMasterWinV10.Helpers;

namespace FileMasterWinV10.Controls;

/// <summary>경로 표시줄 아래에 펼쳐지는 인라인 폴더 트리(아이콘 포함).</summary>
public class FolderTreeDropdownPanel : Panel
{
    private const string PlaceholderName = "...";
    private const int ExpandedHeight = 240;

    private readonly TreeView _tree;
    private readonly ImageList _folderIcons;
    private bool _suppressSelect;

    public event EventHandler<string>? FolderSelected;

    public bool IsOpen => Visible && Height > 0;

    public FolderTreeDropdownPanel()
    {
        Dock = DockStyle.Top;
        Height = 0;
        Visible = false;
        BackColor = UiTheme.Surface;
        Padding = new Padding(1);
        BorderStyle = BorderStyle.FixedSingle;

        _folderIcons = new ImageList { ImageSize = new Size(16, 16), ColorDepth = ColorDepth.Depth32Bit };

        _tree = new TreeView
        {
            Dock = DockStyle.Fill,
            HideSelection = false,
            ShowLines = true,
            ShowPlusMinus = true,
            ShowRootLines = true,
            ShowNodeToolTips = true,
            ImageList = _folderIcons,
            Font = UiTheme.UiFont,
            BorderStyle = BorderStyle.None,
            BackColor = UiTheme.Surface,
            ItemHeight = 22,
        };

        _tree.BeforeExpand += OnBeforeExpand;
        _tree.AfterSelect += OnAfterSelect;
        _tree.NodeMouseDoubleClick += (_, e) =>
        {
            if (e.Node?.Tag is string path && Directory.Exists(path))
                SelectFolder(path);
        };
        _tree.KeyDown += (_, e) =>
        {
            if (e.KeyCode == Keys.Enter && _tree.SelectedNode?.Tag is string path && Directory.Exists(path))
                SelectFolder(path);
            else if (e.KeyCode == Keys.Escape)
                Collapse();
        };

        Controls.Add(_tree);
    }

    public void Toggle(string? currentPath)
    {
        if (IsOpen)
        {
            Collapse();
            return;
        }

        _suppressSelect = true;
        try
        {
            LoadDrives();
            if (!string.IsNullOrWhiteSpace(currentPath) && Directory.Exists(currentPath))
                SelectPath(currentPath);
            Visible = true;
            Height = ExpandedHeight;
            _tree.Focus();
        }
        finally
        {
            _suppressSelect = false;
        }
    }

    public void Collapse()
    {
        Visible = false;
        Height = 0;
        _tree.Nodes.Clear();
    }

    private void OnAfterSelect(object? sender, TreeViewEventArgs e)
    {
        if (_suppressSelect || e.Node?.Tag is not string path || !Directory.Exists(path)) return;
        SelectFolder(path);
    }

    private void SelectFolder(string path)
    {
        FolderSelected?.Invoke(this, path);
        Collapse();
    }

    private void LoadDrives()
    {
        _tree.BeginUpdate();
        _tree.Nodes.Clear();
        foreach (var drive in DriveInfo.GetDrives())
        {
            if (drive.DriveType == DriveType.Unknown) continue;
            string path = drive.Name;
            string label = drive.IsReady
                ? $"{drive.Name.TrimEnd('\\')} ({drive.VolumeLabel})"
                : $"{drive.Name.TrimEnd('\\')} (준비 안 됨)";
            int img = IconHelper.GetIconIndex(_folderIcons, path, isDirectory: true);
            var node = new TreeNode(label, img, img) { Tag = path, ToolTipText = path };
            if (drive.IsReady)
                node.Nodes.Add(new TreeNode(PlaceholderName));
            _tree.Nodes.Add(node);
        }
        _tree.EndUpdate();
    }

    private void OnBeforeExpand(object? sender, TreeViewCancelEventArgs e)
    {
        if (e.Node?.Tag is not string path || !Directory.Exists(path)) return;
        LoadChildFolders(e.Node, path);
    }

    private void LoadChildFolders(TreeNode parent, string path)
    {
        if (parent.Nodes.Count == 1 && parent.Nodes[0].Text == PlaceholderName)
            parent.Nodes.Clear();
        else if (parent.Nodes.Count > 0 && parent.Nodes[0].Tag is string)
            return;

        parent.Nodes.Clear();
        try
        {
            foreach (var dir in Directory.GetDirectories(path).OrderBy(d => d, StringComparer.OrdinalIgnoreCase))
            {
                try
                {
                    var name = Path.GetFileName(dir.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
                    if (string.IsNullOrEmpty(name)) continue;
                    int img = IconHelper.GetIconIndex(_folderIcons, dir, isDirectory: true);
                    var child = new TreeNode(name, img, img) { Tag = dir, ToolTipText = dir };
                    if (HasSubdirectories(dir))
                        child.Nodes.Add(new TreeNode(PlaceholderName));
                    parent.Nodes.Add(child);
                }
                catch { }
            }
        }
        catch { }
    }

    private static bool HasSubdirectories(string path)
    {
        try { return Directory.EnumerateDirectories(path).Any(); }
        catch { return false; }
    }

    private void SelectPath(string path)
    {
        string full;
        string? root;
        try
        {
            full = Path.GetFullPath(path);
            root = Path.GetPathRoot(full);
            if (string.IsNullOrEmpty(root)) return;
        }
        catch { return; }

        TreeNode? current = null;
        foreach (TreeNode driveNode in _tree.Nodes)
        {
            if (driveNode.Tag is not string drivePath) continue;
            if (!full.StartsWith(drivePath, StringComparison.OrdinalIgnoreCase)) continue;
            current = driveNode;
            EnsureExpanded(driveNode, drivePath);
            break;
        }

        if (current == null) return;

        var relative = full[root.Length..].TrimStart('\\', '/');
        if (string.IsNullOrEmpty(relative))
        {
            _tree.SelectedNode = current;
            current.EnsureVisible();
            return;
        }

        foreach (var segment in relative.Split('\\', '/'))
        {
            TreeNode? next = null;
            foreach (TreeNode child in current.Nodes)
            {
                if (child.Text.Equals(segment, StringComparison.OrdinalIgnoreCase))
                {
                    next = child;
                    break;
                }
            }
            if (next == null) break;
            current = next;
            if (next.Tag is string childPath)
                EnsureExpanded(next, childPath);
        }

        _tree.SelectedNode = current;
        current.EnsureVisible();
    }

    private void EnsureExpanded(TreeNode node, string path)
    {
        if (node.Nodes.Count == 1 && node.Nodes[0].Text == PlaceholderName)
        {
            node.Expand();
            LoadChildFolders(node, path);
        }
        else if (node.Nodes.Count == 0 && HasSubdirectories(path))
        {
            node.Nodes.Add(new TreeNode(PlaceholderName));
            node.Expand();
            LoadChildFolders(node, path);
        }
    }
}
