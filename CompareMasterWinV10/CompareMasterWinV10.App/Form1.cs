using System.Text.RegularExpressions;

namespace CompareMasterWinV10.App;

public partial class Form1 : Form
{
    private readonly TabControl _tabs = new() { Dock = DockStyle.Fill };

    private readonly Label _leftDirLabel = new() { Dock = DockStyle.Fill, Text = "Left: (not selected)", AutoEllipsis = true };
    private readonly Label _rightDirLabel = new() { Dock = DockStyle.Fill, Text = "Right: (not selected)", AutoEllipsis = true };
    private readonly TreeView _leftDirTree = new() { Dock = DockStyle.Fill, HideSelection = false };
    private readonly TreeView _rightDirTree = new() { Dock = DockStyle.Fill, HideSelection = false };
    private readonly CheckBox _dirIgnoreCase = new() { Text = "Ignore Case", AutoSize = true };
    private readonly CheckBox _dirIgnoreWhitespace = new() { Text = "Ignore Whitespace", AutoSize = true };
    private readonly TextBox _excludePattern = new() { Width = 220, Text = ".git;bin;obj" };

    private readonly Label _leftFileLabel = new() { Dock = DockStyle.Fill, Text = "Left: (not selected)", AutoEllipsis = true };
    private readonly Label _rightFileLabel = new() { Dock = DockStyle.Fill, Text = "Right: (not selected)", AutoEllipsis = true };
    private readonly RichTextBox _leftDiff = new() { Dock = DockStyle.Fill, Font = new Font("Consolas", 10F), ReadOnly = true, WordWrap = false };
    private readonly RichTextBox _rightDiff = new() { Dock = DockStyle.Fill, Font = new Font("Consolas", 10F), ReadOnly = true, WordWrap = false };
    private readonly CheckBox _fileIgnoreCase = new() { Text = "Ignore Case", AutoSize = true };
    private readonly CheckBox _fileIgnoreWhitespace = new() { Text = "Ignore Whitespace", AutoSize = true };
    private readonly Label _fileSummary = new() { AutoSize = true, Text = "Diff: -" };
    private readonly SplitContainer _dirSplit = new() { Dock = DockStyle.Fill, Orientation = Orientation.Vertical };
    private readonly SplitContainer _fileSplit = new() { Dock = DockStyle.Fill, Orientation = Orientation.Vertical };
    private readonly ImageList _treeIcons = new() { ImageSize = new Size(16, 16), ColorDepth = ColorDepth.Depth32Bit };

    private string _leftDirPath = string.Empty;
    private string _rightDirPath = string.Empty;
    private string _leftFilePath = string.Empty;
    private string _rightFilePath = string.Empty;

    public Form1()
    {
        InitializeComponent();
        BuildUi();
    }

    private void BuildUi()
    {
        Text = "CompareMasterWinV10 - Rebuilt WinForms UI";
        Width = 1300;
        Height = 860;

        ConfigureTreeIcons();
        _tabs.TabPages.Add(BuildDirectoryTab());
        _tabs.TabPages.Add(BuildFileTab());
        Controls.Add(_tabs);
    }

    private TabPage BuildDirectoryTab()
    {
        var tab = new TabPage("Directory Compare");
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2, Padding = new Padding(10) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var topBar = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false };
        var leftSelect = new Button { Text = "Left Directory Select", Width = 170 };
        leftSelect.Click += (_, _) => SelectDirectory(true);
        var rightSelect = new Button { Text = "Right Directory Select", Width = 170 };
        rightSelect.Click += (_, _) => SelectDirectory(false);
        var compareButton = new Button { Text = "Compare", Width = 110 };
        compareButton.Click += (_, _) => CompareDirectories();
        topBar.Controls.Add(leftSelect);
        topBar.Controls.Add(rightSelect);
        topBar.Controls.Add(new Label { Text = "Exclude", AutoSize = true, Padding = new Padding(8, 8, 0, 0) });
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
        var leftSelect = new Button { Text = "Left File Select", Width = 170 };
        leftSelect.Click += (_, _) => SelectFile(true);
        var rightSelect = new Button { Text = "Right File Select", Width = 170 };
        rightSelect.Click += (_, _) => SelectFile(false);
        var compareButton = new Button { Text = "Compare", Width = 110 };
        compareButton.Click += (_, _) => CompareFiles();
        topBar.Controls.Add(leftSelect);
        topBar.Controls.Add(rightSelect);
        topBar.Controls.Add(_fileIgnoreWhitespace);
        topBar.Controls.Add(_fileIgnoreCase);
        topBar.Controls.Add(compareButton);
        topBar.Controls.Add(_fileSummary);

        _fileSplit.SplitterDistance = 620;
        _fileSplit.Panel1.Controls.Add(BuildFileSide("LEFT PANEL", _leftFileLabel, _leftDiff, () => SelectFile(true)));
        _fileSplit.Panel2.Controls.Add(BuildFileSide("RIGHT PANEL", _rightFileLabel, _rightDiff, () => SelectFile(false)));
        _fileSplit.Resize += (_, _) => _fileSplit.SplitterDistance = _fileSplit.Width / 2;

