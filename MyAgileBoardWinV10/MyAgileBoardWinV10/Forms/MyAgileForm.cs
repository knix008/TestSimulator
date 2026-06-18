using System.Text.Json;
using MyAgileBoardWinV10.Controls;
using MyAgileBoardWinV10.Models;
using MyAgileBoardWinV10.Services;
using MyAgileBoardWinV10.Utils;

namespace MyAgileBoardWinV10.Forms;

public partial class MyAgileForm : Form
{
    protected override CreateParams CreateParams
    {
        get
        {
            const int WS_EX_COMPOSITED = 0x02000000;
            var cp = base.CreateParams;
            cp.ExStyle |= WS_EX_COMPOSITED;
            return cp;
        }
    }

    private KanbanProject _project = KanbanProject.CreateDefault();
    private bool _isDirty = false;

    // Column drag state
    private KanbanColumnControl? _draggingColumn;
    private KanbanColumnControl? _selectedColumnControl;
    private Form? _ghostForm;
    private Panel? _dropIndicator;
    private int _lastColumnDropInsertIdx = -1;
    private List<(KanbanColumnControl Col, Rectangle ScreenRect)>? _columnDragHitRects;

    // Card drag state
    private KanbanCard? _draggingCard;
    private KanbanCardControl? _draggingCardControl;
    private int _draggingCardHeight = 56;
    private int _draggingCardWidth = 0;

    // Undo/Redo stacks (JSON snapshots of KanbanProject)
    private readonly Stack<string> _undoStack = new();
    private readonly Stack<string> _redoStack = new();
    // JSON of project at last save/load — used to detect real dirtiness after undo
    private string _savedStateJson = string.Empty;

    // Export UI
    private ToolStripMenuItem menuExport = null!;
    private ToolStripMenuItem menuExportReportMd = null!;
    private ToolStripMenuItem menuExportReportWord = null!;
    private ToolStripMenuItem menuExportReportPdf = null!;
    private ToolStripMenuItem menuExportReportPrint = null!;
    private ToolStripSeparator menuExportSep = null!;
    private ToolStripMenuItem menuExportColumnImages = null!;
    private ToolStripDropDownButton toolBtnExport = null!;

    public MyAgileForm()
    {
        InitializeComponent();
        KeyPreview = true;
        LoadAppIcon();
        SetupIcons();
        SetupExportCommands();
        SetupTooltips();
        SetupAddColumnButton();
        Load += OnFormFirstLoad;
    }

    private void OnFormFirstLoad(object? sender, EventArgs e)
    {
        Load -= OnFormFirstLoad;
        TryLoadLastFile();
        CaptureSavedState();
        UpdateStatusBar();
    }

    private void LoadAppIcon()
    {
        try
        {
            var icoPath = Path.Combine(AppContext.BaseDirectory, "Assets", "MyAgileBoard.ico");
            if (File.Exists(icoPath))
                Icon = new Icon(icoPath);
        }
        catch { /* 아이콘 로드 실패 시 기본 아이콘 사용 */ }
    }

    // ─────────────────────────────────────────────
    //  Icons & Tooltips
    // ─────────────────────────────────────────────

    private void SetupIcons()
    {
        // Toolbar
        toolBtnNew.Image       = IconFactory.Get("new");
        toolBtnOpen.Image      = IconFactory.Get("open");
        toolBtnSave.Image      = IconFactory.Get("save");
        toolBtnUndo.Image      = IconFactory.Get("undo");
        toolBtnRedo.Image      = IconFactory.Get("redo");
        toolBtnSummary.Image   = IconFactory.Get("summary");
        toolBtnCompleted.Image   = IconFactory.Get("check");
        toolBtnBurndown.Image    = IconFactory.Get("burndown");
        toolBtnToggleGrid.Image  = IconFactory.Get("grid");
        menuViewShowGrid.Image   = IconFactory.Get("grid");

        // Menu bar — top-level items
        menuFile.Image    = IconFactory.Get("file");
        menuProject.Image = IconFactory.Get("project");
        menuView.Image    = IconFactory.Get("view");

        // File menu — dropdown items
        menuNew.Image    = IconFactory.Get("new");
        menuOpen.Image   = IconFactory.Get("open");
        menuSave.Image   = IconFactory.Get("save");
        menuSaveAs.Image = IconFactory.Get("saveas");
        menuExit.Image   = IconFactory.Get("exit");

        // Edit menu
        menuUndo.Image = IconFactory.Get("undo");
        menuRedo.Image = IconFactory.Get("redo");

        // Project menu — dropdown items
        menuProjectSettings.Image = IconFactory.Get("settings");

        // View menu — dropdown items
        menuSummary.Image          = IconFactory.Get("summary");
        menuCompletedHistory.Image = IconFactory.Get("check");
        menuBurndown.Image         = IconFactory.Get("burndown");
    }

    private void SetupExportCommands()
    {
        menuExport = new ToolStripMenuItem("보내기(&O)");
        menuExportReportMd = new ToolStripMenuItem("Report — Markdown(&M)...", null, (_, _) => ExportReportMarkdown())
        {
            ShortcutKeys = Keys.Control | Keys.Shift | Keys.M
        };
        menuExportReportWord = new ToolStripMenuItem("Report — Word(&W)...", null, (_, _) => ExportReportWord())
        {
            ShortcutKeys = Keys.Control | Keys.Shift | Keys.W
        };
        menuExportReportPdf = new ToolStripMenuItem("Report — PDF(&P)...", null, (_, _) => ExportReportPdf())
        {
            ShortcutKeys = Keys.Control | Keys.Shift | Keys.P
        };
        menuExportReportPrint = new ToolStripMenuItem("Report 인쇄(&R)...", null, (_, _) => PrintReport())
        {
            ShortcutKeys = Keys.Control | Keys.P
        };
        menuExportSep = new ToolStripSeparator();
        menuExportColumnImages = new ToolStripMenuItem("컬럼 카드 이미지(&I)...", null, (_, _) => ExportColumnImages());

        menuExport.DropDownItems.AddRange(
        [
            menuExportReportMd,
            menuExportReportWord,
            menuExportReportPdf,
            menuExportReportPrint,
            menuExportSep,
            menuExportColumnImages
        ]);

        int projectIndex = menuStrip.Items.IndexOf(menuProject);
        if (projectIndex < 0) projectIndex = menuStrip.Items.Count - 1;
        menuStrip.Items.Insert(projectIndex + 1, menuExport);

        toolBtnExport = new ToolStripDropDownButton("보내기")
        {
            Image = IconFactory.Get("export")
        };
        toolBtnExport.DropDownItems.AddRange(
        [
            new ToolStripMenuItem("Report — Markdown...", IconFactory.Get("report"), (_, _) => ExportReportMarkdown()),
            new ToolStripMenuItem("Report — Word...", IconFactory.Get("report"), (_, _) => ExportReportWord()),
            new ToolStripMenuItem("Report — PDF...", IconFactory.Get("report"), (_, _) => ExportReportPdf()),
            new ToolStripMenuItem("Report 인쇄...", IconFactory.Get("print"), (_, _) => PrintReport()),
            new ToolStripSeparator(),
            new ToolStripMenuItem("컬럼 카드 이미지...", IconFactory.Get("image"), (_, _) => ExportColumnImages())
        ]);

        int summaryIndex = toolStrip.Items.IndexOf(toolBtnSummary);
        if (summaryIndex < 0) summaryIndex = toolStrip.Items.Count;
        toolStrip.Items.Insert(summaryIndex, toolBtnExport);
        toolStrip.Items.Insert(summaryIndex + 1, new ToolStripSeparator());

        menuExport.Image = IconFactory.Get("export");
        menuExportReportMd.Image = IconFactory.Get("report");
        menuExportReportWord.Image = IconFactory.Get("report");
        menuExportReportPdf.Image = IconFactory.Get("report");
        menuExportReportPrint.Image = IconFactory.Get("print");
        menuExportColumnImages.Image = IconFactory.Get("image");
    }

