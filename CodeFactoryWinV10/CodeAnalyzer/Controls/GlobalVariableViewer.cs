using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

public sealed class GlobalVariableViewer : UserControl
{
    private readonly SplitContainer _split = new()
    {
        Dock = DockStyle.Fill,
        Orientation = Orientation.Horizontal,
        SplitterDistance = 280
    };

    private readonly SplitContainer _detailSplit = new()
    {
        Dock = DockStyle.Fill,
        Orientation = Orientation.Horizontal,
        SplitterDistance = 160
    };

    private readonly ListView _variableList = new()
    {
        Dock = DockStyle.Fill,
        View = View.Details,
        FullRowSelect = true,
        GridLines = true,
        MultiSelect = false
    };

    private readonly ListView _accessorList = new()
    {
        Dock = DockStyle.Fill,
        View = View.Details,
        FullRowSelect = true,
        GridLines = true,
        MultiSelect = false
    };

    private readonly TextBox _previewBox = new()
    {
        Dock = DockStyle.Fill,
        Multiline = true,
        ReadOnly = true,
        ScrollBars = ScrollBars.Both,
        Font = new Font(FontFamily.GenericMonospace, 9f),
        BackColor = Color.FromArgb(248, 248, 252),
        BorderStyle = BorderStyle.None,
        WordWrap = false
    };

    private readonly Label _summaryLabel = new()
    {
        Dock = DockStyle.Top,
        Height = 44,
        Padding = new Padding(8, 6, 8, 4),
        AutoEllipsis = true
    };

    private readonly Label _accessorHeaderLabel = new()
    {
        Dock = DockStyle.Top,
        Height = 24,
        Padding = new Padding(8, 4, 8, 0),
        Text = "접근 함수",
        AutoEllipsis = true
    };

    private readonly Button _openFileButton = new()
    {
        Text = "선언 위치 파일 열기",
        AutoSize = true,
        Enabled = false
    };

    private readonly Button _showGraphButton = new()
    {
        Text = "접근 함수 그래프",
        AutoSize = true,
        Enabled = false
    };

    private readonly ContextMenuStrip _variableContextMenu = new();
    private readonly ToolStripMenuItem _menuShowAccessGraph;
    private readonly ToolStripMenuItem _menuOpenDeclaration;

    private GlobalVariableResult? _globals;
    private GlobalVariableItem? _selected;
    private string? _projectRoot;
    private bool _isAnalyzing;
    private readonly ListViewColumnHeaderToolTip _variableListHeaderToolTip;
    private readonly ListViewColumnHeaderToolTip _accessorListHeaderToolTip;

    public event Action<MetricsNavigationRequest>? NavigationRequested;
    public event Action<GlobalVariableItem>? AccessGraphRequested;

