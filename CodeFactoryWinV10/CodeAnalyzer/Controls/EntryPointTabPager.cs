using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

/// <summary>진입점 탭이 한 페이지 분량을 넘을 때 페이지(예: 1–20, 21–40)를 선택합니다.</summary>
internal sealed class EntryPointTabPager : UserControl
{
    private const int PageComboWidth = 168;
    private const int PageSelectorMinWidth = 214;

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
        AutoSize = true,
        Text = "페이지:",
        ForeColor = Color.FromArgb(70, 80, 95),
        TextAlign = ContentAlignment.MiddleRight,
        Margin = new Padding(8, 0, 6, 0)
    };

    private readonly ComboBox _pageCombo = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList,
        Width = PageComboWidth,
        Margin = new Padding(0)
    };

    private readonly Panel _pageSelectorPanel;
    private int _totalItems;
    private int _pageIndex;
    private bool _suppressPageChange;

    public EntryPointTabPager()
    {
        Dock = DockStyle.Top;
        Height = 32;
        MinimumSize = new Size(PageSelectorMinWidth, 32);
        Padding = new Padding(8, 4, 8, 4);
        BackColor = Color.FromArgb(248, 249, 252);
        Visible = false;

        var pagePanel = new TableLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            ColumnCount = 2,
            RowCount = 1,
            Margin = new Padding(0),
            Padding = new Padding(0)
        };
        pagePanel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        pagePanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, PageComboWidth));
        pagePanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 24f));

        _pageLabel.Anchor = AnchorStyles.Left | AnchorStyles.Right;
        _pageLabel.Dock = DockStyle.Fill;

        _pageCombo.Anchor = AnchorStyles.Left | AnchorStyles.Right;
        _pageCombo.Dock = DockStyle.Fill;

        pagePanel.Controls.Add(_pageLabel, 0, 0);
        pagePanel.Controls.Add(_pageCombo, 1, 0);

        _pageSelectorPanel = new Panel
        {
            Dock = DockStyle.Right,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            MinimumSize = new Size(PageSelectorMinWidth, 24),
            Margin = new Padding(0),
            Padding = new Padding(0)
        };
        _pageSelectorPanel.Controls.Add(pagePanel);
        pagePanel.Location = new Point(0, 0);
        _pageSelectorPanel.Resize += (_, _) => AlignPagePanelVertically(pagePanel);

        Controls.Add(_summaryLabel);
        Controls.Add(_pageSelectorPanel);

        _pageCombo.SelectedIndexChanged += (_, _) =>
        {
            if (_suppressPageChange || _pageCombo.SelectedIndex < 0)
            {
                return;
            }

            _pageIndex = _pageCombo.SelectedIndex;
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
            AlignPagePanelVertically(_pageSelectorPanel.Controls[0]);
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

    private string FormatPageLabel(int pageIndex, int pageCount)
    {
        var start = pageIndex * PageSize;
        var end = Math.Min(start + PageSize, _totalItems) - 1;
        return $"{start}–{end} ({pageIndex + 1}/{pageCount})";
    }

    private static void AlignPagePanelVertically(Control? pagePanel)
    {
        if (pagePanel?.Parent is not Panel host)
        {
            return;
        }

        pagePanel.Location = new Point(
            0,
            Math.Max(0, (host.ClientSize.Height - pagePanel.Height) / 2));
    }
}
