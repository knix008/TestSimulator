using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

public sealed class DatabaseTableViewer : UserControl
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

    public event Action<MetricsNavigationRequest>? NavigationRequested;
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
        _tableList.Columns.Add("컬럼", 52, HorizontalAlignment.Right);
        _tableList.Columns.Add("출처", 72);
        _tableList.Columns.Add("파일", 140);
        _tableList.Columns.Add("줄", 44, HorizontalAlignment.Right);
        _tableList.SelectedIndexChanged += (_, _) => ShowSelectedTable();
        _tableList.DoubleClick += (_, _) => ShowAccessGraphForSelected();

        _accessorList.Columns.Add("#", 36);
        _accessorList.Columns.Add("함수", 160);
        _accessorList.Columns.Add("파일", 180);
        _accessorList.Columns.Add("줄", 44, HorizontalAlignment.Right);
        _accessorList.Columns.Add("접근", 72);
        _accessorList.Columns.Add("패턴", 72);
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
        _showGraphButton.Location = new Point(168, 8);
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

        _split.Panel1.Controls.Add(_tableList);
        _split.Panel2.Controls.Add(_detailSplit);

        Controls.Add(_split);
        Controls.Add(_summaryLabel);

        Load += (_, _) => ApplySplitLayout();
        SizeChanged += (_, _) => ApplySplitLayout();
    }

    public void SetSchema(DatabaseSchemaResult? schema, string? projectRoot = null)
    {
        _schema = schema;
        _projectRoot = projectRoot;
        RebuildList();
    }

    public DatabaseTable? SelectedTable => _selected;

    public void BeginAnalysis()
    {
        _isAnalyzing = true;
        _schema = null;
        _selected = null;
        _tableList.Items.Clear();
        _accessorList.Items.Clear();
        _previewBox.Clear();
        _openFileButton.Enabled = false;
        _showGraphButton.Enabled = false;
        _summaryLabel.Text = "DB 테이블·접근 분석 중...";
    }

    public void EndAnalysis() => _isAnalyzing = false;

    private void RebuildList()
    {
        _tableList.BeginUpdate();
        _tableList.Items.Clear();
        _accessorList.Items.Clear();
        _previewBox.Clear();
        _selected = null;
        _openFileButton.Enabled = false;
        _showGraphButton.Enabled = false;

        if (_schema is null || _schema.Tables.Count == 0)
        {
            _summaryLabel.Text = _isAnalyzing
                ? "DB 테이블·접근 분석 중..."
                : "표시할 DB 테이블이 없습니다. SQL·EF Core·SQL 문자열 분석 후 결과가 여기에 표시됩니다.";
            _tableList.EndUpdate();
            return;
        }

        var totalAccessors = _schema.Accesses.Select(access => access.FunctionId).Distinct(StringComparer.Ordinal).Count();
        _summaryLabel.Text =
            $"DB 테이블 {_schema.Tables.Count:N0}개 · 접근 함수 {totalAccessors:N0}개 · 접근 {_schema.Accesses.Count:N0}건 · " +
            "테이블 더블클릭/우클릭: 접근 함수 그래프";

        var index = 1;
        foreach (var table in _schema.Tables)
        {
            var accessorCount = _schema.GetAccessesFor(table.Id).Count;
            var item = new ListViewItem(index.ToString());
            item.SubItems.Add(table.Name);
            item.SubItems.Add(string.IsNullOrWhiteSpace(table.EntityTypeName) ? "-" : table.EntityTypeName);
            item.SubItems.Add(accessorCount.ToString());
            item.SubItems.Add(table.Columns.Count.ToString());
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
            _accessorHeaderLabel.Text = "접근 함수";
            return;
        }

        _selected = table;
        _openFileButton.Enabled = !string.IsNullOrWhiteSpace(table.FilePath) && File.Exists(table.FilePath);
        _showGraphButton.Enabled = true;
        _previewBox.Text = BuildPreview(table);
        RebuildAccessorList(table);
    }

    private void RebuildAccessorList(DatabaseTable table)
    {
        _accessorList.BeginUpdate();
        _accessorList.Items.Clear();

        var accesses = _schema?.GetAccessesFor(table.Id) ?? [];
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
            item.SubItems.Add(FormatPattern(access.Pattern));
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
        if (_selected is null || string.IsNullOrWhiteSpace(_selected.FilePath))
        {
            return;
        }

        NavigationRequested?.Invoke(new MetricsNavigationRequest
        {
            FilePath = _selected.FilePath,
            LineNumber = Math.Max(1, _selected.LineNumber)
        });
    }

    private void OpenSelectedAccessor()
    {
        if (_accessorList.SelectedItems.Count == 0
            || _accessorList.SelectedItems[0].Tag is not DatabaseTableAccess access)
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

    private string BuildPreview(DatabaseTable table)
    {
        var accessorCount = _schema?.GetAccessesFor(table.Id).Count ?? 0;
        var builder = new System.Text.StringBuilder();
        builder.AppendLine($"테이블: {FormatQualifiedName(table)}");
        if (!string.IsNullOrWhiteSpace(table.EntityTypeName))
        {
            builder.AppendLine($"엔티티: {table.EntityTypeName}");
        }

        builder.AppendLine($"접근 함수: {accessorCount}개");
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

    private static string FormatPattern(DatabaseTableAccessPattern pattern) => pattern switch
    {
        DatabaseTableAccessPattern.EntityFramework => "EF",
        DatabaseTableAccessPattern.EntityType => "엔티티",
        _ => "SQL"
    };

    private static string FormatSourceKind(string sourceKind) => sourceKind switch
    {
        "ef-core" => "EF Core",
        "sql-script" => "SQL",
        "sql-in-code" => "SQL 코드",
        _ => string.IsNullOrWhiteSpace(sourceKind) ? "-" : sourceKind
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
        if (_tableList.Columns.Count < 8 || _tableList.ClientSize.Width <= 0)
        {
            return;
        }

        const int fixedWidth = 40 + 120 + 100 + 72 + 52 + 72 + 44;
        var fileWidth = Math.Max(100, _tableList.ClientSize.Width - fixedWidth - 8);
        _tableList.Columns[6].Width = fileWidth;
    }
}
