using MyDiffWinV10.App.Core;
using MyDiffWinV10.App.Dialogs;
using MyDiffWinV10.App.Services;

namespace MyDiffWinV10.App.Controls;

/// <summary>
/// Side-by-side file diff panes without shell chrome (menu, toolbar, status bar).
/// </summary>
public sealed class FileDiffView : UserControl
{
    private const int HeaderHeight = 28;

    private static readonly Color CanvasColor = Color.FromArgb(241, 243, 247);

    private readonly SyncLineListBox _lstLeft = new();
    private readonly SyncLineListBox _lstRight = new();
    private readonly LineNumberGutter _gutterLeft = new();
    private readonly LineNumberGutter _gutterRight = new();
    private readonly DiffOverviewBar _overviewLeft = new();
    private readonly DiffOverviewBar _overviewRight = new();
    private readonly PaneVScrollBar _vscrollLeft = new();
    private readonly PaneVScrollBar _vscrollRight = new();
    private readonly ToolTip _paneHeaderToolTip = new();

    private Label _lblPaneLeft = null!;
    private Label _lblPaneRight = null!;
    private ToolStripMenuItem? _wordWrapMenuItem;

    private readonly AppSettings _settings;
    private DiffSession? _session;
    private Func<DiffSession>? _initialSessionFactory;
    private readonly List<FileSystemWatcher> _fileWatchers = new();
    private System.Windows.Forms.Timer? _fileReloadTimer;
    private int _fileReloadAttempts;

    public FileDiffView(AppSettings settings)
    {
        _settings = settings;
        Dock = DockStyle.Fill;
        BackColor = CanvasColor;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
        BuildLayout();
        ApplyPanePreferences();
        ApplyPaneHeaderColors();
        UpdateActionState();
    }

    public DiffSession? Session => _session;

    public bool HasSession => _session != null;

    public event EventHandler? SessionChanged;

    public event EventHandler<string>? StatusChanged;

    public void SetWordWrapMenuItem(ToolStripMenuItem item) => _wordWrapMenuItem = item;

    public void SetInitialSessionFactory(Func<DiffSession> factory) => _initialSessionFactory = factory;

    public void OnViewShown()
    {
        try
        {
            if (_initialSessionFactory != null)
            {
                LoadSession(_initialSessionFactory());
                _initialSessionFactory = null;
            }
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(FindForm(), ex);
        }

        if (_session == null)
        {
            _lstLeft.EnsureViewportFill();
            _lstRight.EnsureViewportFill();
            UpdateStatus();
        }
    }

    public void ApplyLocalization()
    {
        UpdatePaneHeaderText();
        _paneHeaderToolTip.SetToolTip(_lblPaneLeft, Strings.TipOpenLeft);
        _paneHeaderToolTip.SetToolTip(_lblPaneRight, Strings.TipOpenRight);
        ApplyPaneContextMenus();
        UpdateStatus();
    }

    public void ApplyPaneHeaderColors()
    {
        var left = PaneTheme.HeaderColors(isLeft: true, _settings);
        _lblPaneLeft.BackColor = left.Background;
        _lblPaneLeft.ForeColor = left.Text;

        var right = PaneTheme.HeaderColors(isLeft: false, _settings);
        _lblPaneRight.BackColor = right.Background;
        _lblPaneRight.ForeColor = right.Text;
    }

    public void ApplyPanePreferences()
    {
        var font = new Font("Consolas", _settings.PaneFontSize);
        _lstLeft.Font = font;
        _lstRight.Font = font;
        _lstLeft.WordWrap = _settings.WordWrap;
        _lstRight.WordWrap = _settings.WordWrap;
        if (_wordWrapMenuItem != null)
        {
            _wordWrapMenuItem.Checked = _settings.WordWrap;
        }
    }

    public void OpenLeft()
    {
        using var dialog = new OpenFileDialog { Title = Strings.DialogSelectLeftFile };
        if (dialog.ShowDialog(FindForm()) != DialogResult.OK)
        {
            return;
        }

        string rightPath = _session?.RightPath ?? dialog.FileName;
        LoadSessionSafely(() => DiffSession.Load(dialog.FileName, rightPath));
    }

    public void OpenRight()
    {
        using var dialog = new OpenFileDialog { Title = Strings.DialogSelectRightFile };
        if (dialog.ShowDialog(FindForm()) != DialogResult.OK)
        {
            return;
        }

        string leftPath = _session?.LeftPath ?? dialog.FileName;
        LoadSessionSafely(() => DiffSession.Load(leftPath, dialog.FileName));
    }

