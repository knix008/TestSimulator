using System.ComponentModel;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

namespace CompareMasterWinV10.App;

public partial class CompareForm : Form
{
    private readonly TabControl _tabs = new() { Dock = DockStyle.Fill };

    private readonly Label _leftDirLabel = new() { Dock = DockStyle.Fill, Text = "Left: (not selected)", AutoEllipsis = true };
    private readonly Label _rightDirLabel = new() { Dock = DockStyle.Fill, Text = "Right: (not selected)", AutoEllipsis = true };
    private readonly SyncTreeView _leftDirTree = new() { Dock = DockStyle.Fill, HideSelection = false };
    private readonly SyncTreeView _rightDirTree = new() { Dock = DockStyle.Fill, HideSelection = false };
    private readonly ImageList _dirStatusIcons = new() { ImageSize = new Size(16, 16), ColorDepth = ColorDepth.Depth32Bit };
    private readonly CheckBox _dirIgnoreCase = new() { Text = "Ignore Case", AutoSize = false, Width = 95, Height = 26, CheckAlign = ContentAlignment.MiddleLeft, TextAlign = ContentAlignment.MiddleLeft };
    private readonly CheckBox _dirIgnoreWhitespace = new() { Text = "Ignore Whitespace", AutoSize = false, Width = 135, Height = 26, CheckAlign = ContentAlignment.MiddleLeft, TextAlign = ContentAlignment.MiddleLeft };
    private readonly TextBox _excludePattern = new() { Width = 200, Height = 26, Text = ".git;bin;obj" };

    private readonly Label _leftFileLabel = new() { Dock = DockStyle.Fill, Text = "Left: (not selected)", AutoEllipsis = true };
    private readonly Label _rightFileLabel = new() { Dock = DockStyle.Fill, Text = "Right: (not selected)", AutoEllipsis = true };
    private readonly SyncRichTextBox _leftDiff = new() { Dock = DockStyle.Fill, Font = new Font("Consolas", 10F), ReadOnly = true, WordWrap = false };
    private readonly SyncRichTextBox _rightDiff = new() { Dock = DockStyle.Fill, Font = new Font("Consolas", 10F), ReadOnly = true, WordWrap = false };
    private readonly DiffIndicatorBar _leftIndicator = new();
    private readonly DiffIndicatorBar _rightIndicator = new();
    private readonly CheckBox _fileIgnoreCase = new() { Text = "Ignore Case", AutoSize = false, Width = 95, Height = 26, CheckAlign = ContentAlignment.MiddleLeft, TextAlign = ContentAlignment.MiddleLeft };
    private readonly CheckBox _fileIgnoreWhitespace = new() { Text = "Ignore Whitespace", AutoSize = false, Width = 135, Height = 26, CheckAlign = ContentAlignment.MiddleLeft, TextAlign = ContentAlignment.MiddleLeft };
    private readonly Label _fileSummary = new() { AutoSize = false, Width = 120, Height = 26, Text = "Diff: -", TextAlign = ContentAlignment.MiddleLeft };
    private readonly SplitContainer _dirSplit = new() { Dock = DockStyle.Fill, Orientation = Orientation.Vertical };
    private readonly SplitContainer _fileSplit = new() { Dock = DockStyle.Fill, Orientation = Orientation.Vertical };

    private string _leftDirPath = string.Empty;
    private string _rightDirPath = string.Empty;
    private string _leftFilePath = string.Empty;
    private string _rightFilePath = string.Empty;

    // Stores aligned rows (keyed by relative path) for double-click navigation
    private readonly List<(string RelPath, CompareStatus? LeftStatus, CompareStatus? RightStatus)> _alignedRows = [];

    public CompareForm()
    {
        InitializeComponent();
        BuildUi();
    }

    private void BuildUi()
    {
        Text = "CompareMasterWinV10 - Rebuilt WinForms UI";
        Width = 1300;
        Height = 860;

        var iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "daemon_hammer.ico");
        if (File.Exists(iconPath))
            Icon = new Icon(iconPath);