    private void SetupTooltips()
    {
        toolBtnNew.ToolTipText       = "새 프로젝트 만들기 (Ctrl+N)";
        toolBtnOpen.ToolTipText      = "프로젝트 열기 (Ctrl+O)";
        toolBtnSave.ToolTipText      = "저장 (Ctrl+S)";
        toolBtnUndo.ToolTipText      = "실행 취소 (Ctrl+Z)";
        toolBtnRedo.ToolTipText      = "다시 실행 (Ctrl+Y)";
        toolBtnSummary.ToolTipText   = "Summary / 차트 보기 (Ctrl+T)";
        toolBtnCompleted.ToolTipText   = "완료 후 삭제된 항목 보기";
        toolBtnBurndown.ToolTipText    = "Burn Down 차트 보기";
        toolBtnToggleGrid.ToolTipText  = "선택한 컬럼의 배경 눈금 표시/숨기기";
        toolBtnExport.ToolTipText = "프로젝트 보내기 (Report / 인쇄 / 이미지)";
    }

    private void SetupAddColumnButton()
    {
        btnAddColumn.Width = ColumnWidthDefaults.AddColumnButtonWidth;
        btnAddColumn.FlatAppearance.BorderColor = Color.Silver;
        btnAddColumn.Image = IconFactory.Get("add");
        btnAddColumn.ImageAlign = ContentAlignment.TopCenter;
        btnAddColumn.TextAlign = ContentAlignment.BottomCenter;
        btnAddColumn.Dock = DockStyle.Right;

        if (flowColumns.Controls.Contains(btnAddColumn))
            flowColumns.Controls.Remove(btnAddColumn);

        if (!panelBoard.Controls.Contains(btnAddColumn))
            panelBoard.Controls.Add(btnAddColumn);

        btnAddColumn.BringToFront();

        var tip = new ToolTip();
        tip.SetToolTip(btnAddColumn, "새 컬럼 추가");
    }

    // ─────────────────────────────────────────────
    //  Board management
    // ─────────────────────────────────────────────

    private void RebuildBoard()
    {
        CleanupGhost();
        DeselectAllColumns();

        SuspendLayout();
        flowColumns.SuspendLayout();

        foreach (var ctrl in flowColumns.Controls.OfType<KanbanColumnControl>().ToArray())
            flowColumns.Controls.Remove(ctrl);

        foreach (var col in _project.Columns)
            flowColumns.Controls.Add(CreateColumnControl(col));

        btnAddColumn.Height = GetColumnControlHeight();
        ApplyProportionalColumnWidths();

        // Finalize card layouts now that columns have their correct proportional widths.
        // This is the first moment where ClampCardControl/PositionCardControl may safely
        // write back to the model — any earlier call used the designer-default width.
        foreach (var ctrl in flowColumns.Controls.OfType<KanbanColumnControl>())
            ctrl.FinalizeLayout();

        UpdateLastColumnGrips();

        flowColumns.ResumeLayout(false);
        flowColumns.PerformLayout();
        ResumeLayout(false);

        UpdateStatusBar();
        UpdateGridToolbarState();
    }

    private void SelectColumn(KanbanColumnControl ctrl)
    {
        if (_selectedColumnControl == ctrl)
        {
            UpdateGridToolbarState();
            return;
        }

        foreach (var col in flowColumns.Controls.OfType<KanbanColumnControl>())
            col.SetSelected(false);

        _selectedColumnControl = ctrl;
        ctrl.SetSelected(true);
        UpdateGridToolbarState();
    }

    private void DeselectAllColumns()
    {
        foreach (var col in flowColumns.Controls.OfType<KanbanColumnControl>())
            col.SetSelected(false);
        _selectedColumnControl = null;
        UpdateGridToolbarState();
    }

    private void UpdateGridToolbarState()
    {
        bool hasSelection = _selectedColumnControl != null;
        toolBtnToggleGrid.Enabled = hasSelection;
        menuViewShowGrid.Enabled = hasSelection;

        if (hasSelection)
        {
            toolBtnToggleGrid.Checked = _selectedColumnControl!.ShowGrid;
            menuViewShowGrid.Checked = _selectedColumnControl.ShowGrid;
        }
        else
        {
            toolBtnToggleGrid.Checked = false;
            menuViewShowGrid.Checked = false;
        }
    }

    private void ToggleSelectedColumnGrid(bool show)
    {
        if (_selectedColumnControl == null) return;
        _selectedColumnControl.ShowGrid = show;
        toolBtnToggleGrid.Checked = show;
        menuViewShowGrid.Checked = show;
        UpdateDirtyState();
    }

