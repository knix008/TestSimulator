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

    public EntryPointTabPager()
    {
        InitializeComponent();
        _prevPageButton.Click += OnPrevPageButtonClick;
        _nextPageButton.Click += OnNextPageButtonClick;
        _pageCombo.SelectedIndexChanged += OnPageComboSelectedIndexChanged;
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