    public GlobalVariableViewer()
    {
        DoubleBuffered = true;
        BackColor = Color.White;

        _menuShowAccessGraph = new ToolStripMenuItem("접근 함수 그래프 보기", null, (_, _) => ShowAccessGraphForSelected());
        _menuOpenDeclaration = new ToolStripMenuItem("선언 위치 파일 열기", null, (_, _) => OpenSelectedDeclaration());
        _variableContextMenu.Items.Add(_menuShowAccessGraph);
        _variableContextMenu.Items.Add(_menuOpenDeclaration);
        _variableList.ContextMenuStrip = _variableContextMenu;

        _variableList.Columns.Add("#", 40);
        _variableList.Columns.Add("이름", 120);
        _variableList.Columns.Add("범위", 72);
        _variableList.Columns.Add("접근 함수", 72, HorizontalAlignment.Right);
        _variableList.Columns.Add("타입", 100);
        _variableList.Columns.Add("소속", 120);
        _variableList.Columns.Add("파일", 160);
        _variableList.Columns.Add("줄", 44, HorizontalAlignment.Right);
        _variableListHeaderToolTip = ListViewColumnHeaderToolTip.Attach(_variableList, ListViewHeaderToolTipTexts.GlobalVariable);
        ListViewColumnSortHelper.Enable(_variableList);
        _variableList.SelectedIndexChanged += (_, _) => ShowSelectedVariable();
        _variableList.DoubleClick += (_, _) => ShowAccessGraphForSelected();

        _accessorList.Columns.Add("#", 36);
        _accessorList.Columns.Add("함수", 160);
        _accessorList.Columns.Add("파일", 180);
        _accessorList.Columns.Add("줄", 44, HorizontalAlignment.Right);
        _accessorList.Columns.Add("접근", 72);
        _accessorListHeaderToolTip = ListViewColumnHeaderToolTip.Attach(_accessorList, ListViewHeaderToolTipTexts.GlobalVariableAccessor);
        ListViewColumnSortHelper.Enable(_accessorList);
        _accessorList.DoubleClick += (_, _) => OpenSelectedAccessor();

        _openFileButton.Click += (_, _) => OpenSelectedDeclaration();
        _showGraphButton.Click += (_, _) => ShowAccessGraphForSelected();

        var actionPanel = new Panel
        {
            Dock = DockStyle.Top,
            Height = 40,
            Padding = new Padding(8, 6, 8, 4)
        };
        _openFileButton.Location = new Point(8, 8);
        _showGraphButton.Location = new Point(140, 8);
        actionPanel.Controls.Add(_openFileButton);
        actionPanel.Controls.Add(_showGraphButton);

        var previewPanel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(8, 0, 8, 4) };
        previewPanel.Controls.Add(_previewBox);

