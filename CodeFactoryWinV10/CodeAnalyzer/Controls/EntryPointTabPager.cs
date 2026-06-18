using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

/// <summary>진입점 탭이 한 페이지 분량을 넘을 때 페이지(예: 1–20, 21–40)를 선택합니다.</summary>
internal partial class EntryPointTabPager : UserControl
{
    private const int PageComboWidth = 168;
    private const int NavButtonWidth = 28;
    private const int PageLabelWidth = 56;

    private int _totalItems;
    private int _pageIndex;
    private bool _suppressPageChange;

    private int _pageSize = AnalysisScaleLimits.MaxEntryPointTabsPerPage;
    private string _itemSummaryLabel = "진입점";
    private bool _oneBasedRangeLabels;

    public EntryPointTabPager()
    {
        InitializeComponent();
        _prevPageButton.Click += OnPrevPageButtonClick;
        _nextPageButton.Click += OnNextPageButtonClick;
        _pageCombo.SelectedIndexChanged += OnPageComboSelectedIndexChanged;
    }

    public event Action? PageChanged;

    public int PageIndex => _pageIndex;

    public int PageSize => _pageSize;

    public int PageCount => _totalItems == 0
        ? 0
        : (int)Math.Ceiling(_totalItems / (double)_pageSize);

    public void Configure(int totalItems, int? preserveGlobalIndex = null) =>
        Configure(totalItems, AnalysisScaleLimits.MaxEntryPointTabsPerPage, "진입점", preserveGlobalIndex);

    public void Configure(int totalItems, int pageSize, string itemSummaryLabel, int? preserveGlobalIndex = null, bool oneBasedRangeLabels = false)
    {
        _totalItems = Math.Max(0, totalItems);
        _pageSize = Math.Max(1, pageSize);
        _itemSummaryLabel = string.IsNullOrWhiteSpace(itemSummaryLabel) ? "항목" : itemSummaryLabel.Trim();
        _oneBasedRangeLabels = oneBasedRangeLabels;
        _suppressPageChange = true;
        try
        {
            _pageCombo.Items.Clear();
            if (_totalItems <= _pageSize)
            {
                Visible = false;
                Height = 0;
                _pageIndex = 0;
                _summaryLabel.Text = string.Empty;
                UpdateNavButtonStates();
                return;
            }

            Visible = true;
            Height = 36;
            MinimumSize = new Size(NavButtonWidth * 2 + PageLabelWidth + PageComboWidth + 24, 36);
            var pageCount = PageCount;
            for (var page = 0; page < pageCount; page++)
            {
                _pageCombo.Items.Add(FormatPageLabel(page, pageCount));
            }

            _summaryLabel.Text = $"{_itemSummaryLabel} {_totalItems:N0}개 — 페이지당 {_pageSize:N0}개";
            _pageIndex = preserveGlobalIndex.HasValue
                ? Math.Clamp(preserveGlobalIndex.Value / _pageSize, 0, pageCount - 1)
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

    private void OnPrevPageButtonClick(object? sender, EventArgs e) => SelectPage(_pageIndex - 1);

    private void OnNextPageButtonClick(object? sender, EventArgs e) => SelectPage(_pageIndex + 1);

    private void OnPageComboSelectedIndexChanged(object? sender, EventArgs e)
    {
        if (_suppressPageChange || _pageCombo.SelectedIndex < 0)
        {
            return;
        }

        _pageIndex = _pageCombo.SelectedIndex;
        UpdateNavButtonStates();
        PageChanged?.Invoke();
    }

    private void UpdateNavButtonStates()
    {
        var canNavigate = Visible && PageCount > 1;
        _prevPageButton.Enabled = canNavigate && _pageIndex > 0;
        _nextPageButton.Enabled = canNavigate && _pageIndex < PageCount - 1;
        _prevPageButton.Visible = canNavigate;
        _nextPageButton.Visible = canNavigate;
    }

    public void EnsureVisibleState()
    {
        if (_totalItems <= _pageSize)
        {
            return;
        }

        if (!Visible || Height < 32)
        {
            Visible = true;
            Height = 36;
        }

        UpdateNavButtonStates();
        BringToFront();
    }

    private string FormatPageLabel(int pageIndex, int pageCount)
    {
        var start = pageIndex * _pageSize;
        var endExclusive = Math.Min(start + _pageSize, _totalItems);
        if (_oneBasedRangeLabels)
        {
            return $"{start + 1}–{endExclusive} ({pageIndex + 1}/{pageCount})";
        }

        var endInclusive = endExclusive - 1;
        return $"{start}–{endInclusive} ({pageIndex + 1}/{pageCount})";
    }
}