    private KanbanColumnControl CreateColumnControl(KanbanColumn col)
    {
        var ctrl = new KanbanColumnControl(col)
        {
            Height = GetColumnControlHeight(),
            Margin = new Padding(4, 0, 0, 0)
        };
        ctrl.AddCardRequested        += OnAddCardRequested;
        ctrl.ColumnSettingsRequested += OnColumnSettingsRequested;
        ctrl.DeleteColumnRequested   += OnDeleteColumnRequested;
        ctrl.ColumnWidthChanged     += (_, _) => OnColumnWidthChanged(ctrl);
        ctrl.ColumnWidthLiveChanged += (_, _) => OnColumnWidthLiveChanged(ctrl);
        ctrl.ProjectChanged          += (_, _) => UpdateDirtyState();
        ctrl.BeforeProjectChange     += (_, _) => SaveUndoSnapshot();
        ctrl.CardArchivedRequested   += OnCardArchivedRequested;
        ctrl.ColumnHeaderDragStarted += OnColumnHeaderDragStarted;
        ctrl.ColumnHeaderDragging    += OnColumnHeaderDragging;
        ctrl.ColumnHeaderDragEnded   += OnColumnHeaderDragEnded;
        ctrl.CardDragStarted         += OnCardDragStarted;
        ctrl.CardDragging            += OnCardDragging;
        ctrl.CardDragEnded           += OnCardDragEnded;
        ctrl.ColumnSelected          += (_, _) => SelectColumn(ctrl);
        ctrl.SetGridVisible(col.ShowGrid);
        return ctrl;
    }

    private int GetColumnControlHeight()
        => Math.Max(flowColumns.ClientSize.Height - flowColumns.Padding.Vertical, 300);

    private void panelBoard_Resize(object? sender, EventArgs e)
    {
        int h = GetColumnControlHeight();
        foreach (KanbanColumnControl ctrl in flowColumns.Controls.OfType<KanbanColumnControl>())
            ctrl.Height = h;

        btnAddColumn.Height = h;
        ApplyProportionalColumnWidths();
        UpdateLastColumnGrips();
    }

    private void OnColumnWidthLiveChanged(KanbanColumnControl changed)
    {
        var columns = flowColumns.Controls.OfType<KanbanColumnControl>().ToList();
        int idx = columns.IndexOf(changed);
        if (idx < 0 || idx >= columns.Count - 1) return;

        var nextCol = columns[idx + 1];
        int minWidth = ColumnWidthDefaults.Min;
        int available = GetAvailableColumnAreaWidth(columns.Count);

        // Width of all columns except the two being resized
        int othersWidth = columns.Where((_, i) => i != idx && i != idx + 1).Sum(c => c.Width);
        int twoColSpace = available - othersWidth;

        // Clamp current column so next can't go below minimum
        int changedWidth = Math.Clamp(changed.Width, minWidth, twoColSpace - minWidth);
        if (changed.Width != changedWidth)
            changed.SetVisualWidth(changedWidth);

        nextCol.SetVisualWidth(Math.Max(minWidth, twoColSpace - changedWidth));
    }

    private void OnColumnWidthChanged(KanbanColumnControl changed)
    {
        // Persist current pixel widths as column weight values
        foreach (var ctrl in flowColumns.Controls.OfType<KanbanColumnControl>())
            ctrl.SetColumnWidthWeight(ctrl.Width);
        UpdateDirtyState();
        UpdateLastColumnGrips();
    }

    private static bool IsLastColumn(KanbanColumnControl ctrl)
    {
        if (ctrl.Parent is not FlowLayoutPanel flow) return false;
        var columns = flow.Controls.OfType<KanbanColumnControl>().ToList();
        return columns.Count > 0 && columns[^1] == ctrl;
    }

    private void UpdateLastColumnGrips()
    {
        var columns = flowColumns.Controls.OfType<KanbanColumnControl>().ToList();
        for (int i = 0; i < columns.Count; i++)
            columns[i].SetLastColumn(i == columns.Count - 1);
    }

    private void ApplyLastColumnFillWidth()
    {
        var columns = flowColumns.Controls.OfType<KanbanColumnControl>().ToList();
        if (columns.Count <= 1)
        {
            if (columns.Count == 1)
            {
                int only = GetAvailableColumnAreaWidth(1);
                if (only > 0)
                    columns[0].SetVisualWidth(Math.Max(ColumnWidthDefaults.Min, only));
            }
            return;
        }

        int available = GetAvailableColumnAreaWidth(columns.Count);
        if (available <= 0) return;

        int minWidth = ColumnWidthDefaults.Min;
        int othersTotal = columns.Take(columns.Count - 1).Sum(c => c.Width);
        int lastWidth = available - othersTotal;

        if (lastWidth < minWidth)
        {
            foreach (var c in columns.Take(columns.Count - 1))
                c.SetVisualWidth(minWidth);
            othersTotal = minWidth * (columns.Count - 1);
            lastWidth = Math.Max(minWidth, available - othersTotal);
        }

        columns[^1].SetVisualWidth(Math.Max(minWidth, lastWidth));
    }

    private int GetAvailableColumnAreaWidth(int columnCount)
    {
        if (columnCount <= 0) return 0;

        int area = flowColumns.ClientSize.Width - flowColumns.Padding.Horizontal;
        int columnMargins = columnCount * 4;
        return Math.Max(0, area - columnMargins);
    }

    private void ApplyProportionalColumnWidths()
    {
        var columns = flowColumns.Controls.OfType<KanbanColumnControl>().ToList();
        if (columns.Count == 0) return;
        if (columns.Any(c => c.IsResizingWidth)) return;

        int available = GetAvailableColumnAreaWidth(columns.Count);
        if (available <= 0) return;

        int minWidth = ColumnWidthDefaults.Min;
        int minTotal = columns.Count * minWidth;

        if (available <= minTotal)
        {
            foreach (var ctrl in columns)
                ctrl.SetVisualWidth(minWidth);
            return;
        }

        double totalWeight = columns.Sum(c => Math.Max(1, c.Column.ColumnWidth));
        if (totalWeight <= 0)
            totalWeight = columns.Count * ColumnWidthDefaults.Default;

        int extra = available - minTotal;
        var widths = new int[columns.Count];
        int assigned = 0;

        for (int i = 0; i < columns.Count; i++)
        {
            if (i == columns.Count - 1)
            {
                widths[i] = available - assigned;
                break;
            }

            double share = Math.Max(1, columns[i].Column.ColumnWidth) / totalWeight;
            int w = minWidth + (int)Math.Round(extra * share);
            w = Math.Max(minWidth, w);
            widths[i] = w;
            assigned += w;
        }

        for (int i = 0; i < columns.Count; i++)
            columns[i].SetVisualWidth(Math.Max(minWidth, widths[i]));

        UpdateLastColumnGrips();
    }

    // ─────────────────────────────────────────────
    //  Column drag-to-reorder
    // ─────────────────────────────────────────────

