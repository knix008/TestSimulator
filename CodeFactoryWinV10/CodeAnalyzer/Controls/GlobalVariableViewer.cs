using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

public sealed class GlobalVariableViewer : UserControl
{
    private readonly SplitContainer _split = new()
    {
        Dock = DockStyle.Fill,
        Orientation = Orientation.Horizontal,
        SplitterDistance = 320
    };

    private readonly ListView _variableList = new()
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

    private readonly Button _openFileButton = new()
    {
        Text = "선택 위치 파일 열기",
        AutoSize = true,
        Enabled = false
    };

    private GlobalVariableResult? _globals;
    private GlobalVariableItem? _selected;
    private string? _projectRoot;
    private bool _isAnalyzing;

    public event Action<MetricsNavigationRequest>? NavigationRequested;

    public GlobalVariableViewer()
    {
        DoubleBuffered = true;
        BackColor = Color.White;

        _variableList.Columns.Add("#", 40);
        _variableList.Columns.Add("이름", 120);
        _variableList.Columns.Add("범위", 88);
        _variableList.Columns.Add("타입", 120);
        _variableList.Columns.Add("소속", 140);
        _variableList.Columns.Add("파일", 180);
        _variableList.Columns.Add("줄", 44, HorizontalAlignment.Right);
        _variableList.SelectedIndexChanged += (_, _) => ShowSelectedVariable();
        _variableList.DoubleClick += (_, _) => OpenSelectedVariable();

        _openFileButton.Click += (_, _) => OpenSelectedVariable();

        var actionPanel = new Panel
        {
            Dock = DockStyle.Top,
            Height = 40,
            Padding = new Padding(8, 6, 8, 4)
        };
        _openFileButton.Location = new Point(8, 8);
        actionPanel.Controls.Add(_openFileButton);

        var previewPanel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(8) };
        previewPanel.Controls.Add(_previewBox);

        _split.Panel1.Controls.Add(_variableList);
        _split.Panel2.Controls.Add(previewPanel);
        _split.Panel2.Controls.Add(actionPanel);

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

    public void BeginAnalysis()
    {
        _isAnalyzing = true;
        _globals = null;
        _selected = null;
        _variableList.Items.Clear();
        _previewBox.Clear();
        _openFileButton.Enabled = false;
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
        _previewBox.Clear();
        _selected = null;
        _openFileButton.Enabled = false;

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
        _summaryLabel.Text =
            $"전역 변수 {_globals.Variables.Count:N0}개 · 파일 {fileCount:N0}개 · 언어 {languageCount:N0}개 · 더블클릭/버튼: 파일 열기";

        var index = 1;
        foreach (var variable in _globals.Variables)
        {
            var item = new ListViewItem(index.ToString());
            item.SubItems.Add(variable.Name);
            item.SubItems.Add(FormatScope(variable.Scope));
            item.SubItems.Add(string.IsNullOrWhiteSpace(variable.TypeName) ? "-" : variable.TypeName);
            item.SubItems.Add(string.IsNullOrWhiteSpace(variable.ContainingScope) ? "-" : variable.ContainingScope);
            item.SubItems.Add(Path.GetFileName(variable.FilePath));
            item.SubItems.Add(variable.LineNumber.ToString());
            item.Tag = variable;
            item.ToolTipText = BuildTooltip(variable);
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
            _previewBox.Clear();
            return;
        }

        _selected = variable;
        _openFileButton.Enabled = File.Exists(variable.FilePath);
        _previewBox.Text = BuildPreview(variable);
    }

    private void OpenSelectedVariable()
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

    private string BuildPreview(GlobalVariableItem variable)
    {
        var displayPath = FormatDisplayPath(variable.FilePath);
        var builder = new System.Text.StringBuilder();
        builder.AppendLine($"이름: {variable.Name}");
        builder.AppendLine($"범위: {FormatScope(variable.Scope)}");
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

    private static string BuildTooltip(GlobalVariableItem variable)
    {
        var path = variable.FilePath;
        return $"{variable.Name} · {FormatScope(variable.Scope)} · {path}:{variable.LineNumber}";
    }

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

        const int listMin = 180;
        const int previewMin = 160;
        var maxDistance = height - previewMin - _split.SplitterWidth;
        if (maxDistance < listMin)
        {
            return;
        }

        var desired = Math.Clamp((int)(height * 0.62), listMin, Math.Min(420, maxDistance));
        if (Math.Abs(_split.SplitterDistance - desired) > 2)
        {
            _split.SplitterDistance = desired;
        }
    }

    private void AdjustColumnWidths()
    {
        if (_variableList.Columns.Count < 7 || _variableList.ClientSize.Width <= 0)
        {
            return;
        }

        const int fixedWidth = 40 + 120 + 88 + 120 + 140 + 44;
        var fileWidth = Math.Max(120, _variableList.ClientSize.Width - fixedWidth - 8);
        _variableList.Columns[5].Width = fileWidth;
    }
}