    public void Reload()
    {
        if (_session == null)
        {
            return;
        }

        LoadSessionSafely(() => DiffSession.Load(_session.LeftPath, _session.RightPath));
    }

    public void ToggleWordWrap()
    {
        _settings.WordWrap = !_settings.WordWrap;
        ApplyPanePreferences();
        AppSettingsStore.Save(_settings);
    }

    public void GoToDiff(int direction)
    {
        if (_session == null)
        {
            return;
        }

        IReadOnlyList<DiffLineKind>? rows = GetCurrentRowKinds();
        if (rows == null)
        {
            return;
        }

        int i = _lstLeft.GetFirstVisibleLine() + direction;
        while (i >= 0 && i < rows.Count)
        {
            if (rows[i] != DiffLineKind.Same)
            {
                JumpToLine(i);
                return;
            }

            i += direction;
        }
    }

    public void CopyFromActivePane()
    {
        if (ActiveControl is SyncLineListBox listBox)
        {
            listBox.CopySelectedLine();
        }
    }

    public void LoadSessionFromPaths(string leftPath, string rightPath)
    {
        LoadSessionSafely(() => DiffSession.Load(leftPath, rightPath));
    }

    public void LoadSession(DiffSession session)
    {
        _session = session;
        _settings.LastSession = new LastSessionInfo { LeftPath = session.LeftPath, RightPath = session.RightPath };
        AppSettingsStore.Save(_settings);

        RenderDiff(session);
        UpdateStatus();
        UpdateActionState();
        ApplyBinaryUiState();
        UpdatePaneHeaderText();
        WatchSessionFiles();
        SessionChanged?.Invoke(this, EventArgs.Empty);
    }

    public ContextMenuStrip BuildPaneContextMenu(SyncLineListBox listBox, bool isLeft)
    {
        var menu = new ContextMenuStrip { ShowItemToolTips = false, Renderer = new ModernToolStripRenderer() };
        menu.Items.Add(isLeft
            ? CreateMenuItem(Strings.OpenLeft, IconFactory.OpenLeftFile(), () => OpenLeft())
            : CreateMenuItem(Strings.OpenRight, IconFactory.OpenRightFile(), () => OpenRight()));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(CreateMenuItem(Strings.PreviousDiff, IconFactory.PrevDiff(), () => GoToDiff(-1)));
        menu.Items.Add(CreateMenuItem(Strings.NextDiff, IconFactory.NextDiff(), () => GoToDiff(1)));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(CreateMenuItem(Strings.Copy, IconFactory.Copy(), () => listBox.CopySelectedLine()));
        return menu;
    }

    private void ApplyPaneContextMenus()
    {
        _lstLeft.ContextMenuStrip = BuildPaneContextMenu(_lstLeft, isLeft: true);
        _lstRight.ContextMenuStrip = BuildPaneContextMenu(_lstRight, isLeft: false);
    }

