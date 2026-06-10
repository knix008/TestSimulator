using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

public sealed class DatabaseTableViewer : UserControl
{
    private const int ZoneMinHeight = 100;

    private readonly SplitContainer _split = new()
    {
        Dock = DockStyle.Fill,
        Orientation = Orientation.Horizontal,
        SplitterDistance = 160
    };

    private readonly SplitContainer _detailSplit = new()
    {
        Dock = DockStyle.Fill,
        Orientation = Orientation.Horizontal,
        SplitterDistance = 160
    };

    private readonly ListView _tableList = new()
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

    private readonly ListView _columnAccessList = new()
    {
        Dock = DockStyle.Fill,
        View = View.Details,
        FullRowSelect = true,
        GridLines = true,
        MultiSelect = false
    };

    private readonly ListView _entryAccessList = new()
    {
        Dock = DockStyle.Fill,
        View = View.Details,
        FullRowSelect = true,
        GridLines = true,
        MultiSelect = false
    };

    private readonly TabControl _accessTabControl = new()
    {
        Dock = DockStyle.Fill
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

    private TabPage? _tableAccessTab;
    private TabPage? _columnAccessTab;
    private TabPage? _entryAccessTab;

    private readonly Button _openFileButton = new()
    {
        Text = "스키마 위치 파일 열기",
        AutoSize = true,
        Enabled = false
    };

    private readonly Button _showGraphButton = new()
    {
        Text = "접근 함수 그래프",
        AutoSize = true,
        Enabled = false
    };

    private readonly ContextMenuStrip _tableContextMenu = new();
    private readonly ToolStripMenuItem _menuShowAccessGraph;
    private readonly ToolStripMenuItem _menuOpenDeclaration;

    private DatabaseSchemaResult? _schema;
    private DatabaseTable? _selected;
    private string? _projectRoot;
    private bool _isAnalyzing;
    // ── DB 인스턴스 탭 ─────────────────────────────────────────
    private readonly SplitContainer _catalogSplit = new()
    {
        Dock = DockStyle.Fill,
        Orientation = Orientation.Horizontal,
        SplitterDistance = 220
    };

    private readonly ListView _catalogList = new()
    {
        Dock = DockStyle.Fill,
        View = View.Details,
        FullRowSelect = true,
        GridLines = true,
        MultiSelect = false
    };

    private readonly ListView _catalogAccessList = new()
    {
        Dock = DockStyle.Fill,
        View = View.Details,
        FullRowSelect = true,
        GridLines = true,
        MultiSelect = false
    };

    private readonly Label _catalogSummaryLabel = new()
    {
        Dock = DockStyle.Top,
        Height = 44,
        Padding = new Padding(8, 6, 8, 4),
        AutoEllipsis = true
    };

    private DatabaseCatalog? _selectedCatalog;

    // ── 상단 탭 (DB 인스턴스 / 테이블별 / DB 영향 함수) ────────
    private readonly TabControl _mainTabControl = new() { Dock = DockStyle.Fill };

    // ── DB 영향 함수 탭 (전체 테이블 cross-table 뷰) ─────────────
    private readonly ListView _impactList = new()
    {
        Dock = DockStyle.Fill,
        View = View.Details,
        FullRowSelect = true,
        GridLines = true,
        MultiSelect = false
    };

    private readonly CheckBox _writeOnlyFilter = new()
    {
        Text = "쓰기(Create/Update/Delete)만 보기",
        AutoSize = true,
        Checked = true
    };

    private readonly Label _impactSummaryLabel = new()
    {
        Dock = DockStyle.Top,
        Height = 36,
        Padding = new Padding(8, 6, 8, 4),
        AutoEllipsis = true
    };

    private readonly ListViewColumnHeaderToolTip _tableListHeaderToolTip;
    private readonly ListViewColumnHeaderToolTip _accessorListHeaderToolTip;
    private readonly ListViewColumnHeaderToolTip _columnAccessListHeaderToolTip;
    private readonly ListViewColumnHeaderToolTip _entryAccessListHeaderToolTip;
    private readonly ListViewColumnHeaderToolTip _catalogListHeaderToolTip;
    private readonly ListViewColumnHeaderToolTip _catalogAccessListHeaderToolTip;
    private ListViewColumnHeaderToolTip? _impactListHeaderToolTip;

    public event Action<DatabaseTable>? AccessGraphRequested;

    public DatabaseTableViewer()
    {
        DoubleBuffered = true;
        BackColor = Color.White;

        _menuShowAccessGraph = new ToolStripMenuItem("접근 함수 그래프 보기", null, (_, _) => ShowAccessGraphForSelected());
        _menuOpenDeclaration = new ToolStripMenuItem("스키마 위치 파일 열기", null, (_, _) => OpenSelectedDeclaration());
        _tableContextMenu.Items.Add(_menuShowAccessGraph);
        _tableContextMenu.Items.Add(_menuOpenDeclaration);
        _tableList.ContextMenuStrip = _tableContextMenu;

        _tableList.Columns.Add("#", 40);
        _tableList.Columns.Add("테이블", 120);
        _tableList.Columns.Add("엔티티", 100);
        _tableList.Columns.Add("접근 함수", 72, HorizontalAlignment.Right);
        _tableList.Columns.Add("필드", 52, HorizontalAlignment.Right);
        _tableList.Columns.Add("필드 접근", 72, HorizontalAlignment.Right);
        _tableList.Columns.Add("출처", 72);
        _tableList.Columns.Add("파일", 140);
        _tableList.Columns.Add("줄", 44, HorizontalAlignment.Right);
        _tableListHeaderToolTip = ListViewColumnHeaderToolTip.Attach(_tableList, ListViewHeaderToolTipTexts.DatabaseTable);
        ListViewColumnSortHelper.Enable(_tableList);
        _tableList.SelectedIndexChanged += (_, _) => ShowSelectedTable();
        _tableList.DoubleClick += (_, _) => OpenSelectedDeclaration();

        _accessorList.Columns.Add("#", 36);
        _accessorList.Columns.Add("함수", 160);
        _accessorList.Columns.Add("파일", 180);
        _accessorList.Columns.Add("줄", 44, HorizontalAlignment.Right);
        _accessorList.Columns.Add("접근", 72);
        _accessorList.Columns.Add("CRUD", 90);
        _accessorList.Columns.Add("패턴", 72);
        _accessorListHeaderToolTip = ListViewColumnHeaderToolTip.Attach(_accessorList, ListViewHeaderToolTipTexts.DatabaseTableAccessor);
        ListViewColumnSortHelper.Enable(_accessorList);
        _accessorList.DoubleClick += (_, _) => OpenSelectedAccessor();

        _columnAccessList.Columns.Add("#", 36);
        _columnAccessList.Columns.Add("필드", 120);
        _columnAccessList.Columns.Add("함수", 150);
        _columnAccessList.Columns.Add("접근", 72);
        _columnAccessList.Columns.Add("CRUD", 90);
        _columnAccessList.Columns.Add("파일", 160);
        _columnAccessList.Columns.Add("줄", 44, HorizontalAlignment.Right);
        _columnAccessListHeaderToolTip = ListViewColumnHeaderToolTip.Attach(_columnAccessList, ListViewHeaderToolTipTexts.DatabaseColumnAccess);
        ListViewColumnSortHelper.Enable(_columnAccessList);
        _columnAccessList.DoubleClick += (_, _) => OpenSelectedColumnAccessor();

        _entryAccessList.Columns.Add("#", 36);
        _entryAccessList.Columns.Add("작업", 80);
        _entryAccessList.Columns.Add("함수", 160);
        _entryAccessList.Columns.Add("패턴", 72);
        _entryAccessList.Columns.Add("파일", 160);
        _entryAccessList.Columns.Add("줄", 44, HorizontalAlignment.Right);
        _entryAccessListHeaderToolTip = ListViewColumnHeaderToolTip.Attach(_entryAccessList, ListViewHeaderToolTipTexts.DatabaseEntryAccess);
        ListViewColumnSortHelper.Enable(_entryAccessList);
        _entryAccessList.DoubleClick += (_, _) => OpenSelectedEntryAccessor();

        _openFileButton.Click += (_, _) => OpenSelectedDeclaration();
        _showGraphButton.Click += (_, _) => ShowAccessGraphForSelected();

        var actionPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            ColumnCount = 2,
            RowCount = 1,
            Padding = new Padding(8, 6, 8, 4),
            Margin = new Padding(0)
        };
        actionPanel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        actionPanel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        actionPanel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        _openFileButton.Margin = new Padding(0, 0, 8, 0);
        _showGraphButton.Margin = new Padding(0);
        _openFileButton.Anchor = AnchorStyles.Left;
        _showGraphButton.Anchor = AnchorStyles.Left;
        actionPanel.Controls.Add(_openFileButton, 0, 0);
        actionPanel.Controls.Add(_showGraphButton, 1, 0);

        var previewPanel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(8, 4, 8, 4) };
        previewPanel.Controls.Add(_previewBox);

