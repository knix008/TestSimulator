using MyDiffWinV10.App.Core;
using MyDiffWinV10.App.Services;

namespace MyDiffWinV10.App.Controls;

/// <summary>
/// Left/right synchronized directory trees with compare controls.
/// </summary>
public sealed class DirectoryComparePanel : UserControl
{
    private const int HeaderHeight = 28;

    private static readonly Color CanvasColor = Color.FromArgb(241, 243, 247);

    private readonly SyncDirTreeView _leftTree = new() { Dock = DockStyle.Fill, HideSelection = false, BorderStyle = BorderStyle.None };
    private readonly SyncDirTreeView _rightTree = new() { Dock = DockStyle.Fill, HideSelection = false, BorderStyle = BorderStyle.None };
    private readonly ImageList _statusIcons = new() { ColorDepth = ColorDepth.Depth32Bit, ImageSize = new Size(16, 16) };
    private readonly Label _lblLeftHeader = new();
    private readonly Label _lblRightHeader = new();
    private readonly ToolTip _toolbarToolTip = new();

    private Button? _btnSelectLeftDirectory;
    private Button? _btnSelectRightDirectory;
    private Button? _btnCompareDirectories;

    private string _leftDirectory = string.Empty;
    private string _rightDirectory = string.Empty;
    private DirectoryCompareResult? _result;
    private AppSettings? _settings;

    public event EventHandler<(string LeftPath, string RightPath)>? FileCompareRequested;

    public event EventHandler<string>? StatusChanged;

    public DirectoryComparePanel()
    {
        BackColor = CanvasColor;
        DirectoryTreeIcons.Populate(_statusIcons);
        _leftTree.ImageList = _statusIcons;
        _rightTree.ImageList = _statusIcons;
        _leftTree.Buddy = _rightTree;
        _rightTree.Buddy = _leftTree;
        _leftTree.NodeMouseDoubleClick += (_, e) => OnNodeDoubleClick(e.Node, isLeft: true);
        _rightTree.NodeMouseDoubleClick += (_, e) => OnNodeDoubleClick(e.Node, isLeft: false);

        BuildLayout();
    }

    public void BindSettings(AppSettings settings)
    {
        _settings = settings;
        ApplyHeaderColors();
    }

    public void ApplyLocalization()
    {
        ApplyHeaderText();
        UpdateToolbarToolTips();

        if (_btnSelectLeftDirectory != null)
        {
            _btnSelectLeftDirectory.Text = Strings.SelectLeftDirectory;
        }

        if (_btnSelectRightDirectory != null)
        {
            _btnSelectRightDirectory.Text = Strings.SelectRightDirectory;
        }

        if (_btnCompareDirectories != null)
        {
            _btnCompareDirectories.Text = Strings.CompareDirectories;
        }
    }

    private void UpdateToolbarToolTips()
    {
        if (_btnSelectLeftDirectory != null)
        {
            _toolbarToolTip.SetToolTip(_btnSelectLeftDirectory, Strings.TipSelectLeftDirectory);
        }

        if (_btnSelectRightDirectory != null)
        {
            _toolbarToolTip.SetToolTip(_btnSelectRightDirectory, Strings.TipSelectRightDirectory);
        }

        if (_btnCompareDirectories != null)
        {
            _toolbarToolTip.SetToolTip(_btnCompareDirectories, Strings.TipCompareDirectories);
        }
    }

    public void ApplyHeaderColors()
    {
        if (_settings == null)
        {
            return;
        }

        var left = PaneTheme.HeaderColors(isLeft: true, _settings);
        _lblLeftHeader.BackColor = left.Background;
        _lblLeftHeader.ForeColor = left.Text;

        var right = PaneTheme.HeaderColors(isLeft: false, _settings);
        _lblRightHeader.BackColor = right.Background;
        _lblRightHeader.ForeColor = right.Text;
    }

    public void RestoreLastDirectories(AppSettings settings)
    {
        var last = settings.LastDirectorySession;
        if (last?.LeftDirectory == null || last.RightDirectory == null)
        {
            return;
        }

        if (!Directory.Exists(last.LeftDirectory) || !Directory.Exists(last.RightDirectory))
        {
            return;
        }

        _leftDirectory = last.LeftDirectory;
        _rightDirectory = last.RightDirectory;
        ApplyHeaderText();
        CompareDirectories();
    }