    private void OnColumnHeaderDragStarted(object? sender, Point screenPos)
    {
        if (sender is not KanbanColumnControl ctrl) return;
        _draggingColumn = ctrl;

        // Snapshot the column appearance
        var bmp = new Bitmap(ctrl.Width, ctrl.Height);
        ctrl.DrawToBitmap(bmp, new Rectangle(0, 0, ctrl.Width, ctrl.Height));

        _ghostForm = new Form
        {
            FormBorderStyle       = FormBorderStyle.None,
            ShowInTaskbar         = false,
            TopMost               = true,
            Opacity               = 0.55,
            Size                  = ctrl.Size,
            Location              = new Point(screenPos.X - ctrl.Width / 2, screenPos.Y - 20),
            BackgroundImage       = bmp,
            BackgroundImageLayout = ImageLayout.Stretch,
        };
        // panelHeader.Capture = true already routes all mouse messages to panelHeader,
        // so the ghost form receiving focus is harmless.
        _ghostForm.Show();

        _columnDragHitRects = flowColumns.Controls
            .OfType<KanbanColumnControl>()
            .Select(c => (c, c.RectangleToScreen(c.ClientRectangle)))
            .ToList();
        _lastColumnDropInsertIdx = -1;

        EnsureDropIndicator();
    }

    private void OnColumnHeaderDragging(object? sender, Point screenPos)
    {
        if (_ghostForm == null || _draggingColumn == null) return;

        // Move ghost
        _ghostForm.Location = new Point(
            screenPos.X - _draggingColumn.Width / 2,
            screenPos.Y - 20);

        // Update drop indicator
        var boardPos = flowColumns.PointToClient(screenPos);
        int insertIdx = GetColumnDropIndex(boardPos);
        PositionDropIndicator(insertIdx);
    }

    private void OnColumnHeaderDragEnded(object? sender, Point screenPos)
    {
        CleanupGhost();

        if (_draggingColumn == null) return;

        var boardPos = flowColumns.PointToClient(screenPos);
        int insertIdx = GetColumnDropIndex(boardPos);

        if (insertIdx >= 0)
        {
            var srcIdx = _project.Columns.IndexOf(_draggingColumn.Column);
            if (srcIdx >= 0 && srcIdx != insertIdx)
            {
                SaveUndoSnapshot();
                var col = _project.Columns[srcIdx];
                _project.Columns.RemoveAt(srcIdx);
                int targetIdx = insertIdx > srcIdx ? insertIdx - 1 : insertIdx;
                _project.Columns.Insert(Math.Clamp(targetIdx, 0, _project.Columns.Count), col);
                RebuildBoard();
                UpdateDirtyState();
            }
        }

        _draggingColumn = null;
    }

    private void EnsureDropIndicator()
    {
        if (_dropIndicator != null) return;
        // Full-height placeholder panel — same width as a column so other columns push aside
        _dropIndicator = new Panel
        {
            Width     = ColumnWidthDefaults.Default,
            Height    = GetColumnControlHeight(),
            BackColor = Color.FromArgb(80, 30, 144, 255),
            BorderStyle = BorderStyle.FixedSingle,
            Margin    = new Padding(4, 0, 0, 0),
            Tag       = "indicator"
        };
    }

    private void PositionDropIndicator(int insertIdx)
    {
        if (_dropIndicator == null) return;

        var columns = flowColumns.Controls.OfType<KanbanColumnControl>().ToList();
        if (insertIdx < 0 || columns.Count == 0) return;

        if (insertIdx == _lastColumnDropInsertIdx
            && flowColumns.Controls.Contains(_dropIndicator))
            return;

        _lastColumnDropInsertIdx = insertIdx;
        _dropIndicator.Height = GetColumnControlHeight();
        _dropIndicator.Width = _draggingColumn?.Width ?? ColumnWidthDefaults.Default;

        flowColumns.SuspendLayout();

        bool hadIndicator = flowColumns.Controls.Contains(_dropIndicator);
        if (hadIndicator)
            flowColumns.Controls.Remove(_dropIndicator);

        int targetCtrlIdx = insertIdx < columns.Count
            ? flowColumns.Controls.GetChildIndex(columns[insertIdx])
            : flowColumns.Controls.Count;

        flowColumns.Controls.Add(_dropIndicator);
        if (flowColumns.Controls.GetChildIndex(_dropIndicator) != targetCtrlIdx)
            flowColumns.Controls.SetChildIndex(_dropIndicator, targetCtrlIdx);

        flowColumns.ResumeLayout(false);
        flowColumns.PerformLayout();
    }

    private int GetColumnDropIndex(Point boardPos)
    {
        var screenPos = flowColumns.PointToScreen(boardPos);

        if (_columnDragHitRects != null)
        {
            for (int i = 0; i < _columnDragHitRects.Count; i++)
            {
                int mid = _columnDragHitRects[i].ScreenRect.Left + _columnDragHitRects[i].ScreenRect.Width / 2;
                if (screenPos.X < mid) return i;
            }
            return _columnDragHitRects.Count;
        }

        var columns = flowColumns.Controls
            .OfType<KanbanColumnControl>()
            .OrderBy(c => c.Left)
            .ToList();

        for (int i = 0; i < columns.Count; i++)
        {
            int mid = columns[i].Left + columns[i].Width / 2;
            if (boardPos.X < mid) return i;
        }
        return columns.Count;
    }

    private void CleanupGhost()
    {
        _ghostForm?.Close();
        _ghostForm?.Dispose();
        _ghostForm = null;

        if (_dropIndicator != null)
        {
            flowColumns.Controls.Remove(_dropIndicator);
            _dropIndicator.Dispose();
            _dropIndicator = null;
        }

        _lastColumnDropInsertIdx = -1;
        _columnDragHitRects = null;
    }

    // ─────────────────────────────────────────────
    //  Card operations
    // ─────────────────────────────────────────────

    private void OnAddCardRequested(object? sender, KanbanColumn column)
    {
        var newCard = new KanbanCard { Title = "새 카드" };
        SaveUndoSnapshot();
        var colCtrl = FindColumnControl(column);
        colCtrl?.AddCard(newCard);

        using var form = new CardEditForm(newCard);
        form.PreviewChanged += (_, _) => RefreshCardPreview(colCtrl, newCard);
        if (form.ShowDialog() != DialogResult.OK)
        {
            colCtrl?.RemoveCard(newCard);
            UpdateDirtyState();
            UpdateStatusBar();
            return;
        }

        UpdateDirtyState();
        UpdateStatusBar();
    }

    private void RefreshCardPreview(KanbanColumnControl? colCtrl, KanbanCard card)
    {
        colCtrl?.FindCardControl(card)?.UpdateDisplay();
        colCtrl?.ApplyCardLayouts();
        colCtrl?.UpdateHeader();
    }

    // ─────────────────────────────────────────────
    //  Card drag with ghost + drop indicator
    // ─────────────────────────────────────────────