        SetupDirTrees();
        SetupFileDiffs();
        _tabs.TabPages.Add(BuildDirectoryTab());
        _tabs.TabPages.Add(BuildFileTab());
        Controls.Add(_tabs);
    }

    // ── Directory tree setup ──────────────────────────────────────────────────

    private void SetupDirTrees()
    {
        PopulateTreeIcons(_dirStatusIcons);
        _leftDirTree.ImageList = _dirStatusIcons;
        _rightDirTree.ImageList = _dirStatusIcons;

        _leftDirTree.Buddy = _rightDirTree;
        _rightDirTree.Buddy = _leftDirTree;

        _leftDirTree.NodeMouseDoubleClick += (_, e) => OnDirNodeDoubleClick(e.Node, isLeft: true);
        _rightDirTree.NodeMouseDoubleClick += (_, e) => OnDirNodeDoubleClick(e.Node, isLeft: false);
    }

    private void OnDirNodeDoubleClick(TreeNode? node, bool isLeft)
    {
        if (node?.Tag is not string relPath) return;

        var row = _alignedRows.FirstOrDefault(r => string.Equals(r.RelPath, relPath, StringComparison.OrdinalIgnoreCase));
        if (row == default) return;

        if (isLeft && row.LeftStatus == null) return;
        if (!isLeft && row.RightStatus == null) return;

        var leftPath = row.LeftStatus.HasValue && !string.IsNullOrEmpty(_leftDirPath)
            ? Path.Combine(_leftDirPath, relPath) : string.Empty;
        var rightPath = row.RightStatus.HasValue && !string.IsNullOrEmpty(_rightDirPath)
            ? Path.Combine(_rightDirPath, relPath) : string.Empty;

        if (!File.Exists(leftPath) && !File.Exists(rightPath)) return;

        _leftFilePath = leftPath;
        _rightFilePath = rightPath;
        _leftFileLabel.Text = string.IsNullOrEmpty(_leftFilePath) ? "Left: (not selected)" : $"Left: {_leftFilePath}";
        _rightFileLabel.Text = string.IsNullOrEmpty(_rightFilePath) ? "Right: (not selected)" : $"Right: {_rightFilePath}";

        _tabs.SelectedIndex = 1;

        if (File.Exists(leftPath) && File.Exists(rightPath))
            CompareFiles();
        else if (File.Exists(leftPath))
            ShowSingleFile(true);
        else if (File.Exists(rightPath))
            ShowSingleFile(false);
    }

    // ── File diff setup ───────────────────────────────────────────────────────

    private void SetupFileDiffs()
    {
        _leftDiff.Buddy = _rightDiff;
        _rightDiff.Buddy = _leftDiff;
    }

    // ── UI layout ─────────────────────────────────────────────────────────────

    private TabPage BuildDirectoryTab()
    {
        var tab = new TabPage("Directory Compare");
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2, Padding = new Padding(10) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var topBar = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false };
        var leftSelect = new Button { Text = "Left Directory Select", Width = 160, Height = 26, Margin = new Padding(2, 8, 2, 0) };
        leftSelect.Click += (_, _) => SelectDirectory(true);
        var rightSelect = new Button { Text = "Right Directory Select", Width = 160, Height = 26, Margin = new Padding(2, 8, 2, 0) };
        rightSelect.Click += (_, _) => SelectDirectory(false);
        var compareButton = new Button { Text = "Compare", Width = 100, Height = 26, Margin = new Padding(8, 8, 2, 0) };
        compareButton.Click += (_, _) => CompareDirectories();
        var excludeLabel = new Label { Text = "Exclude:", AutoSize = false, Width = 58, Height = 26, TextAlign = ContentAlignment.MiddleRight, Margin = new Padding(8, 8, 0, 0) };
        _excludePattern.Margin = new Padding(2, 8, 2, 0);
        _dirIgnoreWhitespace.Margin = new Padding(8, 8, 2, 0);
        _dirIgnoreCase.Margin = new Padding(2, 8, 2, 0);
        topBar.Controls.Add(leftSelect);
        topBar.Controls.Add(rightSelect);
        topBar.Controls.Add(excludeLabel);
        topBar.Controls.Add(_excludePattern);
        topBar.Controls.Add(_dirIgnoreWhitespace);
        topBar.Controls.Add(_dirIgnoreCase);
        topBar.Controls.Add(compareButton);

        _dirSplit.SplitterDistance = 620;
        _dirSplit.Panel1.Controls.Add(BuildDirectorySide("LEFT PANEL", _leftDirLabel, _leftDirTree, () => SelectDirectory(true)));
        _dirSplit.Panel2.Controls.Add(BuildDirectorySide("RIGHT PANEL", _rightDirLabel, _rightDirTree, () => SelectDirectory(false)));
        _dirSplit.Resize += (_, _) => _dirSplit.SplitterDistance = _dirSplit.Width / 2;

        root.Controls.Add(topBar, 0, 0);
        root.Controls.Add(_dirSplit, 0, 1);
        tab.Controls.Add(root);
        return tab;
    }

    private TabPage BuildFileTab()
    {
        var tab = new TabPage("File Compare");
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2, Padding = new Padding(10) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var topBar = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false };
        var leftSelect = new Button { Text = "Left File Select", Width = 160, Height = 26, Margin = new Padding(2, 8, 2, 0) };
        leftSelect.Click += (_, _) => SelectFile(true);
        var rightSelect = new Button { Text = "Right File Select", Width = 160, Height = 26, Margin = new Padding(2, 8, 2, 0) };
        rightSelect.Click += (_, _) => SelectFile(false);
        var compareButton = new Button { Text = "Compare", Width = 100, Height = 26, Margin = new Padding(8, 8, 2, 0) };
        compareButton.Click += (_, _) => CompareFiles();
        _fileIgnoreWhitespace.Margin = new Padding(8, 8, 2, 0);
        _fileIgnoreCase.Margin = new Padding(2, 8, 2, 0);
        _fileSummary.Margin = new Padding(12, 8, 2, 0);
        topBar.Controls.Add(leftSelect);
        topBar.Controls.Add(rightSelect);
        topBar.Controls.Add(_fileIgnoreWhitespace);
        topBar.Controls.Add(_fileIgnoreCase);
        topBar.Controls.Add(compareButton);
        topBar.Controls.Add(_fileSummary);

        _fileSplit.SplitterDistance = 620;
        _fileSplit.Panel1.Controls.Add(BuildFileSide("LEFT PANEL", _leftFileLabel, _leftDiff, _leftIndicator, indicatorOnRight: true, () => SelectFile(true)));
        _fileSplit.Panel2.Controls.Add(BuildFileSide("RIGHT PANEL", _rightFileLabel, _rightDiff, _rightIndicator, indicatorOnRight: false, () => SelectFile(false)));
        _fileSplit.Resize += (_, _) => _fileSplit.SplitterDistance = _fileSplit.Width / 2;

        root.Controls.Add(topBar, 0, 0);
        root.Controls.Add(_fileSplit, 0, 1);
        tab.Controls.Add(root);
        return tab;
    }

    private static Control BuildDirectorySide(string title, Label pathLabel, TreeView tree, Action onSelect)
    {
        var panel = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 4, Padding = new Padding(8) };
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 24));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 24));
        panel.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var header = new Label { Text = title, Dock = DockStyle.Fill, Font = new Font("Segoe UI Semibold", 10F) };
        var select = new Button { Text = "Select (Popup)", Dock = DockStyle.Fill };
        select.Click += (_, _) => onSelect();
        panel.Controls.Add(header, 0, 0);
        panel.Controls.Add(select, 0, 1);
        panel.Controls.Add(pathLabel, 0, 2);
        panel.Controls.Add(tree, 0, 3);
        return panel;
    }

    private static Control BuildFileSide(string title, Label pathLabel, RichTextBox diff, DiffIndicatorBar indicator, bool indicatorOnRight, Action onSelect)
    {
        var panel = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 4, Padding = new Padding(8) };
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 24));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 24));
        panel.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var header = new Label { Text = title, Dock = DockStyle.Fill, Font = new Font("Segoe UI Semibold", 10F) };
        var select = new Button { Text = "Select (Popup)", Dock = DockStyle.Fill };
        select.Click += (_, _) => onSelect();

        var inner = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1 };
        if (indicatorOnRight)
        {
            inner.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            inner.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 14));
            inner.Controls.Add(diff, 0, 0);
            inner.Controls.Add(indicator, 1, 0);
        }
        else
        {
            inner.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 14));
            inner.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            inner.Controls.Add(indicator, 0, 0);
            inner.Controls.Add(diff, 1, 0);
        }

        panel.Controls.Add(header, 0, 0);
        panel.Controls.Add(select, 0, 1);
        panel.Controls.Add(pathLabel, 0, 2);
        panel.Controls.Add(inner, 0, 3);
        return panel;
    }

    // ── Directory selection ────────────────────────────────────────────────────

    private void SelectDirectory(bool left)
    {
        using var dialog = new FolderBrowserDialog();
        if (dialog.ShowDialog() != DialogResult.OK) return;

        if (left)
        {
            _leftDirPath = dialog.SelectedPath;
            _leftDirLabel.Text = $"Left: {_leftDirPath}";
        }
        else
        {
            _rightDirPath = dialog.SelectedPath;
            _rightDirLabel.Text = $"Right: {_rightDirPath}";
        }

        if (Directory.Exists(_leftDirPath) && Directory.Exists(_rightDirPath))
            CompareDirectories();
        else
            PopulateSingleDirTree(left);
    }

    private void PopulateSingleDirTree(bool left)
    {
        var dir = left ? _leftDirPath : _rightDirPath;
        var tree = left ? _leftDirTree : _rightDirTree;

        _alignedRows.Clear();
        tree.BeginUpdate();
        tree.Nodes.Clear();

        if (Directory.Exists(dir))
        {
            var exclude = ParseExclude(_excludePattern.Text);
            var rootNode = new TreeNode(new DirectoryInfo(dir).Name) { ImageKey = "folder", SelectedImageKey = "folder" };
            tree.Nodes.Add(rootNode);

            foreach (var rel in Directory.GetFiles(dir, "*", SearchOption.AllDirectories)
                         .Select(f => Path.GetRelativePath(dir, f))
                         .Where(f => !IsExcluded(f, exclude))
                         .OrderBy(f => f, StringComparer.OrdinalIgnoreCase))
            {
                AddPathToTree(rootNode.Nodes, rel, status: null, isPlaceholder: false);
            }

            rootNode.Expand();
        }

        tree.EndUpdate();
    }

    private void SelectFile(bool left)
    {
        using var dialog = new OpenFileDialog();
        if (dialog.ShowDialog() != DialogResult.OK) return;

        if (left)
        {
            _leftFilePath = dialog.FileName;
            _leftFileLabel.Text = $"Left: {_leftFilePath}";
        }
        else
        {
            _rightFilePath = dialog.FileName;
            _rightFileLabel.Text = $"Right: {_rightFilePath}";
        }

        if (File.Exists(_leftFilePath) && File.Exists(_rightFilePath))
            CompareFiles();
        else
            ShowSingleFile(left);
    }

    private void ShowSingleFile(bool left)
    {
        var path = left ? _leftFilePath : _rightFilePath;
        var box = left ? _leftDiff : _rightDiff;
        var indicator = left ? _leftIndicator : _rightIndicator;

        box.Clear();
        indicator.SetColors([]);

        if (!File.Exists(path)) return;

        var lines = File.ReadAllLines(path);
        var colors = new Color[lines.Length];
        for (var i = 0; i < lines.Length; i++)
        {
            AppendLine(box, lines[i], SystemColors.Window);
            colors[i] = SystemColors.Window;
        }
        indicator.SetColors(colors);
        _fileSummary.Text = "Diff: -";
    }

    // ── Directory comparison ───────────────────────────────────────────────────

    private void CompareDirectories()
    {
        if (!Directory.Exists(_leftDirPath) || !Directory.Exists(_rightDirPath))
        {
            MessageBox.Show("Select both left and right directories first.", "Directory Compare", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var exclude = ParseExclude(_excludePattern.Text);
        var leftFiles = Directory.GetFiles(_leftDirPath, "*", SearchOption.AllDirectories)
            .Select(path => Path.GetRelativePath(_leftDirPath, path))
            .Where(path => !IsExcluded(path, exclude))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var rightFiles = Directory.GetFiles(_rightDirPath, "*", SearchOption.AllDirectories)
            .Select(path => Path.GetRelativePath(_rightDirPath, path))
            .Where(path => !IsExcluded(path, exclude))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var same = 0; var diff = 0; var leftOnly = 0; var rightOnly = 0;
        var leftStatus = new Dictionary<string, CompareStatus>(StringComparer.OrdinalIgnoreCase);
        var rightStatus = new Dictionary<string, CompareStatus>(StringComparer.OrdinalIgnoreCase);

        foreach (var rel in leftFiles.Union(rightFiles, StringComparer.OrdinalIgnoreCase).OrderBy(x => x))
        {
            var inLeft = leftFiles.Contains(rel);
            var inRight = rightFiles.Contains(rel);
            if (inLeft && inRight)
            {
                var lp = Path.Combine(_leftDirPath, rel);
                var rp = Path.Combine(_rightDirPath, rel);
                if (!FileTextEquals(lp, rp, _dirIgnoreWhitespace.Checked, _dirIgnoreCase.Checked))
                {
                    diff++;
                    leftStatus[rel] = CompareStatus.Different;
                    rightStatus[rel] = CompareStatus.Different;
                }
                else
                {
                    same++;
                    leftStatus[rel] = CompareStatus.Same;
                    rightStatus[rel] = CompareStatus.Same;
                }
            }
            else if (inLeft)
            {
                leftOnly++;
                leftStatus[rel] = CompareStatus.LeftOnly;
            }
            else
            {
                rightOnly++;
                rightStatus[rel] = CompareStatus.RightOnly;
            }
        }

        PopulateBothTrees(leftStatus, rightStatus);
        var summary = $"Same={same}, Different={diff}, LeftOnly={leftOnly}, RightOnly={rightOnly}";
        _leftDirLabel.Text = $"Left: {_leftDirPath} | {summary}";
        _rightDirLabel.Text = $"Right: {_rightDirPath} | {summary}";
    }

    private void PopulateBothTrees(
        Dictionary<string, CompareStatus> leftStatus,
        Dictionary<string, CompareStatus> rightStatus)
    {
        _alignedRows.Clear();
        _leftDirTree.BeginUpdate();
        _rightDirTree.BeginUpdate();
        _leftDirTree.Nodes.Clear();
        _rightDirTree.Nodes.Clear();

        var leftRoot = new TreeNode(new DirectoryInfo(_leftDirPath).Name) { ImageKey = "folder", SelectedImageKey = "folder" };
        var rightRoot = new TreeNode(new DirectoryInfo(_rightDirPath).Name) { ImageKey = "folder", SelectedImageKey = "folder" };
        _leftDirTree.Nodes.Add(leftRoot);
        _rightDirTree.Nodes.Add(rightRoot);

        var allPaths = leftStatus.Keys
            .Union(rightStatus.Keys, StringComparer.OrdinalIgnoreCase)
            .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
            .ToList();

        foreach (var rel in allPaths)
        {
            var hasLeft = leftStatus.TryGetValue(rel, out var lStat);
            var hasRight = rightStatus.TryGetValue(rel, out var rStat);
            CompareStatus? ls = hasLeft ? lStat : null;
            CompareStatus? rs = hasRight ? rStat : null;
            _alignedRows.Add((rel, ls, rs));

            // Both trees get a node: real node or ghost placeholder
            AddPathToTree(leftRoot.Nodes, rel, ls, isPlaceholder: !hasLeft);
            AddPathToTree(rightRoot.Nodes, rel, rs, isPlaceholder: !hasRight);
        }

        leftRoot.Expand();
        rightRoot.Expand();
        _leftDirTree.EndUpdate();
        _rightDirTree.EndUpdate();
    }

    // Adds a file path hierarchy to the given node collection.
    // Intermediate folders are created as needed; file node carries the status icon.
    private static void AddPathToTree(TreeNodeCollection nodes, string relPath, CompareStatus? status, bool isPlaceholder)
    {
        var parts = relPath.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var current = nodes;

        for (var i = 0; i < parts.Length; i++)
        {
            var part = parts[i];
            var isLast = i == parts.Length - 1;

            var existing = current.Cast<TreeNode>()
                .FirstOrDefault(n => string.Equals(n.Text, part, StringComparison.OrdinalIgnoreCase));

            if (isLast)
            {
                if (existing != null) break; // already added (shouldn't happen)
                var iconKey = isPlaceholder ? "ghost" : StatusToIconKey(status);
                var node = new TreeNode(part)
                {
                    Tag = relPath,
                    ImageKey = iconKey,
                    SelectedImageKey = iconKey,
                    ForeColor = isPlaceholder ? Color.Silver : StatusToForeColor(status),
                };
                current.Add(node);
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

    private static string StatusToIconKey(CompareStatus? status) => status switch
    {
        CompareStatus.Same => "same",
        CompareStatus.Different => "different",
        CompareStatus.LeftOnly => "left",
        CompareStatus.RightOnly => "right",
        _ => "ghost"
    };

    private static Color StatusToForeColor(CompareStatus? status) => status switch
    {
        CompareStatus.Same => Color.SeaGreen,
        CompareStatus.Different => Color.DarkOrange,
        CompareStatus.LeftOnly => Color.Crimson,
        CompareStatus.RightOnly => Color.DodgerBlue,
        _ => Color.Silver
    };

    // ── File comparison ────────────────────────────────────────────────────────

    private void CompareFiles()
    {
        if (!File.Exists(_leftFilePath) || !File.Exists(_rightFilePath))
        {
            MessageBox.Show("Select both left and right files first.", "File Compare", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        _leftDiff.Clear();
        _rightDiff.Clear();
        var leftLines = File.ReadAllLines(_leftFilePath);
        var rightLines = File.ReadAllLines(_rightFilePath);
        var pairs = BuildAlignedLines(leftLines, rightLines, _fileIgnoreWhitespace.Checked, _fileIgnoreCase.Checked);
        var diffCount = 0;
        var leftBarColors = new List<Color>();
        var rightBarColors = new List<Color>();

        foreach (var (l, r) in pairs)
        {
            var same = LinesEqual(l, r, _fileIgnoreWhitespace.Checked, _fileIgnoreCase.Checked);
            if (!same) diffCount++;

            if (same)
            {
                AppendLine(_leftDiff, l ?? string.Empty, Color.Honeydew);
                AppendLine(_rightDiff, r ?? string.Empty, Color.Honeydew);
                leftBarColors.Add(Color.Honeydew);
                rightBarColors.Add(Color.Honeydew);
                continue;
            }

            if (l is null)
            {
                AppendLine(_leftDiff, string.Empty, Color.LightGray);
                AppendLine(_rightDiff, r ?? string.Empty, Color.MistyRose);
                leftBarColors.Add(Color.LightGray);
                rightBarColors.Add(Color.Crimson);
                continue;
            }

            if (r is null)
            {
                AppendLine(_leftDiff, l, Color.MistyRose);
                AppendLine(_rightDiff, string.Empty, Color.LightGray);
                leftBarColors.Add(Color.Crimson);
                rightBarColors.Add(Color.LightGray);
                continue;
            }

            AppendLineWithInlineDiff(_leftDiff, l, r);
            AppendLineWithInlineDiff(_rightDiff, r, l);
            leftBarColors.Add(Color.DarkOrange);
            rightBarColors.Add(Color.DarkOrange);
        }

        _leftIndicator.SetColors([.. leftBarColors]);
        _rightIndicator.SetColors([.. rightBarColors]);
        _fileSummary.Text = $"Diff: {diffCount} lines";
    }

    private static void AppendLine(RichTextBox box, string text, Color bg)
    {
        var start = box.TextLength;
        box.AppendText(text + Environment.NewLine);
        box.Select(start, text.Length);
        box.SelectionBackColor = bg;
        box.SelectionColor = Color.Black;
        box.Select(box.TextLength, 0);
    }

    private static void AppendLineWithInlineDiff(RichTextBox box, string line, string otherLine)
    {
        var start = box.TextLength;
        AppendLine(box, line, Color.Linen);
        var (diffStart, diffLength) = FindChangedRange(line, otherLine);
        if (diffLength <= 0) return;

        box.Select(start + diffStart, diffLength);
        box.SelectionBackColor = Color.Orange;
        box.SelectionColor = Color.Black;
        box.Select(box.TextLength, 0);
    }

    private static (int Start, int Length) FindChangedRange(string line, string otherLine)
    {
        var minLength = Math.Min(line.Length, otherLine.Length);
        var prefix = 0;
        while (prefix < minLength && line[prefix] == otherLine[prefix]) prefix++;
        var maxSuffix = minLength - prefix;
        var suffix = 0;
        while (suffix < maxSuffix && line[^ (suffix + 1)] == otherLine[^ (suffix + 1)]) suffix++;
        return (prefix, Math.Max(0, line.Length - prefix - suffix));
    }

    private static List<(string? Left, string? Right)> BuildAlignedLines(string[] left, string[] right, bool ignoreWs, bool ignoreCase)
    {
        var n = left.Length; var m = right.Length;
        var lcs = new int[n + 1, m + 1];
        for (var i = n - 1; i >= 0; i--)
            for (var j = m - 1; j >= 0; j--)
                lcs[i, j] = LinesEqual(left[i], right[j], ignoreWs, ignoreCase)
                    ? lcs[i + 1, j + 1] + 1 : Math.Max(lcs[i + 1, j], lcs[i, j + 1]);

        var result = new List<(string? Left, string? Right)>();
        var li = 0; var ri = 0;
        while (li < n && ri < m)
        {
            if (LinesEqual(left[li], right[ri], ignoreWs, ignoreCase)) { result.Add((left[li], right[ri])); li++; ri++; }
            else if (lcs[li + 1, ri] >= lcs[li, ri + 1]) { result.Add((left[li], null)); li++; }
            else { result.Add((null, right[ri])); ri++; }
        }
        while (li < n) { result.Add((left[li], null)); li++; }
        while (ri < m) { result.Add((null, right[ri])); ri++; }
        return result;
    }

    private static bool FileTextEquals(string leftPath, string rightPath, bool ignoreWs, bool ignoreCase)
    {
        var left = File.ReadAllLines(leftPath);
        var right = File.ReadAllLines(rightPath);
        if (left.Length != right.Length) return false;
        for (var i = 0; i < left.Length; i++)
            if (!LinesEqual(left[i], right[i], ignoreWs, ignoreCase)) return false;
        return true;
    }

    private static bool LinesEqual(string? l, string? r, bool ignoreWs, bool ignoreCase)
    {
        if (l is null || r is null) return l is null && r is null;
        var left = ignoreWs ? Regex.Replace(l, @"\s+", string.Empty) : l;
        var right = ignoreWs ? Regex.Replace(r, @"\s+", string.Empty) : r;
        return string.Equals(left, right, ignoreCase ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal);
    }

    private static List<string> ParseExclude(string text) =>
        text.Split([';', ','], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();

    private static bool IsExcluded(string relativePath, IReadOnlyCollection<string> patterns)
    {
        var normalized = relativePath.Replace('\\', '/');
        foreach (var p in patterns)
            if (normalized.Contains(p.Replace('\\', '/'), StringComparison.OrdinalIgnoreCase)) return true;
        return false;
    }

    // ── Status icon creation ───────────────────────────────────────────────────

    private static void PopulateTreeIcons(ImageList icons)
    {
        icons.Images.Clear();

        // folder: yellow/brown simple folder shape
        icons.Images.Add("folder", DrawIcon(g =>
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using var body = new SolidBrush(Color.FromArgb(255, 200, 130));
            using var tab = new SolidBrush(Color.FromArgb(240, 175, 90));
            g.FillRectangle(body, 1, 5, 14, 9);
            g.FillRectangle(tab, 1, 3, 6, 3);
            using var border = new Pen(Color.FromArgb(180, 130, 60), 1f);
            g.DrawRectangle(border, 1, 5, 13, 8);
            g.DrawRectangle(border, 1, 3, 5, 2);
        }));

        // same: green checkmark ✓
        icons.Images.Add("same", DrawIcon(g =>
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using var pen = new Pen(Color.SeaGreen, 2.5f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
            g.DrawLines(pen, new PointF[] { new(2f, 8f), new(6f, 12f), new(14f, 4f) });
        }));

        // different: orange diamond ◆
        icons.Images.Add("different", DrawIcon(g =>
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using var brush = new SolidBrush(Color.DarkOrange);
            g.FillPolygon(brush, new PointF[] { new(8f, 2f), new(14f, 8f), new(8f, 14f), new(2f, 8f) });
        }));

        // left: crimson left-pointing triangle ◄ (file only on left side)
        icons.Images.Add("left", DrawIcon(g =>
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using var brush = new SolidBrush(Color.Crimson);
            g.FillPolygon(brush, new PointF[] { new(13f, 3f), new(3f, 8f), new(13f, 13f) });
        }));

        // right: blue right-pointing triangle ► (file only on right side)
        icons.Images.Add("right", DrawIcon(g =>
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using var brush = new SolidBrush(Color.DodgerBlue);
            g.FillPolygon(brush, new PointF[] { new(3f, 3f), new(13f, 8f), new(3f, 13f) });
        }));

        // ghost: gray dash — (placeholder for missing file on this side)
        icons.Images.Add("ghost", DrawIcon(g =>
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using var pen = new Pen(Color.Silver, 2f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
            g.DrawLine(pen, 3f, 8f, 13f, 8f);
        }));
    }

    private static Bitmap DrawIcon(Action<Graphics> draw)
    {
        var bmp = new Bitmap(16, 16, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);
        g.Clear(Color.Transparent);
        draw(g);
        return bmp;
    }

    // ── Enums ─────────────────────────────────────────────────────────────────

    private enum CompareStatus { Same, Different, LeftOnly, RightOnly }

    // ── Nested controls ────────────────────────────────────────────────────────

    // TreeView that syncs expand/collapse and scroll with a paired buddy tree
    private sealed class SyncTreeView : TreeView
    {
        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public SyncTreeView? Buddy { get; set; }
        private bool _syncing;

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

        private void SyncExpandState(TreeNode node, bool expand)
        {
            if (Buddy == null || _syncing) return;
            _syncing = true;
            try
            {
                // FullPath includes root node name which may differ; skip root level
                var parts = node.FullPath.Split(PathSeparator[0]);
                var buddyNode = parts.Length <= 1
                    ? (Buddy.Nodes.Count > 0 ? Buddy.Nodes[0] : null)
                    : FindNodeByPath(Buddy.Nodes.Count > 0 ? Buddy.Nodes[0].Nodes : Buddy.Nodes, parts, depth: 1);

                if (buddyNode != null)
                {
                    if (expand) buddyNode.Expand();
                    else buddyNode.Collapse();
                }
            }
            finally { _syncing = false; }
        }

        private static TreeNode? FindNodeByPath(TreeNodeCollection nodes, string[] parts, int depth)
        {
            if (depth >= parts.Length) return null;
            foreach (TreeNode n in nodes)
            {
                if (!string.Equals(n.Text, parts[depth], StringComparison.OrdinalIgnoreCase)) continue;
                return depth == parts.Length - 1 ? n : FindNodeByPath(n.Nodes, parts, depth + 1);
            }
            return null;
        }

        protected override void WndProc(ref Message m)
        {
            base.WndProc(ref m);
            const int WM_VSCROLL = 0x0115;
            const int WM_MOUSEWHEEL = 0x020A;
            if (m.Msg != WM_VSCROLL && m.Msg != WM_MOUSEWHEEL) return;
            if (Buddy == null || _syncing) return;

            _syncing = true;
            try
            {
                var topIdx = GetTopNodeIndex(this);
                var buddyVisible = GetVisibleNodes(Buddy.Nodes).ToList();
                if (topIdx >= 0 && topIdx < buddyVisible.Count)
                    Buddy.TopNode = buddyVisible[topIdx];
            }
            finally { _syncing = false; }
        }

        private static int GetTopNodeIndex(TreeView tree)
        {
            if (tree.TopNode == null) return 0;
            var idx = 0;
            foreach (var node in GetVisibleNodes(tree.Nodes))
            {
                if (ReferenceEquals(node, tree.TopNode)) return idx;
                idx++;
            }
            return 0;
        }

        private static IEnumerable<TreeNode> GetVisibleNodes(TreeNodeCollection nodes)
        {
            foreach (TreeNode node in nodes)
            {
                yield return node;
                if (node.IsExpanded)
                    foreach (var child in GetVisibleNodes(node.Nodes))
                        yield return child;
            }
        }
    }

    // RichTextBox that syncs vertical scroll position with a paired buddy
    private sealed class SyncRichTextBox : RichTextBox
    {
        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public SyncRichTextBox? Buddy { get; set; }
        private bool _syncing;

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

        protected override void WndProc(ref Message m)
        {
            base.WndProc(ref m);

            const int WM_VSCROLL = 0x0115;
            const int WM_MOUSEWHEEL = 0x020A;
            const int WM_KEYDOWN = 0x0100;

            var shouldSync = m.Msg == WM_VSCROLL || m.Msg == WM_MOUSEWHEEL;
            if (!shouldSync && m.Msg == WM_KEYDOWN)
            {
                var vk = (Keys)m.WParam.ToInt32();
                shouldSync = vk is Keys.Up or Keys.Down or Keys.PageUp or Keys.PageDown or Keys.Home or Keys.End;
            }

            if (!shouldSync || Buddy == null || _syncing) return;

            _syncing = true;
            try
            {
                const int EM_GETFIRSTVISIBLELINE = 0x00CE;
                const int EM_LINESCROLL = 0x00B6;
                var myLine = (int)SendMessage(Handle, EM_GETFIRSTVISIBLELINE, IntPtr.Zero, IntPtr.Zero);
                var buddyLine = (int)SendMessage(Buddy.Handle, EM_GETFIRSTVISIBLELINE, IntPtr.Zero, IntPtr.Zero);
                var delta = myLine - buddyLine;
                if (delta != 0)
                    SendMessage(Buddy.Handle, EM_LINESCROLL, IntPtr.Zero, new IntPtr(delta));
            }
            finally { _syncing = false; }
        }
    }

    // Narrow bar drawn beside the file diff panels showing diff status at a glance
    private sealed class DiffIndicatorBar : Control
    {
        private Color[] _lineColors = [];

        public DiffIndicatorBar()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
            Dock = DockStyle.Fill;
        }

        public void SetColors(Color[] colors)
        {
            _lineColors = colors;
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            var w = ClientSize.Width;
            var h = ClientSize.Height;
            g.Clear(Color.White);

            if (_lineColors.Length > 0)
            {
                for (var i = 0; i < _lineColors.Length; i++)
                {
                    var color = _lineColors[i];
                    if (color == Color.Honeydew) continue;
                    var y = (int)Math.Round((double)i / _lineColors.Length * h);
                    var nextY = (int)Math.Round((double)(i + 1) / _lineColors.Length * h);
                    using var brush = new SolidBrush(color);
                    g.FillRectangle(brush, 0, y, w, Math.Max(2, nextY - y));
                }
            }

            g.DrawRectangle(Pens.Silver, 0, 0, w - 1, h - 1);
        }
    }
}