    public void SelectDirectory(bool left)
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = left ? Strings.DialogSelectLeftDirectory : Strings.DialogSelectRightDirectory,
        };

        if (dialog.ShowDialog(FindForm()) != DialogResult.OK)
        {
            return;
        }

        if (left)
        {
            _leftDirectory = dialog.SelectedPath;
        }
        else
        {
            _rightDirectory = dialog.SelectedPath;
        }

        ApplyHeaderText();

        if (Directory.Exists(_leftDirectory) && Directory.Exists(_rightDirectory))
        {
            CompareDirectories();
        }
        else
        {
            PopulateSingleTree(left);
        }
    }

    public void CompareDirectories()
    {
        if (!Directory.Exists(_leftDirectory) || !Directory.Exists(_rightDirectory))
        {
            MessageBox.Show(FindForm(), Strings.ErrorSelectBothDirectories, Strings.DirectoryCompareTitle, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        try
        {
            _result = DirectoryCompareService.Compare(_leftDirectory, _rightDirectory);

            PopulateBothTrees(_result);
            PersistDirectorySession();

            string summary = Strings.FormatDirectorySummary(
                _result.SameCount,
                _result.DifferentCount,
                _result.LeftOnlyCount,
                _result.RightOnlyCount);
            ApplyHeaderText(summary);
            SetStatus(Strings.FormatDirectoryCompareCompleted(summary));
        }
        catch (Exception ex)
        {
            MessageBox.Show(FindForm(), ex.Message, Strings.ErrorTitle, MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void BuildLayout()
    {
        var toolbar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            WrapContents = false,
            Padding = new Padding(4, 4, 4, 2),
            BackColor = Color.White,
        };

        _btnSelectLeftDirectory = CreateToolbarButton(Strings.SelectLeftDirectory, IconFactory.OpenLeft(), () => SelectDirectory(left: true));
        _btnSelectRightDirectory = CreateToolbarButton(Strings.SelectRightDirectory, IconFactory.OpenRight(), () => SelectDirectory(left: false));
        _btnCompareDirectories = CreateToolbarButton(Strings.CompareDirectories, IconFactory.Reload(), CompareDirectories);

        toolbar.Controls.Add(_btnSelectLeftDirectory);
        toolbar.Controls.Add(_btnSelectRightDirectory);
        toolbar.Controls.Add(_btnCompareDirectories);
        UpdateToolbarToolTips();

        var content = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 1,
            BackColor = CanvasColor,
            Padding = new Padding(4, 1, 4, 4),
        };
        content.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
        content.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
        content.Controls.Add(BuildPaneCard(isLeft: true, _lblLeftHeader, _leftTree), 0, 0);
        content.Controls.Add(BuildPaneCard(isLeft: false, _lblRightHeader, _rightTree), 1, 0);

        Controls.Add(content);
        Controls.Add(toolbar);
        ApplyHeaderText();
    }

    private static Button CreateToolbarButton(string text, Image image, Action onClick)
    {
        var button = new Button
        {
            AutoSize = true,
            Text = text,
            Image = image,
            TextImageRelation = TextImageRelation.ImageBeforeText,
            ImageAlign = ContentAlignment.MiddleLeft,
            TextAlign = ContentAlignment.MiddleCenter,
            Margin = new Padding(2, 4, 2, 4),
            Padding = new Padding(6, 4, 8, 4),
        };
        button.Click += (_, _) => onClick();
        return button;
    }

    private static Control BuildPaneCard(bool isLeft, Label header, Control body)
    {
        header.Dock = DockStyle.Top;
        header.Height = HeaderHeight;
        header.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
        header.TextAlign = ContentAlignment.MiddleLeft;
        header.Padding = new Padding(8, 0, 8, 0);
        header.AutoEllipsis = true;

        var inner = new Panel { Dock = DockStyle.Fill, BackColor = Color.White };
        inner.Controls.Add(body);
        inner.Controls.Add(header);

        var card = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.FromArgb(226, 232, 240),
            Padding = new Padding(1),
            Margin = new Padding(2, 0, 2, 2),
        };
        card.Controls.Add(inner);
        return card;
    }

    private void ApplyHeaderText(string? summary = null)
    {
        _lblLeftHeader.Text = FormatHeader(Strings.PaneLeft, _leftDirectory, summary);
        _lblRightHeader.Text = FormatHeader(Strings.PaneRight, _rightDirectory, summary);
    }

    private static string FormatHeader(string sideLabel, string directoryPath, string? summary)
    {
        if (string.IsNullOrWhiteSpace(directoryPath))
        {
            return sideLabel;
        }

        string path = directoryPath;
        if (path.Length > 48)
        {
            path = "..." + path[^45..];
        }

        return summary == null ? $"{sideLabel} — {path}" : $"{sideLabel} — {path} | {summary}";
    }

    private void SetStatus(string message)
    {
        StatusChanged?.Invoke(this, message);
    }

    private void PersistDirectorySession()
    {
        if (_settings == null || string.IsNullOrWhiteSpace(_leftDirectory) || string.IsNullOrWhiteSpace(_rightDirectory))
        {
            return;
        }

        _settings.LastDirectorySession = new LastDirectorySessionInfo
        {
            LeftDirectory = _leftDirectory,
            RightDirectory = _rightDirectory,
        };
        AppSettingsStore.Save(_settings);
    }

    private void PopulateSingleTree(bool left)
    {
        string directory = left ? _leftDirectory : _rightDirectory;
        var tree = left ? _leftTree : _rightTree;
        var other = left ? _rightTree : _leftTree;

        tree.BeginUpdate();
        other.BeginUpdate();
        tree.Nodes.Clear();
        other.Nodes.Clear();
        _result = null;

        if (Directory.Exists(directory))
        {
            var rootNode = new TreeNode(new DirectoryInfo(directory).Name) { ImageKey = "folder", SelectedImageKey = "folder" };
            tree.Nodes.Add(rootNode);

            foreach (string rel in Directory.EnumerateFiles(directory, "*", SearchOption.AllDirectories)
                         .Select(path => Path.GetRelativePath(directory, path))
                         .OrderBy(path => path, StringComparer.OrdinalIgnoreCase))
            {
                AddPathToTree(rootNode.Nodes, rel, status: null, isPlaceholder: false);
            }

            rootNode.Expand();
        }

        tree.EndUpdate();
        other.EndUpdate();
        SetStatus(left ? Strings.StatusLeftDirectoryLoaded : Strings.StatusRightDirectoryLoaded);
    }

    private void PopulateBothTrees(DirectoryCompareResult result)
    {
        _leftTree.BeginUpdate();
        _rightTree.BeginUpdate();
        _leftTree.Nodes.Clear();
        _rightTree.Nodes.Clear();

        var leftRoot = new TreeNode(new DirectoryInfo(result.LeftDirectory).Name) { ImageKey = "folder", SelectedImageKey = "folder" };
        var rightRoot = new TreeNode(new DirectoryInfo(result.RightDirectory).Name) { ImageKey = "folder", SelectedImageKey = "folder" };
        _leftTree.Nodes.Add(leftRoot);
        _rightTree.Nodes.Add(rightRoot);

        foreach (DirectoryCompareEntry entry in result.Entries)
        {
            bool hasLeft = entry.LeftStatus.HasValue;
            bool hasRight = entry.RightStatus.HasValue;
            AddPathToTree(leftRoot.Nodes, entry.RelativePath, entry.LeftStatus, isPlaceholder: !hasLeft);
            AddPathToTree(rightRoot.Nodes, entry.RelativePath, entry.RightStatus, isPlaceholder: !hasRight);
        }

        leftRoot.Expand();
        rightRoot.Expand();
        _leftTree.EndUpdate();
        _rightTree.EndUpdate();
    }

    private static void AddPathToTree(TreeNodeCollection nodes, string relPath, FileCompareStatus? status, bool isPlaceholder)
    {
        string[] parts = relPath.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        TreeNodeCollection current = nodes;

        for (int i = 0; i < parts.Length; i++)
        {
            string part = parts[i];
            bool isLast = i == parts.Length - 1;
            TreeNode? existing = current.Cast<TreeNode>()
                .FirstOrDefault(node => string.Equals(node.Text, part, StringComparison.OrdinalIgnoreCase));

            if (isLast)
            {
                if (existing != null)
                {
                    break;
                }

                string iconKey = isPlaceholder ? "ghost" : DirectoryTreeIcons.StatusToIconKey(status);
                current.Add(new TreeNode(part)
                {
                    Tag = relPath,
                    ImageKey = iconKey,
                    SelectedImageKey = iconKey,
                    ForeColor = isPlaceholder ? Color.Silver : DirectoryTreeIcons.StatusToForeColor(status),
                });
            }
            else
            {
                if (existing == null)
                {
                    existing = new TreeNode(part) { ImageKey = "folder", SelectedImageKey = "folder" };
                    current.Add(existing);
                }

                current = existing.Nodes;
            }
        }
    }

    private void OnNodeDoubleClick(TreeNode? node, bool isLeft)
    {
        if (node?.Tag is not string relPath || _result == null)
        {
            return;
        }

        DirectoryCompareEntry? entry = _result.Entries.FirstOrDefault(item =>
            string.Equals(item.RelativePath, relPath, StringComparison.OrdinalIgnoreCase));
        if (entry == null)
        {
            return;
        }

        if (isLeft && !entry.LeftStatus.HasValue)
        {
            return;
        }

        if (!isLeft && !entry.RightStatus.HasValue)
        {
            return;
        }

        string leftPath = entry.LeftStatus.HasValue
            ? Path.Combine(_result.LeftDirectory, relPath)
            : string.Empty;
        string rightPath = entry.RightStatus.HasValue
            ? Path.Combine(_result.RightDirectory, relPath)
            : string.Empty;

        if (!File.Exists(leftPath) && !File.Exists(rightPath))
        {
            return;
        }

        FileCompareRequested?.Invoke(this, (leftPath, rightPath));
    }
}
