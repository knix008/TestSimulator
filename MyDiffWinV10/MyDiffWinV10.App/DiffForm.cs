using MyDiffWinV10.App.Controls;
using MyDiffWinV10.App.Core;
using MyDiffWinV10.App.Dialogs;
using MyDiffWinV10.App.Services;

namespace MyDiffWinV10.App;

public sealed class DiffForm : Form
{
    private const int HeaderHeight = 36;

    private static readonly Color CanvasColor = Color.FromArgb(241, 243, 247);
    private static readonly Color LeftAccent = Color.FromArgb(100, 116, 139);
    private static readonly Color RightAccent = Color.FromArgb(37, 99, 235);

    private readonly SyncLineListBox _lstLeft = new();
    private readonly SyncLineListBox _lstRight = new();
    private readonly LineNumberGutter _gutterLeft = new();
    private readonly LineNumberGutter _gutterRight = new();
    private readonly DiffOverviewBar _overviewLeft = new();
    private readonly DiffOverviewBar _overviewRight = new();
    private readonly PaneVScrollBar _vscrollLeft = new();
    private readonly PaneVScrollBar _vscrollRight = new();
    private readonly ToolStripStatusLabel _statusLabel = new();

    private readonly ToolStripButton _tsbOpenLeft = new() { Image = IconFactory.OpenLeft() };
    private readonly ToolStripButton _tsbOpenRight = new() { Image = IconFactory.OpenRight() };
    private readonly ToolStripButton _tsbReload = new() { Image = IconFactory.Reload() };
    private readonly ToolStripButton _tsbPrev = new() { Image = IconFactory.PrevDiff() };
    private readonly ToolStripButton _tsbNext = new() { Image = IconFactory.NextDiff() };
    private readonly ToolStripButton _tsbWordWrap = new() { Image = IconFactory.WordWrap() };
    private readonly ToolStripButton _tsbInfo = new() { Image = IconFactory.Info(), Alignment = ToolStripItemAlignment.Right };
    private readonly ToolStripLabel _tslFontSize = new();
    private readonly NumericUpDown _nudFontSize = new()
    {
        DecimalPlaces = 1,
        Increment = 0.5m,
        Minimum = 6m,
        Maximum = 32m,
        Width = 55,
    };

    private ToolStripMenuItem _wordWrapMenuItem = null!;
    private Label _lblPaneLeft = null!;
    private Label _lblPaneRight = null!;
    private ToolStrip? _toolStrip;
    private readonly ToolTip _paneHeaderToolTip = new();

    private readonly List<(Control Control, Func<string> GetText)> _localizedControls = new();
    private readonly List<(ToolStripItem Item, Func<string> GetText)> _localizedItems = new();
    private readonly List<(ToolStripItem Item, Func<string> GetToolTip)> _localizedToolTips = new();

    private readonly AppSettings _settings = AppSettingsStore.Load();
    private DiffSession? _session;
    private Func<DiffSession>? _initialSessionFactory;
    private bool _restoreLastSessionOnLoad;

    private DiffForm()
    {
        Strings.Language = _settings.Language;
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 10f);
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        Width = Math.Max(_settings.WindowWidth, 900);
        Height = Math.Max(_settings.WindowHeight, 600);