    private void OnCardDragStarted(object? sender, (KanbanCard Card, Point ScreenPos) e)
    {
        if (sender is not KanbanCardControl cardCtrl) return;
        SaveUndoSnapshot();
        _draggingCard = e.Card;
        _draggingCardControl = cardCtrl;
        _draggingCardHeight = cardCtrl.Height;
        _draggingCardWidth = cardCtrl.Width;

        cardCtrl.Visible = false;

        var bmp = new Bitmap(cardCtrl.Width, cardCtrl.Height);
        cardCtrl.DrawToBitmap(bmp, new Rectangle(0, 0, cardCtrl.Width, cardCtrl.Height));

        _ghostForm = new Form
        {
            FormBorderStyle       = FormBorderStyle.None,
            ShowInTaskbar         = false,
            TopMost               = true,
            Opacity               = 0.65,
            Size                  = cardCtrl.Size,
            Location              = new Point(e.ScreenPos.X - cardCtrl.Width / 2,
                                              e.ScreenPos.Y - cardCtrl.Height / 2),
            BackgroundImage       = bmp,
            BackgroundImageLayout = ImageLayout.Stretch,
        };
        _ghostForm.Show();
    }

    private void OnCardDragging(object? sender, (KanbanCard Card, Point ScreenPos) e)
    {
        if (_ghostForm == null || _draggingCard == null) return;

        _ghostForm.Location = new Point(
            e.ScreenPos.X - _ghostForm.Width / 2,
            e.ScreenPos.Y - _ghostForm.Height / 2);
    }

    private void OnCardDragEnded(object? sender, (KanbanCard Card, Point ScreenPos) e)
    {
        _ghostForm?.Close();
        _ghostForm?.Dispose();
        _ghostForm = null;

        var draggedCtrl = _draggingCardControl;
        var card = _draggingCard;
        var dragWidth = _draggingCardWidth;
        var dragHeight = _draggingCardHeight;
        _draggingCardControl = null;
        _draggingCard = null;
        _draggingCardWidth = 0;
        _draggingCardHeight = 0;

        if (card == null) return;

        var targetColCtrl = flowColumns.Controls
            .OfType<KanbanColumnControl>()
            .FirstOrDefault(c => c.ContainsScreenPoint(e.ScreenPos));

        if (targetColCtrl != null)
        {
            var dropSize = new Size(
                dragWidth > 0 ? dragWidth : draggedCtrl?.Width ?? CardSizeDefaults.MinWidth,
                dragHeight > 0 ? dragHeight : draggedCtrl?.Height ?? CardSizeDefaults.MinHeight);
            var canvasLoc = targetColCtrl.GetCanvasDropLocation(e.ScreenPos, dropSize);

            ErrorHandler.TryExecute(
                () => MoveCardToCanvas(card, targetColCtrl, canvasLoc, draggedCtrl),
                "카드 이동 오류",
                this,
                $"카드: {card.Title}");
        }
        else
        {
            RestoreDraggedCard(card, draggedCtrl);
        }
    }

    private void RestoreDraggedCard(KanbanCard card, KanbanCardControl? draggedCtrl)
    {
        if (draggedCtrl == null) return;

        draggedCtrl.Visible = true;
        var sourceColModel = _project.Columns.FirstOrDefault(c => c.Cards.Contains(card));
        if (sourceColModel == null) return;

        var sourceUi = FindColumnControl(sourceColModel);
        if (sourceUi == null) return;

        var restoreAt = new Point(card.CanvasX, card.CanvasY);
        if (draggedCtrl.Parent == null)
            sourceUi.AttachCardControl(draggedCtrl, restoreAt);
        else
            sourceUi.SetCardCanvasPosition(card, restoreAt);
    }

    private void MoveCardToCanvas(KanbanCard card, KanbanColumnControl targetCtrl, Point canvasLocation, KanbanCardControl? draggedCtrl = null)
    {
        var sourceCol = _project.Columns.FirstOrDefault(c => c.Cards.Contains(card));
        if (sourceCol == null)
            throw new InvalidOperationException("이동할 카드가 원본 컬럼에 없습니다.");

        var targetColumn = targetCtrl.Column;
        bool sameColumn = sourceCol.Id == targetColumn.Id;
        var sourceUi = FindColumnControl(sourceCol);

        if (targetColumn.IsCompletionColumn && card.CompletedAt == null)
            card.CompletedAt = DateTime.Now;
        else if (!targetColumn.IsCompletionColumn)
            card.CompletedAt = null;

        var savedLocation = card.HasCanvasPosition()
            ? new Point(card.CanvasX, card.CanvasY)
            : new Point(CardCanvasHelper.CanvasPadding, CardCanvasHelper.CanvasPadding);

        card.CanvasX = canvasLocation.X;
        card.CanvasY = canvasLocation.Y;

        if (!sameColumn)
        {
            var ctrl = sourceUi?.DetachCardControl(card, draggedCtrl);
            var removedFromSource = false;
            var addedToTarget = false;

            try
            {
                sourceCol.Cards.Remove(card);
                removedFromSource = true;

                int nextZ = targetColumn.Cards.Select(c => c.ZIndex).DefaultIfEmpty(0).Max() + 1;
                targetColumn.Cards.Add(card);
                addedToTarget = true;
                card.ZIndex = nextZ;

                sourceUi?.UpdateHeader();
                targetCtrl.UpdateHeader();

                if (ctrl != null)
                {
                    ctrl.Visible = true;
                    targetCtrl.AttachCardControl(ctrl, canvasLocation);
                }
                else
                {
                    targetCtrl.LoadCards();
                    targetCtrl.SetCardCanvasPosition(card, canvasLocation);
                }
            }
            catch
            {
                card.CanvasX = savedLocation.X;
                card.CanvasY = savedLocation.Y;

                if (addedToTarget)
                    targetColumn.Cards.Remove(card);
                if (removedFromSource && !sourceCol.Cards.Contains(card))
                    sourceCol.Cards.Add(card);

                if (ctrl != null && sourceUi != null)
                {
                    ctrl.Visible = true;
                    sourceUi.AttachCardControl(ctrl, savedLocation);
                }
                else if (ctrl != null)
                {
                    ctrl.Visible = true;
                }

                sourceUi?.UpdateHeader();
                targetCtrl.UpdateHeader();
                throw;
            }
        }
        else
        {
            if (draggedCtrl != null)
                draggedCtrl.Visible = true;
            targetCtrl.SetCardCanvasPosition(card, canvasLocation);
            draggedCtrl?.SetSelected(true);
        }

        UpdateDirtyState();
        UpdateStatusBar();
    }

