using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

/// <summary>분석 포함·제외 항목과 항목별 경고 기준을 한 곳에서 설정합니다.</summary>
public sealed class AnalysisSettingsDialog : Form
{
    private const int CheckColumnWidth = 32;
    private const int ComparisonColumnWidth = 24;
    private const int ThresholdColumnWidth = 84;
    private const int ItemRowHeight = 24;
    private const int GroupRowHeight = 22;
    private const int HeaderRowHeight = 24;
    private const int MinNameColumnWidth = 88;
    private const int ListHostHorizontalPadding = 20;
    private const int NameColumnPadding = 10;

    private sealed class InspectionRow
    {
        public required MetricInspectionOption Option { get; init; }
        public required CheckBox EnabledCheck { get; init; }
        public NumericUpDown? ThresholdInput { get; init; }
    }

    private readonly List<InspectionRow> _rows = [];
    private readonly ToolTip _toolTip = QualityThresholdToolTipHelper.CreateToolTip();
    private readonly TableLayoutPanel _grid;
    private readonly TableLayoutPanel _headerGrid;
    private readonly Panel _headerHost;
    private readonly Panel _scrollHost;
    private readonly Panel _listHost;
    private bool _suppressDupSync;
    private bool _layoutUpdateScheduled;

    public UserAnalysisSettings Settings { get; private set; }

    public AnalysisSettingsDialog(UserAnalysisSettings settings)
    {
        Settings = UserAnalysisSettings.CloneThresholds(settings);
        Settings.EnabledInspections = MetricInspectionCatalog.NormalizeScope(Settings.EnabledInspections);

        Text = "분석 설정";
        StartPosition = FormStartPosition.CenterParent;
        var preferredWidth = CalculatePreferredClientWidth();
        ClientSize = new Size(preferredWidth, 580);
        MinimumSize = new Size(CalculateMinimumClientWidth(), 400);
        FormBorderStyle = FormBorderStyle.Sizable;
        MaximizeBox = true;
        MinimizeBox = false;
        ShowInTaskbar = false;
        ShowIcon = false;
        Padding = new Padding(0);

        var topBar = CreateTopBar();
        var hintLabel = CreateHintLabel();
        var footer = CreateFooter(out var okButton, out var cancelButton);

        _headerGrid = CreateHeaderGrid();
        _headerGrid.Dock = DockStyle.Fill;
        _headerHost = new Panel
        {
            Dock = DockStyle.Top,
            Height = HeaderRowHeight,
            Margin = Padding.Empty,
            Padding = Padding.Empty
        };
        _headerHost.Controls.Add(_headerGrid);

        _grid = CreateBodyGrid();
        BuildRows(_grid);

        _scrollHost = new Panel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            Padding = new Padding(0, 0, 0, 4)
        };
        _grid.Dock = DockStyle.Top;
        _grid.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _scrollHost.Controls.Add(_grid);