        _tableAccessTab = new TabPage("테이블 접근");
        _tableAccessTab.Controls.Add(_accessorList);

        _columnAccessTab = new TabPage("필드 접근");
        _columnAccessTab.Controls.Add(_columnAccessList);

        _entryAccessTab = new TabPage("엔트리 접근");
        _entryAccessTab.Controls.Add(_entryAccessList);

        _accessTabControl.TabPages.Add(_tableAccessTab);
        _accessTabControl.TabPages.Add(_columnAccessTab);
        _accessTabControl.TabPages.Add(_entryAccessTab);

        _detailSplit.Panel1.Controls.Add(previewPanel);
        _detailSplit.Panel1.Controls.Add(actionPanel);
        _detailSplit.Panel2.Controls.Add(_accessTabControl);

        _split.Panel1.Controls.Add(_tableList);
        _split.Panel2.Controls.Add(_detailSplit);

        _catalogList.Columns.Add("#", 40);
        _catalogList.Columns.Add("DB", 160);
        _catalogList.Columns.Add("접근 함수", 72, HorizontalAlignment.Right);
        _catalogList.Columns.Add("방언", 72);
        _catalogList.Columns.Add("출처", 100);
        _catalogListHeaderToolTip = ListViewColumnHeaderToolTip.Attach(_catalogList, ListViewHeaderToolTipTexts.DatabaseCatalog);
        ListViewColumnSortHelper.Enable(_catalogList);
        _catalogList.SelectedIndexChanged += (_, _) => ShowSelectedCatalog();
        _catalogList.DoubleClick += (_, _) => OpenSelectedCatalogAccessor();

