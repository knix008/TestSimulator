using DiffMergeWinV10.App.Controls;
using DiffMergeWinV10.App.Core;
using DiffMergeWinV10.App.Dialogs;
using DiffMergeWinV10.App.Services;

namespace DiffMergeWinV10.App;

public sealed class MergeForm : Form
{
    private static readonly Color CardBorderColor = Color.FromArgb(226, 232, 240);
    private static readonly Color CanvasColor = Color.FromArgb(241, 243, 247);

    private readonly SyncRichTextBox _rtbBase = new();
    private readonly SyncRichTextBox _rtbLocal = new();
    private readonly SyncRichTextBox _rtbRemote = new();
    private readonly SyncRichTextBox _rtbResult = new();
    private readonly LineNumberGutter _gutterBase = new();
    private readonly LineNumberGutter _gutterLocal = new();
    private readonly LineNumberGutter _gutterRemote = new();
    private readonly LineNumberGutter _gutterResult = new();
    private readonly ListBox _lstConflicts = new();
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
    private readonly Dictionary<ConflictHunk, int> _resultHunkOffsets = new();
    private Func<MergeSession>? _initialSessionFactory;
    private bool _restoreLastSessionOnLoad;
    private TableLayoutPanel? _topPanel;
    private SplitContainer? _bottomSplit;
    private Control? _remotePaneCard;

    public bool Saved { get; private set; }

    private MergeForm()
    {
        Strings.Language = _settings.Language;
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 9f);
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        ApplyWindowBounds();