        var accessorPanel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(8, 0, 8, 8) };
        accessorPanel.Controls.Add(_accessorList);
        accessorPanel.Controls.Add(_accessorHeaderLabel);

        _detailSplit.Panel1.Controls.Add(previewPanel);
        _detailSplit.Panel1.Controls.Add(actionPanel);
        _detailSplit.Panel2.Controls.Add(accessorPanel);

        _split.Panel1.Controls.Add(_variableList);
        _split.Panel2.Controls.Add(_detailSplit);

        Controls.Add(_split);
        Controls.Add(_summaryLabel);

        Load += (_, _) => ApplySplitLayout();
        SizeChanged += (_, _) => ApplySplitLayout();
    }

    public void SetGlobals(GlobalVariableResult? globals, string? projectRoot = null)
    {
        _globals = globals;
        _projectRoot = projectRoot;
        RebuildList();
    }

    public GlobalVariableItem? SelectedVariable => _selected;

    public void BeginAnalysis()
    {
        _isAnalyzing = true;
        _globals = null;
        _selected = null;
        _variableList.Items.Clear();
        _accessorList.Items.Clear();
        _previewBox.Clear();
        _openFileButton.Enabled = false;
        _showGraphButton.Enabled = false;
        _summaryLabel.Text = "전역 변수 검색 중...";
    }

    public void EndAnalysis()
    {
        _isAnalyzing = false;
    }

    private void RebuildList()
    {
        _variableList.BeginUpdate();
        _variableList.Items.Clear();
        _accessorList.Items.Clear();
        _previewBox.Clear();
        _selected = null;
        _openFileButton.Enabled = false;
        _showGraphButton.Enabled = false;

        if (_globals is null || _globals.Variables.Count == 0)
        {
            _summaryLabel.Text = _isAnalyzing
                ? "전역 변수 검색 중..."
                : "표시할 전역 변수가 없습니다. 분석 실행 후 결과가 여기에 표시됩니다.";
            _variableList.EndUpdate();
            return;
        }

        var fileCount = _globals.Variables.Select(variable => variable.FilePath).Distinct(StringComparer.OrdinalIgnoreCase).Count();
        var languageCount = _globals.Variables.Select(variable => variable.LanguageId).Distinct(StringComparer.OrdinalIgnoreCase).Count();
        var totalAccessors = _globals.Accesses.Select(access => access.FunctionId).Distinct(StringComparer.Ordinal).Count();
        _summaryLabel.Text =
            $"전역 변수 {_globals.Variables.Count:N0}개 · 접근 함수 {totalAccessors:N0}개 · 파일 {fileCount:N0}개 · 언어 {languageCount:N0}개 · " +
            "변수 더블클릭/우클릭: 접근 함수 그래프";

        var index = 1;
        foreach (var variable in _globals.Variables)
        {
            var accessorCount = _globals.GetAccessesFor(variable.Id).Count;
            var item = new ListViewItem(index.ToString());
            item.SubItems.Add(variable.Name);
            item.SubItems.Add(FormatScope(variable.Scope));
            item.SubItems.Add(accessorCount.ToString());
            item.SubItems.Add(string.IsNullOrWhiteSpace(variable.TypeName) ? "-" : variable.TypeName);
            item.SubItems.Add(string.IsNullOrWhiteSpace(variable.ContainingScope) ? "-" : variable.ContainingScope);
            item.SubItems.Add(Path.GetFileName(variable.FilePath));
            item.SubItems.Add(variable.LineNumber.ToString());
            item.Tag = variable;
            item.ToolTipText = BuildTooltip(variable, accessorCount);
            _variableList.Items.Add(item);
            index++;
        }

        if (_variableList.Items.Count > 0)
        {
            _variableList.Items[0].Selected = true;
        }

        _variableList.EndUpdate();
        AdjustColumnWidths();
    }

    private void ShowSelectedVariable()
    {
        if (_variableList.SelectedItems.Count == 0
            || _variableList.SelectedItems[0].Tag is not GlobalVariableItem variable)
        {
            _selected = null;
            _openFileButton.Enabled = false;
            _showGraphButton.Enabled = false;
            _previewBox.Clear();
            _accessorList.Items.Clear();
            _accessorHeaderLabel.Text = "접근 함수";
            return;
        }

        _selected = variable;
        _openFileButton.Enabled = File.Exists(variable.FilePath);
        _showGraphButton.Enabled = true;
        _previewBox.Text = BuildPreview(variable);
        RebuildAccessorList(variable);
    }

    private void RebuildAccessorList(GlobalVariableItem variable)
    {
        _accessorList.BeginUpdate();
        _accessorList.Items.Clear();

        var accesses = _globals?.GetAccessesFor(variable.Id) ?? [];
        _accessorHeaderLabel.Text = accesses.Count > 0
            ? $"접근 함수 ({accesses.Count}개)"
            : "접근 함수 (없음)";

        var index = 1;
        foreach (var access in accesses)
        {
            var item = new ListViewItem(index.ToString());
            item.SubItems.Add(access.FunctionDisplayName);
            item.SubItems.Add(Path.GetFileName(access.FunctionFilePath));
            item.SubItems.Add(access.FunctionLineNumber.ToString());
            item.SubItems.Add(FormatAccessKind(access.Kind));
            item.Tag = access;
            item.ToolTipText = $"{access.FunctionFullName} · {access.FunctionFilePath}:{access.FunctionLineNumber}";
            _accessorList.Items.Add(item);
            index++;
        }

        _accessorList.EndUpdate();
    }

    private void ShowAccessGraphForSelected()
    {
        if (_selected is null)
        {
            return;
        }

        AccessGraphRequested?.Invoke(_selected);
    }

    private void OpenSelectedDeclaration()
    {
        if (_selected is null)
        {
            return;
        }

        NavigationRequested?.Invoke(new MetricsNavigationRequest
        {
            FilePath = _selected.FilePath,
            LineNumber = _selected.LineNumber
        });
    }

    private void OpenSelectedAccessor()
    {
        if (_accessorList.SelectedItems.Count == 0
            || _accessorList.SelectedItems[0].Tag is not GlobalVariableAccess access)
        {
            return;
        }

        NavigationRequested?.Invoke(new MetricsNavigationRequest
        {
            CallGraphNodeId = access.FunctionId,
            FilePath = access.FunctionFilePath,
            LineNumber = access.FunctionLineNumber
        });
    }

    private string BuildPreview(GlobalVariableItem variable)
    {
        var accessorCount = _globals?.GetAccessesFor(variable.Id).Count ?? 0;
        var displayPath = FormatDisplayPath(variable.FilePath);
        var builder = new System.Text.StringBuilder();
        builder.AppendLine($"이름: {variable.Name}");
        builder.AppendLine($"범위: {FormatScope(variable.Scope)}");
        builder.AppendLine($"접근 함수: {accessorCount}개");
        if (!string.IsNullOrWhiteSpace(variable.TypeName))
        {
            builder.AppendLine($"타입: {variable.TypeName}");
        }

        if (!string.IsNullOrWhiteSpace(variable.ContainingScope))
        {
            builder.AppendLine($"소속: {variable.ContainingScope}");
        }

        if (!string.IsNullOrWhiteSpace(variable.AccessModifier))
        {
            builder.AppendLine($"접근: {variable.AccessModifier}");
        }

        builder.AppendLine($"변경 가능: {(variable.IsReadOnly ? "아니오" : "예")}");
        builder.AppendLine($"위치: {displayPath}:{variable.LineNumber}");
        builder.AppendLine();
        builder.AppendLine("선언:");
        builder.AppendLine(variable.Declaration);
        return builder.ToString();
    }

    private static string BuildTooltip(GlobalVariableItem variable, int accessorCount) =>
        $"{variable.Name} · {FormatScope(variable.Scope)} · 접근 {accessorCount}개 · {variable.FilePath}:{variable.LineNumber}";

    private static string FormatAccessKind(GlobalVariableAccessKind kind) => kind switch
    {
        GlobalVariableAccessKind.Write => "쓰기",
        GlobalVariableAccessKind.ReadWrite => "읽기/쓰기",
        _ => "읽기"
    };

    private string FormatDisplayPath(string filePath)
    {
        if (string.IsNullOrWhiteSpace(_projectRoot))
        {
            return filePath;
        }

        try
        {
            var relative = Path.GetRelativePath(_projectRoot, filePath);
            return relative.StartsWith("..", StringComparison.Ordinal) ? filePath : relative;
        }
        catch
        {
            return filePath;
        }
    }

    private static string FormatScope(GlobalVariableScope scope) => scope switch
    {
        GlobalVariableScope.File => "파일",
        GlobalVariableScope.Module => "모듈",
        GlobalVariableScope.ClassStatic => "static",
        _ => scope.ToString()
    };

    private void ApplySplitLayout()
    {
        var height = _split.Height;
        if (height <= _split.SplitterWidth + 20)
        {
            return;
        }

        const int listMin = 160;
        const int detailMin = 220;
        var maxDistance = height - detailMin - _split.SplitterWidth;
        if (maxDistance < listMin)
        {
            return;
        }

        var desired = Math.Clamp((int)(height * 0.48), listMin, Math.Min(360, maxDistance));
        if (Math.Abs(_split.SplitterDistance - desired) > 2)
        {
            _split.SplitterDistance = desired;
        }

        var detailHeight = _detailSplit.Height;
        if (detailHeight > _detailSplit.SplitterWidth + 40)
        {
            var previewMin = 100;
            var accessorMin = 120;
            var maxDetail = detailHeight - accessorMin - _detailSplit.SplitterWidth;
            if (maxDetail >= previewMin)
            {
                var previewDesired = Math.Clamp((int)(detailHeight * 0.42), previewMin, Math.Min(220, maxDetail));
                if (Math.Abs(_detailSplit.SplitterDistance - previewDesired) > 2)
                {
                    _detailSplit.SplitterDistance = previewDesired;
                }
            }
        }
    }

    private void AdjustColumnWidths()
    {
        if (_variableList.Columns.Count < 8 || _variableList.ClientSize.Width <= 0)
        {
            return;
        }

        const int fixedWidth = 40 + 120 + 72 + 72 + 100 + 120 + 44;
        var fileWidth = Math.Max(120, _variableList.ClientSize.Width - fixedWidth - 8);
        _variableList.Columns[6].Width = fileWidth;
    }
}