        _catalogAccessList.Columns.Add("#", 36);
        _catalogAccessList.Columns.Add("함수", 160);
        _catalogAccessList.Columns.Add("유형", 72);
        _catalogAccessList.Columns.Add("CRUD", 90);
        _catalogAccessList.Columns.Add("패턴", 80);
        _catalogAccessList.Columns.Add("파일", 160);
        _catalogAccessList.Columns.Add("줄", 44, HorizontalAlignment.Right);
        _catalogAccessListHeaderToolTip = ListViewColumnHeaderToolTip.Attach(_catalogAccessList, ListViewHeaderToolTipTexts.DatabaseCatalogAccess);
        ListViewColumnSortHelper.Enable(_catalogAccessList);
        _catalogAccessList.DoubleClick += (_, _) => OpenSelectedCatalogAccessor();

        _catalogSplit.Panel1.Controls.Add(_catalogList);
        _catalogSplit.Panel2.Controls.Add(_catalogAccessList);

        var catalogViewTab = new TabPage("DB 인스턴스");
        catalogViewTab.Controls.Add(_catalogSplit);
        catalogViewTab.Controls.Add(_catalogSummaryLabel);

        // ── 테이블별 탭 ──────────────────────────────────────────
        var tableViewTab = new TabPage("테이블·필드");
        tableViewTab.Controls.Add(_split);
        tableViewTab.Controls.Add(_summaryLabel);

        // ── DB 영향 함수 탭 ──────────────────────────────────────
        _impactList.Columns.Add("#", 40);
        _impactList.Columns.Add("테이블", 120);
        _impactList.Columns.Add("함수", 200);
        _impactList.Columns.Add("CRUD", 90);
        _impactList.Columns.Add("패턴", 72);
        _impactList.Columns.Add("파일", 200);
        _impactList.Columns.Add("줄", 44, HorizontalAlignment.Right);
        _impactListHeaderToolTip = ListViewColumnHeaderToolTip.Attach(_impactList, ListViewHeaderToolTipTexts.DatabaseImpactFunction);
        ListViewColumnSortHelper.Enable(_impactList);
        _impactList.DoubleClick += (_, _) => OpenSelectedImpactFunction();

        var filterPanel = new Panel { Dock = DockStyle.Top, Height = 36, Padding = new Padding(8, 6, 8, 4) };
        _writeOnlyFilter.Location = new Point(8, 8);
        _writeOnlyFilter.CheckedChanged += (_, _) => RebuildImpactList();
        filterPanel.Controls.Add(_writeOnlyFilter);

        var impactViewTab = new TabPage("DB 영향 함수");
        impactViewTab.Controls.Add(_impactList);
        impactViewTab.Controls.Add(_impactSummaryLabel);
        impactViewTab.Controls.Add(filterPanel);

        _mainTabControl.TabPages.Add(catalogViewTab);
        _mainTabControl.TabPages.Add(tableViewTab);
        _mainTabControl.TabPages.Add(impactViewTab);

        Controls.Add(_mainTabControl);

        _mainTabControl.SelectedIndexChanged += (_, _) =>
        {
            if (_mainTabControl.SelectedTab == tableViewTab)
            {
                ApplySplitLayout();
            }
        };