        BuildLayout();
        ApplyLocalization();
        ApplyPanePreferences();
        WireEvents();
        UpdateActionItemsEnabled();
    }

    // The SplitContainer/TableLayoutPanel hierarchy doesn't finish settling its child
    // controls' final sizes until the form has actually been shown once; loading a
    // session any earlier (Load/BeginInvoke) leaves the panes correctly scrolled at that
    // moment, but a deferred resize right after re-wraps the RichTextBox content and
    // silently resets its scroll position. Shown fires after that layout has settled.
    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
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
    }

    private void RefreshPaneContentsAfterLayout()
    {
        if (_session == null)
        {
            return;
        }

        int baseLine = GetFirstVisibleLine(_rtbBase);
        int localLine = GetFirstVisibleLine(_rtbLocal);
        int remoteLine = GetFirstVisibleLine(_rtbRemote);
        int resultLine = GetFirstVisibleLine(_rtbResult);
        int selectedConflict = SelectedConflictIndex();

        RenderSourcePanes();
        RenderResultPane();
        RenderConflictList(selectedConflict);

        ScrollToLine(_rtbBase, baseLine);
        ScrollToLine(_rtbLocal, localLine);
        ScrollToLine(_rtbRemote, remoteLine);
        ScrollToLine(_rtbResult, resultLine);
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

        var topPanel = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 1, BackColor = CanvasColor, Padding = new Padding(8, 8, 8, 4) };
        _topPanel = topPanel;
        topPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.33f));
        topPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.34f));
        topPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.33f));
        topPanel.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));

        ConfigureReadOnlyPane(_rtbBase);
        ConfigureReadOnlyPane(_rtbLocal);
        ConfigureReadOnlyPane(_rtbRemote);
        _rtbBase.Partners.AddRange(new[] { _rtbLocal, _rtbRemote });
        _rtbLocal.Partners.AddRange(new[] { _rtbBase, _rtbRemote });
        _rtbRemote.Partners.AddRange(new[] { _rtbBase, _rtbLocal });

        _rtbBase.ContextMenuStrip = BuildPaneContextMenu(_rtbBase);
        _rtbLocal.ContextMenuStrip = BuildPaneContextMenu(_rtbLocal);
        _rtbRemote.ContextMenuStrip = BuildPaneContextMenu(_rtbRemote);

        _gutterBase.Sync(_rtbBase);
        _gutterLocal.Sync(_rtbLocal);
        _gutterRemote.Sync(_rtbRemote);

        var remoteCard = MakePaneCard(Color.FromArgb(37, 99, 235), _btnHeaderTakeRemote, _gutterRemote, _rtbRemote, out _lblPaneRemote);
        _remotePaneCard = remoteCard;
        topPanel.Controls.Add(MakePaneCard(Color.FromArgb(100, 116, 139), _btnHeaderTakeBase, _gutterBase, _rtbBase, out _lblPaneBase), 0, 0);
        topPanel.Controls.Add(MakePaneCard(Color.FromArgb(22, 163, 74), _btnHeaderTakeLocal, _gutterLocal, _rtbLocal, out _lblPaneLocal), 1, 0);
        topPanel.Controls.Add(remoteCard, 2, 0);

        var bottomSplit = new SplitContainer { Dock = DockStyle.Fill, Orientation = Orientation.Vertical, BackColor = CanvasColor, SplitterWidth = 8 };
        _bottomSplit = bottomSplit;
        _lstConflicts.Dock = DockStyle.Fill;
        _lstConflicts.BackColor = PaneTheme.RowColorEven;
        _lstConflicts.BorderStyle = BorderStyle.None;
        _lstConflicts.IntegralHeight = false;
        _lstConflicts.Font = new Font("Segoe UI", 9.5f);
        _lstConflicts.DrawMode = DrawMode.OwnerDrawFixed;
        _lstConflicts.ItemHeight = (int)(_lstConflicts.Font.Height * 1.7f);
        _lstConflicts.DrawItem += OnDrawConflictItem;
        _lstConflicts.ContextMenuStrip = BuildPaneContextMenu(box: null);
        _lstConflicts.MouseDown += OnConflictListMouseDown;
        var conflictListCard = MakeCardWithRows(MakeCardHeader(Color.FromArgb(15, 23, 42), out _lblPaneConflicts), MakeContentFrame(_lstConflicts));
        bottomSplit.Panel1.Padding = new Padding(8, 4, 4, 8);
        bottomSplit.Panel1.Controls.Add(conflictListCard);

        ConfigureReadOnlyPane(_rtbResult);
        _rtbResult.ReadOnly = false;
        _rtbResult.ContextMenuStrip = BuildPaneContextMenu(_rtbResult);
        _gutterResult.Sync(_rtbResult);
        bottomSplit.Panel2.Padding = new Padding(4, 4, 8, 8);
        bottomSplit.Panel2.Controls.Add(MakePaneCard(Color.FromArgb(15, 23, 42), _btnHeaderTakeBoth, _gutterResult, _rtbResult, out _lblPaneResult));

        RegisterPaneLocalizedText();

        var mainSplit = new SplitContainer { Dock = DockStyle.Fill, Orientation = Orientation.Horizontal, SplitterDistance = 380, BackColor = CanvasColor, SplitterWidth = 6 };
        mainSplit.Panel1.Controls.Add(topPanel);
        mainSplit.Panel2.Controls.Add(bottomSplit);

        var statusStrip = new StatusStrip { SizingGrip = false, BackColor = CanvasColor };
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
                BeginInvoke(AlignBottomSplitterToRemotePane);
                return;
            }

            remoteCardWidth = columnWidths[2];
        }

        if (_bottomSplit.Width <= 0)
        {
            BeginInvoke(AlignBottomSplitterToRemotePane);
            return;
        }

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

    private ContextMenuStrip BuildPaneContextMenu(RichTextBox? box)
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add(MakeMenuItem(() => Strings.TakeBase, IconFactory.TakeBase(), () => Strings.TipTakeBaseShort, (_, _) => ApplyResolution(ConflictResolution.Base)));
        menu.Items.Add(MakeMenuItem(() => Strings.TakeLocal, IconFactory.TakeLocal(), () => Strings.TipTakeLocalShort, (_, _) => ApplyResolution(ConflictResolution.Local)));
        menu.Items.Add(MakeMenuItem(() => Strings.TakeRemote, IconFactory.TakeRemote(), () => Strings.TipTakeRemoteShort, (_, _) => ApplyResolution(ConflictResolution.Remote)));
        menu.Items.Add(MakeMenuItem(() => Strings.TakeBoth, IconFactory.TakeBoth(), () => Strings.TipTakeBoth, (_, _) => ApplyResolution(ConflictResolution.Both)));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(MakeMenuItem(() => Strings.PreviousConflict, IconFactory.PrevConflict(), () => Strings.TipPrevConflict, (_, _) => SelectConflict(SelectedConflictIndex() - 1)));
        menu.Items.Add(MakeMenuItem(() => Strings.NextConflict, IconFactory.NextConflict(), () => Strings.TipNextConflict, (_, _) => SelectConflict(SelectedConflictIndex() + 1)));
        if (box != null)
        {
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(MakeMenuItem(() => Strings.Copy, IconFactory.Copy(), () => Strings.TipCopy, (_, _) => box.Copy()));
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

        _rtbBase.ContextMenuStrip = BuildPaneContextMenu(_rtbBase);
        _rtbLocal.ContextMenuStrip = BuildPaneContextMenu(_rtbLocal);
        _rtbRemote.ContextMenuStrip = BuildPaneContextMenu(_rtbRemote);
        _rtbResult.ContextMenuStrip = BuildPaneContextMenu(_rtbResult);
        _lstConflicts.ContextMenuStrip = BuildPaneContextMenu(box: null);

        if (_session != null)
        {
            RenderSourcePanes();
            RenderConflictList();
        }

        UpdateStatus();
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
        if (index >= 0)
        {
            _lstConflicts.SelectedIndex = index;
        }
    }

    private void OnDrawConflictItem(object? sender, DrawItemEventArgs e)
    {
        if (e.Index < 0 || e.Index >= _lstConflicts.Items.Count)
        {
            e.DrawBackground();
            return;
        }

        if (_lstConflicts.Items[e.Index] is not ConflictHunk hunk)
        {
            e.DrawBackground();
            return;
        }

        bool selected = (e.State & DrawItemState.Selected) == DrawItemState.Selected;
        var rowColor = hunk.Resolution == ConflictResolution.Unresolved
            ? PaneTheme.ConflictListUnresolvedColor
            : PaneTheme.ConflictListResolvedColor;
        using (var rowBrush = new SolidBrush(rowColor))
        {
            e.Graphics.FillRectangle(rowBrush, e.Bounds);
        }

        if (selected)
        {
            using var accentBrush = new SolidBrush(PaneTheme.SelectedConflictColor);
            e.Graphics.FillRectangle(accentBrush, e.Bounds.X, e.Bounds.Y, 4, e.Bounds.Height);
        }

        var textBounds = new Rectangle(e.Bounds.X + (selected ? 12 : 8), e.Bounds.Y, e.Bounds.Width - 12, e.Bounds.Height);
        TextRenderer.DrawText(
            e.Graphics,
            DescribeConflict(e.Index),
            e.Font ?? _lstConflicts.Font,
            textBounds,
            Color.FromArgb(30, 41, 59),
            TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.NoPrefix);
    }

    private void CopyFromActivePane()
    {
        if (ActiveControl is RichTextBox box)
        {
            box.Copy();
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

    private const int HeaderHeight = 58;

    private static Control MakePaneHeader(Color accent, Button takeButton, out Label titleLabel)
    {
        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.White,
            ColumnCount = 2,
            RowCount = 1,
            Padding = new Padding(6, 8, 8, 8),
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

        titleLabel = new Label
        {
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            ForeColor = accent,
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(0, 0, 8, 0),
            Margin = Padding.Empty,
        };

        takeButton.AutoSize = true;
        takeButton.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        takeButton.Margin = Padding.Empty;
        takeButton.Dock = DockStyle.None;
        takeButton.Anchor = AnchorStyles.None;

        layout.Controls.Add(titleLabel, 0, 0);
        layout.Controls.Add(takeButton, 1, 0);
        return layout;
    }

    private static Label MakeCardHeader(Color accent, out Label titleLabel)
    {
        titleLabel = new Label
        {
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            ForeColor = accent,
            BackColor = Color.White,
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(6, 0, 0, 0),
            Margin = Padding.Empty,
        };
        return titleLabel;
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

    private static Control MakePaneCard(Color accent, Button takeButton, LineNumberGutter gutter, RichTextBox box, out Label titleLabel)
    {
        var content = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            BackColor = PaneTheme.RowColorEven,
            ColumnCount = 2,
            RowCount = 1,
            Margin = Padding.Empty,
            Padding = Padding.Empty,
        };
        content.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 44));
        content.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));

        gutter.Dock = DockStyle.Fill;
        gutter.Margin = Padding.Empty;
        box.Dock = DockStyle.Fill;
        box.Margin = Padding.Empty;

        content.Controls.Add(gutter, 0, 0);
        content.Controls.Add(box, 1, 0);

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

    private static void ConfigureReadOnlyPane(RichTextBox box)
    {
        box.Dock = DockStyle.Fill;
        box.ReadOnly = true;
        box.BorderStyle = BorderStyle.None;
        box.BackColor = PaneTheme.RowColorEven;
    }

    private void ApplyPanePreferences()
    {
        var font = new Font(FontFamily.GenericMonospace, _settings.PaneFontSize);
        foreach (var box in new RichTextBox[] { _rtbBase, _rtbLocal, _rtbRemote, _rtbResult })
        {
            box.Font = font;
            box.WordWrap = _settings.WordWrap;
        }
        if (_wordWrapMenuItem != null)
        {
            _wordWrapMenuItem.Checked = _settings.WordWrap;
        }

        RefreshPaneContentsAfterLayout();
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
        _rtbBase.ClearContent();
        _rtbLocal.ClearContent();
        _rtbRemote.ClearContent();
        int baseLine = 0, localLine = 0, remoteLine = 0;

        foreach (var region in _session!.Document.Regions)
        {
            if (region.Hunk is { } hunk)
            {
                AppendLines(_rtbBase, hunk.HasBase ? hunk.BaseLines : new List<string> { Strings.BaseUnavailable }, PaneTheme.ConflictColor, ref baseLine);
                AppendLines(_rtbLocal, hunk.LocalLines, PaneTheme.ConflictColor, ref localLine);
                AppendLines(_rtbRemote, hunk.RemoteLines, PaneTheme.ConflictColor, ref remoteLine);
            }
            else if (region.CleanLines != null)
            {
                AppendLines(_rtbBase, region.CleanLines, null, ref baseLine);
                AppendLines(_rtbLocal, region.CleanLines, null, ref localLine);
                AppendLines(_rtbRemote, region.CleanLines, null, ref remoteLine);
            }
        }

        PadEmptyViewportLines(_rtbBase, ref baseLine);
        PadEmptyViewportLines(_rtbLocal, ref localLine);
        PadEmptyViewportLines(_rtbRemote, ref remoteLine);

        ResetScrollToTop(_rtbBase);
        ResetScrollToTop(_rtbLocal);
        ResetScrollToTop(_rtbRemote);
        InvalidateGutters(_gutterBase, _gutterLocal, _gutterRemote);
    }

    private static void ResetScrollToTop(SyncRichTextBox box)
    {
        box.ScrollToTopLeft();
    }

    private void RenderResultPane()
    {
        _resultHunkOffsets.Clear();
        _rtbResult.ClearContent();
        int resultLine = 0;

        foreach (var region in _session!.Document.Regions)
        {
            if (region.Hunk is { } hunk)
            {
                _resultHunkOffsets[hunk] = _rtbResult.TextLength;
                var color = hunk.Resolution == ConflictResolution.Unresolved ? PaneTheme.ConflictColor : PaneTheme.ResolvedColor;
                AppendLines(_rtbResult, hunk.GetResolvedLines(), color, ref resultLine);
            }
            else if (region.CleanLines != null)
            {
                AppendLines(_rtbResult, region.CleanLines, null, ref resultLine);
            }
        }

        PadEmptyViewportLines(_rtbResult, ref resultLine);

        ResetScrollToTop(_rtbResult);
        InvalidateGutters(_gutterResult);
    }

    private void RenderConflictList(int? preserveSelectedIndex = null)
    {
        int selected = preserveSelectedIndex ?? _lstConflicts.SelectedIndex;
        _lstConflicts.BeginUpdate();
        try
        {
            _lstConflicts.Items.Clear();
            foreach (var hunk in _conflicts)
            {
                _lstConflicts.Items.Add(hunk);
            }
        }
        finally
        {
            _lstConflicts.EndUpdate();
        }

        if (selected >= 0 && selected < _conflicts.Count)
        {
            _lstConflicts.SelectedIndex = selected;
        }

        _lstConflicts.Invalidate();
    }

    private string DescribeConflict(int index) => Strings.FormatConflict(index, _conflicts[index].Resolution);

    private static void AppendLines(SyncRichTextBox box, IEnumerable<string> lines, Color? backColor, ref int lineIndex)
    {
        foreach (string line in lines)
        {
            var rowColor = backColor ?? PaneTheme.ZebraForLine(lineIndex);
            box.AddLineBackground(rowColor);
            int start = box.TextLength;
            box.AppendText(line + Environment.NewLine);
            RichTextRowBackground.Apply(box, start, box.TextLength - start, rowColor);
            lineIndex++;
        }

        box.Invalidate();
    }

    private static void PadEmptyViewportLines(SyncRichTextBox box, ref int lineIndex)
    {
        int lineHeight = Math.Max(1, TextRenderer.MeasureText("Ag", box.Font).Height);
        int visibleLines = Math.Max(1, box.ClientSize.Height / lineHeight + 1);
        int currentLines = box.Lines.Length;
        if (currentLines >= visibleLines)
        {
            return;
        }

        AppendLines(box, Enumerable.Repeat(string.Empty, visibleLines - currentLines), null, ref lineIndex);
    }

    private static int GetFirstVisibleLine(RichTextBox box)
    {
        if (!box.IsHandleCreated)
        {
            return 0;
        }

        return box.GetLineFromCharIndex(box.GetCharIndexFromPosition(new Point(1, 1)));
    }

    private static void ScrollToLine(RichTextBox box, int line)
    {
        if (!box.IsHandleCreated || line <= 0)
        {
            return;
        }

        int charIndex = box.GetFirstCharIndexFromLine(line);
        if (charIndex >= 0)
        {
            box.Select(charIndex, 0);
            box.ScrollToCaret();
        }
    }

    private static void InvalidateGutters(params LineNumberGutter[] gutters)
    {
        foreach (var gutter in gutters)
        {
            gutter.Invalidate();
        }
    }

    private int SelectedConflictIndex() => _lstConflicts.SelectedIndex;

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
        if (_resultHunkOffsets.TryGetValue(hunk, out int offset))
        {
            _rtbResult.Select(offset, 0);
            _rtbResult.ScrollToCaret();
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
            File.WriteAllText(_session.MergedPath, _rtbResult.Text);
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
            File.WriteAllText(dialog.FileName, _rtbResult.Text);
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
