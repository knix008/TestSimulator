using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

public sealed class SecurityViewer : UserControl
{
    /// <summary>MainForm 기본 오른쪽 패널 너비(1528 − 좌측 356 − 스플리터 6).</summary>
    private const int DefaultListHostWidth = 1166;

    private const int ColIndex = 0;
    private const int ColSeverity = 1;
    private const int ColRule = 2;
    private const int ColMeaning = 3;
    private const int ColAction = 4;
    private const int ColFile = 5;
    private const int ColLine = 6;

    private readonly SplitContainer _split = new()
    {
        Dock = DockStyle.Fill,
        Orientation = Orientation.Horizontal,
        SplitterDistance = 320
    };

    private readonly ListView _list = new()
    {
        Dock = DockStyle.Fill,
        View = View.Details,
        FullRowSelect = true,
        GridLines = true,
        MultiSelect = false
    };

    private readonly ListViewColumnHeaderToolTip _listHeaderToolTip;

    private readonly TextBox _detail = new()
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

    private readonly Label _summary = new()
    {
        Dock = DockStyle.Top,
        Height = 44,
        Padding = new Padding(8, 6, 8, 4),
        AutoEllipsis = true
    };

    private readonly Panel _filterPanel = new()
    {
        Dock = DockStyle.Top,
        Height = 32
    };

