using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

public sealed class BugRiskViewer : UserControl
{
    // ── UI 컨트롤 ──────────────────────────────────────────────────────────
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
        MultiSelect = false,
        VirtualMode = false
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

    // 카테고리/심각도 필터 패널
    private readonly Panel _filterPanel = new()
    {
        Dock = DockStyle.Top,
        Height = 32
    };

    private readonly ComboBox _filterCombo = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList,
        Width = 200
    };

    // 언어 탭 스트립
    private readonly FlowLayoutPanel _langStrip = new()
    {
        Dock = DockStyle.Top,
        Height = 32,
        Padding = new Padding(6, 4, 4, 0),
        AutoSize = false
    };

    // ── 상태 ───────────────────────────────────────────────────────────────
    private BugRiskResult? _result;
    private string? _projectRoot;
    private bool _isAnalyzing;
    private string? _selectedLanguageId; // null = 전체

    // 색상 (Critical=빨강, Warning=노랑, Info=흰색)
    private static readonly Color CriticalBg = Color.FromArgb(255, 220, 220);
    private static readonly Color WarningBg = Color.FromArgb(255, 251, 204);
    private static readonly Color InfoBg = Color.White;

    private static readonly Color LangActiveBack = Color.FromArgb(74, 108, 155);
    private static readonly Color LangActiveFore = Color.White;
    private static readonly Color LangInactiveBack = Color.FromArgb(228, 234, 242);
    private static readonly Color LangInactiveFore = Color.FromArgb(40, 60, 90);

    public event Action<MetricsNavigationRequest>? NavigationRequested;

    // ── 생성자 ─────────────────────────────────────────────────────────────
    public BugRiskViewer()
    {
        DoubleBuffered = true;
        BackColor = Color.White;

        // 목록 컬럼
        _list.Columns.Add("#", 40);
        _list.Columns.Add("심각도", 70);
        _list.Columns.Add("카테고리", 148);
        _list.Columns.Add("함수", 148);
        _list.Columns.Add("설명", 340);
        _list.Columns.Add("파일", 160);
        _list.Columns.Add("줄", 44, HorizontalAlignment.Right);
        _listHeaderToolTip = ListViewColumnHeaderToolTip.Attach(_list, ListViewHeaderToolTipTexts.BugRisk);
        _list.SelectedIndexChanged += (_, _) => ShowDetail();
        _list.DoubleClick += (_, _) => NavigateToSelected();
        _list.ColumnClick += OnColumnClick;

        // 카테고리/심각도 필터
        _filterCombo.Items.Add("전체");
        foreach (var cat in Enum.GetValues<BugRiskCategory>())
            _filterCombo.Items.Add(CategoryKorean(cat));
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

        SizeChanged += (_, _) => AdjustColumns();
        Load += (_, _) => AdjustColumns();
    }

    // ── 공개 API ───────────────────────────────────────────────────────────
    public void SetResult(BugRiskResult? result, string? projectRoot = null)
    {
        _result = result;
        _projectRoot = projectRoot;
        _isAnalyzing = false;
        _selectedLanguageId = null;
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
        _summary.Text = "버그 위험 분석 중...";
    }

    public void EndAnalysis() => _isAnalyzing = false;

    // ── 언어 스트립 ────────────────────────────────────────────────────────
    private void RebuildLangStrip()
    {
        _langStrip.Controls.Clear();
        var findings = _result?.Findings ?? [];

        // "전체" 버튼
        AddLangButton(null, $"전체 ({findings.Count:N0})", _selectedLanguageId is null);

        // 언어별 버튼 (건수 내림차순)
        var byLang = findings
            .Where(f => !string.IsNullOrEmpty(f.LanguageId))
            .GroupBy(f => f.LanguageId!)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key);

        foreach (var grp in byLang)
            AddLangButton(grp.Key, $"{GetLanguageDisplayName(grp.Key)} ({grp.Count():N0})", grp.Key == _selectedLanguageId);
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

    private static string GetLanguageDisplayName(string? langId) => langId switch
    {
        null => "전체",
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

    // ── 목록 재구성 ────────────────────────────────────────────────────────
    private void RebuildList()
    {
        _list.BeginUpdate();
        _list.Items.Clear();
        _detail.Clear();

        if (_result is null || _result.Findings.Count == 0)
        {
            _summary.Text = _isAnalyzing
                ? "버그 위험 분석 중..."
                : "발견된 버그 위험 패턴이 없습니다.";
            _list.EndUpdate();
            return;
        }

        var filtered = ApplyFilter(_result.Findings).ToList();

        var crit = _result.Findings.Count(f => f.Severity == BugRiskSeverity.Critical);
        var warn = _result.Findings.Count(f => f.Severity == BugRiskSeverity.Warning);
        var info = _result.Findings.Count(f => f.Severity == BugRiskSeverity.Info);
        _summary.Text =
            $"전체 {_result.Findings.Count:N0}건  Critical {crit:N0}  Warning {warn:N0}  Info {info:N0}" +
            $"  |  {_result.ByCategory.Count}개 카테고리" +
            (_selectedLanguageId is not null ? $"  |  표시 {filtered.Count:N0}건" : "") +
            "  |  더블클릭: 소스로 이동";

        var index = 1;
        foreach (var f in filtered)
        {
            var item = new ListViewItem(index.ToString());
            item.SubItems.Add(SeverityLabel(f.Severity));
            item.SubItems.Add(CategoryKorean(f.Category));
            item.SubItems.Add(string.IsNullOrWhiteSpace(f.FunctionName) ? "-" : f.FunctionName);
            item.SubItems.Add(f.Message);
            item.SubItems.Add(FormatPath(f.FilePath));
            item.SubItems.Add(f.LineNumber > 0 ? f.LineNumber.ToString() : "-");
            item.Tag = f;
            item.BackColor = f.Severity switch
            {
                BugRiskSeverity.Critical => CriticalBg,
                BugRiskSeverity.Warning => WarningBg,
                _ => InfoBg
            };
            item.ToolTipText = BuildTooltip(f);
            _list.Items.Add(item);
            index++;
        }

        _list.EndUpdate();
        AdjustColumns();
    }

    private IEnumerable<BugRiskFinding> ApplyFilter(IReadOnlyList<BugRiskFinding> all)
    {
        IEnumerable<BugRiskFinding> result = all;

        // 언어 필터 (탭 스트립)
        if (_selectedLanguageId is not null)
            result = result.Where(f => f.LanguageId == _selectedLanguageId);

        // 카테고리/심각도 필터
        var sel = _filterCombo.SelectedIndex;
        if (sel > 0)
        {
            var cats = Enum.GetValues<BugRiskCategory>();
            if (sel - 1 < cats.Length)
            {
                var cat = cats[sel - 1];
                result = result.Where(f => f.Category == cat);
            }
            else
            {
                var catCount = cats.Length;
                var sevOffset = sel - catCount - 2; // -2: separator "──" item
                if (sevOffset == 0) result = result.Where(f => f.Severity == BugRiskSeverity.Critical);
                else if (sevOffset == 1) result = result.Where(f => f.Severity == BugRiskSeverity.Warning);
                else if (sevOffset == 2) result = result.Where(f => f.Severity == BugRiskSeverity.Info);
            }
        }

        return result;
    }

    // ── 상세 패널 ──────────────────────────────────────────────────────────
    private void ShowDetail()
    {
        if (_list.SelectedItems.Count == 0
            || _list.SelectedItems[0].Tag is not BugRiskFinding f)
        {
            _detail.Clear();
            return;
        }

        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"카테고리  : {CategoryKorean(f.Category)}");
        sb.AppendLine($"심각도    : {SeverityLabel(f.Severity)}");
        sb.AppendLine($"설명      : {f.Message}");
        if (!string.IsNullOrWhiteSpace(f.FunctionName))
            sb.AppendLine($"함수      : {f.FunctionName}");
        sb.AppendLine($"위치      : {f.FilePath}:{f.LineNumber}");
        if (!string.IsNullOrWhiteSpace(f.Snippet))
        {
            sb.AppendLine();
            sb.AppendLine("코드 스니펫:");
            sb.AppendLine($"  {f.Snippet}");
        }
        if (!string.IsNullOrWhiteSpace(f.Detail))
        {
            sb.AppendLine();
            sb.AppendLine("추가 정보:");
            sb.AppendLine($"  {f.Detail}");
        }

        _detail.Text = sb.ToString();
    }

    private void NavigateToSelected()
    {
        if (_list.SelectedItems.Count == 0
            || _list.SelectedItems[0].Tag is not BugRiskFinding f
            || string.IsNullOrWhiteSpace(f.FilePath))
            return;

        NavigationRequested?.Invoke(new MetricsNavigationRequest
        {
            FilePath = f.FilePath,
            LineNumber = Math.Max(1, f.LineNumber)
        });
    }

    // ── 컬럼 정렬 ──────────────────────────────────────────────────────────
    private int _sortColumn = -1;
    private bool _sortAscending = true;

    private void OnColumnClick(object? sender, ColumnClickEventArgs e)
    {
        if (_sortColumn == e.Column)
            _sortAscending = !_sortAscending;
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
        public ColumnSorter(int col, bool asc) { _col = col; _asc = asc; }

        public int Compare(object? x, object? y)
        {
            var a = (ListViewItem?)x;
            var b = (ListViewItem?)y;
            if (a is null && b is null) return 0;
            if (a is null) return _asc ? -1 : 1;
            if (b is null) return _asc ? 1 : -1;

            var ta = _col < a.SubItems.Count ? a.SubItems[_col].Text : string.Empty;
            var tb = _col < b.SubItems.Count ? b.SubItems[_col].Text : string.Empty;

            if (_col is 0 or 6 && int.TryParse(ta, out var ia) && int.TryParse(tb, out var ib))
                return _asc ? ia.CompareTo(ib) : ib.CompareTo(ia);

            var cmp = string.Compare(ta, tb, StringComparison.OrdinalIgnoreCase);
            return _asc ? cmp : -cmp;
        }
    }

    // ── 유틸리티 ────────────────────────────────────────────────────────────
    private void AdjustColumns()
    {
        if (_list.Columns.Count < 7 || _list.ClientSize.Width <= 0) return;
        const int fixedWidth = 40 + 70 + 148 + 148 + 44;
        var remaining = Math.Max(200, _list.ClientSize.Width - fixedWidth - 12);
        _list.Columns[4].Width = (int)(remaining * 0.60);
        _list.Columns[5].Width = (int)(remaining * 0.40);
    }

    private string FormatPath(string path)
    {
        if (string.IsNullOrWhiteSpace(_projectRoot) || string.IsNullOrWhiteSpace(path))
            return Path.GetFileName(path);
        try
        {
            var rel = Path.GetRelativePath(_projectRoot, path);
            return rel.StartsWith("..", StringComparison.Ordinal) ? Path.GetFileName(path) : rel;
        }
        catch { return Path.GetFileName(path); }
    }

    private static string BuildTooltip(BugRiskFinding f)
    {
        var parts = new List<string> { f.Message };
        if (!string.IsNullOrWhiteSpace(f.Snippet)) parts.Add($"코드: {f.Snippet}");
        if (!string.IsNullOrWhiteSpace(f.Detail)) parts.Add(f.Detail);
        parts.Add($"{f.FilePath}:{f.LineNumber}");
        return string.Join(Environment.NewLine, parts);
    }

    private static string SeverityLabel(BugRiskSeverity sev) => sev switch
    {
        BugRiskSeverity.Critical => "Critical",
        BugRiskSeverity.Warning => "Warning",
        _ => "Info"
    };

    internal static string CategoryKorean(BugRiskCategory cat) => cat switch
    {
        BugRiskCategory.ExceptionSwallowing => "예외 무음 처리",
        BugRiskCategory.UnusedVariable => "사용 안 된 변수",
        BugRiskCategory.DeadCode => "도달 불가 코드",
        BugRiskCategory.ConstantCondition => "상수 조건",
        BugRiskCategory.AlwaysTrue => "항상 참인 조건",
        BugRiskCategory.AlwaysFalse => "항상 거짓인 조건",
        BugRiskCategory.CompareToSelf => "자기 비교",
        BugRiskCategory.NullDereference => "null 역참조 위험",
        BugRiskCategory.ResourceLeak => "리소스 누수",
        BugRiskCategory.HighComplexityNesting => "복잡도·중첩 위험",
        BugRiskCategory.DeadWrite => "Dead Write",
        BugRiskCategory.EmptyBlock => "빈 블록",
        BugRiskCategory.DuplicateCondition => "중복 조건",
        BugRiskCategory.AsyncVoidMethod => "async void",
        BugRiskCategory.MagicNumberAbuse => "매직 넘버 남용",
        BugRiskCategory.PossiblyUnusedPrivate => "미사용 함수 의심",
        BugRiskCategory.LintViolation => "Lint 위반",
        _ => cat.ToString()
    };
}
