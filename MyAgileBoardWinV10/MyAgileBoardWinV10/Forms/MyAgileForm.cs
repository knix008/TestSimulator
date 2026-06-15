using System.Text.Json;
using MyAgileBoardWinV10.Controls;
using MyAgileBoardWinV10.Models;
using MyAgileBoardWinV10.Services;
using MyAgileBoardWinV10.Utils;

namespace MyAgileBoardWinV10.Forms;

public partial class MyAgileForm : Form
{
    private KanbanProject _project = KanbanProject.CreateDefault();
    private bool _isDirty = false;

    // Column drag state
    private KanbanColumnControl? _draggingColumn;
    private Form? _ghostForm;
    private Panel? _dropIndicator;

    // Card drag state
    private KanbanCard? _draggingCard;
    private int _draggingCardHeight = 56;

    // Undo/Redo stacks (JSON snapshots of KanbanProject)
    private readonly Stack<string> _undoStack = new();
    private readonly Stack<string> _redoStack = new();
    // JSON of project at last save/load — used to detect real dirtiness after undo
    private string _savedStateJson = string.Empty;

    public MyAgileForm()
    {
        InitializeComponent();
        LoadAppIcon();
        SetupIcons();
        SetupTooltips();
        RebuildBoard();
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
        toolBtnCompleted.Image = IconFactory.Get("check");
        toolBtnBurndown.Image  = IconFactory.Get("summary");

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
        menuBurndown.Image         = IconFactory.Get("summary");
    }

    private void SetupTooltips()
    {
        toolBtnNew.ToolTipText       = "새 프로젝트 만들기 (Ctrl+N)";
        toolBtnOpen.ToolTipText      = "프로젝트 열기 (Ctrl+O)";
        toolBtnSave.ToolTipText      = "저장 (Ctrl+S)";
        toolBtnUndo.ToolTipText      = "실행 취소 (Ctrl+Z)";
        toolBtnRedo.ToolTipText      = "다시 실행 (Ctrl+Y)";
        toolBtnSummary.ToolTipText   = "Summary / 차트 보기 (Ctrl+T)";
        toolBtnCompleted.ToolTipText = "완료 후 삭제된 항목 보기";
        toolBtnBurndown.ToolTipText  = "Burn Down 차트 보기";
    }

    // ─────────────────────────────────────────────
    //  Board management
    // ─────────────────────────────────────────────

    private void RebuildBoard()
    {
        CleanupGhost();

        panelBoard.SuspendLayout();
        panelBoard.Controls.Clear();

        foreach (var col in _project.Columns)
            panelBoard.Controls.Add(CreateColumnControl(col));

        panelBoard.Controls.Add(BuildAddColumnButton());
        panelBoard.ResumeLayout();

        UpdateStatusBar();
    }

    private KanbanColumnControl CreateColumnControl(KanbanColumn col)
    {
        var ctrl = new KanbanColumnControl(col)
        {
            Height = Math.Max(panelBoard.ClientSize.Height - 12, 300),
            Margin = new Padding(4, 0, 0, 0)
        };
        ctrl.AddCardRequested        += OnAddCardRequested;
        ctrl.ColumnSettingsRequested += OnColumnSettingsRequested;
        ctrl.DeleteColumnRequested   += OnDeleteColumnRequested;
        ctrl.ProjectChanged          += (_, _) => UpdateDirtyState();
        ctrl.BeforeProjectChange     += (_, _) => SaveUndoSnapshot();
        ctrl.CardArchivedRequested   += OnCardArchivedRequested;
        ctrl.ColumnHeaderDragStarted += OnColumnHeaderDragStarted;
        ctrl.ColumnHeaderDragging    += OnColumnHeaderDragging;
        ctrl.ColumnHeaderDragEnded   += OnColumnHeaderDragEnded;
        ctrl.CardDragStarted         += OnCardDragStarted;
        ctrl.CardDragging            += OnCardDragging;
        ctrl.CardDragEnded           += OnCardDragEnded;
        return ctrl;
    }

