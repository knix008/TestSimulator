using DiffMergeWinV10.App.Controls;
using DiffMergeWinV10.App.Core;
using DiffMergeWinV10.App.Dialogs;
using DiffMergeWinV10.App.Services;

namespace DiffMergeWinV10.App;

public sealed class MergeForm : Form
{
    private static readonly Color CardBorderColor = Color.FromArgb(226, 232, 240);
    private static readonly Color CanvasColor = Color.FromArgb(241, 243, 247);

    private readonly SyncLineListBox _lstBase = new();
    private readonly SyncLineListBox _lstLocal = new();
    private readonly SyncLineListBox _lstRemote = new();
    private readonly SyncLineListBox _lstResult = new();
    private readonly LineNumberGutter _gutterBase = new();
    private readonly LineNumberGutter _gutterLocal = new();
    private readonly LineNumberGutter _gutterRemote = new();
    private readonly LineNumberGutter _gutterResult = new();
    private readonly SyncLineListBox _lstConflicts = new() { ShowSelectionAccent = true };
    private readonly LineNumberGutter _gutterConflicts = new();
    private readonly ToolStripStatusLabel _statusLabel = new();

    private readonly ToolStripButton _tsbOpenThree = new() { Image = IconFactory.OpenFiles() };
    private readonly ToolStripButton _tsbOpenConflicted = new() { Image = IconFactory.OpenConflicted() };
    private readonly ToolStripButton _tsbSave = new() { Image = IconFactory.Save() };
    private readonly ToolStripButton _tsbSaveAs = new() { Image = IconFactory.SaveAs() };
    private readonly ToolStripButton _tsbTakeBase = new() { Image = IconFactory.TakeBase() };
    private readonly ToolStripButton _tsbTakeLocal = new() { Image = IconFactory.TakeLocal() };
    private readonly ToolStripButton _tsbTakeRemote = new() { Image = IconFactory.TakeRemote() };
    private readonly ToolStripButton _tsbTakeBoth = new() { Image = IconFactory.TakeBoth() };
    private readonly ToolStripButton _tsbPrev = new() { Image = IconFactory.PrevConflict() };
    private readonly ToolStripButton _tsbNext = new() { Image = IconFactory.NextConflict() };
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
    private readonly Button _btnHeaderTakeBase = MakeHeaderButton(IconFactory.TakeBase());
    private readonly Button _btnHeaderTakeLocal = MakeHeaderButton(IconFactory.TakeLocal());
    private readonly Button _btnHeaderTakeRemote = MakeHeaderButton(IconFactory.TakeRemote());
    private readonly Button _btnHeaderTakeBoth = MakeHeaderButton(IconFactory.TakeBoth());
    private ToolStripMenuItem _wordWrapMenuItem = null!;
    private Label _lblPaneBase = null!;
    private Label _lblPaneLocal = null!;
    private Label _lblPaneRemote = null!;
    private Label _lblPaneResult = null!;
    private Label _lblPaneConflicts = null!;

    private readonly List<(Control Control, Func<string> GetText)> _localizedControls = new();
    private readonly List<(ToolStripItem Item, Func<string> GetText)> _localizedItems = new();
    private readonly List<(ToolStripItem Item, Func<string> GetToolTip)> _localizedToolTips = new();

    private readonly AppSettings _settings = AppSettingsStore.Load();
    private MergeSession? _session;
    private List<ConflictHunk> _conflicts = new();
    private readonly Dictionary<ConflictHunk, int> _resultHunkLineIndexes = new();
    private Func<MergeSession>? _initialSessionFactory;
    private bool _restoreLastSessionOnLoad;
    private TableLayoutPanel? _topPanel;
    private SplitContainer? _mainSplit;
    private SplitContainer? _bottomSplit;
    private Control? _remotePaneCard;
    private System.Windows.Forms.Timer? _paneLayoutRefreshTimer;
    private ToolStrip? _toolStrip;

    private bool _isFormShown;
    private int _alignBottomSplitterRetries;

    public bool Saved { get; private set; }

    private MergeForm()
    {
        Strings.Language = _settings.Language;
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 10f);
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        ApplyWindowBounds();