    private KanbanColumnControl? FindColumnControl(KanbanColumn col) =>
        flowColumns.Controls.OfType<KanbanColumnControl>()
                           .FirstOrDefault(c => c.Column.Id == col.Id);

    // ─────────────────────────────────────────────
    //  Column operations
    // ─────────────────────────────────────────────

    private void OnColumnSettingsRequested(object? sender, KanbanColumn column)
    {
        var ctrl = FindColumnControl(column);
        if (ctrl != null)
            SelectColumn(ctrl);

        SaveUndoSnapshot();
        using var form = new ColumnSettingsForm(column);
        form.PreviewChanged += (_, _) => RefreshColumnPreview(column);
        if (form.ShowDialog() != DialogResult.OK) return;
        UpdateGridToolbarState();
        UpdateDirtyState();
    }

    private void RefreshColumnPreview(KanbanColumn column)
    {
        var ctrl = FindColumnControl(column);
        ctrl?.UpdateHeader();
        ctrl?.SetGridVisible(column.ShowGrid);
        ApplyProportionalColumnWidths();
        UpdateGridToolbarState();
    }

    private void OnDeleteColumnRequested(object? sender, KanbanColumn column)
    {
        SaveUndoSnapshot();
        _project.Columns.Remove(column);
        RebuildBoard();
        UpdateDirtyState();
        UpdateStatusBar();
    }

    private void BtnAddColumn_Click(object? sender, EventArgs e)
    {
        SaveUndoSnapshot();
        var newCol = new KanbanColumn { Name = "새 컬럼" };
        _project.Columns.Add(newCol);
        RebuildBoard();

        var newColCtrl = FindColumnControl(newCol);
        if (newColCtrl != null)
            SelectColumn(newColCtrl);

        using var form = new ColumnSettingsForm(newCol);
        form.PreviewChanged += (_, _) => RefreshColumnPreview(newCol);
        if (form.ShowDialog() != DialogResult.OK)
        {
            _project.Columns.Remove(newCol);
            RebuildBoard();
            return;
        }

        UpdateDirtyState();
    }

    // ─────────────────────────────────────────────
    //  File operations
    // ─────────────────────────────────────────────

    private void TryLoadLastFile()
    {
        var lastFile = AppSettings.GetLastFilePath();
        if (string.IsNullOrEmpty(lastFile))
        {
            RebuildBoard();
            return;
        }

        if (!File.Exists(lastFile))
        {
            AppSettings.SetLastFilePath(null);
            RebuildBoard();
            return;
        }

        var loaded = ErrorHandler.TryExecute(
            () => ProjectService.Load(lastFile),
            "마지막 파일 열기 오류", this, $"파일: {lastFile}");

        if (loaded != null)
        {
            _project = loaded;
            RestoreWindowState();
            RebuildBoard();
            return;
        }

        RebuildBoard();
    }

    private void menuNew_Click(object sender, EventArgs e)
    {
        if (!ConfirmDiscardChanges()) return;
        _project = KanbanProject.CreateDefault();
        RebuildBoard();
        BeginInvoke(CaptureSavedState);
        UpdateStatusBar();
    }

    private void menuOpen_Click(object sender, EventArgs e)
    {
        if (!ConfirmDiscardChanges()) return;
        using var dlg = new OpenFileDialog
        {
            Filter          = "MyAgileBoard 파일 (*.mab)|*.mab|모든 파일 (*.*)|*.*",
            Title           = "프로젝트 열기",
            InitialDirectory = GetInitialDir()
        };
        if (dlg.ShowDialog() != DialogResult.OK) return;

        var loaded = ErrorHandler.TryExecute(
            () => ProjectService.Load(dlg.FileName),
            "프로젝트 열기 오류",
            this,
            $"파일: {dlg.FileName}");

        if (loaded == null)
        {
            if (File.Exists(dlg.FileName))
            {
                ErrorHandler.Show(
                    "프로젝트 열기 오류",
                    "파일을 읽었지만 프로젝트 데이터를 해석할 수 없습니다.",
                    $"[컨텍스트] 파일: {dlg.FileName}\n[시각] {DateTime.Now:yyyy-MM-dd HH:mm:ss}\n[원인] 파일 형식이 올바르지 않거나 내용이 비어 있습니다.",
                    this);
            }
            return;
        }

        _project = loaded;
        RememberDir(dlg.FileName);
        RestoreWindowState();
        RebuildBoard();
        BeginInvoke(CaptureSavedState);
        UpdateStatusBar();
    }

    private void menuSave_Click(object sender, EventArgs e)   => Save();
    private void menuSaveAs_Click(object sender, EventArgs e) => SaveAs();

    private void SyncProjectFromBoard()
    {
        CaptureWindowState();
        ProjectBoardSync.SyncFromBoard(_project, flowColumns.Controls.OfType<KanbanColumnControl>());
    }

    private bool Save()
    {
        if (string.IsNullOrEmpty(_project.FilePath)) return SaveAs();
        SyncProjectFromBoard();
        return ErrorHandler.TryExecute(() =>
        {
            ProjectService.Save(_project, _project.FilePath);
            RememberDir(_project.FilePath);
            CaptureSavedState();
        }, "저장 오류", this, $"파일: {_project.FilePath}");
    }

    private bool SaveAs()
    {
        using var dlg = new SaveFileDialog
        {
            Filter           = "MyAgileBoard 파일 (*.mab)|*.mab|모든 파일 (*.*)|*.*",
            Title            = "다른 이름으로 저장",
            FileName         = _project.Name,
            InitialDirectory = GetInitialDir()
        };
        if (dlg.ShowDialog() != DialogResult.OK) return false;
        RememberDir(dlg.FileName);
        SyncProjectFromBoard();
        return ErrorHandler.TryExecute(() =>
        {
            ProjectService.Save(_project, dlg.FileName);
            CaptureSavedState();
        }, "저장 오류", this, $"파일: {dlg.FileName}");
    }

    private void menuExit_Click(object sender, EventArgs e) => Close();

    // ─────────────────────────────────────────────
    //  View operations
    // ─────────────────────────────────────────────

    private void menuSummary_Click(object sender, EventArgs e)
    {
        using var form = new SummaryForm(_project);
        form.ShowDialog();
    }

    private void menuProjectSettings_Click(object sender, EventArgs e)
    {
        using var form = new ProjectSettingsForm(_project);
        if (form.ShowDialog() != DialogResult.OK) return;
        SyncProjectFromBoard();
        UpdateDirtyState();
    }

    private void SyncColumnWidthsToModel()
    {
        foreach (var ctrl in flowColumns.Controls.OfType<KanbanColumnControl>())
            ctrl.SetColumnWidthWeight(ctrl.Width);
    }