        root.Controls.Add(topBar, 0, 0);
        root.Controls.Add(_fileSplit, 0, 1);
        tab.Controls.Add(root);
        return tab;
    }

    private static Control BuildDirectorySide(string title, Label pathLabel, TreeView preview, Action onSelect)
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
        panel.Controls.Add(preview, 0, 3);
        return panel;
    }

    private static Control BuildFileSide(string title, Label pathLabel, RichTextBox diff, Action onSelect)
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
        panel.Controls.Add(diff, 0, 3);
        return panel;
    }

    private void SelectDirectory(bool left)
    {
        using var dialog = new FolderBrowserDialog();
        if (dialog.ShowDialog() != DialogResult.OK)
        {
            return;
        }

        if (left)
        {
            _leftDirPath = dialog.SelectedPath;
            _leftDirLabel.Text = $"Left: {_leftDirPath}";
            PopulateDirectoryTree(_leftDirTree, _leftDirPath, null);
        }
        else
        {
            _rightDirPath = dialog.SelectedPath;
            _rightDirLabel.Text = $"Right: {_rightDirPath}";
            PopulateDirectoryTree(_rightDirTree, _rightDirPath, null);
        }

        if (Directory.Exists(_leftDirPath) && Directory.Exists(_rightDirPath))
        {
            CompareDirectories();
        }
    }

    private void SelectFile(bool left)
    {
        using var dialog = new OpenFileDialog();
        if (dialog.ShowDialog() != DialogResult.OK)
        {
            return;
        }

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
        {
            CompareFiles();
        }
    }

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

        var same = 0;
        var diff = 0;
        var leftOnly = 0;
        var rightOnly = 0;
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

        PopulateDirectoryTree(_leftDirTree, _leftDirPath, leftStatus);
        PopulateDirectoryTree(_rightDirTree, _rightDirPath, rightStatus);
        var summary = $"Same={same}, Different={diff}, LeftOnly={leftOnly}, RightOnly={rightOnly}";
        _leftDirLabel.Text = $"Left: {_leftDirPath} | {summary}";
        _rightDirLabel.Text = $"Right: {_rightDirPath} | {summary}";
    }

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

        foreach (var (l, r) in pairs)
        {
            var same = LinesEqual(l, r, _fileIgnoreWhitespace.Checked, _fileIgnoreCase.Checked);
            if (!same)
            {
                diffCount++;
            }

            if (same)
            {
                AppendLine(_leftDiff, l ?? string.Empty, Color.Honeydew);
                AppendLine(_rightDiff, r ?? string.Empty, Color.Honeydew);
                continue;
            }

            if (l is null)
            {
                AppendLine(_leftDiff, string.Empty, Color.LightGray);
                AppendLine(_rightDiff, r ?? string.Empty, Color.MistyRose);
                continue;
            }

            if (r is null)
            {
                AppendLine(_leftDiff, l, Color.MistyRose);
                AppendLine(_rightDiff, string.Empty, Color.LightGray);
                continue;
            }

            AppendLineWithInlineDiff(_leftDiff, l, r);
            AppendLineWithInlineDiff(_rightDiff, r, l);
        }

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
        if (diffLength <= 0)
        {
            return;
        }

        box.Select(start + diffStart, diffLength);
        box.SelectionBackColor = Color.Orange;
        box.SelectionColor = Color.Black;
        box.Select(box.TextLength, 0);
    }

    private static (int Start, int Length) FindChangedRange(string line, string otherLine)
    {
        var minLength = Math.Min(line.Length, otherLine.Length);
        var prefix = 0;
        while (prefix < minLength && line[prefix] == otherLine[prefix])
        {
            prefix++;
        }

        var maxSuffix = minLength - prefix;
        var suffix = 0;
        while (suffix < maxSuffix && line[^ (suffix + 1)] == otherLine[^ (suffix + 1)])
        {
            suffix++;
        }

        var length = line.Length - prefix - suffix;
        return (prefix, Math.Max(0, length));
    }

    private void PopulateDirectoryTree(TreeView tree, string dir, IReadOnlyDictionary<string, CompareStatus>? statusMap)
    {
        tree.BeginUpdate();
        tree.Nodes.Clear();
        if (!Directory.Exists(dir))
        {
            tree.EndUpdate();
            return;
        }

        var rootNode = new TreeNode(new DirectoryInfo(dir).Name) { ImageKey = "folder", SelectedImageKey = "folder" };
        tree.Nodes.Add(rootNode);

        foreach (var relative in Directory.GetFileSystemEntries(dir, "*", SearchOption.AllDirectories)
                     .Select(path => Path.GetRelativePath(dir, path))
                     .OrderBy(path => path))
        {
            AddPathNode(rootNode, dir, relative, statusMap);
        }

        rootNode.Expand();
        tree.EndUpdate();
    }

    private void AddPathNode(TreeNode root, string baseDir, string relativePath, IReadOnlyDictionary<string, CompareStatus>? statusMap)
    {
        var parts = relativePath.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var current = root;
        var running = string.Empty;
        for (var i = 0; i < parts.Length; i++)
        {
            var part = parts[i];
            running = string.IsNullOrEmpty(running) ? part : Path.Combine(running, part);
            var existing = current.Nodes.Cast<TreeNode>().FirstOrDefault(n => string.Equals(n.Text, part, StringComparison.OrdinalIgnoreCase));
            if (existing is null)
            {
                var full = Path.Combine(baseDir, running);
                var isDir = Directory.Exists(full) || i < parts.Length - 1;
                var node = new TreeNode(part)
                {
                    ImageKey = isDir ? "folder" : GetFileIconKey(part),
                    SelectedImageKey = isDir ? "folder" : GetFileIconKey(part)
                };

                if (statusMap is not null && statusMap.TryGetValue(running.Replace(Path.AltDirectorySeparatorChar, Path.DirectorySeparatorChar), out var status))
                {
                    node.ForeColor = status switch
                    {
                        CompareStatus.Same => Color.SeaGreen,
                        CompareStatus.Different => Color.DarkOrange,
                        CompareStatus.LeftOnly => Color.Crimson,
                        CompareStatus.RightOnly => Color.DodgerBlue,
                        _ => SystemColors.ControlText
                    };
                }

                current.Nodes.Add(node);
                existing = node;
            }

            current = existing;
        }
    }

    private static List<(string? Left, string? Right)> BuildAlignedLines(string[] left, string[] right, bool ignoreWs, bool ignoreCase)
    {
        var n = left.Length;
        var m = right.Length;
        var lcs = new int[n + 1, m + 1];
        for (var i = n - 1; i >= 0; i--)
        {
            for (var j = m - 1; j >= 0; j--)
            {
                lcs[i, j] = LinesEqual(left[i], right[j], ignoreWs, ignoreCase)
                    ? lcs[i + 1, j + 1] + 1
                    : Math.Max(lcs[i + 1, j], lcs[i, j + 1]);
            }
        }

        var result = new List<(string? Left, string? Right)>();
        var li = 0;
        var ri = 0;
        while (li < n && ri < m)
        {
            if (LinesEqual(left[li], right[ri], ignoreWs, ignoreCase))
            {
                result.Add((left[li], right[ri]));
                li++;
                ri++;
            }
            else if (lcs[li + 1, ri] >= lcs[li, ri + 1])
            {
                result.Add((left[li], null));
                li++;
            }
            else
            {
                result.Add((null, right[ri]));
                ri++;
            }
        }

        while (li < n)
        {
            result.Add((left[li], null));
            li++;
        }

        while (ri < m)
        {
            result.Add((null, right[ri]));
            ri++;
        }

        return result;
    }

    private static bool FileTextEquals(string leftPath, string rightPath, bool ignoreWs, bool ignoreCase)
    {
        var left = File.ReadAllLines(leftPath);
        var right = File.ReadAllLines(rightPath);
        if (left.Length != right.Length)
        {
            return false;
        }

        for (var i = 0; i < left.Length; i++)
        {
            if (!LinesEqual(left[i], right[i], ignoreWs, ignoreCase))
            {
                return false;
            }
        }

        return true;
    }

    private static bool LinesEqual(string? l, string? r, bool ignoreWs, bool ignoreCase)
    {
        if (l is null || r is null)
        {
            return l is null && r is null;
        }

        var left = ignoreWs ? Regex.Replace(l, @"\s+", string.Empty) : l;
        var right = ignoreWs ? Regex.Replace(r, @"\s+", string.Empty) : r;
        return string.Equals(left, right, ignoreCase ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal);
    }

    private static List<string> ParseExclude(string text)
    {
        return text.Split([';', ','], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
    }

    private static bool IsExcluded(string relativePath, IReadOnlyCollection<string> patterns)
    {
        var normalized = relativePath.Replace('\\', '/');
        foreach (var p in patterns)
        {
            if (normalized.Contains(p.Replace('\\', '/'), StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private void ConfigureTreeIcons()
    {
        _treeIcons.Images.Clear();
        _treeIcons.Images.Add("folder", SystemIcons.WinLogo.ToBitmap());
        _treeIcons.Images.Add("file", SystemIcons.Application.ToBitmap());
        _treeIcons.Images.Add("text", SystemIcons.Asterisk.ToBitmap());
        _treeIcons.Images.Add("image", SystemIcons.Information.ToBitmap());
        _treeIcons.Images.Add("binary", SystemIcons.Shield.ToBitmap());

        _leftDirTree.ImageList = _treeIcons;
        _rightDirTree.ImageList = _treeIcons;
    }

    private static string GetFileIconKey(string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        return ext switch
        {
            ".txt" or ".md" or ".json" or ".xml" or ".yml" or ".yaml" or ".cs" or ".cpp" or ".h" => "text",
            ".png" or ".jpg" or ".jpeg" or ".gif" or ".bmp" or ".webp" => "image",
            ".exe" or ".dll" or ".bin" or ".dat" => "binary",
            _ => "file"
        };
    }

    private enum CompareStatus
    {
        Same,
        Different,
        LeftOnly,
        RightOnly
    }
}