    private Button BuildAddColumnButton()
    {
        var btn = new Button
        {
            Size      = new Size(54, Math.Max(panelBoard.ClientSize.Height - 12, 300)),
            Text      = "+\r\n컬럼",
            Font      = new Font("Segoe UI", 9F, FontStyle.Bold),
            FlatStyle = FlatStyle.Flat,
            ForeColor = Color.DimGray,
            BackColor = Color.FromArgb(220, 222, 226),
            Margin    = new Padding(6, 0, 4, 0),
        };
        btn.FlatAppearance.BorderColor = Color.Silver;
        btn.Image = IconFactory.Get("add");
        btn.ImageAlign = ContentAlignment.TopCenter;
        btn.TextAlign = ContentAlignment.BottomCenter;
        var tip = new ToolTip();
        tip.SetToolTip(btn, "새 컬럼 추가");
        btn.Click += BtnAddColumn_Click;
        return btn;
    }

    private void panelBoard_Resize(object sender, EventArgs e)
    {
        int h = Math.Max(panelBoard.ClientSize.Height - 12, 300);
        foreach (Control ctrl in panelBoard.Controls)
            ctrl.Height = h;
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
        var boardPos = panelBoard.PointToClient(screenPos);
        int insertIdx = GetColumnDropIndex(boardPos);
        PositionDropIndicator(insertIdx);
    }