    private readonly ComboBox _filterCombo = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList,
        Width = 220
    };

    private readonly FlowLayoutPanel _langStrip = new()
    {
        Dock = DockStyle.Top,
        Height = 32,
        Padding = new Padding(6, 4, 4, 0),
        AutoSize = false
    };

    private SecurityAnalysisResult? _result;
    private string? _projectRoot;
    private bool _isAnalyzing;
    private string? _selectedLanguageId;

    private static readonly Color CriticalBg = Color.FromArgb(255, 220, 220);
    private static readonly Color WarningBg = Color.FromArgb(255, 251, 204);
    private static readonly Color InfoBg = Color.White;
    private static readonly Color LangActiveBack = Color.FromArgb(74, 108, 155);
    private static readonly Color LangActiveFore = Color.White;
    private static readonly Color LangInactiveBack = Color.FromArgb(228, 234, 242);
    private static readonly Color LangInactiveFore = Color.FromArgb(40, 60, 90);

    public event Action<MetricsNavigationRequest>? NavigationRequested;

    public SecurityViewer()
    {
        DoubleBuffered = true;
        BackColor = Color.White;

        // MainForm 기본 크기(오른쪽 ~1166px)에 맞춘 초기 폭 — 이후 AdjustColumns가 가용 너비에 맞게 재계산
        _list.Columns.Add("#", 40);
        _list.Columns.Add("심각도", 72);
        _list.Columns.Add("규칙", 112);
        _list.Columns.Add("설명", 220);
        _list.Columns.Add("대처 방안", 320);
        _list.Columns.Add("파일", 140);
        _list.Columns.Add("줄", 40, HorizontalAlignment.Right);
        _listHeaderToolTip = ListViewColumnHeaderToolTip.Attach(_list, ListViewHeaderToolTipTexts.Security);
        _list.SelectedIndexChanged += (_, _) => ShowDetail();
        _list.DoubleClick += (_, _) => NavigateToSelected();
        _list.ColumnClick += OnColumnClick;

        _filterCombo.Items.Add("전체");
        _filterCombo.Items.Add("── 심각도 ──");
        _filterCombo.Items.Add("Critical");
        _filterCombo.Items.Add("Warning");
        _filterCombo.Items.Add("Info");
        _filterCombo.SelectedIndex = 0;
        _filterCombo.SelectedIndexChanged += (_, _) => RebuildList();

        var filterLabel = new Label
        {
            Text = "필터:",
            AutoSize = true,
            Location = new Point(8, 8)
        };
        _filterCombo.Location = new Point(46, 5);
        _filterPanel.Controls.Add(filterLabel);
        _filterPanel.Controls.Add(_filterCombo);

        var detailPanel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(4) };
        detailPanel.Controls.Add(_detail);

        _split.Panel1.Controls.Add(_list);
        _split.Panel2.Controls.Add(detailPanel);

        Controls.Add(_split);
        Controls.Add(_filterPanel);
        Controls.Add(_langStrip);
        Controls.Add(_summary);

        _split.SplitterMoved += (_, _) => AdjustColumns();
        SizeChanged += (_, _) => AdjustColumns();
        Load += (_, _) => BeginInvoke(AdjustColumns);
    }

    public void SetResult(SecurityAnalysisResult? result, string? projectRoot = null)
    {
        _result = result;
        _projectRoot = projectRoot;
        _isAnalyzing = false;
        _selectedLanguageId = null;
        RebuildRuleFilter();
        RebuildLangStrip();
        RebuildList();
    }

    public void BeginAnalysis()
    {
        _isAnalyzing = true;
        _result = null;
        _selectedLanguageId = null;
        _list.Items.Clear();
        _detail.Clear();
        _langStrip.Controls.Clear();
        _summary.Text = "정보 보호·보안 분석 중...";
    }

    public void EndAnalysis() => _isAnalyzing = false;

    private void RebuildRuleFilter()
    {
        var selected = _filterCombo.SelectedItem?.ToString();
        _filterCombo.Items.Clear();
        _filterCombo.Items.Add("전체");

        if (_result is { Findings.Count: > 0 })
        {
            foreach (var rule in _result.Findings
                         .GroupBy(f => f.RuleId)
                         .OrderByDescending(g => g.Count())
                         .ThenBy(g => g.First().Label))
            {
                _filterCombo.Items.Add($"{rule.First().Label} ({rule.Count():N0})");
            }
        }

        _filterCombo.Items.Add("── 심각도 ──");
        _filterCombo.Items.Add("Critical");
        _filterCombo.Items.Add("Warning");
        _filterCombo.Items.Add("Info");

        var index = 0;
        if (!string.IsNullOrWhiteSpace(selected))
        {
            for (var i = 0; i < _filterCombo.Items.Count; i++)
            {
                if (string.Equals(_filterCombo.Items[i]?.ToString(), selected, StringComparison.Ordinal))
                {
                    index = i;
                    break;
                }
            }
        }

        _filterCombo.SelectedIndex = Math.Min(index, _filterCombo.Items.Count - 1);
    }

    private void RebuildLangStrip()
    {
        _langStrip.Controls.Clear();
        var findings = _result?.Findings ?? [];
        AddLangButton(null, $"전체 ({findings.Count:N0})", _selectedLanguageId is null);

        foreach (var grp in findings
                     .Where(f => !string.IsNullOrEmpty(f.LanguageId))
                     .GroupBy(f => f.LanguageId)
                     .OrderByDescending(g => g.Count())
                     .ThenBy(g => g.Key))
        {
            AddLangButton(grp.Key, $"{GetLanguageDisplayName(grp.Key)} ({grp.Count():N0})", grp.Key == _selectedLanguageId);
        }
    }

    private void AddLangButton(string? langId, string label, bool active)
    {
        var btn = new Button
        {
            Text = label,
            AutoSize = true,
            FlatStyle = FlatStyle.Flat,
            Margin = new Padding(0, 0, 4, 0),
            BackColor = active ? LangActiveBack : LangInactiveBack,
            ForeColor = active ? LangActiveFore : LangInactiveFore,
            Cursor = Cursors.Hand
        };
        btn.FlatAppearance.BorderColor = active
            ? Color.FromArgb(50, 80, 130)
            : Color.FromArgb(190, 200, 215);
        btn.FlatAppearance.BorderSize = 1;
        btn.Click += (_, _) =>
        {
            _selectedLanguageId = active && langId is not null ? null : langId;
            RebuildLangStrip();
            RebuildList();
        };
        _langStrip.Controls.Add(btn);
    }

    private void RebuildList()
    {
        _list.BeginUpdate();
        _list.Items.Clear();
        _detail.Clear();

        if (_result is null || _result.Findings.Count == 0)
        {
            _summary.Text = _isAnalyzing
                ? "정보 보호·보안 분석 중..."
                : "발견된 보안 smell 패턴이 없습니다. (분석 설정에서 보안 smell 항목이 켜져 있는지 확인하세요.)";
            _list.EndUpdate();
            return;
        }

        var filtered = ApplyFilter(_result.Findings).ToList();
        var crit = _result.Findings.Count(f => f.Severity == SecuritySeverity.Critical);
        var warn = _result.Findings.Count(f => f.Severity == SecuritySeverity.Warning);
        var info = _result.Findings.Count(f => f.Severity == SecuritySeverity.Info);
        var langCount = _result.Findings.Select(f => f.LanguageId).Distinct(StringComparer.OrdinalIgnoreCase).Count();

        _summary.Text =
            $"전체 {_result.Findings.Count:N0}건  Critical {crit:N0}  Warning {warn:N0}  Info {info:N0}" +
            $"  |  {langCount}개 언어  |  {_result.ByRule.Count}개 규칙" +
            (_selectedLanguageId is not null || _filterCombo.SelectedIndex > 0 ? $"  |  표시 {filtered.Count:N0}건" : "") +
            "  |  더블클릭: 소스로 이동";

        var index = 1;
        foreach (var f in filtered)
        {
            var item = new ListViewItem(index.ToString());
            item.SubItems.Add(SeverityLabel(f.Severity));
            item.SubItems.Add(f.Label);
            item.SubItems.Add(f.Explanation ?? f.Label);
            item.SubItems.Add(f.Remediation ?? "-");
            item.SubItems.Add(FormatPath(f.FilePath));
            item.SubItems.Add(f.LineNumber > 0 ? f.LineNumber.ToString() : "-");
            item.Tag = f;
            item.BackColor = f.Severity switch
            {
                SecuritySeverity.Critical => CriticalBg,
                SecuritySeverity.Warning => WarningBg,
                _ => InfoBg
            };
            item.ToolTipText = BuildTooltip(f);
            _list.Items.Add(item);
            index++;
        }

        _list.EndUpdate();
        AdjustColumns();
    }

    private IEnumerable<SecurityFinding> ApplyFilter(IReadOnlyList<SecurityFinding> all)
    {
        IEnumerable<SecurityFinding> result = all;

        if (_selectedLanguageId is not null)
        {
            result = result.Where(f => f.LanguageId == _selectedLanguageId);
        }

        var sel = _filterCombo.SelectedIndex;
        if (sel <= 0)
        {
            return result;
        }

        var selectedText = _filterCombo.SelectedItem?.ToString() ?? string.Empty;
        if (selectedText == "Critical")
        {
            return result.Where(f => f.Severity == SecuritySeverity.Critical);
        }

        if (selectedText == "Warning")
        {
            return result.Where(f => f.Severity == SecuritySeverity.Warning);
        }

        if (selectedText == "Info")
        {
            return result.Where(f => f.Severity == SecuritySeverity.Info);
        }

        if (selectedText.StartsWith("──", StringComparison.Ordinal))
        {
            return result;
        }

        var ruleLabel = selectedText.Contains('(')
            ? selectedText[..selectedText.LastIndexOf('(')].Trim()
            : selectedText;

        return result.Where(f => string.Equals(f.Label, ruleLabel, StringComparison.Ordinal));
    }

    private void ShowDetail()
    {
        if (_list.SelectedItems.Count == 0
            || _list.SelectedItems[0].Tag is not SecurityFinding f)
        {
            _detail.Clear();
            return;
        }

        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"규칙 ID    : {f.RuleId}");
        sb.AppendLine($"규칙       : {f.Label}");
        sb.AppendLine($"심각도     : {SeverityLabel(f.Severity)}");
        sb.AppendLine($"언어       : {GetLanguageDisplayName(f.LanguageId)} ({f.LanguageId})");
        sb.AppendLine($"위치       : {f.FilePath}:{f.LineNumber}");
        if (!string.IsNullOrWhiteSpace(f.Explanation))
        {
            sb.AppendLine();
            sb.AppendLine("설명:");
            sb.AppendLine($"  {f.Explanation}");
        }

        if (!string.IsNullOrWhiteSpace(f.Remediation))
        {
            sb.AppendLine();
            sb.AppendLine("대처 방안:");
            sb.AppendLine($"  {f.Remediation}");
        }

        if (!string.IsNullOrWhiteSpace(f.Snippet))
        {
            sb.AppendLine();
            sb.AppendLine("코드 스니펫:");
            sb.AppendLine($"  {f.Snippet}");
        }

        _detail.Text = sb.ToString();
    }

    private void NavigateToSelected()
    {
        if (_list.SelectedItems.Count == 0
            || _list.SelectedItems[0].Tag is not SecurityFinding f
            || string.IsNullOrWhiteSpace(f.FilePath))
        {
            return;
        }

        NavigationRequested?.Invoke(new MetricsNavigationRequest
        {
            FilePath = f.FilePath,
            LineNumber = Math.Max(1, f.LineNumber)
        });
    }

    private int _sortColumn = -1;
    private bool _sortAscending = true;

    private void OnColumnClick(object? sender, ColumnClickEventArgs e)
    {
        if (_sortColumn == e.Column)
        {
            _sortAscending = !_sortAscending;
        }
        else
        {
            _sortColumn = e.Column;
            _sortAscending = true;
        }

        _list.ListViewItemSorter = new ColumnSorter(_sortColumn, _sortAscending);
        _list.Sort();
    }

    private sealed class ColumnSorter : System.Collections.IComparer
    {
        private readonly int _col;
        private readonly bool _asc;

        public ColumnSorter(int col, bool asc)
        {
            _col = col;
            _asc = asc;
        }

        public int Compare(object? x, object? y)
        {
            var a = (ListViewItem?)x;
            var b = (ListViewItem?)y;
            if (a is null && b is null) return 0;
            if (a is null) return _asc ? -1 : 1;
            if (b is null) return _asc ? 1 : -1;

            var ta = _col < a.SubItems.Count ? a.SubItems[_col].Text : string.Empty;
            var tb = _col < b.SubItems.Count ? b.SubItems[_col].Text : string.Empty;

            if (_col is 0 or ColLine && int.TryParse(ta, out var ia) && int.TryParse(tb, out var ib))
            {
                return _asc ? ia.CompareTo(ib) : ib.CompareTo(ia);
            }

            var cmp = string.Compare(ta, tb, StringComparison.OrdinalIgnoreCase);
            return _asc ? cmp : -cmp;
        }
    }

    private void AdjustColumns()
    {
        if (_list.Columns.Count <= ColLine)
        {
            return;
        }

        var available = GetAvailableListWidth();
        if (available <= 0)
        {
            return;
        }

        const int indexW = 40;
        const int severityW = 72;
        const int lineW = 40;
        const int minRuleW = 72;
        const int minMeaningW = 96;
        const int minActionW = 200;
        const int minFileW = 88;
        var ruleW = 112;

        _list.Columns[ColIndex].Width = indexW;
        _list.Columns[ColSeverity].Width = severityW;
        _list.Columns[ColLine].Width = lineW;

        var flexibleTotal = available - indexW - severityW - ruleW - lineW;
        while (flexibleTotal < minMeaningW + minActionW + minFileW && ruleW > minRuleW)
        {
            ruleW -= 8;
            flexibleTotal = available - indexW - severityW - ruleW - lineW;
        }

        _list.Columns[ColRule].Width = ruleW;
        flexibleTotal = Math.Max(0, available - indexW - severityW - ruleW - lineW);

        var meaningW = Math.Max(minMeaningW, (int)(flexibleTotal * 0.28));
        var actionW = Math.Max(minActionW, (int)(flexibleTotal * 0.42));
        var fileW = flexibleTotal - meaningW - actionW;

        if (fileW < minFileW)
        {
            var deficit = minFileW - fileW;
            fileW = minFileW;
            actionW = Math.Max(minActionW, actionW - deficit);
            if (meaningW + actionW + fileW > flexibleTotal)
            {
                meaningW = Math.Max(minMeaningW, flexibleTotal - actionW - fileW);
            }
        }

        _list.Columns[ColMeaning].Width = meaningW;
        _list.Columns[ColAction].Width = actionW;
        _list.Columns[ColFile].Width = Math.Max(0, fileW);
    }

    private int GetAvailableListWidth()
    {
        if (_list.IsHandleCreated && _list.ClientSize.Width > 0)
        {
            var width = _list.ClientSize.Width - 2;
            if (_list.Items.Count > 0 && _list.ClientSize.Height > 0)
            {
                var itemHeight = Math.Max(18, _list.Font.Height + 4);
                if (_list.Items.Count * itemHeight > _list.ClientSize.Height)
                {
                    width -= SystemInformation.VerticalScrollBarWidth;
                }
            }

            return Math.Max(0, width);
        }

        var hostWidth = ClientSize.Width;
        if (hostWidth <= 0 && Parent is { } parent)
        {
            hostWidth = parent.ClientSize.Width;
        }

        if (hostWidth <= 0)
        {
            hostWidth = DefaultListHostWidth;
        }

        return Math.Max(0, hostWidth - 2);
    }

    private string FormatPath(string path)
    {
        if (string.IsNullOrWhiteSpace(_projectRoot) || string.IsNullOrWhiteSpace(path))
        {
            return Path.GetFileName(path);
        }

        try
        {
            var rel = Path.GetRelativePath(_projectRoot, path);
            return rel.StartsWith("..", StringComparison.Ordinal) ? Path.GetFileName(path) : rel;
        }
        catch
        {
            return Path.GetFileName(path);
        }
    }

    private static string BuildTooltip(SecurityFinding f)
    {
        var parts = new List<string> { f.Label };
        if (!string.IsNullOrWhiteSpace(f.Explanation))
        {
            parts.Add(f.Explanation);
        }

        if (!string.IsNullOrWhiteSpace(f.Remediation))
        {
            parts.Add($"대처: {f.Remediation}");
        }

        if (!string.IsNullOrWhiteSpace(f.Snippet))
        {
            parts.Add($"코드: {f.Snippet}");
        }

        parts.Add($"{f.FilePath}:{f.LineNumber}");
        return string.Join(Environment.NewLine, parts);
    }

    private static string SeverityLabel(SecuritySeverity sev) => sev switch
    {
        SecuritySeverity.Critical => "Critical",
        SecuritySeverity.Warning => "Warning",
        _ => "Info"
    };

    private static string GetLanguageDisplayName(string? langId) => langId switch
    {
        null or "" => "전체",
        "csharp" => "C#",
        "vbnet" => "VB.NET",
        "javascript" => "JavaScript",
        "typescript" => "TypeScript",
        "python" => "Python",
        "java" => "Java",
        "cpp" => "C/C++",
        "c" => "C",
        "go" => "Go",
        "rust" => "Rust",
        "ruby" => "Ruby",
        "php" => "PHP",
        "swift" => "Swift",
        "kotlin" => "Kotlin",
        _ => langId
    };
}