    private void BuildLayout()
    {
        var topPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 1,
            BackColor = CanvasColor,
            Padding = new Padding(4, 1, 4, 4),
        };
        topPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
        topPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));

        ConfigureSourcePane(_lstLeft);
        ConfigureSourcePane(_lstRight);
        _lstLeft.Partners.Add(_lstRight);
        _lstRight.Partners.Add(_lstLeft);

        _lstLeft.ContextMenuStrip = BuildPaneContextMenu(_lstLeft, isLeft: true);
        _lstRight.ContextMenuStrip = BuildPaneContextMenu(_lstRight, isLeft: false);

        _gutterLeft.Sync(_lstLeft);
        _gutterRight.Sync(_lstRight);
        _vscrollLeft.AttachTarget(_lstLeft);
        _vscrollRight.AttachTarget(_lstRight);
        _overviewLeft.AttachTarget(_lstLeft);
        _overviewRight.AttachTarget(_lstRight);
        _overviewLeft.LineClicked += (_, line) => JumpToLine(line);
        _overviewRight.LineClicked += (_, line) => JumpToLine(line);

        topPanel.Controls.Add(MakePaneCard(isLeft: true, _gutterLeft, _lstLeft, _vscrollLeft, _overviewLeft, out _lblPaneLeft), 0, 0);
        topPanel.Controls.Add(MakePaneCard(isLeft: false, _gutterRight, _lstRight, _vscrollRight, _overviewRight, out _lblPaneRight), 1, 0);

        Controls.Add(topPanel);

        _lblPaneLeft.Cursor = Cursors.Hand;
        _lblPaneRight.Cursor = Cursors.Hand;
        _lblPaneLeft.Click += (_, _) => OpenLeft();
        _lblPaneRight.Click += (_, _) => OpenRight();
    }

    private static void ConfigureSourcePane(SyncLineListBox listBox)
    {
        listBox.Dock = DockStyle.Fill;
        listBox.BorderStyle = BorderStyle.None;
    }

    private Control MakePaneCard(
        bool isLeft,
        LineNumberGutter gutter,
        SyncLineListBox listBox,
        PaneVScrollBar scrollBar,
        DiffOverviewBar overviewBar,
        out Label titleLabel)
    {
        Color headerBg = isLeft
            ? PaneHeaderColorPalette.DefaultLeftBackground
            : PaneHeaderColorPalette.DefaultRightBackground;
        Color headerText = PaneHeaderColorPalette.HeaderTextForBackground(headerBg);
        titleLabel = new Label
        {
            Dock = DockStyle.Top,
            Height = HeaderHeight,
            Font = new Font("Segoe UI", 10f, FontStyle.Bold),
            ForeColor = headerText,
            BackColor = headerBg,
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(8, 0, 8, 0),
            AutoEllipsis = true,
        };

        gutter.Dock = DockStyle.Left;
        overviewBar.Dock = DockStyle.Right;
        scrollBar.Dock = DockStyle.Right;

        var body = new Panel { Dock = DockStyle.Fill, BackColor = Color.White };
        body.Controls.Add(listBox);
        body.Controls.Add(gutter);
        body.Controls.Add(scrollBar);
        body.Controls.Add(overviewBar);

        var card = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.FromArgb(226, 232, 240),
            Padding = new Padding(1),
            Margin = new Padding(2, 0, 2, 2),
        };
        var inner = new Panel { Dock = DockStyle.Fill, BackColor = Color.White };
        inner.Controls.Add(body);
        inner.Controls.Add(titleLabel);
        card.Controls.Add(inner);
        return card;
    }

    private static ToolStripMenuItem CreateMenuItem(string text, Image image, Action action)
    {
        var item = new ToolStripMenuItem(text, image);
        item.Click += (_, _) => action();
        return item;
    }

    private void LoadSessionSafely(Func<DiffSession> factory)
    {
        try
        {
            LoadSession(factory());
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(FindForm(), Strings.ErrorOpenFile, ex);
        }
    }

    private void UpdatePaneHeaderText()
    {
        _lblPaneLeft.Text = FormatPaneHeader(Strings.PaneLeft, _session?.LeftPath);
        _lblPaneRight.Text = FormatPaneHeader(Strings.PaneRight, _session?.RightPath);
    }

    private static string FormatPaneHeader(string sideLabel, string? filePath) =>
        filePath == null ? sideLabel : $"{sideLabel} — {Path.GetFileName(filePath)}";

    private void RenderDiff(DiffSession session)
    {
        if (session.Mode == DiffMode.Binary)
        {
            RenderBinaryDiff(session.BinaryDocument!);
            return;
        }

        RenderTextDiff(session.TextDocument!);
    }

    private void RenderTextDiff(DiffDocument document)
    {
        _lstLeft.ClearLines();
        _lstRight.ClearLines();

        int line = 0;
        foreach (DiffRow row in document.Rows)
        {
            _lstLeft.AddLine(
                row.LeftText ?? string.Empty,
                PaneTheme.PaneRowBackColor(row.Kind, line, row.LeftText != null));
            _lstRight.AddLine(
                row.RightText ?? string.Empty,
                PaneTheme.PaneRowBackColor(row.Kind, line, row.RightText != null));
            line++;
        }

        FinishRender(document.Rows.Select(row => row.Kind).ToList());
    }

    private void RenderBinaryDiff(BinaryDiffDocument document)
    {
        _lstLeft.SetVirtualBinaryContent(document, isLeft: true);
        _lstRight.SetVirtualBinaryContent(document, isLeft: false);
        FinishRender(document.RowKinds);
    }

    private void FinishRender(IReadOnlyList<DiffLineKind> kinds)
    {
        _lstLeft.FinishBatch();
        _lstRight.FinishBatch();
        _lstLeft.ScrollToTop();
        _lstRight.ScrollToTop();
        _overviewLeft.SetRowKinds(kinds);
        _overviewRight.SetRowKinds(kinds);
        RefreshScrollIndicators();
    }

    private void ApplyBinaryUiState()
    {
        bool isBinary = _session?.Mode == DiffMode.Binary;
        if (isBinary && _settings.WordWrap)
        {
            _settings.WordWrap = false;
            ApplyPanePreferences();
        }
    }

    private IReadOnlyList<DiffLineKind>? GetCurrentRowKinds()
    {
        if (_session == null)
        {
            return null;
        }

        return _session.Mode == DiffMode.Binary
            ? _session.BinaryDocument!.RowKinds
            : _session.TextDocument!.Rows.Select(row => row.Kind).ToList();
    }

    private void JumpToLine(int line)
    {
        if (_session == null)
        {
            return;
        }

        int clamped = Math.Clamp(line, 0, Math.Max(0, _lstLeft.ContentLineCount - 1));
        _lstLeft.SetBinaryScrollTop(clamped);
        _lstRight.SetBinaryScrollTop(clamped, syncPartners: false);
        RefreshScrollIndicators();
    }

    private void RefreshScrollIndicators()
    {
        _vscrollLeft.SyncFromTarget();
        _vscrollRight.SyncFromTarget();
        _gutterLeft.Invalidate();
        _gutterRight.Invalidate();
        _overviewLeft.Invalidate();
        _overviewRight.Invalidate();
    }

    private void UpdateActionState()
    {
        // Shell updates toolbar/menu enablement via SessionChanged.
    }

    private void UpdateStatus()
    {
        if (_session == null)
        {
            StatusChanged?.Invoke(this, Strings.StatusNoSession);
            return;
        }

        if (_session.Mode == DiffMode.Binary && _session.BinaryDocument is { } binary)
        {
            StatusChanged?.Invoke(this, binary.HasDifferences
                ? Strings.FormatBinaryStatus(
                    _session.LeftPath,
                    _session.RightPath,
                    binary.DifferentByteCount,
                    binary.AddedRowCount,
                    binary.RemovedRowCount,
                    binary.ModifiedRowCount)
                : Strings.StatusBinaryIdentical);
            return;
        }

        if (_session.TextDocument is not { } doc)
        {
            StatusChanged?.Invoke(this, Strings.StatusNoSession);
            return;
        }

        StatusChanged?.Invoke(this, doc.HasDifferences
            ? Strings.FormatStatus(_session.LeftPath, _session.RightPath, doc.AddedCount, doc.RemovedCount, doc.ModifiedCount)
            : Strings.StatusIdentical);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            DisposeFileWatchers();
            _fileReloadTimer?.Dispose();
            _fileReloadTimer = null;
        }

        base.Dispose(disposing);
    }

    private void WatchSessionFiles()
    {
        DisposeFileWatchers();
        if (_session == null)
        {
            return;
        }

        WatchFile(_session.LeftPath);
        if (!string.Equals(_session.LeftPath, _session.RightPath, StringComparison.OrdinalIgnoreCase))
        {
            WatchFile(_session.RightPath);
        }
    }

    private void WatchFile(string filePath)
    {
        string? directory = Path.GetDirectoryName(filePath);
        string name = Path.GetFileName(filePath);
        if (string.IsNullOrEmpty(directory) || string.IsNullOrEmpty(name) || !Directory.Exists(directory))
        {
            return;
        }

        var watcher = new FileSystemWatcher(directory, name)
        {
            NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size,
            EnableRaisingEvents = true,
        };
        FileSystemEventHandler changed = (_, _) => ScheduleFileReload();
        watcher.Changed += changed;
        watcher.Created += changed;
        watcher.Renamed += (_, _) => ScheduleFileReload();
        _fileWatchers.Add(watcher);
    }

    private void ScheduleFileReload()
    {
        if (IsDisposed)
        {
            return;
        }

        if (InvokeRequired)
        {
            try
            {
                BeginInvoke(ScheduleFileReload);
            }
            catch (InvalidOperationException)
            {
                /* the view is closing */
            }

            return;
        }

        _fileReloadTimer ??= new System.Windows.Forms.Timer { Interval = 300 };
        _fileReloadTimer.Tick -= OnFileReloadTick;
        _fileReloadTimer.Tick += OnFileReloadTick;
        _fileReloadTimer.Stop();
        _fileReloadTimer.Start();
    }

    private void OnFileReloadTick(object? sender, EventArgs e)
    {
        _fileReloadTimer?.Stop();
        if (_session == null || IsDisposed)
        {
            return;
        }

        try
        {
            LoadSession(DiffSession.Load(_session.LeftPath, _session.RightPath));
            _fileReloadAttempts = 0;
        }
        catch (IOException) when (_fileReloadAttempts < 5)
        {
            _fileReloadAttempts++;
            ScheduleFileReload();
        }
        catch (Exception ex)
        {
            _fileReloadAttempts = 0;
            ErrorDialog.Show(FindForm(), Strings.ErrorOpenFile, ex);
        }
    }

    private void DisposeFileWatchers()
    {
        foreach (FileSystemWatcher watcher in _fileWatchers)
        {
            watcher.EnableRaisingEvents = false;
            watcher.Dispose();
        }

        _fileWatchers.Clear();
    }
}