    private void CaptureWindowState()
    {
        if (WindowState == FormWindowState.Maximized)
        {
            _project.WindowMaximized = true;
            _project.WindowX = RestoreBounds.X;
            _project.WindowY = RestoreBounds.Y;
            _project.WindowWidth = RestoreBounds.Width;
            _project.WindowHeight = RestoreBounds.Height;
        }
        else if (WindowState == FormWindowState.Normal)
        {
            _project.WindowMaximized = false;
            _project.WindowX = Location.X;
            _project.WindowY = Location.Y;
            _project.WindowWidth = Width;
            _project.WindowHeight = Height;
        }
    }

    private void RestoreWindowState()
    {
        if (_project.WindowWidth <= 0 || _project.WindowHeight <= 0) return;
        var screen = Screen.FromPoint(new Point(
            Math.Max(0, _project.WindowX),
            Math.Max(0, _project.WindowY)));
        int x = _project.WindowX >= 0
            ? Math.Clamp(_project.WindowX, screen.Bounds.Left, screen.Bounds.Right - 200)
            : Left;
        int y = _project.WindowY >= 0
            ? Math.Clamp(_project.WindowY, screen.Bounds.Top, screen.Bounds.Bottom - 100)
            : Top;
        SetBounds(x, y, _project.WindowWidth, _project.WindowHeight);
        if (_project.WindowMaximized)
            WindowState = FormWindowState.Maximized;
    }

    // ─────────────────────────────────────────────
    //  UI helpers
    // ─────────────────────────────────────────────