        _listHost = new Panel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(10, 0, 10, 0)
        };
        _listHost.Controls.Add(_scrollHost);
        _listHost.Controls.Add(_headerHost);

        WireDuplicateCodeSync();

        Controls.Add(_listHost);
        Controls.Add(footer);
        Controls.Add(hintLabel);
        Controls.Add(topBar);

        AcceptButton = okButton;
        CancelButton = cancelButton;

        _listHost.Resize += (_, _) => ScheduleGridLayout();
        _scrollHost.Resize += (_, _) => ScheduleGridLayout();
        Shown += (_, _) =>
        {
            ScheduleGridLayout();
            BeginInvoke(ScheduleGridLayout);
        };
        Resize += (_, _) => ScheduleGridLayout();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _toolTip.Dispose();
        }

        base.Dispose(disposing);
    }

    private FlowLayoutPanel CreateTopBar()
    {
        var topBar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            Padding = new Padding(12, 10, 12, 4),
            WrapContents = false
        };

        var selectAllButton = new Button
        {
            Text = "모두 선택",
            AutoSize = true,
            Margin = new Padding(0, 0, 8, 0)
        };
        selectAllButton.Click += (_, _) => SetAllChecked(true);

        var clearAllButton = new Button
        {
            Text = "모두 해제",
            AutoSize = true,
            Margin = new Padding(0, 0, 8, 0)
        };
        clearAllButton.Click += (_, _) => SetAllChecked(false);

        topBar.Controls.Add(selectAllButton);
        topBar.Controls.Add(clearAllButton);
        return topBar;
    }

    private static Label CreateHintLabel()
    {
        return new Label
        {
            Dock = DockStyle.Top,
            AutoSize = false,
            Height = 52,
            Padding = new Padding(16, 0, 16, 8),
            ForeColor = Color.DimGray,
            Text =
                "체크된 항목만 분석·표시·경고에 사용됩니다. 기준이 있는 항목은 오른쪽에서 임계값을 설정하세요.\r\n" +
                "폴더 제외는 메인 화면 「하위 디렉터리」에서 설정합니다."
        };
    }

    private Panel CreateFooter(out Button okButton, out Button cancelButton)
    {
        var footer = new Panel
        {
            Dock = DockStyle.Bottom,
            Height = 48,
            Padding = new Padding(12, 8, 12, 8)
        };

        okButton = new Button
        {
            Text = "확인",
            DialogResult = DialogResult.OK,
            Size = new Size(88, 30),
            Anchor = AnchorStyles.Top | AnchorStyles.Right
        };
        okButton.Click += (_, _) =>
        {
            if (!TryCommitSelection())
            {
                DialogResult = DialogResult.None;
            }
        };

        cancelButton = new Button
        {
            Text = "취소",
            DialogResult = DialogResult.Cancel,
            Size = new Size(88, 30),
            Anchor = AnchorStyles.Top | AnchorStyles.Right
        };

        footer.Controls.Add(cancelButton);
        footer.Controls.Add(okButton);

        var confirmButton = okButton;
        var dismissButton = cancelButton;
        footer.Resize += (_, _) =>
        {
            confirmButton.Location = new Point(footer.ClientSize.Width - confirmButton.Width, 8);
            dismissButton.Location = new Point(confirmButton.Left - dismissButton.Width - 8, 8);
        };

        return footer;
    }

    private static TableLayoutPanel CreateHeaderGrid()
    {
        var headerGrid = new TableLayoutPanel
        {
            Height = HeaderRowHeight,
            ColumnCount = 4,
            RowCount = 1,
            Margin = Padding.Empty,
            Padding = Padding.Empty,
            BackColor = Color.FromArgb(245, 247, 250),
            GrowStyle = TableLayoutPanelGrowStyle.FixedSize
        };

        headerGrid.RowStyles.Add(new RowStyle(SizeType.Absolute, HeaderRowHeight));
        InitializeColumnStyles(headerGrid);

        AddHeaderCell(headerGrid, "사용", 0, ContentAlignment.MiddleCenter);
        AddHeaderCell(headerGrid, "항목", 1, ContentAlignment.MiddleLeft);
        AddHeaderCell(headerGrid, string.Empty, 2, ContentAlignment.MiddleCenter);
        AddHeaderCell(headerGrid, "기준", 3, ContentAlignment.MiddleCenter);
        return headerGrid;
    }

    private static TableLayoutPanel CreateBodyGrid()
    {
        var grid = new TableLayoutPanel
        {
            AutoSize = false,
            ColumnCount = 4,
            Margin = Padding.Empty,
            Padding = Padding.Empty,
            GrowStyle = TableLayoutPanelGrowStyle.AddRows
        };
        InitializeColumnStyles(grid);
        return grid;
    }

    private static void InitializeColumnStyles(TableLayoutPanel grid)
    {
        grid.ColumnStyles.Clear();
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, CheckColumnWidth));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, ComparisonColumnWidth));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, ThresholdColumnWidth));
    }

    private static void AddHeaderCell(
        TableLayoutPanel panel,
        string text,
        int column,
        ContentAlignment align)
    {
        var label = new Label
        {
            Text = text,
            Dock = DockStyle.Fill,
            TextAlign = align,
            AutoEllipsis = true,
            Font = new Font(SystemFonts.DefaultFont, FontStyle.Bold),
            ForeColor = Color.FromArgb(55, 65, 80),
            Margin = Padding.Empty
        };
        panel.Controls.Add(label, column, 0);
    }

    private void BuildRows(TableLayoutPanel grid)
    {
        var normalized = Settings.EnabledInspections;
        string? currentGroup = null;
        var rowIndex = 0;

        foreach (var option in MetricInspectionCatalog.Options)
        {
            if (!string.Equals(currentGroup, option.Group, StringComparison.Ordinal))
            {
                currentGroup = option.Group;
                AddGroupRow(grid, ref rowIndex, option.Group);
            }

            AddItemRow(grid, ref rowIndex, option, normalized);
        }
    }

    private static int CalculateGridHeight(TableLayoutPanel grid)
    {
        var height = 0;
        foreach (RowStyle row in grid.RowStyles)
        {
            height += (int)row.Height;
        }

        return height;
    }

    private void AddGroupRow(TableLayoutPanel grid, ref int rowIndex, string groupName)
    {
        var label = new Label
        {
            Text = groupName,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            AutoEllipsis = true,
            Font = new Font(SystemFonts.DefaultFont, FontStyle.Bold),
            ForeColor = Color.FromArgb(35, 70, 120),
            BackColor = Color.FromArgb(232, 240, 252),
            Margin = Padding.Empty,
            Padding = new Padding(8, 0, 0, 0)
        };

        AddRowStyle(grid, rowIndex, GroupRowHeight);
        grid.Controls.Add(label, 0, rowIndex);
        grid.SetColumnSpan(label, 4);
        rowIndex++;
    }

    private void AddItemRow(
        TableLayoutPanel grid,
        ref int rowIndex,
        MetricInspectionOption option,
        MetricInspectionKind normalized)
    {
        var enabledCheck = new CheckBox
        {
            AutoSize = true,
            Checked = MetricInspectionCatalog.IsEnabled(normalized, option.Kind),
            Margin = Padding.Empty
        };
        var checkHost = CenterInCell(enabledCheck);

        var nameLabel = new Label
        {
            Text = option.Label,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            AutoEllipsis = true,
            AutoSize = false,
            Margin = new Padding(2, 0, 4, 0)
        };
        _toolTip.SetToolTip(nameLabel, option.Label);

        AddRowStyle(grid, rowIndex, ItemRowHeight);

        if (MetricInspectionThresholdCatalog.TryGetSpec(option.Kind, out var spec)
            && spec.Comparison != ThresholdComparisonKind.None)
        {
            var comparisonLabel = new Label
            {
                Text = MetricInspectionThresholdCatalog.FormatComparisonPrefix(spec.Comparison),
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleCenter,
                ForeColor = Color.FromArgb(80, 90, 100),
                AutoEllipsis = true,
                Margin = Padding.Empty
            };

            var thresholdInput = new NumericUpDown
            {
                Minimum = spec.Minimum,
                Maximum = spec.Maximum,
                DecimalPlaces = spec.DecimalPlaces,
                Increment = spec.DecimalPlaces > 0 ? 0.1m : 1m,
                TextAlign = HorizontalAlignment.Right,
                Dock = DockStyle.Fill,
                Margin = new Padding(0, 2, 0, 2),
                Value = Math.Clamp(spec.GetValue(Settings), spec.Minimum, spec.Maximum)
            };

            var toolTipText = spec.ToolTip;
            _toolTip.SetToolTip(thresholdInput, toolTipText);
            _toolTip.SetToolTip(comparisonLabel, toolTipText);

            grid.Controls.Add(checkHost, 0, rowIndex);
            grid.Controls.Add(nameLabel, 1, rowIndex);
            grid.Controls.Add(comparisonLabel, 2, rowIndex);
            grid.Controls.Add(thresholdInput, 3, rowIndex);

            _rows.Add(new InspectionRow
            {
                Option = option,
                EnabledCheck = enabledCheck,
                ThresholdInput = thresholdInput
            });
        }
        else
        {
            _toolTip.SetToolTip(nameLabel, "이 항목은 별도 경고 임계값이 없습니다.");

            var placeholder = new Label
            {
                Text = "—",
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleCenter,
                ForeColor = Color.Silver,
                Margin = Padding.Empty
            };

            grid.Controls.Add(checkHost, 0, rowIndex);
            grid.Controls.Add(nameLabel, 1, rowIndex);
            grid.Controls.Add(placeholder, 2, rowIndex);
            grid.SetColumnSpan(placeholder, 2);

            _rows.Add(new InspectionRow
            {
                Option = option,
                EnabledCheck = enabledCheck,
                ThresholdInput = null
            });
        }

        rowIndex++;
    }

    private static void AddRowStyle(TableLayoutPanel grid, int rowIndex, int height)
    {
        while (grid.RowStyles.Count <= rowIndex)
        {
            grid.RowStyles.Add(new RowStyle(SizeType.Absolute, height));
        }

        grid.RowStyles[rowIndex] = new RowStyle(SizeType.Absolute, height);
        grid.RowCount = Math.Max(grid.RowCount, rowIndex + 1);
    }

    private static Panel CenterInCell(Control control)
    {
        var host = new Panel
        {
            Dock = DockStyle.Fill,
            Margin = Padding.Empty
        };
        host.Controls.Add(control);

        void LayoutControl()
        {
            control.Left = Math.Max(0, (host.ClientSize.Width - control.Width) / 2);
            control.Top = Math.Max(0, (host.ClientSize.Height - control.Height) / 2);
        }

        host.Resize += (_, _) => LayoutControl();
        host.HandleCreated += (_, _) => LayoutControl();
        return host;
    }

    private void ScheduleGridLayout()
    {
        if (_layoutUpdateScheduled || IsDisposed || !IsHandleCreated)
        {
            return;
        }

        _layoutUpdateScheduled = true;
        BeginInvoke(UpdateGridLayout);
    }

    private void UpdateGridLayout()
    {
        _layoutUpdateScheduled = false;
        if (IsDisposed || !_listHost.IsHandleCreated || _listHost.ClientSize.Width <= 0)
        {
            return;
        }

        var gridHeight = CalculateGridHeight(_grid);
        var needsVerticalScroll = _scrollHost.ClientSize.Height > 0 && gridHeight > _scrollHost.ClientSize.Height;
        var scrollbarWidth = needsVerticalScroll ? SystemInformation.VerticalScrollBarWidth : 0;

        _headerHost.Padding = new Padding(0, 0, scrollbarWidth, 0);
        _scrollHost.Padding = new Padding(0, 0, scrollbarWidth, 4);

        var contentWidth = _scrollHost.ClientSize.Width;
        if (contentWidth > 0)
        {
            _grid.Width = contentWidth;
            _grid.Height = gridHeight;
        }

        _scrollHost.AutoScrollMinSize = new Size(0, gridHeight);
        _scrollHost.HorizontalScroll.Enabled = false;
        _headerHost.PerformLayout();
        _headerGrid.PerformLayout();
        _grid.PerformLayout();
    }

    private static int CalculatePreferredClientWidth()
    {
        var maxTextWidth = MeasureWidestLabelText();
        var gridWidth = FixedGridColumnWidth() + maxTextWidth + NameColumnPadding;
        return gridWidth + ListHostHorizontalPadding;
    }

    private static int CalculateMinimumClientWidth() =>
        FixedGridColumnWidth() + MinNameColumnWidth + ListHostHorizontalPadding;

    private static int FixedGridColumnWidth() =>
        CheckColumnWidth + ComparisonColumnWidth + ThresholdColumnWidth;

    private static int MeasureWidestLabelText()
    {
        var font = SystemFonts.DefaultFont;
        var maxWidth = 0;

        foreach (var option in MetricInspectionCatalog.Options)
        {
            maxWidth = Math.Max(maxWidth, MeasureTextWidth(option.Label, font));
            maxWidth = Math.Max(maxWidth, MeasureTextWidth(option.Group, font));
        }

        maxWidth = Math.Max(maxWidth, MeasureTextWidth("기준", font));
        return maxWidth;
    }

    private static int MeasureTextWidth(string text, Font font) =>
        TextRenderer.MeasureText(
            text,
            font,
            Size.Empty,
            TextFormatFlags.NoPadding | TextFormatFlags.SingleLine).Width;

    private void WireDuplicateCodeSync()
    {
        var dupGroupsIdx = FindOptionIndex(MetricInspectionKind.DuplicateCodeGroups);
        var fileDupIdx = FindOptionIndex(MetricInspectionKind.FileDuplicateLines);

        foreach (var row in _rows)
        {
            row.EnabledCheck.CheckedChanged += (_, _) =>
            {
                if (_suppressDupSync)
                {
                    return;
                }

                var idx = _rows.IndexOf(row);
                if (idx != dupGroupsIdx && idx != fileDupIdx)
                {
                    return;
                }

                var otherIdx = idx == dupGroupsIdx ? fileDupIdx : dupGroupsIdx;
                _suppressDupSync = true;
                try
                {
                    _rows[otherIdx].EnabledCheck.Checked = row.EnabledCheck.Checked;
                }
                finally
                {
                    _suppressDupSync = false;
                }
            };
        }
    }

    private int FindOptionIndex(MetricInspectionKind kind) =>
        _rows.FindIndex(row => row.Option.Kind == kind);

    private void SetAllChecked(bool check)
    {
        foreach (var row in _rows)
        {
            row.EnabledCheck.Checked = check;
        }
    }

    private bool TryCommitSelection()
    {
        var kinds = new List<MetricInspectionKind>();
        foreach (var row in _rows)
        {
            if (row.EnabledCheck.Checked)
            {
                kinds.Add(row.Option.Kind);
            }
        }

        if (kinds.Count == 0)
        {
            MessageBox.Show(this, "최소 한 개 이상의 분석 항목을 선택하세요.", "분석 설정", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return false;
        }

        var next = UserAnalysisSettings.CloneThresholds(Settings);
        next.EnabledInspections = MetricInspectionCatalog.FromCheckedKinds(kinds);

        foreach (var row in _rows)
        {
            if (row.ThresholdInput is null
                || !MetricInspectionThresholdCatalog.TryGetSpec(row.Option.Kind, out var spec))
            {
                continue;
            }

            spec.SetValue(next, row.ThresholdInput.Value);
        }

        Settings = next;
        return true;
    }
}