        BuildLayout();
        ApplyLocalization();
        ApplyPanePreferences();
        WireEvents();
        UpdateActionItemsEnabled();
        UpdateMinimumWindowSize();
    }

    // The SplitContainer/TableLayoutPanel hierarchy doesn't finish settling its child
    // controls' final sizes until the form has actually been shown once; loading a
    // session any earlier (Load/BeginInvoke) leaves the panes correctly scrolled at that
    // moment, but a deferred resize right after re-wraps the RichTextBox content and
    // silently resets its scroll position. Shown fires after that layout has settled.
    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        _isFormShown = true;
        UpdateMinimumWindowSize();
        AlignBottomSplitterToRemotePane();

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
            EnsureAllPaneViewportFill();
        }
    }

    private void RefreshPaneContentsAfterLayout()
    {
        int resultLine = _lstResult.GetFirstVisibleLine();
        int selectedConflict = SelectedConflictIndex();

        if (_session != null && _settings.WordWrap)
        {
            RenderSourcePanes();
            RenderResultPane();
            RenderConflictList(selectedConflict);
        }
        else
        {
            EnsureAllPaneViewportFill();
            if (_session != null)
            {
                RenderConflictList(selectedConflict);
            }
        }

        _lstResult.TopIndex = Math.Clamp(resultLine, 0, Math.Max(0, _lstResult.Items.Count - 1));
    }

    private void EnsureAllPaneViewportFill()
    {
        _lstBase.EnsureViewportFill();
        _lstLocal.EnsureViewportFill();
        _lstRemote.EnsureViewportFill();
        _lstResult.EnsureViewportFill();
        _lstConflicts.EnsureViewportFill();
        _gutterBase.Invalidate();
        _gutterLocal.Invalidate();
        _gutterRemote.Invalidate();
        _gutterConflicts.Invalidate();
        _gutterResult.Invalidate();
    }

    public static MergeForm Standalone()
    {
        var form = new MergeForm();
        form._restoreLastSessionOnLoad = true;
        return form;
    }

    public static MergeForm FromConflictedFile(string conflictedFile)
    {
        var form = new MergeForm();
        form._initialSessionFactory = () => MergeSession.FromConflictedFile(conflictedFile, conflictedFile);
        return form;
    }

    public static MergeForm FromMergeTool(string baseFile, string localFile, string remoteFile, string mergedFile)
    {
        var form = new MergeForm();
        form._initialSessionFactory = () => MergeSession.FromThreeFiles(baseFile, localFile, remoteFile, mergedFile);
        return form;
    }

    private void BuildLayout()
    {
        BackColor = CanvasColor;

        var menu = BuildMenu();
        var toolStrip = BuildToolStrip();
        _toolStrip = toolStrip;

        var topPanel = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 1, BackColor = CanvasColor, Padding = new Padding(8, 8, 8, 4) };
        _topPanel = topPanel;
        topPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.33f));
        topPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.34f));
        topPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.33f));
        topPanel.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));

        ConfigureSourcePane(_lstBase);
        ConfigureSourcePane(_lstLocal);
        ConfigureSourcePane(_lstRemote);
        _lstBase.Partners.AddRange(new[] { _lstLocal, _lstRemote });
        _lstLocal.Partners.AddRange(new[] { _lstBase, _lstRemote });
        _lstRemote.Partners.AddRange(new[] { _lstBase, _lstLocal });

        _lstBase.ContextMenuStrip = BuildPaneContextMenu(listBox: _lstBase);
        _lstLocal.ContextMenuStrip = BuildPaneContextMenu(listBox: _lstLocal);
        _lstRemote.ContextMenuStrip = BuildPaneContextMenu(listBox: _lstRemote);

        _gutterBase.Sync(_lstBase);
        _gutterLocal.Sync(_lstLocal);
        _gutterRemote.Sync(_lstRemote);

        var remoteCard = MakePaneCard(Color.FromArgb(202, 138, 4), _btnHeaderTakeRemote, _gutterRemote, _lstRemote, out _lblPaneRemote);
        _remotePaneCard = remoteCard;
        topPanel.Controls.Add(MakePaneCard(Color.FromArgb(100, 116, 139), _btnHeaderTakeBase, _gutterBase, _lstBase, out _lblPaneBase), 0, 0);
        topPanel.Controls.Add(MakePaneCard(Color.FromArgb(22, 163, 74), _btnHeaderTakeLocal, _gutterLocal, _lstLocal, out _lblPaneLocal), 1, 0);
        topPanel.Controls.Add(remoteCard, 2, 0);

        var bottomSplit = new SplitContainer { Dock = DockStyle.Fill, Orientation = Orientation.Vertical, BackColor = CanvasColor, SplitterWidth = 8 };
        _bottomSplit = bottomSplit;
        ConfigureSourcePane(_lstConflicts);
        _lstConflicts.ContextMenuStrip = BuildPaneContextMenu(listBox: _lstConflicts);
        _lstConflicts.MouseDown += OnConflictListMouseDown;
        _gutterConflicts.Sync(_lstConflicts);
        bottomSplit.Panel1.Padding = new Padding(8, 4, 4, 8);
        bottomSplit.Panel1.Controls.Add(MakePaneCard(Color.FromArgb(220, 38, 38), takeButton: null, _gutterConflicts, _lstConflicts, out _lblPaneConflicts));

        ConfigureSourcePane(_lstResult);
        _lstResult.ContextMenuStrip = BuildPaneContextMenu(listBox: _lstResult);
        _gutterResult.Sync(_lstResult);
        bottomSplit.Panel2.Padding = new Padding(4, 4, 8, 8);
        bottomSplit.Panel2.Controls.Add(MakePaneCard(Color.FromArgb(37, 99, 235), _btnHeaderTakeBoth, _gutterResult, _lstResult, out _lblPaneResult));

        RegisterPaneLocalizedText();

        var mainSplit = new SplitContainer { Dock = DockStyle.Fill, Orientation = Orientation.Horizontal, SplitterDistance = 380, BackColor = CanvasColor, SplitterWidth = 6 };
        _mainSplit = mainSplit;
        mainSplit.SplitterMoved += (_, _) => QueuePaneLayoutRefresh();
        mainSplit.Panel1.Controls.Add(topPanel);
        mainSplit.Panel2.Controls.Add(bottomSplit);
        bottomSplit.SplitterMoved += (_, _) => QueuePaneLayoutRefresh();

        var statusStrip = new StatusStrip { SizingGrip = true, BackColor = CanvasColor };
        statusStrip.Items.Add(_statusLabel);

        Controls.Add(mainSplit);
        Controls.Add(toolStrip);
        Controls.Add(statusStrip);
        Controls.Add(menu);
    }

    /// <summary>
    /// Sizes the bottom split so the Result pane matches the Remote column width above it.
    /// </summary>
    private void AlignBottomSplitterToRemotePane()
    {
        if (_topPanel == null || _bottomSplit == null)
        {
            return;
        }

        int remoteCardWidth = _remotePaneCard?.Width ?? 0;
        if (remoteCardWidth <= 0)
        {
            int[] columnWidths = _topPanel.GetColumnWidths();
            if (columnWidths.Length < 3 || columnWidths[2] <= 0 || _bottomSplit.Width <= 0)
            {
                if (_alignBottomSplitterRetries++ < 8)
                {
                    BeginInvoke(AlignBottomSplitterToRemotePane);
                }

                return;
            }

            remoteCardWidth = columnWidths[2];
        }

        if (_bottomSplit.Width <= 0)
        {
            if (_alignBottomSplitterRetries++ < 8)
            {
                BeginInvoke(AlignBottomSplitterToRemotePane);
            }

            return;
        }

        _alignBottomSplitterRetries = 0;
        int panel2Padding = _bottomSplit.Panel2.Padding.Horizontal;
        int panel2Width = remoteCardWidth + panel2Padding;
        int splitterDistance = _bottomSplit.Width - _bottomSplit.SplitterWidth - panel2Width;
        int maxDistance = _bottomSplit.Width - _bottomSplit.SplitterWidth - _bottomSplit.Panel2MinSize;
        _bottomSplit.SplitterDistance = Math.Clamp(splitterDistance, _bottomSplit.Panel1MinSize, maxDistance);
    }

    private MenuStrip BuildMenu()
    {
        var menu = new MenuStrip { ShowItemToolTips = true, BackColor = Color.White, Renderer = new ModernToolStripRenderer() };

        var fileMenu = RegisterLocalizedItem(new ToolStripMenuItem { Image = IconFactory.OpenFiles() }, () => Strings.MenuFile);
        fileMenu.DropDownItems.Add(MakeMenuItem(() => Strings.OpenThreeFiles, IconFactory.OpenFiles(), () => Strings.TipOpenThreeFiles, (_, _) => OpenThreeFiles()));
        fileMenu.DropDownItems.Add(MakeMenuItem(() => Strings.OpenConflictedFile, IconFactory.OpenConflicted(), () => Strings.TipOpenConflictedFile, (_, _) => OpenConflictedFile()));
        fileMenu.DropDownItems.Add(new ToolStripSeparator());
        fileMenu.DropDownItems.Add(MakeMenuItem(() => Strings.Save, IconFactory.Save(), () => Strings.TipSave, (_, _) => Save()));
        fileMenu.DropDownItems.Add(MakeMenuItem(() => Strings.SaveAs, IconFactory.SaveAs(), () => Strings.TipSaveAs, (_, _) => SaveAs()));
        fileMenu.DropDownItems.Add(new ToolStripSeparator());
        fileMenu.DropDownItems.Add(MakeMenuItem(() => Strings.Preferences, IconFactory.Preferences(), () => Strings.TipPreferences, (_, _) => OpenPreferences()));
        fileMenu.DropDownItems.Add(new ToolStripSeparator());
        fileMenu.DropDownItems.Add(MakeMenuItem(() => Strings.Exit, IconFactory.Exit(), () => Strings.TipExit, (_, _) => Close()));

        var editMenu = RegisterLocalizedItem(new ToolStripMenuItem { Image = IconFactory.Edit() }, () => Strings.MenuEdit);
        editMenu.DropDownItems.Add(MakeMenuItem(() => Strings.TakeBase, IconFactory.TakeBase(), () => Strings.TipTakeBase, (_, _) => ApplyResolution(ConflictResolution.Base)));
        editMenu.DropDownItems.Add(MakeMenuItem(() => Strings.TakeLocal, IconFactory.TakeLocal(), () => Strings.TipTakeLocal, (_, _) => ApplyResolution(ConflictResolution.Local)));
        editMenu.DropDownItems.Add(MakeMenuItem(() => Strings.TakeRemote, IconFactory.TakeRemote(), () => Strings.TipTakeRemote, (_, _) => ApplyResolution(ConflictResolution.Remote)));
        editMenu.DropDownItems.Add(MakeMenuItem(() => Strings.TakeBoth, IconFactory.TakeBoth(), () => Strings.TipTakeBoth, (_, _) => ApplyResolution(ConflictResolution.Both)));
        editMenu.DropDownItems.Add(new ToolStripSeparator());
        editMenu.DropDownItems.Add(MakeMenuItem(() => Strings.PreviousConflict, IconFactory.PrevConflict(), () => Strings.TipPrevConflict, (_, _) => SelectConflict(SelectedConflictIndex() - 1)));
        editMenu.DropDownItems.Add(MakeMenuItem(() => Strings.NextConflict, IconFactory.NextConflict(), () => Strings.TipNextConflict, (_, _) => SelectConflict(SelectedConflictIndex() + 1)));
        editMenu.DropDownItems.Add(new ToolStripSeparator());
        editMenu.DropDownItems.Add(MakeMenuItem(() => Strings.Copy, IconFactory.Copy(), () => Strings.TipCopyFocused, (_, _) => CopyFromActivePane()));

        var viewMenu = RegisterLocalizedItem(new ToolStripMenuItem { Image = IconFactory.View() }, () => Strings.MenuView);
        _wordWrapMenuItem = MakeMenuItem(() => Strings.WordWrap, IconFactory.WordWrap(), () => Strings.TipWordWrap, (_, _) => ToggleWordWrap());
        _wordWrapMenuItem.CheckOnClick = false;
        viewMenu.DropDownItems.Add(_wordWrapMenuItem);

        var helpMenu = RegisterLocalizedItem(new ToolStripMenuItem { Image = IconFactory.Info() }, () => Strings.MenuHelp);
        helpMenu.DropDownItems.Add(MakeMenuItem(() => Strings.About, IconFactory.Info(), () => Strings.TipAbout, (_, _) => ShowAbout()));

        menu.Items.Add(fileMenu);
        menu.Items.Add(editMenu);
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
        };

        RegisterLocalizedToolTip(_tsbOpenThree, () => Strings.TipOpenThreeFiles);
        RegisterLocalizedToolTip(_tsbOpenConflicted, () => Strings.TipOpenConflictedFile);
        RegisterLocalizedToolTip(_tsbSave, () => Strings.TipSave);
        RegisterLocalizedToolTip(_tsbSaveAs, () => Strings.TipSaveAs);
        RegisterLocalizedToolTip(_tsbPrev, () => Strings.TipPrevConflict);
        RegisterLocalizedToolTip(_tsbNext, () => Strings.TipNextConflict);
        RegisterLocalizedToolTip(_tsbTakeBase, () => Strings.TipTakeBase);
        RegisterLocalizedToolTip(_tsbTakeLocal, () => Strings.TipTakeLocal);
        RegisterLocalizedToolTip(_tsbTakeRemote, () => Strings.TipTakeRemote);
        RegisterLocalizedToolTip(_tsbTakeBoth, () => Strings.TipTakeBoth);

        foreach (var item in new ToolStripItem[] { _tsbOpenThree, _tsbOpenConflicted, _tsbSave, _tsbSaveAs, _tsbPrev, _tsbNext, _tsbTakeBase, _tsbTakeLocal, _tsbTakeRemote, _tsbTakeBoth })
        {
            item.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
            item.TextImageRelation = TextImageRelation.ImageBeforeText;
            item.Padding = new Padding(4, 2, 6, 2);
        }

        RegisterLocalizedItem(_tsbOpenThree, () => Strings.TsbOpenThree);
        RegisterLocalizedItem(_tsbOpenConflicted, () => Strings.TsbOpenConflicted);
        RegisterLocalizedItem(_tsbSave, () => Strings.Save);
        RegisterLocalizedItem(_tsbSaveAs, () => Strings.SaveAs);
        RegisterLocalizedItem(_tsbPrev, () => Strings.TsbPrevConflict);
        RegisterLocalizedItem(_tsbNext, () => Strings.TsbNextConflict);
        RegisterLocalizedItem(_tsbTakeBase, () => Strings.TakeBase);
        RegisterLocalizedItem(_tsbTakeLocal, () => Strings.TakeLocal);
        RegisterLocalizedItem(_tsbTakeRemote, () => Strings.TakeRemote);
        RegisterLocalizedItem(_tsbTakeBoth, () => Strings.TakeBoth);

        toolStrip.Items.Add(_tsbOpenThree);
        toolStrip.Items.Add(_tsbOpenConflicted);
        toolStrip.Items.Add(_tsbSave);
        toolStrip.Items.Add(_tsbSaveAs);
        toolStrip.Items.Add(new ToolStripSeparator());
        toolStrip.Items.Add(_tsbPrev);
        toolStrip.Items.Add(_tsbNext);
        toolStrip.Items.Add(new ToolStripSeparator());
        toolStrip.Items.Add(_tsbTakeBase);
        toolStrip.Items.Add(_tsbTakeLocal);
        toolStrip.Items.Add(_tsbTakeRemote);
        toolStrip.Items.Add(_tsbTakeBoth);
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

    private ContextMenuStrip BuildPaneContextMenu(SyncLineListBox? listBox = null)
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add(MakeMenuItem(() => Strings.TakeBase, IconFactory.TakeBase(), () => Strings.TipTakeBaseShort, (_, _) => ApplyResolution(ConflictResolution.Base)));
        menu.Items.Add(MakeMenuItem(() => Strings.TakeLocal, IconFactory.TakeLocal(), () => Strings.TipTakeLocalShort, (_, _) => ApplyResolution(ConflictResolution.Local)));
        menu.Items.Add(MakeMenuItem(() => Strings.TakeRemote, IconFactory.TakeRemote(), () => Strings.TipTakeRemoteShort, (_, _) => ApplyResolution(ConflictResolution.Remote)));
        menu.Items.Add(MakeMenuItem(() => Strings.TakeBoth, IconFactory.TakeBoth(), () => Strings.TipTakeBoth, (_, _) => ApplyResolution(ConflictResolution.Both)));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(MakeMenuItem(() => Strings.PreviousConflict, IconFactory.PrevConflict(), () => Strings.TipPrevConflict, (_, _) => SelectConflict(SelectedConflictIndex() - 1)));
        menu.Items.Add(MakeMenuItem(() => Strings.NextConflict, IconFactory.NextConflict(), () => Strings.TipNextConflict, (_, _) => SelectConflict(SelectedConflictIndex() + 1)));
        if (listBox != null)
        {
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(MakeMenuItem(() => Strings.Copy, IconFactory.Copy(), () => Strings.TipCopy, (_, _) => listBox.CopySelectedLine()));
        }
        return menu;
    }

    private void ApplyLocalization()
    {
        Strings.Language = _settings.Language;

        foreach (var (control, getText) in _localizedControls)
        {
            control.Text = getText();
        }

        foreach (var (item, getText) in _localizedItems)
        {
            item.Text = getText();
        }

        foreach (var (item, getToolTip) in _localizedToolTips)
        {
            item.ToolTipText = getToolTip();
        }

        Text = _session == null
            ? Strings.AppTitle
            : string.Format(Strings.WindowTitleFormat, Path.GetFileName(_session.MergedPath));

        _lstBase.ContextMenuStrip = BuildPaneContextMenu(listBox: _lstBase);
        _lstLocal.ContextMenuStrip = BuildPaneContextMenu(listBox: _lstLocal);
        _lstRemote.ContextMenuStrip = BuildPaneContextMenu(listBox: _lstRemote);
        _lstResult.ContextMenuStrip = BuildPaneContextMenu(listBox: _lstResult);
        _lstConflicts.ContextMenuStrip = BuildPaneContextMenu(listBox: _lstConflicts);

        if (_session != null)
        {
            RenderSourcePanes();
            RenderResultPane();
            RenderConflictList();
        }

        UpdateStatus();
        UpdateMinimumWindowSize();
    }

    private void UpdateMinimumWindowSize()
    {
        if (_toolStrip == null || MainMenuStrip == null)
        {
            return;
        }

        _toolStrip.PerformLayout();
        MainMenuStrip.PerformLayout();

        int toolbarWidth = MeasureToolStripWidth(_toolStrip) + _toolStrip.Padding.Horizontal;
        int menuWidth = MainMenuStrip.GetPreferredSize(Size.Empty).Width;
        int frameWidth = (SystemInformation.Border3DSize.Width * 2) + 8;
        int minWidth = Math.Max(toolbarWidth, menuWidth) + frameWidth;

        int chromeHeight = SystemInformation.CaptionHeight
            + (SystemInformation.Border3DSize.Height * 2)
            + MainMenuStrip.PreferredSize.Height
            + _toolStrip.PreferredSize.Height
            + 28;
        const int minContentHeight = 360;
        int minHeight = chromeHeight + minContentHeight;

        MinimumSize = new Size(minWidth, minHeight);

        if (WindowState == FormWindowState.Normal)
        {
            if (Width < MinimumSize.Width)
            {
                Width = MinimumSize.Width;
            }

            if (Height < MinimumSize.Height)
            {
                Height = MinimumSize.Height;
            }
        }
    }

    private static int MeasureToolStripWidth(ToolStrip strip)
    {
        int width = 0;
        foreach (ToolStripItem item in strip.Items)
        {
            Size preferred = item.GetPreferredSize(Size.Empty);
            width += item.Margin.Horizontal + preferred.Width;
        }

        return width;
    }

    private void RegisterPaneLocalizedText()
    {
        RegisterLocalizedControl(_lblPaneBase, () => Strings.PaneBase);
        RegisterLocalizedControl(_lblPaneLocal, () => Strings.PaneLocal);
        RegisterLocalizedControl(_lblPaneRemote, () => Strings.PaneRemote);
        RegisterLocalizedControl(_lblPaneResult, () => Strings.PaneResult);
        RegisterLocalizedControl(_lblPaneConflicts, () => Strings.PaneConflicts);
        RegisterLocalizedControl(_btnHeaderTakeBase, () => Strings.TakeBase);
        RegisterLocalizedControl(_btnHeaderTakeLocal, () => Strings.TakeLocal);
        RegisterLocalizedControl(_btnHeaderTakeRemote, () => Strings.TakeRemote);
        RegisterLocalizedControl(_btnHeaderTakeBoth, () => Strings.TakeBoth);
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

    private void OnConflictListMouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Right)
        {
            return;
        }
        int index = _lstConflicts.IndexFromPoint(e.Location);
        if (index >= 0 && index < _conflicts.Count)
        {
            _lstConflicts.SelectedIndex = index;
        }
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

    private void ShowAbout()
    {
        MessageBox.Show(
            this,
            Strings.AboutBody,
            Strings.About,
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
    }

    private ToolStripMenuItem MakeMenuItem(Func<string> getText, Image image, Func<string> getTooltip, EventHandler onClick)
    {
        var item = new ToolStripMenuItem(getText(), image, onClick);
        RegisterLocalizedItem(item, getText);
        RegisterLocalizedToolTip(item, getTooltip);
        return item;
    }

    private const int HeaderHeight = 42;
    private const float PaneTitleFontSize = 11f;

    private static Control MakePaneHeader(Color accent, Button? takeButton, out Label titleLabel)
    {
        var headerBg = PaneTheme.PastelHeaderBackground(accent);
        titleLabel = new Label
        {
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", PaneTitleFontSize, FontStyle.Bold),
            ForeColor = accent,
            BackColor = headerBg,
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(0, 0, 8, 0),
            Margin = Padding.Empty,
        };

        if (takeButton == null)
        {
            var panel = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = headerBg,
                Padding = new Padding(6, 4, 8, 4),
            };
            panel.Controls.Add(titleLabel);
            return panel;
        }

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            BackColor = headerBg,
            ColumnCount = 2,
            RowCount = 1,
            Padding = new Padding(6, 4, 8, 4),
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));

        takeButton.AutoSize = true;
        takeButton.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        takeButton.Margin = Padding.Empty;
        takeButton.Dock = DockStyle.None;
        takeButton.Anchor = AnchorStyles.None;

        layout.Controls.Add(titleLabel, 0, 0);
        layout.Controls.Add(takeButton, 1, 0);
        return layout;
    }

    /// <summary>
    /// A bordered "card" with a fixed-height header row and a content row that fills the
    /// rest — explicit TableLayoutPanel cells, not Dock-stacked siblings, so the header can
    /// never visually overlap the content below it regardless of control add order.
    /// </summary>
    private static Control MakeCardWithRows(Control header, Control content)
    {
        var card = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            BackColor = CardBorderColor,
            Padding = new Padding(1),
            ColumnCount = 1,
            RowCount = 2,
        };
        card.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        card.RowStyles.Add(new RowStyle(SizeType.Absolute, HeaderHeight));
        card.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));

        header.Dock = DockStyle.Fill;
        content.Dock = DockStyle.Fill;
        card.Controls.Add(header, 0, 0);
        card.Controls.Add(content, 0, 1);
        return card;
    }

    private static Control MakePaneCard(Color accent, Button? takeButton, LineNumberGutter? gutter, Control paneContent, out Label titleLabel)
    {
        var content = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            BackColor = PaneTheme.RowColorEven,
            ColumnCount = gutter == null ? 1 : 2,
            RowCount = 1,
            Margin = Padding.Empty,
            Padding = Padding.Empty,
        };

        if (gutter != null)
        {
            content.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 44));
            content.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            gutter.Dock = DockStyle.Fill;
            gutter.Margin = Padding.Empty;
            content.Controls.Add(gutter, 0, 0);
        }
        else
        {
            content.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        }

        paneContent.Dock = DockStyle.Fill;
        paneContent.Margin = Padding.Empty;
        content.Controls.Add(paneContent, gutter == null ? 0 : 1, 0);

        var header = MakePaneHeader(accent, takeButton, out titleLabel);
        return MakeCardWithRows(header, MakeContentFrame(content));
    }

    private static Panel MakeContentFrame(Control content)
    {
        var frame = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = CardBorderColor,
            Padding = new Padding(1),
        };
        content.Dock = DockStyle.Fill;
        frame.Controls.Add(content);
        return frame;
    }

    private static Button MakeHeaderButton(Image icon) => new IconTextButton
    {
        Icon = icon,
        AutoSize = true,
        AutoSizeMode = AutoSizeMode.GrowAndShrink,
        FlatStyle = FlatStyle.Flat,
        TextAlign = ContentAlignment.MiddleLeft,
        FlatAppearance = { BorderColor = Color.FromArgb(203, 213, 225) },
        BackColor = Color.White,
    };

    private static void ConfigureSourcePane(SyncLineListBox box)
    {
        box.Dock = DockStyle.Fill;
        box.BorderStyle = BorderStyle.None;
        box.BackColor = PaneTheme.RowColorEven;
        box.ForeColor = Color.FromArgb(30, 41, 59);
    }

    private void ApplyPanePreferences()
    {
        var font = new Font(FontFamily.GenericMonospace, _settings.PaneFontSize);
        foreach (var box in new SyncLineListBox[] { _lstBase, _lstLocal, _lstRemote, _lstResult, _lstConflicts })
        {
            box.Font = font;
            box.WordWrap = _settings.WordWrap;
        }
        if (_wordWrapMenuItem != null)
        {
            _wordWrapMenuItem.Checked = _settings.WordWrap;
        }

        if (_session != null)
        {
            RenderSourcePanes();
            RenderResultPane();
        }
        else if (_isFormShown)
        {
            EnsureAllPaneViewportFill();
        }
    }

    private void ApplyWindowBounds()
    {
        if (_settings.WindowX >= 0 && _settings.WindowY >= 0)
        {
            StartPosition = FormStartPosition.Manual;
            Location = new Point(_settings.WindowX, _settings.WindowY);
        }
        Width = _settings.WindowWidth;
        Height = _settings.WindowHeight;
        WindowState = _settings.Maximized ? FormWindowState.Maximized : FormWindowState.Normal;
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
        else
        {
            ApplyLocalization();
            ApplyPanePreferences();
        }
    }

    private void RestoreLastSessionIfAvailable()
    {
        var last = _settings.LastSession;
        if (last == null)
        {
            return;
        }

        try
        {
            switch (last.Mode)
            {
                case LastSessionMode.ThreeFiles when last.BasePath != null && last.LocalPath != null && last.RemotePath != null && last.MergedPath != null
                    && File.Exists(last.BasePath) && File.Exists(last.LocalPath) && File.Exists(last.RemotePath):
                    LoadSession(MergeSession.FromThreeFiles(last.BasePath, last.LocalPath, last.RemotePath, last.MergedPath));
                    break;
                case LastSessionMode.Conflicted when last.MergedPath != null && File.Exists(last.MergedPath):
                    LoadSession(MergeSession.FromConflictedFile(last.MergedPath, last.MergedPath));
                    break;
            }
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(this, Strings.ErrorRestoreSession, ex);
        }
    }

    private void SaveLastSession()
    {
        if (_session == null)
        {
            return;
        }

        _settings.LastSession = new LastSessionInfo
        {
            Mode = _session.BasePath != null ? LastSessionMode.ThreeFiles : LastSessionMode.Conflicted,
            BasePath = _session.BasePath,
            LocalPath = _session.LocalPath,
            RemotePath = _session.RemotePath,
            MergedPath = _session.MergedPath,
        };
        AppSettingsStore.Save(_settings);
    }

    private void WireEvents()
    {
        _tsbOpenThree.Click += (_, _) => OpenThreeFiles();
        _tsbOpenConflicted.Click += (_, _) => OpenConflictedFile();
        _tsbSave.Click += (_, _) => Save();
        _tsbSaveAs.Click += (_, _) => SaveAs();
        _tsbPrev.Click += (_, _) => SelectConflict(SelectedConflictIndex() - 1);
        _tsbNext.Click += (_, _) => SelectConflict(SelectedConflictIndex() + 1);
        _tsbTakeBase.Click += (_, _) => ApplyResolution(ConflictResolution.Base);
        _tsbTakeLocal.Click += (_, _) => ApplyResolution(ConflictResolution.Local);
        _tsbTakeRemote.Click += (_, _) => ApplyResolution(ConflictResolution.Remote);
        _tsbTakeBoth.Click += (_, _) => ApplyResolution(ConflictResolution.Both);
        _btnHeaderTakeBase.Click += (_, _) => ApplyResolution(ConflictResolution.Base);
        _btnHeaderTakeLocal.Click += (_, _) => ApplyResolution(ConflictResolution.Local);
        _btnHeaderTakeRemote.Click += (_, _) => ApplyResolution(ConflictResolution.Remote);
        _btnHeaderTakeBoth.Click += (_, _) => ApplyResolution(ConflictResolution.Both);
        _lstConflicts.SelectedIndexChanged += (_, _) => ScrollResultToSelectedConflict();
        FormClosing += OnFormClosing;
        FormClosed += (_, _) => SaveWindowBounds();
        ResizeEnd += (_, _) => QueuePaneLayoutRefresh();
    }

    private void QueuePaneLayoutRefresh()
    {
        _paneLayoutRefreshTimer ??= new System.Windows.Forms.Timer { Interval = 120 };
        _paneLayoutRefreshTimer.Tick -= OnPaneLayoutRefreshTimer;
        _paneLayoutRefreshTimer.Tick += OnPaneLayoutRefreshTimer;
        _paneLayoutRefreshTimer.Stop();
        _paneLayoutRefreshTimer.Start();
    }

    private void OnPaneLayoutRefreshTimer(object? sender, EventArgs e)
    {
        _paneLayoutRefreshTimer?.Stop();

        if (_session != null && _settings.WordWrap)
        {
            RefreshPaneContentsAfterLayout();
            return;
        }

        EnsureAllPaneViewportFill();
    }

    private void SaveWindowBounds()
    {
        _settings.Maximized = WindowState == FormWindowState.Maximized;
        var bounds = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
        _settings.WindowX = bounds.X;
        _settings.WindowY = bounds.Y;
        _settings.WindowWidth = bounds.Width;
        _settings.WindowHeight = bounds.Height;
        AppSettingsStore.Save(_settings);
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        if (_session == null || Saved)
        {
            return;
        }

        var choice = MessageBox.Show(
            Strings.CloseWithoutSaving,
            Strings.AppTitle,
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Warning);
        if (choice == DialogResult.No)
        {
            e.Cancel = true;
        }
    }

    private void OpenThreeFiles()
    {
        string? basePath = PromptOpenFile(Strings.DialogSelectBaseFile);
        if (basePath == null)
        {
            return;
        }
        string? localPath = PromptOpenFile(Strings.DialogSelectLocalFile);
        if (localPath == null)
        {
            return;
        }
        string? remotePath = PromptOpenFile(Strings.DialogSelectRemoteFile);
        if (remotePath == null)
        {
            return;
        }

        using var saveDialog = new SaveFileDialog { Title = Strings.DialogSaveMergedAs, FileName = Path.GetFileName(localPath) };
        if (saveDialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        try
        {
            LoadSession(MergeSession.FromThreeFiles(basePath, localPath, remotePath, saveDialog.FileName));
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(this, ex);
        }
    }

    private void OpenConflictedFile()
    {
        string? path = PromptOpenFile(Strings.DialogSelectConflictedFile);
        if (path == null)
        {
            return;
        }

        try
        {
            LoadSession(MergeSession.FromConflictedFile(path, path));
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(this, ex);
        }
    }

    private static string? PromptOpenFile(string title)
    {
        using var dialog = new OpenFileDialog { Title = title };
        return dialog.ShowDialog() == DialogResult.OK ? dialog.FileName : null;
    }

    private void LoadSession(MergeSession session)
    {
        _session = session;
        _conflicts = session.Document.Conflicts.ToList();
        Saved = false;
        Text = string.Format(Strings.WindowTitleFormat, Path.GetFileName(session.MergedPath));

        RenderConflictList();
        RenderSourcePanes();
        RenderResultPane();
        UpdateStatus();
        UpdateActionItemsEnabled();
        SaveLastSession();

        if (_conflicts.Count > 0)
        {
            SelectConflict(0);
        }
    }

    private void RenderSourcePanes()
    {
        int baseTop = _lstBase.GetFirstVisibleLine();
        int localTop = _lstLocal.GetFirstVisibleLine();
        int remoteTop = _lstRemote.GetFirstVisibleLine();

        _lstBase.ClearLines();
        _lstLocal.ClearLines();
        _lstRemote.ClearLines();
        int baseLine = 0, localLine = 0, remoteLine = 0;

        foreach (var region in _session!.Document.Regions)
        {
            if (region.Hunk is { } hunk)
            {
                AppendListLines(_lstBase, hunk.HasBase ? hunk.BaseLines : new List<string> { Strings.BaseUnavailable }, PaneTheme.ConflictColor, ref baseLine);
                AppendListLines(_lstLocal, hunk.LocalLines, PaneTheme.ConflictColor, ref localLine);
                AppendListLines(_lstRemote, hunk.RemoteLines, PaneTheme.ConflictColor, ref remoteLine);
            }
            else if (region.CleanLines != null)
            {
                AppendListLines(_lstBase, region.CleanLines, null, ref baseLine);
                AppendListLines(_lstLocal, region.CleanLines, null, ref localLine);
                AppendListLines(_lstRemote, region.CleanLines, null, ref remoteLine);
            }
        }

        _lstBase.FinishBatch();
        _lstLocal.FinishBatch();
        _lstRemote.FinishBatch();

        _lstBase.TopIndex = Math.Clamp(baseTop, 0, Math.Max(0, _lstBase.Items.Count - 1));
        _lstLocal.TopIndex = Math.Clamp(localTop, 0, Math.Max(0, _lstLocal.Items.Count - 1));
        _lstRemote.TopIndex = Math.Clamp(remoteTop, 0, Math.Max(0, _lstRemote.Items.Count - 1));
    }

    private void RenderResultPane()
    {
        _resultHunkLineIndexes.Clear();
        _lstResult.ClearLines();
        int resultLine = 0;

        foreach (var region in _session!.Document.Regions)
        {
            if (region.Hunk is { } hunk)
            {
                _resultHunkLineIndexes[hunk] = resultLine;
                var color = PaneTheme.ColorForConflict(hunk.Resolution == ConflictResolution.Unresolved);
                AppendListLines(_lstResult, hunk.GetResolvedLines(), color, ref resultLine);
            }
            else if (region.CleanLines != null)
            {
                AppendListLines(_lstResult, region.CleanLines, null, ref resultLine);
            }
        }

        _lstResult.FinishBatch();
        _gutterResult.Invalidate();
    }

    private void RenderConflictList(int? preserveSelectedIndex = null)
    {
        int selected = preserveSelectedIndex ?? SelectedConflictIndex();
        _lstConflicts.ClearLines();
        for (int i = 0; i < _conflicts.Count; i++)
        {
            var hunk = _conflicts[i];
            var color = PaneTheme.ColorForConflict(hunk.Resolution == ConflictResolution.Unresolved);
            _lstConflicts.AddLine(DescribeConflict(i), color);
        }

        _lstConflicts.FinishBatch();
        _gutterConflicts.Invalidate();

        if (selected >= 0 && selected < _conflicts.Count)
        {
            _lstConflicts.SelectedIndex = selected;
        }
    }

    private string DescribeConflict(int index) => Strings.FormatConflict(index, _conflicts[index].Resolution);

    private static void AppendListLines(SyncLineListBox box, IEnumerable<string> lines, Color? backColor, ref int lineIndex)
    {
        foreach (string line in lines)
        {
            var rowColor = backColor ?? PaneTheme.ZebraForLine(lineIndex);
            box.AddLine(line, rowColor);
            lineIndex++;
        }
    }

    private int SelectedConflictIndex()
    {
        int index = _lstConflicts.SelectedIndex;
        return index >= 0 && index < _conflicts.Count ? index : -1;
    }

    private void SelectConflict(int index)
    {
        if (_conflicts.Count == 0)
        {
            return;
        }
        index = Math.Clamp(index, 0, _conflicts.Count - 1);
        _lstConflicts.SelectedIndex = index;
    }

    private void ScrollResultToSelectedConflict()
    {
        int index = SelectedConflictIndex();
        if (index < 0 || index >= _conflicts.Count)
        {
            return;
        }
        var hunk = _conflicts[index];
        if (_resultHunkLineIndexes.TryGetValue(hunk, out int lineIndex))
        {
            _lstResult.TopIndex = Math.Clamp(lineIndex, 0, Math.Max(0, _lstResult.Items.Count - 1));
        }
    }

    private void ApplyResolution(ConflictResolution resolution)
    {
        int index = SelectedConflictIndex();
        if (index < 0 || index >= _conflicts.Count)
        {
            return;
        }

        _conflicts[index].Resolution = resolution;
        RenderSourcePanes();
        RenderResultPane();
        RenderConflictList();
        _lstConflicts.SelectedIndex = index;
        UpdateStatus();
    }

    private void UpdateStatus()
    {
        if (_session == null)
        {
            _statusLabel.Text = Strings.StatusNoSession;
            return;
        }
        int resolved = _conflicts.Count(c => c.Resolution != ConflictResolution.Unresolved);
        _statusLabel.Text = Strings.FormatStatusResolved(resolved, _conflicts.Count, _session.MergedPath);
    }

    private void UpdateActionItemsEnabled()
    {
        bool hasSession = _session != null;
        foreach (var item in new ToolStripItem[] { _tsbSave, _tsbSaveAs, _tsbPrev, _tsbNext, _tsbTakeBase, _tsbTakeLocal, _tsbTakeRemote, _tsbTakeBoth })
        {
            item.Enabled = hasSession;
        }
        foreach (var button in new[] { _btnHeaderTakeBase, _btnHeaderTakeLocal, _btnHeaderTakeRemote, _btnHeaderTakeBoth })
        {
            button.Enabled = hasSession;
        }
    }

    private void Save()
    {
        if (_session == null)
        {
            return;
        }

        if (!ConfirmUnresolvedConflicts())
        {
            return;
        }

        try
        {
            _session.Save();
            Saved = true;
            UpdateStatus();
            MessageBox.Show(string.Format(Strings.SavedToFormat, _session.MergedPath), Strings.AppTitle, MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(this, Strings.ErrorSave, ex);
        }
    }

    private void SaveAs()
    {
        if (_session == null)
        {
            return;
        }

        if (!ConfirmUnresolvedConflicts())
        {
            return;
        }

        using var dialog = new SaveFileDialog { FileName = Path.GetFileName(_session.MergedPath) };
        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        try
        {
            _session.SaveAs(dialog.FileName);
            Saved = true;
            UpdateStatus();
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(this, Strings.ErrorSave, ex);
        }
    }

    private bool ConfirmUnresolvedConflicts()
    {
        int unresolved = _conflicts.Count(c => c.Resolution == ConflictResolution.Unresolved);
        if (unresolved == 0)
        {
            return true;
        }

        var choice = MessageBox.Show(
            string.Format(Strings.UnresolvedSaveFormat, unresolved),
            Strings.AppTitle,
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Warning);
        return choice == DialogResult.Yes;
    }
}
