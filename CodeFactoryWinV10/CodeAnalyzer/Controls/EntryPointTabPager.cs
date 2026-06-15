using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

/// <summary>진입점 탭이 한 페이지 분량을 넘을 때 페이지(예: 1–20, 21–40)를 선택합니다.</summary>
internal sealed class EntryPointTabPager : UserControl
{
    private const int PageComboWidth = 168;
    private const int NavButtonWidth = 28;
    private const int PageLabelWidth = 56;

    private readonly Label _summaryLabel = new()
    {
        AutoSize = false,
        Dock = DockStyle.Fill,
        ForeColor = Color.FromArgb(70, 80, 95),
        TextAlign = ContentAlignment.MiddleLeft,
        AutoEllipsis = true
    };

    private readonly Label _pageLabel = new()
    {
        AutoSize = false,
        Width = PageLabelWidth,
        Dock = DockStyle.Left,
        Text = "페이지:",
        ForeColor = Color.FromArgb(70, 80, 95),
        TextAlign = ContentAlignment.MiddleRight,
        Padding = new Padding(4, 0, 4, 0)
    };

    private readonly ComboBox _pageCombo = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList,
        Dock = DockStyle.Fill
    };

    private readonly Button _prevPageButton = new()
    {
        Text = "◀",
        AutoSize = false,
        Width = NavButtonWidth,
        Dock = DockStyle.Left,
        FlatStyle = FlatStyle.System,
        ForeColor = Color.FromArgb(50, 70, 100),
        Enabled = false
    };

    private readonly Button _nextPageButton = new()
    {
        Text = "▶",
        AutoSize = false,
        Width = NavButtonWidth,
        Dock = DockStyle.Right,
        FlatStyle = FlatStyle.System,
        ForeColor = Color.FromArgb(50, 70, 100),
        Enabled = false
    };

    private int _totalItems;
    private int _pageIndex;
    private bool _suppressPageChange;

    public EntryPointTabPager()
    {
        Dock = DockStyle.Top;
        Height = 32;
        MinimumSize = new Size(NavButtonWidth, 32);
        Padding = new Padding(8, 4, 4, 4);
        BackColor = Color.FromArgb(248, 249, 252);
        Visible = false;

        // [◀][페이지:][ComboBox] 패널 — DockStyle.Right 으로 우측 정렬
        // 창이 좁아질 때 왼쪽부터 클리핑되므로 ▶는 항상 최우측에 표시됨
        var middlePanel = new Panel
        {
            Dock = DockStyle.Right,
            Width = NavButtonWidth + PageLabelWidth + PageComboWidth
        };
        // 높은 인덱스 먼저 처리: ◀가 가장 좌측이 되도록 마지막에 추가
        middlePanel.Controls.Add(_pageCombo);       // index 0: Fill
        middlePanel.Controls.Add(_pageLabel);        // index 1: Left
        middlePanel.Controls.Add(_prevPageButton);   // index 2: Left (좌단)

        // ▶를 가장 마지막에 추가(높은 인덱스) → 도킹 처리 시 최우측에 고정
        Controls.Add(_summaryLabel);   // index 0: Fill
        Controls.Add(middlePanel);     // index 1: Right (▶ 왼쪽)
        Controls.Add(_nextPageButton); // index 2: Right (최우측, 항상 표시)

        _prevPageButton.Click += (_, _) => SelectPage(_pageIndex - 1);
        _nextPageButton.Click += (_, _) => SelectPage(_pageIndex + 1);

        _pageCombo.SelectedIndexChanged += (_, _) =>
        {
            if (_suppressPageChange || _pageCombo.SelectedIndex < 0)
            {
                return;
            }

            _pageIndex = _pageCombo.SelectedIndex;
            UpdateNavButtonStates();
            PageChanged?.Invoke();
        };
    }

    public event Action? PageChanged;

    public int PageIndex => _pageIndex;

    public int PageSize => AnalysisScaleLimits.MaxEntryPointTabsPerPage;

    public int PageCount => _totalItems == 0
        ? 0
        : (int)Math.Ceiling(_totalItems / (double)PageSize);

    public void Configure(int totalItems, int? preserveGlobalIndex = null)
    {
        _totalItems = Math.Max(0, totalItems);
        _suppressPageChange = true;
        try
        {
            _pageCombo.Items.Clear();
            if (_totalItems <= PageSize)
            {
                Visible = false;
                _pageIndex = 0;
                _summaryLabel.Text = string.Empty;
                UpdateNavButtonStates();
                return;
            }

            Visible = true;
            var pageCount = PageCount;
            for (var page = 0; page < pageCount; page++)
            {
                _pageCombo.Items.Add(FormatPageLabel(page, pageCount));
            }

            _summaryLabel.Text = $"진입점 {_totalItems:N0}개 — 페이지당 {PageSize:N0}개";
            _pageIndex = preserveGlobalIndex.HasValue
                ? Math.Clamp(preserveGlobalIndex.Value / PageSize, 0, pageCount - 1)
                : Math.Clamp(_pageIndex, 0, pageCount - 1);
            _pageCombo.SelectedIndex = _pageIndex;
            UpdateNavButtonStates();
        }
        finally
        {
            _suppressPageChange = false;
        }
    }

    public (int StartIndex, int Count) GetCurrentPageSlice()
    {
        if (_totalItems == 0)
        {
            return (0, 0);
        }

        var start = _pageIndex * PageSize;
        var count = Math.Min(PageSize, _totalItems - start);
        return (start, count);
    }

    public void SelectPage(int pageIndex)
    {
        if (PageCount == 0)
        {
            return;
        }

        pageIndex = Math.Clamp(pageIndex, 0, PageCount - 1);
        if (pageIndex == _pageIndex)
        {
            return;
        }

        _suppressPageChange = true;
        try
        {
            _pageIndex = pageIndex;
            if (_pageCombo.Items.Count > pageIndex)
            {
                _pageCombo.SelectedIndex = pageIndex;
            }

            UpdateNavButtonStates();
        }
        finally
        {
            _suppressPageChange = false;
        }

        PageChanged?.Invoke();
    }

    public void SelectPageForGlobalIndex(int globalIndex)
    {
        if (globalIndex < 0 || globalIndex >= _totalItems)
        {
            return;
        }

        SelectPage(globalIndex / PageSize);
    }

    private void UpdateNavButtonStates()
    {
        _prevPageButton.Enabled = Visible && _pageIndex > 0;
        _nextPageButton.Enabled = Visible && _pageIndex < PageCount - 1;
    }

    private string FormatPageLabel(int pageIndex, int pageCount)
    {
        var start = pageIndex * PageSize;
        var end = Math.Min(start + PageSize, _totalItems) - 1;
        return $"{start}–{end} ({pageIndex + 1}/{pageCount})";
    }
}