        Load += (_, _) => ApplySplitLayout();
        SizeChanged += (_, _) => ApplySplitLayout();
    }

    public void SetSchema(DatabaseSchemaResult? schema, string? projectRoot = null)
    {
        _schema = schema;
        _projectRoot = projectRoot;
        RebuildList();
        RebuildCatalogList();
        RebuildImpactList();
    }

    public DatabaseTable? SelectedTable => _selected;

    public void BeginAnalysis()
    {
        _isAnalyzing = true;
        _schema = null;
        _selected = null;
        _tableList.Items.Clear();
        _accessorList.Items.Clear();
        _columnAccessList.Items.Clear();
        _entryAccessList.Items.Clear();
        _impactList.Items.Clear();
        _catalogList.Items.Clear();
        _catalogAccessList.Items.Clear();
        _previewBox.Clear();
        _openFileButton.Enabled = false;
        _showGraphButton.Enabled = false;
        _summaryLabel.Text = "DB 테이블·접근 분석 중...";
        _catalogSummaryLabel.Text = "DB 인스턴스 분석 중...";
        _impactSummaryLabel.Text = "분석 중...";
        ResetAccessTabTitles();
    }

    public void EndAnalysis() => _isAnalyzing = false;

    private void RebuildList()
    {
        _tableList.BeginUpdate();
        _tableList.Items.Clear();
        _accessorList.Items.Clear();
        _columnAccessList.Items.Clear();
        _entryAccessList.Items.Clear();
        _impactList.Items.Clear();
        _catalogList.Items.Clear();
        _catalogAccessList.Items.Clear();
        _previewBox.Clear();
        _selected = null;
        _selectedCatalog = null;
        _openFileButton.Enabled = false;
        _showGraphButton.Enabled = false;
        ResetAccessTabTitles();

        if (_schema is null || (_schema.Tables.Count == 0 && _schema.Catalogs.Count == 0))
        {
            _summaryLabel.Text = _isAnalyzing
                ? "DB 테이블·접근 분석 중..."
                : "표시할 DB 분석 결과가 없습니다. SQL·EF Core·연결 문자열 분석 후 결과가 여기에 표시됩니다.";
            _tableList.EndUpdate();
            return;
        }

        var totalAccessors = _schema.Accesses.Select(access => access.FunctionId).Distinct(StringComparer.Ordinal).Count();
        var totalColumnAccesses = _schema.ColumnAccesses.Count;
        _summaryLabel.Text =
            $"테이블 {_schema.Tables.Count:N0}개 · 테이블 접근 {_schema.Accesses.Count:N0}건 · 필드 접근 {totalColumnAccesses:N0}건 · 함수 {totalAccessors:N0}개 · " +
            "더블클릭: 파일 열기 · 우클릭/버튼: 접근 함수 그래프";

        var index = 1;
        foreach (var table in _schema.Tables)
        {
            var accessorCount = _schema.GetAccessesFor(table.Id).Count;
            var colAccessCount = _schema.GetColumnAccessesFor(table.Id).Count;
            var distinctFields = _schema.GetColumnAccessesFor(table.Id)
                .Select(ca => ca.ColumnName)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Count();
            var item = new ListViewItem(index.ToString());
            item.SubItems.Add(table.Name);
            item.SubItems.Add(string.IsNullOrWhiteSpace(table.EntityTypeName) ? "-" : table.EntityTypeName);
            item.SubItems.Add(accessorCount.ToString());
            item.SubItems.Add(table.Columns.Count > 0 ? table.Columns.Count.ToString() : distinctFields.ToString());
            item.SubItems.Add(colAccessCount.ToString());
            item.SubItems.Add(FormatSourceKind(table.SourceKind));
            item.SubItems.Add(string.IsNullOrWhiteSpace(table.FilePath) ? "-" : Path.GetFileName(table.FilePath));
            item.SubItems.Add(table.LineNumber > 0 ? table.LineNumber.ToString() : "-");
            item.Tag = table;
            item.ToolTipText = BuildTooltip(table, accessorCount);
            _tableList.Items.Add(item);
            index++;
        }

        if (_tableList.Items.Count > 0)
        {
            _tableList.Items[0].Selected = true;
        }

        _tableList.EndUpdate();
        AdjustColumnWidths();
    }

    private void ShowSelectedTable()
    {
        if (_tableList.SelectedItems.Count == 0
            || _tableList.SelectedItems[0].Tag is not DatabaseTable table)
        {
            _selected = null;
            _openFileButton.Enabled = false;
            _showGraphButton.Enabled = false;
            _previewBox.Clear();
            _accessorList.Items.Clear();
            _columnAccessList.Items.Clear();
            _entryAccessList.Items.Clear();
            ResetAccessTabTitles();
            return;
        }

        _selected = table;
        _openFileButton.Enabled = !string.IsNullOrWhiteSpace(table.FilePath) && File.Exists(table.FilePath);
        _showGraphButton.Enabled = true;
        _previewBox.Text = BuildPreview(table);
        RebuildAccessorList(table);
        RebuildColumnAccessList(table);
        RebuildEntryAccessList(table);
    }

    private void RebuildAccessorList(DatabaseTable table)
    {
        _accessorList.BeginUpdate();
        _accessorList.Items.Clear();

        var accesses = _schema?.GetAccessesFor(table.Id) ?? [];
        if (_tableAccessTab is not null)
        {
            _tableAccessTab.Text = accesses.Count > 0
                ? $"테이블 접근 ({accesses.Count}개)"
                : "테이블 접근";
        }

        var index = 1;
        foreach (var access in accesses)
        {
            var item = new ListViewItem(index.ToString());
            item.SubItems.Add(access.FunctionDisplayName);
            item.SubItems.Add(Path.GetFileName(access.FunctionFilePath));
            item.SubItems.Add(access.FunctionLineNumber.ToString());
            item.SubItems.Add(FormatAccessKind(access.Kind));
            item.SubItems.Add(FormatOperations(access.Operations));
            item.SubItems.Add(FormatPattern(access.Pattern));
            item.Tag = access;
            item.ToolTipText = $"{access.FunctionFullName} · {access.FunctionFilePath}:{access.FunctionLineNumber}";
            _accessorList.Items.Add(item);
            index++;
        }

        _accessorList.EndUpdate();
    }

    private void RebuildColumnAccessList(DatabaseTable table)
    {
        _columnAccessList.BeginUpdate();
        _columnAccessList.Items.Clear();

        var colAccesses = _schema?.GetColumnAccessesFor(table.Id) ?? [];
        if (_columnAccessTab is not null)
        {
            _columnAccessTab.Text = colAccesses.Count > 0
                ? $"필드 접근 ({colAccesses.Count}건)"
                : "필드 접근";
        }

        var index = 1;
        foreach (var ca in colAccesses)
        {
            var item = new ListViewItem(index.ToString());
            item.SubItems.Add(ca.ColumnName);
            item.SubItems.Add(ca.FunctionDisplayName);
            item.SubItems.Add(FormatAccessKind(ca.Kind));
            item.SubItems.Add(FormatOperations(ca.Operations));
            item.SubItems.Add(Path.GetFileName(ca.FunctionFilePath));
            item.SubItems.Add(ca.FunctionLineNumber.ToString());
            item.Tag = ca;
            item.ToolTipText = $"{ca.FunctionFullName} · {ca.FunctionFilePath}:{ca.FunctionLineNumber}";
            _columnAccessList.Items.Add(item);
            index++;
        }

        _columnAccessList.EndUpdate();
    }

    private void RebuildEntryAccessList(DatabaseTable table)
    {
        _entryAccessList.BeginUpdate();
        _entryAccessList.Items.Clear();

        var entryAccesses = _schema?.GetEntryAccessesFor(table.Id) ?? [];
        if (_entryAccessTab is not null)
        {
            _entryAccessTab.Text = entryAccesses.Count > 0
                ? $"엔트리 접근 ({entryAccesses.Count}건)"
                : "엔트리 접근";
        }

        var index = 1;
        foreach (var entry in entryAccesses)
        {
            var item = new ListViewItem(index.ToString());
            item.SubItems.Add(FormatOperation(entry.Operation));
            item.SubItems.Add(entry.FunctionDisplayName);
            item.SubItems.Add(FormatPattern(entry.Pattern));
            item.SubItems.Add(Path.GetFileName(entry.FunctionFilePath));
            item.SubItems.Add(entry.FunctionLineNumber.ToString());
            item.Tag = entry;
            item.ToolTipText = $"{entry.FunctionFullName} · {entry.FunctionFilePath}:{entry.FunctionLineNumber}";
            _entryAccessList.Items.Add(item);
            index++;
        }

        _entryAccessList.EndUpdate();
    }

    private void OpenSelectedColumnAccessor()
    {
        if (_columnAccessList.SelectedItems.Count == 0
            || _columnAccessList.SelectedItems[0].Tag is not DatabaseColumnAccess ca)
        {
            return;
        }

        SourceFileOpener.TryOpen(ca.FunctionFilePath, ca.FunctionLineNumber);
    }

    private void OpenSelectedEntryAccessor()
    {
        if (_entryAccessList.SelectedItems.Count == 0
            || _entryAccessList.SelectedItems[0].Tag is not DatabaseEntryAccess entry)
        {
            return;
        }

        SourceFileOpener.TryOpen(entry.FunctionFilePath, entry.FunctionLineNumber);
    }

    private void RebuildImpactList()
    {
        _impactList.BeginUpdate();
        _impactList.Items.Clear();

        if (_schema is null || _schema.Tables.Count == 0)
        {
            _impactSummaryLabel.Text = "분석 결과 없음";
            _impactList.EndUpdate();
            return;
        }

        var writeOps = DatabaseCrudOperation.Create | DatabaseCrudOperation.Update | DatabaseCrudOperation.Delete;
        var writeOnlyMode = _writeOnlyFilter.Checked;
        var tableMap = _schema.TableMap;

        var rows = _schema.Accesses
            .Where(a =>
            {
                if (writeOnlyMode)
                {
                    return (a.Operations & writeOps) != DatabaseCrudOperation.None
                        || (a.Operations == DatabaseCrudOperation.None && a.Kind != DatabaseTableAccessKind.Read);
                }
                return true;
            })
            .OrderBy(a => tableMap.TryGetValue(a.TableId, out var t) ? t.Name : a.TableId, StringComparer.OrdinalIgnoreCase)
            .ThenBy(a => a.FunctionDisplayName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(a => a.FunctionLineNumber)
            .ToList();

        var writeCount = _schema.Accesses.Count(a =>
            (a.Operations & writeOps) != DatabaseCrudOperation.None
            || (a.Operations == DatabaseCrudOperation.None && a.Kind != DatabaseTableAccessKind.Read));
        var totalCount = _schema.Accesses.Count;
        var distinctFiles = rows.Select(a => a.FunctionFilePath).Distinct(StringComparer.OrdinalIgnoreCase).Count();
        var distinctFunctions = rows.Select(a => a.FunctionId).Distinct(StringComparer.OrdinalIgnoreCase).Count();
        _impactSummaryLabel.Text =
            $"수정 함수 {writeCount:N0}개 / 전체 접근 {totalCount:N0}건 · " +
            $"현재 표시 {rows.Count:N0}건 · 함수 {distinctFunctions:N0}개 · 파일 {distinctFiles:N0}개 — " +
            "더블클릭: 함수 위치 열기";

        var index = 1;
        foreach (var access in rows)
        {
            var tableName = tableMap.TryGetValue(access.TableId, out var table) ? table.Name : access.TableId;
            var item = new ListViewItem(index.ToString());
            item.SubItems.Add(tableName);
            item.SubItems.Add(access.FunctionDisplayName);
            item.SubItems.Add(FormatOperations(access.Operations));
            item.SubItems.Add(FormatPattern(access.Pattern));
            item.SubItems.Add(access.FunctionFilePath);
            item.SubItems.Add(access.FunctionLineNumber.ToString());
            item.Tag = access;
            item.ToolTipText = $"{access.FunctionFullName} · {access.FunctionFilePath}:{access.FunctionLineNumber}";
            _impactList.Items.Add(item);
            index++;
        }

        _impactList.EndUpdate();
    }

    private void RebuildCatalogList()
    {
        _catalogList.BeginUpdate();
        _catalogList.Items.Clear();
        _catalogAccessList.Items.Clear();
        _selectedCatalog = null;

        if (_schema is null || _schema.Catalogs.Count == 0)
        {
            _catalogSummaryLabel.Text = _isAnalyzing
                ? "DB 인스턴스 분석 중..."
                : "검출된 DB 인스턴스(연결·카탈로그)가 없습니다.";
            _catalogList.EndUpdate();
            return;
        }

        var totalFunctions = _schema.CatalogAccesses.Select(a => a.FunctionId).Distinct(StringComparer.Ordinal).Count();
        _catalogSummaryLabel.Text =
            $"DB 인스턴스 {_schema.Catalogs.Count:N0}개 · 접근 {_schema.CatalogAccesses.Count:N0}건 · 함수 {totalFunctions:N0}개";

        var index = 1;
        foreach (var catalog in _schema.Catalogs)
        {
            var accessorCount = _schema.GetCatalogAccessesFor(catalog.Id).Count;
            var item = new ListViewItem(index.ToString());
            item.SubItems.Add(catalog.Name);
            item.SubItems.Add(accessorCount.ToString());
            item.SubItems.Add(catalog.Dialect == DatabaseDialect.Unknown ? "-" : catalog.Dialect.ToString());
            item.SubItems.Add(FormatCatalogSourceKind(catalog.SourceKind));
            item.Tag = catalog;
            _catalogList.Items.Add(item);
            index++;
        }

        if (_catalogList.Items.Count > 0)
        {
            _catalogList.Items[0].Selected = true;
        }

        _catalogList.EndUpdate();
    }

    private void ShowSelectedCatalog()
    {
        _catalogAccessList.BeginUpdate();
        _catalogAccessList.Items.Clear();

        if (_catalogList.SelectedItems.Count == 0
            || _catalogList.SelectedItems[0].Tag is not DatabaseCatalog catalog)
        {
            _selectedCatalog = null;
            _catalogAccessList.EndUpdate();
            return;
        }

        _selectedCatalog = catalog;
        var accesses = _schema?.GetCatalogAccessesFor(catalog.Id) ?? [];
        var row = 1;
        foreach (var access in accesses)
        {
            var item = new ListViewItem(row.ToString());
            item.SubItems.Add(access.FunctionDisplayName);
            item.SubItems.Add(FormatCatalogAccessKind(access.Kind));
            item.SubItems.Add(FormatOperations(access.Operations));
            item.SubItems.Add(FormatCatalogPattern(access.Pattern));
            item.SubItems.Add(Path.GetFileName(access.FunctionFilePath));
            item.SubItems.Add(access.FunctionLineNumber.ToString());
            item.Tag = access;
            _catalogAccessList.Items.Add(item);
            row++;
        }

        _catalogAccessList.EndUpdate();
    }

    private void OpenSelectedCatalogAccessor()
    {
        if (_catalogAccessList.SelectedItems.Count > 0
            && _catalogAccessList.SelectedItems[0].Tag is DatabaseCatalogAccess access)
        {
            SourceFileOpener.TryOpen(access.FunctionFilePath, access.FunctionLineNumber);
            return;
        }

        if (_selectedCatalog is not null
            && !string.IsNullOrWhiteSpace(_selectedCatalog.FilePath)
            && File.Exists(_selectedCatalog.FilePath))
        {
            SourceFileOpener.TryOpen(_selectedCatalog.FilePath, Math.Max(1, _selectedCatalog.LineNumber));
        }
    }

    private void OpenSelectedImpactFunction()
    {
        if (_impactList.SelectedItems.Count == 0
            || _impactList.SelectedItems[0].Tag is not DatabaseTableAccess access)
        {
            return;
        }

        SourceFileOpener.TryOpen(access.FunctionFilePath, access.FunctionLineNumber);
    }

    private void ResetAccessTabTitles()
    {
        if (_tableAccessTab is not null) _tableAccessTab.Text = "테이블 접근";
        if (_columnAccessTab is not null) _columnAccessTab.Text = "필드 접근";
        if (_entryAccessTab is not null) _entryAccessTab.Text = "엔트리 접근";
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
        if (_selected is null || string.IsNullOrWhiteSpace(_selected.FilePath))
        {
            return;
        }

        SourceFileOpener.TryOpen(_selected.FilePath, Math.Max(1, _selected.LineNumber));
    }

    private void OpenSelectedAccessor()
    {
        if (_accessorList.SelectedItems.Count == 0
            || _accessorList.SelectedItems[0].Tag is not DatabaseTableAccess access)
        {
            return;
        }

        SourceFileOpener.TryOpen(access.FunctionFilePath, access.FunctionLineNumber);
    }

    private string BuildPreview(DatabaseTable table)
    {
        var accessorCount = _schema?.GetAccessesFor(table.Id).Count ?? 0;
        var colAccesses = _schema?.GetColumnAccessesFor(table.Id) ?? [];
        var distinctCols = colAccesses.Select(ca => ca.ColumnName).Distinct(StringComparer.OrdinalIgnoreCase).Count();
        var builder = new System.Text.StringBuilder();
        builder.AppendLine($"테이블: {FormatQualifiedName(table)}");
        if (!string.IsNullOrWhiteSpace(table.EntityTypeName))
        {
            builder.AppendLine($"엔티티: {table.EntityTypeName}");
        }

        builder.AppendLine($"테이블 접근: {accessorCount}개 함수");
        builder.AppendLine($"필드 접근: {colAccesses.Count}건 ({distinctCols}개 필드)");
        builder.AppendLine($"출처: {FormatSourceKind(table.SourceKind)}");
        if (!string.IsNullOrWhiteSpace(table.FilePath))
        {
            builder.AppendLine($"위치: {FormatDisplayPath(table.FilePath)}:{table.LineNumber}");
        }

        builder.AppendLine($"컬럼: {table.Columns.Count}개");
        if (table.Columns.Count > 0)
        {
            builder.AppendLine();
            builder.AppendLine("컬럼:");
            foreach (var column in table.Columns.Take(20))
            {
                var flags = new List<string>();
                if (column.IsPrimaryKey) flags.Add("PK");
                if (column.IsForeignKey) flags.Add("FK");
                if (!column.IsNullable) flags.Add("NOT NULL");
                var flagText = flags.Count > 0 ? $" ({string.Join(", ", flags)})" : string.Empty;
                builder.AppendLine($"  · {column.Name}: {column.DataType}{flagText}");
            }

            if (table.Columns.Count > 20)
            {
                builder.AppendLine($"  ... 외 {table.Columns.Count - 20}개");
            }
        }

        return builder.ToString();
    }

    private static string BuildTooltip(DatabaseTable table, int accessorCount)
    {
        var entity = string.IsNullOrWhiteSpace(table.EntityTypeName) ? string.Empty : $" · {table.EntityTypeName}";
        return $"{FormatQualifiedName(table)}{entity} · 접근 {accessorCount}개";
    }

    private static string FormatQualifiedName(DatabaseTable table) =>
        string.IsNullOrWhiteSpace(table.Schema) ? table.Name : $"{table.Schema}.{table.Name}";

    private static string FormatAccessKind(DatabaseTableAccessKind kind) => kind switch
    {
        DatabaseTableAccessKind.Write => "쓰기",
        DatabaseTableAccessKind.ReadWrite => "읽기/쓰기",
        _ => "읽기"
    };

    private static string FormatOperations(DatabaseCrudOperation operations)
    {
        if (operations == DatabaseCrudOperation.None)
        {
            return "-";
        }

        var parts = new List<string>(4);
        if (operations.HasFlag(DatabaseCrudOperation.Create)) parts.Add("C");
        if (operations.HasFlag(DatabaseCrudOperation.Read)) parts.Add("R");
        if (operations.HasFlag(DatabaseCrudOperation.Update)) parts.Add("U");
        if (operations.HasFlag(DatabaseCrudOperation.Delete)) parts.Add("D");
        return string.Join(" ", parts);
    }

    private static string FormatOperation(DatabaseCrudOperation operation) => operation switch
    {
        DatabaseCrudOperation.Create => "Create",
        DatabaseCrudOperation.Read => "Read",
        DatabaseCrudOperation.Update => "Update",
        DatabaseCrudOperation.Delete => "Delete",
        _ => "-"
    };

    private static string FormatPattern(DatabaseTableAccessPattern pattern) => pattern switch
    {
        DatabaseTableAccessPattern.EntityFramework => "EF",
        DatabaseTableAccessPattern.EntityType => "엔티티",
        _ => "SQL"
    };

    private static string FormatSourceKind(string sourceKind) => sourceKind switch
    {
        "ef-core" => "EF Core",
        "jpa" => "JPA",
        "prisma" => "Prisma",
        "orm-decorator" => "TypeORM/Sequelize",
        "sql-script" => "SQL",
        "sql-in-code" => "SQL 코드",
        _ => string.IsNullOrWhiteSpace(sourceKind) ? "-" : sourceKind
    };

    private static string FormatCatalogSourceKind(string sourceKind) => sourceKind switch
    {
        "connection-string" => "연결 문자열",
        "sqlite-file" => "SQLite 파일",
        "sql-create" => "CREATE DATABASE",
        "sql-use" => "USE",
        "sql-attach" => "ATTACH",
        "api" => "DB API",
        _ => string.IsNullOrWhiteSpace(sourceKind) ? "-" : sourceKind
    };

    private static string FormatCatalogAccessKind(DatabaseCatalogAccessKind kind) => kind switch
    {
        DatabaseCatalogAccessKind.Connect => "연결",
        DatabaseCatalogAccessKind.Select => "선택",
        DatabaseCatalogAccessKind.Admin => "관리",
        _ => kind.ToString()
    };

    private static string FormatCatalogPattern(DatabaseCatalogAccessPattern pattern) => pattern switch
    {
        DatabaseCatalogAccessPattern.ConnectionString => "연결 문자열",
        DatabaseCatalogAccessPattern.Api => "API",
        _ => "SQL"
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

    private void ApplySplitLayout()
    {
        ApplyTableFieldSplitLayout();
        ApplyCatalogSplitLayout();
    }

    /// <summary>
    /// 테이블·필드 탭: 테이블 목록 · 미리보기·버튼 · 접근 ListView를 세 구역으로 균등(≈1/3) 배분합니다.
    /// </summary>
    private void ApplyTableFieldSplitLayout()
    {
        var height = _split.Height;
        var splitterTotal = _split.SplitterWidth + _detailSplit.SplitterWidth;
        var minTotal = splitterTotal + ZoneMinHeight * 3;
        if (height < minTotal)
        {
            return;
        }

        ClearSplitMinSizes(_split);
        ClearSplitMinSizes(_detailSplit);

        var zoneHeight = (height - splitterTotal) / 3;
        var maxZone = height - splitterTotal - ZoneMinHeight * 2;
        zoneHeight = Math.Clamp(zoneHeight, ZoneMinHeight, maxZone);

        if (Math.Abs(_split.SplitterDistance - zoneHeight) > 2)
        {
            _split.SplitterDistance = zoneHeight;
        }

        if (Math.Abs(_detailSplit.SplitterDistance - zoneHeight) > 2)
        {
            _detailSplit.SplitterDistance = zoneHeight;
        }
    }

    private void ApplyCatalogSplitLayout()
    {
        var height = _catalogSplit.Height;
        if (height <= _catalogSplit.SplitterWidth + ZoneMinHeight * 2)
        {
            return;
        }

        ClearSplitMinSizes(_catalogSplit);

        var half = (height - _catalogSplit.SplitterWidth) / 2;
        var desired = Math.Clamp(half, ZoneMinHeight, height - ZoneMinHeight - _catalogSplit.SplitterWidth);
        if (Math.Abs(_catalogSplit.SplitterDistance - desired) > 2)
        {
            _catalogSplit.SplitterDistance = desired;
        }
    }

    private static void ClearSplitMinSizes(SplitContainer split)
    {
        try
        {
            if (split.Panel1MinSize != 0)
            {
                split.Panel1MinSize = 0;
            }

            if (split.Panel2MinSize != 0)
            {
                split.Panel2MinSize = 0;
            }
        }
        catch (InvalidOperationException)
        {
        }
    }

    private void AdjustColumnWidths()
    {
        if (_tableList.Columns.Count < 9 || _tableList.ClientSize.Width <= 0)
        {
            return;
        }

        const int fixedWidth = 40 + 120 + 100 + 72 + 52 + 72 + 72 + 44;
        var fileWidth = Math.Max(100, _tableList.ClientSize.Width - fixedWidth - 8);
        _tableList.Columns[7].Width = fileWidth;
    }
}