        BuildLayout();
        ApplyLocalization();
        ApplyPanePreferences();
        WireEvents();
        UpdateActionItemsEnabled();
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);

        try
        {
            if (_initialSessionFactory != null)
            {
                LoadSession(_initialSessionFactory());
            }
            else if (_restoreLastSessionOnLoad)
            {
                RestoreLastSessionIfAvailable();
            }
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(this, ex);
        }

        if (_session == null)
        {
            _lstLeft.EnsureViewportFill();
            _lstRight.EnsureViewportFill();
        }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        _settings.WindowWidth = Width;
        _settings.WindowHeight = Height;
        AppSettingsStore.Save(_settings);
        base.OnFormClosing(e);
    }

    public static DiffForm Standalone()
    {
        var form = new DiffForm();
        form._restoreLastSessionOnLoad = true;
        return form;
    }

    public static DiffForm FromFiles(string leftFile, string rightFile)
    {
        var form = new DiffForm();
        form._initialSessionFactory = () => DiffSession.Load(leftFile, rightFile);
        return form;
    }

    private void BuildLayout()
    {
        BackColor = CanvasColor;

        var menu = BuildMenu();
        var toolStrip = BuildToolStrip();
        _toolStrip = toolStrip;

        var topPanel = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, BackColor = CanvasColor, Padding = new Padding(8) };
        topPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
        topPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
        topPanel.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));

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

        topPanel.Controls.Add(MakePaneCard(LeftAccent, _gutterLeft, _lstLeft, _vscrollLeft, _overviewLeft, out _lblPaneLeft), 0, 0);
        topPanel.Controls.Add(MakePaneCard(RightAccent, _gutterRight, _lstRight, _vscrollRight, _overviewRight, out _lblPaneRight), 1, 0);

        var statusStrip = new StatusStrip { SizingGrip = false, BackColor = CanvasColor };
        statusStrip.Items.Add(_statusLabel);

        Controls.Add(topPanel);
        Controls.Add(toolStrip);
        Controls.Add(statusStrip);
        Controls.Add(menu);

        ConfigurePaneHeader(_lblPaneLeft, OpenLeft);
        ConfigurePaneHeader(_lblPaneRight, OpenRight);
    }

    private static string FormatPaneHeader(string sideLabel, string? filePath) =>
        filePath == null ? sideLabel : $"{sideLabel} — {Path.GetFileName(filePath)}";

    private void ConfigurePaneHeader(Label label, Action openFile)
    {
        label.Cursor = Cursors.Hand;
        label.Click += (_, _) => openFile();
    }

    private static void ConfigureSourcePane(SyncLineListBox listBox)
    {
        listBox.Dock = DockStyle.Fill;
        listBox.BorderStyle = BorderStyle.None;
    }

    private static Control MakePaneCard(Color accent, LineNumberGutter gutter, SyncLineListBox listBox, PaneVScrollBar scrollBar, DiffOverviewBar overviewBar, out Label titleLabel)
    {
        var headerBg = PaneTheme.PastelHeaderBackground(accent);
        titleLabel = new Label
        {
            Dock = DockStyle.Top,
            Height = HeaderHeight,
            Font = new Font("Segoe UI", 11f, FontStyle.Bold),
            ForeColor = accent,
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
            Margin = new Padding(4),
        };
        var inner = new Panel { Dock = DockStyle.Fill, BackColor = Color.White };
        inner.Controls.Add(body);
        inner.Controls.Add(titleLabel);
        card.Controls.Add(inner);
        return card;
    }

    private MenuStrip BuildMenu()
    {
        var menu = new MenuStrip { ShowItemToolTips = true, BackColor = Color.White, Renderer = new ModernToolStripRenderer() };

        var fileMenu = RegisterLocalizedItem(new ToolStripMenuItem { Image = IconFactory.OpenLeft() }, () => Strings.MenuFile);
        RegisterLocalizedToolTip(fileMenu, () => Strings.TipMenuFile);
        fileMenu.DropDownItems.Add(MakeMenuItem(() => Strings.OpenLeft, IconFactory.OpenLeft(), () => Strings.TipOpenLeft, (_, _) => OpenLeft()));
        fileMenu.DropDownItems.Add(MakeMenuItem(() => Strings.OpenRight, IconFactory.OpenRight(), () => Strings.TipOpenRight, (_, _) => OpenRight()));
        fileMenu.DropDownItems.Add(MakeMenuItem(() => Strings.Reload, IconFactory.Reload(), () => Strings.TipReload, (_, _) => Reload()));
        fileMenu.DropDownItems.Add(new ToolStripSeparator());
        fileMenu.DropDownItems.Add(MakeMenuItem(() => Strings.Preferences, IconFactory.Preferences(), () => Strings.TipPreferences, (_, _) => OpenPreferences()));
        fileMenu.DropDownItems.Add(new ToolStripSeparator());
        fileMenu.DropDownItems.Add(MakeMenuItem(() => Strings.Exit, IconFactory.Exit(), () => Strings.TipExit, (_, _) => Close()));

        var viewMenu = RegisterLocalizedItem(new ToolStripMenuItem { Image = IconFactory.View() }, () => Strings.MenuView);
        RegisterLocalizedToolTip(viewMenu, () => Strings.TipMenuView);
        _wordWrapMenuItem = MakeMenuItem(() => Strings.WordWrap, IconFactory.WordWrap(), () => Strings.TipWordWrap, (_, _) => ToggleWordWrap());
        viewMenu.DropDownItems.Add(_wordWrapMenuItem);
        viewMenu.DropDownItems.Add(new ToolStripSeparator());
        viewMenu.DropDownItems.Add(MakeMenuItem(() => Strings.PreviousDiff, IconFactory.PrevDiff(), () => Strings.TipPrevDiff, (_, _) => GoToDiff(-1)));
        viewMenu.DropDownItems.Add(MakeMenuItem(() => Strings.NextDiff, IconFactory.NextDiff(), () => Strings.TipNextDiff, (_, _) => GoToDiff(1)));
        viewMenu.DropDownItems.Add(new ToolStripSeparator());
        viewMenu.DropDownItems.Add(MakeMenuItem(() => Strings.Copy, IconFactory.Copy(), () => Strings.TipCopyFocused, (_, _) => CopyFromActivePane()));

        var helpMenu = RegisterLocalizedItem(new ToolStripMenuItem { Image = IconFactory.Info() }, () => Strings.MenuHelp);
        RegisterLocalizedToolTip(helpMenu, () => Strings.TipMenuHelp);
        helpMenu.DropDownItems.Add(MakeMenuItem(() => Strings.About, IconFactory.Info(), () => Strings.TipAbout, (_, _) => ShowAbout()));

        menu.Items.Add(fileMenu);
        menu.Items.Add(viewMenu);
        menu.Items.Add(helpMenu);
        MainMenuStrip = menu;
        return menu;
    }

    private ToolStrip BuildToolStrip()
    {
        var toolStrip = new ToolStrip
        {
            Dock = DockStyle.Top,
            GripStyle = ToolStripGripStyle.Hidden,
            CanOverflow = false,
            ImageScalingSize = new Size(16, 16),
            Renderer = new ModernToolStripRenderer(),
            BackColor = Color.White,
            Padding = new Padding(4),
            ShowItemToolTips = true,
        };

        RegisterLocalizedToolTip(_tsbOpenLeft, () => Strings.TipOpenLeft);
        RegisterLocalizedToolTip(_tsbOpenRight, () => Strings.TipOpenRight);
        RegisterLocalizedToolTip(_tsbReload, () => Strings.TipReload);
        RegisterLocalizedToolTip(_tsbPrev, () => Strings.TipPrevDiff);
        RegisterLocalizedToolTip(_tsbNext, () => Strings.TipNextDiff);
        RegisterLocalizedToolTip(_tsbWordWrap, () => Strings.TipWordWrap);

        foreach (var item in new ToolStripItem[] { _tsbOpenLeft, _tsbOpenRight, _tsbReload, _tsbPrev, _tsbNext, _tsbWordWrap })
        {
            item.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
            item.TextImageRelation = TextImageRelation.ImageBeforeText;
            item.Padding = new Padding(4, 2, 6, 2);
        }

        RegisterLocalizedItem(_tsbOpenLeft, () => Strings.TsbOpenLeft);
        RegisterLocalizedItem(_tsbOpenRight, () => Strings.TsbOpenRight);
        RegisterLocalizedItem(_tsbReload, () => Strings.TsbReload);
        RegisterLocalizedItem(_tsbPrev, () => Strings.TsbPrevDiff);
        RegisterLocalizedItem(_tsbNext, () => Strings.TsbNextDiff);
        RegisterLocalizedItem(_tsbWordWrap, () => Strings.WordWrap);

        _tsbOpenLeft.Click += (_, _) => OpenLeft();
        _tsbOpenRight.Click += (_, _) => OpenRight();
        _tsbReload.Click += (_, _) => Reload();
        _tsbPrev.Click += (_, _) => GoToDiff(-1);
        _tsbNext.Click += (_, _) => GoToDiff(1);
        _tsbWordWrap.Click += (_, _) => ToggleWordWrap();

        toolStrip.Items.Add(_tsbOpenLeft);
        toolStrip.Items.Add(_tsbOpenRight);
        toolStrip.Items.Add(_tsbReload);
        toolStrip.Items.Add(new ToolStripSeparator());
        toolStrip.Items.Add(_tsbPrev);
        toolStrip.Items.Add(_tsbNext);
        toolStrip.Items.Add(new ToolStripSeparator());
        toolStrip.Items.Add(_tsbWordWrap);
        toolStrip.Items.Add(new ToolStripSeparator());

        _nudFontSize.Value = Math.Clamp((decimal)_settings.PaneFontSize, _nudFontSize.Minimum, _nudFontSize.Maximum);
        _nudFontSize.ValueChanged += (_, _) =>
        {
            _settings.PaneFontSize = (float)_nudFontSize.Value;
            ApplyPanePreferences();
            AppSettingsStore.Save(_settings);
        };
        var fontSizeHost = new ToolStripControlHost(_nudFontSize) { Margin = new Padding(2, 4, 6, 4) };
        RegisterLocalizedItem(_tslFontSize, () => Strings.FontSizeLabel);
        RegisterLocalizedToolTip(_tslFontSize, () => Strings.TipFontSize);
        RegisterLocalizedToolTip(fontSizeHost, () => Strings.TipFontSize);
        toolStrip.Items.Add(_tslFontSize);
        toolStrip.Items.Add(fontSizeHost);

        RegisterLocalizedToolTip(_tsbInfo, () => Strings.TipAboutButton);
        RegisterLocalizedItem(_tsbInfo, () => Strings.TsbInfo);
        _tsbInfo.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        _tsbInfo.TextImageRelation = TextImageRelation.ImageBeforeText;
        _tsbInfo.Padding = new Padding(4, 2, 6, 2);
        _tsbInfo.Click += (_, _) => ShowAbout();
        toolStrip.Items.Add(_tsbInfo);

        return toolStrip;
    }

    private ContextMenuStrip BuildPaneContextMenu(SyncLineListBox listBox, bool isLeft)
    {
        var menu = new ContextMenuStrip();
        if (isLeft)
        {
            menu.Items.Add(MakeMenuItem(() => Strings.OpenLeft, IconFactory.OpenLeft(), () => Strings.TipOpenLeft, (_, _) => OpenLeft()));
        }
        else
        {
            menu.Items.Add(MakeMenuItem(() => Strings.OpenRight, IconFactory.OpenRight(), () => Strings.TipOpenRight, (_, _) => OpenRight()));
        }

        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(MakeMenuItem(() => Strings.PreviousDiff, IconFactory.PrevDiff(), () => Strings.TipPrevDiff, (_, _) => GoToDiff(-1)));
        menu.Items.Add(MakeMenuItem(() => Strings.NextDiff, IconFactory.NextDiff(), () => Strings.TipNextDiff, (_, _) => GoToDiff(1)));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(MakeMenuItem(() => Strings.Copy, IconFactory.Copy(), () => Strings.TipCopy, (_, _) => listBox.CopySelectedLine()));
        return menu;
    }

    private void WireEvents()
    {
        KeyPreview = true;
        KeyDown += (_, e) =>
        {
            if (e.KeyCode == Keys.F3)
            {
                GoToDiff(e.Shift ? -1 : 1);
                e.Handled = true;
            }
        };
    }

    private void OpenLeft()
    {
        using var dialog = new OpenFileDialog { Title = Strings.DialogSelectLeftFile };
        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        string rightPath = _session?.RightPath ?? dialog.FileName;
        LoadSessionSafely(() => DiffSession.Load(dialog.FileName, rightPath));
    }

    private void OpenRight()
    {
        using var dialog = new OpenFileDialog { Title = Strings.DialogSelectRightFile };
        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        string leftPath = _session?.LeftPath ?? dialog.FileName;
        LoadSessionSafely(() => DiffSession.Load(leftPath, dialog.FileName));
    }

    private void Reload()
    {
        if (_session == null)
        {
            return;
        }

        LoadSessionSafely(() => DiffSession.Load(_session.LeftPath, _session.RightPath));
    }

    private void LoadSessionSafely(Func<DiffSession> factory)
    {
        try
        {
            LoadSession(factory());
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(this, Strings.ErrorOpenFile, ex);
        }
    }

    private void LoadSession(DiffSession session)
    {
        _session = session;
        _settings.LastSession = new LastSessionInfo { LeftPath = session.LeftPath, RightPath = session.RightPath };
        AppSettingsStore.Save(_settings);

        RenderDiff(session);
        UpdateStatus();
        UpdateActionItemsEnabled();
        ApplyBinaryUiState();
        UpdatePaneHeaderText();
        Text = string.Format(Strings.WindowTitleFormat, Path.GetFileName(session.RightPath));
    }

    private void UpdatePaneHeaderText()
    {
        _lblPaneLeft.Text = FormatPaneHeader(Strings.PaneLeft, _session?.LeftPath);
        _lblPaneRight.Text = FormatPaneHeader(Strings.PaneRight, _session?.RightPath);
    }

    private void RestoreLastSessionIfAvailable()
    {
        var last = _settings.LastSession;
        if (last?.LeftPath == null || last.RightPath == null || !File.Exists(last.LeftPath) || !File.Exists(last.RightPath))
        {
            return;
        }

        LoadSession(DiffSession.Load(last.LeftPath, last.RightPath));
    }

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
        foreach (var row in document.Rows)
        {
            Color color = RowColor(row.Kind, line);

            _lstLeft.AddLine(row.LeftText ?? string.Empty, color);
            _lstRight.AddLine(row.RightText ?? string.Empty, color);
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

    private static Color RowColor(DiffLineKind kind, int line) =>
        PaneTheme.RowBackColor(kind, line);

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
        _tsbWordWrap.Enabled = !isBinary;
        _wordWrapMenuItem.Enabled = !isBinary;

        if (isBinary && _settings.WordWrap)
        {
            _settings.WordWrap = false;
            ApplyPanePreferences();
        }
    }

    private void GoToDiff(int direction)
    {
        if (_session == null)
        {
            return;
        }

        var rows = GetCurrentRowKinds();
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

    private void CopyFromActivePane()
    {
        if (ActiveControl is SyncLineListBox listBox)
        {
            listBox.CopySelectedLine();
        }
    }

    private void ToggleWordWrap()
    {
        _settings.WordWrap = !_settings.WordWrap;
        ApplyPanePreferences();
        AppSettingsStore.Save(_settings);
    }

    private void ApplyPanePreferences()
    {
        var font = new Font("Consolas", _settings.PaneFontSize);
        _lstLeft.Font = font;
        _lstRight.Font = font;
        _lstLeft.WordWrap = _settings.WordWrap;
        _lstRight.WordWrap = _settings.WordWrap;
        _wordWrapMenuItem.Checked = _settings.WordWrap;
        _tsbWordWrap.Checked = _settings.WordWrap;
    }

    private void UpdateActionItemsEnabled()
    {
        bool hasSession = _session != null;
        _tsbReload.Enabled = hasSession;
        _tsbPrev.Enabled = hasSession;
        _tsbNext.Enabled = hasSession;
    }

    private void UpdateStatus()
    {
        if (_session == null)
        {
            _statusLabel.Text = Strings.StatusNoSession;
            return;
        }

        var doc = _session.TextDocument;
        var binary = _session.BinaryDocument;

        if (_session.Mode == DiffMode.Binary && binary != null)
        {
            _statusLabel.Text = binary.HasDifferences
                ? Strings.FormatBinaryStatus(
                    _session.LeftPath,
                    _session.RightPath,
                    binary.DifferentByteCount,
                    binary.AddedRowCount,
                    binary.RemovedRowCount,
                    binary.ModifiedRowCount)
                : Strings.StatusBinaryIdentical;
            return;
        }

        if (doc == null)
        {
            _statusLabel.Text = Strings.StatusNoSession;
            return;
        }

        _statusLabel.Text = doc.HasDifferences
            ? Strings.FormatStatus(_session.LeftPath, _session.RightPath, doc.AddedCount, doc.RemovedCount, doc.ModifiedCount)
            : Strings.StatusIdentical;
    }

    private void OpenPreferences()
    {
        using var dialog = new PreferencesDialog(_settings);
        dialog.SettingsChanged += (_, _) =>
        {
            ApplyLocalization();
            ApplyPanePreferences();
        };

        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            AppSettingsStore.Save(_settings);
        }

        ApplyLocalization();
        ApplyPanePreferences();
    }

    private void ShowAbout()
    {
        MessageBox.Show(this, Strings.AboutBody, Strings.About, MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private void ApplyLocalization()
    {
        Strings.Language = _settings.Language;

        foreach (var (control, getText) in _localizedControls)
        {
            control.Text = getText();
        }

        UpdatePaneHeaderText();

        foreach (var (item, getText) in _localizedItems)
        {
            item.Text = getText();
        }

        foreach (var (item, getToolTip) in _localizedToolTips)
        {
            item.ToolTipText = getToolTip();
        }

        _paneHeaderToolTip.SetToolTip(_lblPaneLeft, Strings.TipOpenLeft);
        _paneHeaderToolTip.SetToolTip(_lblPaneRight, Strings.TipOpenRight);

        Text = _session == null ? Strings.AppTitle : string.Format(Strings.WindowTitleFormat, Path.GetFileName(_session.RightPath));
        UpdateStatus();
    }

    private void RegisterLocalizedControl(Control control, Func<string> getText)
    {
        if (!_localizedControls.Any(entry => ReferenceEquals(entry.Control, control)))
        {
            _localizedControls.Add((control, getText));
            control.Text = getText();
        }
    }

    private T RegisterLocalizedItem<T>(T item, Func<string> getText) where T : ToolStripItem
    {
        if (!_localizedItems.Any(entry => ReferenceEquals(entry.Item, item)))
        {
            _localizedItems.Add((item, getText));
        }

        item.Text = getText();
        return item;
    }

    private void RegisterLocalizedToolTip(ToolStripItem item, Func<string> getToolTip)
    {
        if (!_localizedToolTips.Any(entry => ReferenceEquals(entry.Item, item)))
        {
            _localizedToolTips.Add((item, getToolTip));
        }

        item.ToolTipText = getToolTip();
    }

    private ToolStripMenuItem MakeMenuItem(Func<string> getText, Image image, Func<string> getTooltip, EventHandler onClick)
    {
        var item = new ToolStripMenuItem(getText(), image, onClick);
        RegisterLocalizedItem(item, getText);
        RegisterLocalizedToolTip(item, getTooltip);
        return item;
    }
}