    private void OnColumnHeaderDragEnded(object? sender, Point screenPos)
    {
        CleanupGhost();

        if (_draggingColumn == null) return;

        var boardPos = panelBoard.PointToClient(screenPos);
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
            Width     = 250,
            Height    = Math.Max(panelBoard.ClientSize.Height - 12, 300),
            BackColor = Color.FromArgb(80, 30, 144, 255),
            BorderStyle = BorderStyle.FixedSingle,
            Margin    = new Padding(4, 0, 0, 0),
            Tag       = "indicator"
        };
    }

    private void PositionDropIndicator(int insertIdx)
    {
        if (_dropIndicator == null) return;

        var columns = panelBoard.Controls.OfType<KanbanColumnControl>().ToList();
        if (insertIdx < 0 || columns.Count == 0) return;

        _dropIndicator.Height = Math.Max(panelBoard.ClientSize.Height - 12, 300);

        panelBoard.SuspendLayout();

        // Remove placeholder if already there, then re-insert at right spot
        if (panelBoard.Controls.Contains(_dropIndicator))
            panelBoard.Controls.Remove(_dropIndicator);

        panelBoard.Controls.Add(_dropIndicator);

        int targetCtrlIdx = insertIdx < columns.Count
            ? panelBoard.Controls.IndexOf(columns[insertIdx])
            : panelBoard.Controls.IndexOf(columns[^1]) + 1;
        panelBoard.Controls.SetChildIndex(_dropIndicator, targetCtrlIdx);

        panelBoard.ResumeLayout();
    }

    private int GetColumnDropIndex(Point boardPos)
    {
        var columns = panelBoard.Controls
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
            panelBoard.Controls.Remove(_dropIndicator);
            _dropIndicator.Dispose();
            _dropIndicator = null;
        }
    }

    // ─────────────────────────────────────────────
    //  Card operations
    // ─────────────────────────────────────────────

    private void OnAddCardRequested(object? sender, KanbanColumn column)
    {
        var newCard = new KanbanCard { Title = "새 카드" };
        using var form = new CardEditForm(newCard);
        if (form.ShowDialog() != DialogResult.OK) return;

        SaveUndoSnapshot();
        FindColumnControl(column)?.AddCard(newCard);
        UpdateDirtyState();
        UpdateStatusBar();
    }

    // ─────────────────────────────────────────────
    //  Card drag with ghost + drop indicator
    // ─────────────────────────────────────────────

    private void OnCardDragStarted(object? sender, (KanbanCard Card, Point ScreenPos) e)
    {
        if (sender is not KanbanCardControl cardCtrl) return;
        _draggingCard = e.Card;
        _draggingCardHeight = cardCtrl.Height;

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

        var targetCol = panelBoard.Controls
            .OfType<KanbanColumnControl>()
            .FirstOrDefault(c => c.ContainsScreenPoint(e.ScreenPos));

        foreach (var col in panelBoard.Controls.OfType<KanbanColumnControl>())
        {
            if (col == targetCol)
                col.ShowCardDropIndicator(col.GetCardInsertIndexFromScreen(e.ScreenPos), _draggingCardHeight);
            else
                col.HideCardDropIndicator();
        }
    }

    private void OnCardDragEnded(object? sender, (KanbanCard Card, Point ScreenPos) e)
    {
        _ghostForm?.Close();
        _ghostForm?.Dispose();
        _ghostForm = null;

        foreach (var col in panelBoard.Controls.OfType<KanbanColumnControl>())
            col.HideCardDropIndicator();

        if (_draggingCard == null) { _draggingCard = null; return; }

        var targetColCtrl = panelBoard.Controls
            .OfType<KanbanColumnControl>()
            .FirstOrDefault(c => c.ContainsScreenPoint(e.ScreenPos));

        if (targetColCtrl != null)
        {
            int insertIdx = targetColCtrl.GetCardInsertIndexFromScreen(e.ScreenPos);
            MoveCard(_draggingCard, targetColCtrl.Column, insertIdx);
        }

        _draggingCard = null;
    }

    private void MoveCard(KanbanCard card, KanbanColumn targetColumn, int insertIdx)
    {
        SaveUndoSnapshot();
        var sourceCol = _project.Columns.FirstOrDefault(c => c.Cards.Contains(card));
        if (sourceCol == null) return;

        bool sameColumn = sourceCol.Id == targetColumn.Id;
        int srcIdx = sourceCol.Cards.IndexOf(card);

        if (targetColumn.IsCompletionColumn && card.CompletedAt == null)
            card.CompletedAt = DateTime.Now;
        else if (!targetColumn.IsCompletionColumn)
            card.CompletedAt = null;

        if (sameColumn)
        {
            if (srcIdx == insertIdx || srcIdx + 1 == insertIdx) return;
            sourceCol.Cards.RemoveAt(srcIdx);
            int target = insertIdx > srcIdx ? insertIdx - 1 : insertIdx;
            sourceCol.Cards.Insert(Math.Clamp(target, 0, sourceCol.Cards.Count), card);
            FindColumnControl(sourceCol)?.LoadCards();
            FindColumnControl(sourceCol)?.UpdateHeader();
        }
        else
        {
            sourceCol.Cards.RemoveAt(srcIdx);
            targetColumn.Cards.Insert(Math.Clamp(insertIdx, 0, targetColumn.Cards.Count), card);
            FindColumnControl(sourceCol)?.LoadCards();
            FindColumnControl(sourceCol)?.UpdateHeader();
            FindColumnControl(targetColumn)?.LoadCards();
            FindColumnControl(targetColumn)?.UpdateHeader();
        }

        UpdateDirtyState();
        UpdateStatusBar();
    }

    private KanbanColumnControl? FindColumnControl(KanbanColumn col) =>
        panelBoard.Controls.OfType<KanbanColumnControl>()
                           .FirstOrDefault(c => c.Column.Id == col.Id);

    // ─────────────────────────────────────────────
    //  Column operations
    // ─────────────────────────────────────────────

    private void OnColumnSettingsRequested(object? sender, KanbanColumn column)
    {
        using var form = new ColumnSettingsForm(column);
        if (form.ShowDialog() != DialogResult.OK) return;
        FindColumnControl(column)?.UpdateHeader();
        UpdateDirtyState();
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
        var newCol = new KanbanColumn { Name = "새 컬럼" };
        using var form = new ColumnSettingsForm(newCol);
        if (form.ShowDialog() != DialogResult.OK) return;
        SaveUndoSnapshot();
        _project.Columns.Add(newCol);
        RebuildBoard();
        UpdateDirtyState();
    }

    // ─────────────────────────────────────────────
    //  File operations
    // ─────────────────────────────────────────────

    private void menuNew_Click(object sender, EventArgs e)
    {
        if (!ConfirmDiscardChanges()) return;
        _project = KanbanProject.CreateDefault();
        RebuildBoard();
        CaptureSavedState();
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
        RememberDir(dlg.FileName);

        var loaded = ProjectService.Load(dlg.FileName);
        if (loaded == null)
        {
            MessageBox.Show("파일을 불러올 수 없습니다.", "오류",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        _project = loaded;
        RebuildBoard();
        CaptureSavedState();
        UpdateStatusBar();
    }

    private void menuSave_Click(object sender, EventArgs e)   => Save();
    private void menuSaveAs_Click(object sender, EventArgs e) => SaveAs();

    private bool Save()
    {
        if (string.IsNullOrEmpty(_project.FilePath)) return SaveAs();
        ProjectService.Save(_project, _project.FilePath);
        RememberDir(_project.FilePath);
        CaptureSavedState();
        return true;
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
        ProjectService.Save(_project, dlg.FileName);
        CaptureSavedState();
        return true;
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
        if (form.ShowDialog() == DialogResult.OK)
            UpdateDirtyState();
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
        _savedStateJson = JsonSerializer.Serialize(_project, ProjectService.Options);
        _isDirty = false;
        UpdateTitle();
    }

    private void UpdateDirtyState()
    {
        var currentJson = JsonSerializer.Serialize(_project, ProjectService.Options);
        _isDirty = currentJson != _savedStateJson;
        UpdateTitle();
        UpdateStatusBar();
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
            e.Cancel = true;
        base.OnFormClosing(e);
    }

    // Toolbar handlers
    private void toolBtnNew_Click(object sender, EventArgs e)     => menuNew_Click(sender, e);
    private void toolBtnOpen_Click(object sender, EventArgs e)    => menuOpen_Click(sender, e);
    private void toolBtnSave_Click(object sender, EventArgs e)    => menuSave_Click(sender, e);
    private void toolBtnSummary_Click(object sender, EventArgs e) => menuSummary_Click(sender, e);

    // ─────────────────────────────────────────────
    //  Undo / Redo
    // ─────────────────────────────────────────────

    private void SaveUndoSnapshot()
    {
        var json = JsonSerializer.Serialize(_project, ProjectService.Options);
        _undoStack.Push(json);
        _redoStack.Clear();
        UpdateUndoRedoUI();
    }

    private void menuUndo_Click(object? sender, EventArgs e)
    {
        if (_undoStack.Count == 0) return;
        var currentJson = JsonSerializer.Serialize(_project, ProjectService.Options);
        _redoStack.Push(currentJson);
        var json = _undoStack.Pop();
        _project = JsonSerializer.Deserialize<KanbanProject>(json, ProjectService.Options)!;
        RebuildBoard();
        UpdateDirtyState();
        UpdateUndoRedoUI();
    }

    private void menuRedo_Click(object? sender, EventArgs e)
    {
        if (_redoStack.Count == 0) return;
        var currentJson = JsonSerializer.Serialize(_project, ProjectService.Options);
        _undoStack.Push(currentJson);
        var json = _redoStack.Pop();
        _project = JsonSerializer.Deserialize<KanbanProject>(json, ProjectService.Options)!;
        RebuildBoard();
        UpdateDirtyState();
        UpdateUndoRedoUI();
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
        form.ShowDialog();
    }

    private void menuAbout_Click(object? sender, EventArgs e)
    {
        using var form = new AboutForm();
        form.ShowDialog();
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
    }
}