    private bool ConfirmDiscardChanges()
    {
        if (!_isDirty) return true;
        return MessageBox.Show(
            "저장되지 않은 변경사항이 있습니다. 계속하시겠습니까?",
            "확인", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes;
    }

    private void CaptureSavedState()
    {
        ErrorHandler.TryExecute(() =>
        {
            _savedStateJson = JsonSerializer.Serialize(_project, ProjectService.Options);
            _isDirty = false;
            UpdateTitle();
        }, "상태 저장 오류", this);
    }

    private void UpdateDirtyState()
    {
        ErrorHandler.TryExecute(() =>
        {
            var currentJson = JsonSerializer.Serialize(_project, ProjectService.Options);
            _isDirty = currentJson != _savedStateJson;
            UpdateTitle();
            UpdateStatusBar();
        }, "변경 상태 확인 오류", this);
    }

    private void UpdateTitle()
    {
        string dirty = _isDirty ? " *" : string.Empty;
        Text = $"MyAgileBoard — {_project.Name}{dirty}";
    }

    private void UpdateStatusBar()
    {
        int total  = _project.Columns.Sum(c => c.Cards.Count);
        int done   = _project.Columns.Where(c => c.IsCompletionColumn).Sum(c => c.Cards.Count);
        int inProg = _project.Columns
            .Where(c => !c.IsCompletionColumn && c.Cards.Count > 0)
            .Sum(c => c.Cards.Count);

        statusTotal.Text      = $"전체: {total}개";
        statusDone.Text       = $"완료: {done}개";
        statusInProgress.Text = $"진행중: {inProg}개";
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (_isDirty && !ConfirmDiscardChanges())
        {
            e.Cancel = true;
            return;
        }

        if (!string.IsNullOrEmpty(_project.FilePath))
            RememberDir(_project.FilePath);

        base.OnFormClosing(e);
    }

    // Toolbar handlers
    private void toolBtnNew_Click(object sender, EventArgs e)     => menuNew_Click(sender, e);
    private void toolBtnOpen_Click(object sender, EventArgs e)    => menuOpen_Click(sender, e);
    private void toolBtnSave_Click(object sender, EventArgs e)    => menuSave_Click(sender, e);
    private void toolBtnSummary_Click(object sender, EventArgs e) => menuSummary_Click(sender, e);

    private void menuViewShowGrid_Click(object? sender, EventArgs e)
        => ToggleSelectedColumnGrid(menuViewShowGrid.Checked);

    private void toolBtnToggleGrid_Click(object sender, EventArgs e)
        => ToggleSelectedColumnGrid(toolBtnToggleGrid.Checked);

    // ─────────────────────────────────────────────
    //  Export — Report & images
    // ─────────────────────────────────────────────

    private ProjectReportSnapshot BuildReportSnapshot()
        => ProjectReportBuilder.Build(_project);

    private void ExportReportMarkdown() => ExportReport(
        "Markdown (*.md)|*.md",
        ".md",
        (snapshot, path) => MarkdownReportExporter.Export(snapshot, path),
        "Report 보내기 (Markdown)");

    private void ExportReportWord() => ExportReport(
        "Word 문서 (*.docx)|*.docx",
        ".docx",
        (snapshot, path) => WordReportExporter.Export(snapshot, path),
        "Report 보내기 (Word)");

    private void ExportReportPdf() => ExportReport(
        "PDF 문서 (*.pdf)|*.pdf",
        ".pdf",
        (snapshot, path) => PdfReportExporter.Export(snapshot, path),
        "Report 보내기 (PDF)");

    private void PrintReport()
    {
        ErrorHandler.TryExecute(() =>
        {
            ReportPrinter.ShowPreview(this, BuildReportSnapshot());
        }, "Report 인쇄", this);
    }

    private void ExportReport(string filter, string extension, Action<ProjectReportSnapshot, string> export, string errorTitle)
    {
        using var dlg = new SaveFileDialog
        {
            Filter = filter,
            FileName = SanitizeExportName(_project.Name) + extension,
            InitialDirectory = GetInitialDir()
        };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;

        ErrorHandler.TryExecute(() =>
        {
            export(BuildReportSnapshot(), dlg.FileName);
            RememberDir(dlg.FileName);
            MessageBox.Show(this,
                $"Report를 저장했습니다.\n\n{dlg.FileName}",
                "보내기",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
        }, errorTitle, this, dlg.FileName);
    }

    private void ExportColumnImages()
    {
        using var folderDlg = new FolderBrowserDialog
        {
            Description = "컬럼 카드 이미지를 저장할 폴더를 선택하세요.",
            SelectedPath = GetInitialDir(),
            UseDescriptionForTitle = true
        };
        if (folderDlg.ShowDialog(this) != DialogResult.OK) return;

        using var fmtDlg = new ExportImageFormatDialog();
        if (fmtDlg.ShowDialog(this) != DialogResult.OK) return;

        string targetDir = Path.Combine(folderDlg.SelectedPath, SanitizeExportName(_project.Name) + "_cards");
        var format = fmtDlg.SelectedFormat;

        ErrorHandler.TryExecute(() =>
        {
            int count = ColumnCardImageExporter.Export(_project, targetDir, format);
            RememberDir(targetDir);
            MessageBox.Show(this,
                $"{count}개 이미지를 저장했습니다.\n\n{targetDir}",
                "이미지 보내기",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }, "컬럼 카드 이미지 보내기", this, targetDir);
    }

    private static string SanitizeExportName(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "project";
        foreach (char ch in Path.GetInvalidFileNameChars())
            name = name.Replace(ch, '_');
        name = name.Trim().TrimEnd('.');
        return string.IsNullOrWhiteSpace(name) ? "project" : name;
    }

    // ─────────────────────────────────────────────
    //  Undo / Redo
    // ─────────────────────────────────────────────

    private void SaveUndoSnapshot()
    {
        if (!ErrorHandler.TryExecute(() =>
        {
            var json = JsonSerializer.Serialize(_project, ProjectService.Options);
            _undoStack.Push(json);
            _redoStack.Clear();
            UpdateUndoRedoUI();
        }, "실행 취소 준비 오류", this))
            return;
    }

    private void menuUndo_Click(object? sender, EventArgs e)
    {
        if (_undoStack.Count == 0) return;
        ErrorHandler.TryExecute(() =>
        {
            var savedWidths = CaptureColumnWidths();
            var currentJson = JsonSerializer.Serialize(_project, ProjectService.Options);
            _redoStack.Push(currentJson);
            var json = _undoStack.Pop();
            _project = JsonSerializer.Deserialize<KanbanProject>(json, ProjectService.Options)
                ?? throw new InvalidOperationException("저장된 실행 취소 데이터를 복원할 수 없습니다.");
            RebuildBoard();
            TryRestoreColumnWidths(savedWidths);
            UpdateDirtyState();
            UpdateUndoRedoUI();
        }, "실행 취소 오류", this);
    }

    private void menuRedo_Click(object? sender, EventArgs e)
    {
        if (_redoStack.Count == 0) return;
        ErrorHandler.TryExecute(() =>
        {
            var savedWidths = CaptureColumnWidths();
            var currentJson = JsonSerializer.Serialize(_project, ProjectService.Options);
            _undoStack.Push(currentJson);
            var json = _redoStack.Pop();
            _project = JsonSerializer.Deserialize<KanbanProject>(json, ProjectService.Options)
                ?? throw new InvalidOperationException("저장된 다시 실행 데이터를 복원할 수 없습니다.");
            RebuildBoard();
            TryRestoreColumnWidths(savedWidths);
            UpdateDirtyState();
            UpdateUndoRedoUI();
        }, "다시 실행 오류", this);
    }

    private Dictionary<string, int> CaptureColumnWidths()
        => flowColumns.Controls.OfType<KanbanColumnControl>()
            .ToDictionary(c => c.Column.Id, c => c.Width);

    private void TryRestoreColumnWidths(Dictionary<string, int> saved)
    {
        var cols = flowColumns.Controls.OfType<KanbanColumnControl>().ToList();
        if (cols.Count == 0) return;

        // Only restore if the exact same column set exists (no columns added/removed)
        var currentIds = cols.Select(c => c.Column.Id).ToHashSet();
        var savedIds   = saved.Keys.ToHashSet();
        if (!currentIds.SetEquals(savedIds)) return;

        foreach (var ctrl in cols)
        {
            if (saved.TryGetValue(ctrl.Column.Id, out int w))
                ctrl.SetVisualWidth(w);
        }
        SyncColumnWidthsToModel();
    }

    private void UpdateUndoRedoUI()
    {
        menuUndo.Enabled    = _undoStack.Count > 0;
        menuRedo.Enabled    = _redoStack.Count > 0;
        toolBtnUndo.Enabled = _undoStack.Count > 0;
        toolBtnRedo.Enabled = _redoStack.Count > 0;
    }

    // ─────────────────────────────────────────────
    //  Archive handling
    // ─────────────────────────────────────────────

    private void OnCardArchivedRequested(object? sender, (KanbanCard Card, string ColumnName) e)
    {
        _project.ArchivedCards.Add(new ArchivedCard
        {
            Card             = e.Card,
            SourceColumnName = e.ColumnName,
            ArchivedAt       = DateTime.Now
        });
    }

    // ─────────────────────────────────────────────
    //  New view handlers
    // ─────────────────────────────────────────────

    private void menuCompletedHistory_Click(object? sender, EventArgs e)
    {
        using var form = new CompletedHistoryForm(_project);
        form.ShowDialog();
    }

    private void menuBurndown_Click(object? sender, EventArgs e)
    {
        using var form = new BurndownChartForm(_project);
        form.ProjectSettingsChanged += (_, _) => UpdateDirtyState();
        form.ShowDialog();
    }

    private void menuAbout_Click(object? sender, EventArgs e)
    {
        using var form = new AboutForm();
        form.ShowDialog();
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if (TryHandleSelectedCardRotation(keyData))
            return true;
        return base.ProcessCmdKey(ref msg, keyData);
    }

    private bool TryHandleSelectedCardRotation(Keys keyData)
    {
        var column = flowColumns.Controls.OfType<KanbanColumnControl>()
            .FirstOrDefault(c => c.SelectedCardControl != null);
        if (column == null) return false;

        if (keyData == (Keys.Control | Keys.OemOpenBrackets))
            return column.RotateSelectedCard(-CardCanvasHelper.RotationStep);
        if (keyData == (Keys.Control | Keys.OemCloseBrackets))
            return column.RotateSelectedCard(CardCanvasHelper.RotationStep);
        if (keyData == (Keys.Control | Keys.D0) || keyData == (Keys.Control | Keys.NumPad0))
            return column.ResetSelectedCardRotation();

        return false;
    }

    // ─────────────────────────────────────────────
    //  Last-used directory memory
    // ─────────────────────────────────────────────

    private string GetInitialDir()
    {
        var last = AppSettings.GetLastDirectory();
        if (!string.IsNullOrEmpty(last) && Directory.Exists(last))
            return last;

        if (!string.IsNullOrEmpty(_project.FilePath))
        {
            var projectDir = Path.GetDirectoryName(_project.FilePath);
            if (!string.IsNullOrEmpty(projectDir) && Directory.Exists(projectDir))
                return projectDir;
        }

        return Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
    }

    private static void RememberDir(string filePath)
    {
        var dir = Path.GetDirectoryName(filePath);
        if (!string.IsNullOrEmpty(dir))
            AppSettings.SetLastDirectory(dir);
        AppSettings.SetLastFilePath(filePath);
    }
}
