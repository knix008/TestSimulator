using DiffMergeWinV10.App.Controls;
using DiffMergeWinV10.App.Core;
using DiffMergeWinV10.App.Dialogs;
using DiffMergeWinV10.App.Services;

namespace DiffMergeWinV10.App;

public sealed class MergeForm : Form
{
    private static readonly Color ConflictColor = Color.FromArgb(255, 244, 180);
    private static readonly Color ResolvedColor = Color.FromArgb(214, 245, 214);
    private static readonly Color SelectedConflictColor = Color.FromArgb(222, 234, 252);
    private static readonly Color ZebraColor = Color.FromArgb(238, 241, 246);
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

    private readonly ToolStripButton _tsbOpenThree = new("Open Base/Local/Remote") { Image = IconFactory.OpenFiles() };
    private readonly ToolStripButton _tsbOpenConflicted = new("Open Conflicted") { Image = IconFactory.OpenConflicted() };
    private readonly ToolStripButton _tsbSave = new("Save") { Image = IconFactory.Save() };
    private readonly ToolStripButton _tsbSaveAs = new("Save As") { Image = IconFactory.SaveAs() };
    private readonly ToolStripButton _tsbTakeBase = new("Take Base") { Image = IconFactory.TakeBase() };
    private readonly ToolStripButton _tsbTakeLocal = new("Take Local") { Image = IconFactory.TakeLocal() };
    private readonly ToolStripButton _tsbTakeRemote = new("Take Remote") { Image = IconFactory.TakeRemote() };
    private readonly ToolStripButton _tsbTakeBoth = new("Take Both") { Image = IconFactory.TakeBoth() };
    private readonly ToolStripButton _tsbPrev = new("Prev Conflict") { Image = IconFactory.PrevConflict() };
    private readonly ToolStripButton _tsbNext = new("Next Conflict") { Image = IconFactory.NextConflict() };
    private readonly ToolStripButton _tsbInfo = new("Info") { Image = IconFactory.Info(), Alignment = ToolStripItemAlignment.Right };
    private readonly ToolStripLabel _tslFontSize = new("Font size:");
    private readonly NumericUpDown _nudFontSize = new()
    {
        DecimalPlaces = 1,
        Increment = 0.5m,
        Minimum = 6m,
        Maximum = 32m,
        Width = 55,
    };
    private readonly Button _btnHeaderTakeBase = MakeHeaderButton("Take Base", IconFactory.TakeBase());
    private readonly Button _btnHeaderTakeLocal = MakeHeaderButton("Take Local", IconFactory.TakeLocal());
    private readonly Button _btnHeaderTakeRemote = MakeHeaderButton("Take Remote", IconFactory.TakeRemote());
    private readonly Button _btnHeaderTakeBoth = MakeHeaderButton("Take Both", IconFactory.TakeBoth());
    private ToolStripMenuItem _wordWrapMenuItem = null!;

    private readonly AppSettings _settings = AppSettingsStore.Load();
    private MergeSession? _session;
    private List<ConflictHunk> _conflicts = new();
    private readonly Dictionary<ConflictHunk, int> _resultHunkOffsets = new();
    private Func<MergeSession>? _initialSessionFactory;
    private bool _restoreLastSessionOnLoad;

    public bool Saved { get; private set; }

    private MergeForm()
    {
        Text = "Diff & Merge";
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 9f);
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        ApplyWindowBounds();

        BuildLayout();
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

        if (_initialSessionFactory != null)
        {
            LoadSession(_initialSessionFactory());
        }
        else if (_restoreLastSessionOnLoad)
        {
            RestoreLastSessionIfAvailable();
        }

        MessageBox.Show($"gutter={_gutterBase.Bounds} box={_rtbBase.Bounds} parent={_rtbBase.Parent?.Bounds} gutterParent={_gutterBase.Parent?.Bounds}", "DEBUG");
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

        topPanel.Controls.Add(MakePaneCard("Base (common ancestor)", Color.FromArgb(100, 116, 139), _btnHeaderTakeBase, _gutterBase, _rtbBase), 0, 0);
        topPanel.Controls.Add(MakePaneCard("Local (ours)", Color.FromArgb(22, 163, 74), _btnHeaderTakeLocal, _gutterLocal, _rtbLocal), 1, 0);
        topPanel.Controls.Add(MakePaneCard("Remote (theirs)", Color.FromArgb(37, 99, 235), _btnHeaderTakeRemote, _gutterRemote, _rtbRemote), 2, 0);

        var bottomSplit = new SplitContainer { Dock = DockStyle.Fill, Orientation = Orientation.Vertical, SplitterDistance = 260, BackColor = CanvasColor, SplitterWidth = 8 };
        _lstConflicts.Dock = DockStyle.Fill;
        _lstConflicts.BorderStyle = BorderStyle.None;
        _lstConflicts.IntegralHeight = false;
        _lstConflicts.Font = new Font("Segoe UI", 9.5f);
        _lstConflicts.DrawMode = DrawMode.OwnerDrawFixed;
        _lstConflicts.ItemHeight = (int)(_lstConflicts.Font.Height * 1.7f);
        _lstConflicts.DrawItem += OnDrawConflictItem;
        _lstConflicts.ContextMenuStrip = BuildPaneContextMenu(box: null);
        _lstConflicts.MouseDown += OnConflictListMouseDown;
        var conflictListCard = MakeCardWithRows(MakeCardHeader("Conflicts", Color.FromArgb(15, 23, 42)), _lstConflicts);
        bottomSplit.Panel1.Padding = new Padding(8, 4, 4, 8);
        bottomSplit.Panel1.Controls.Add(conflictListCard);

        ConfigureReadOnlyPane(_rtbResult);
        _rtbResult.ReadOnly = false;
        _rtbResult.ContextMenuStrip = BuildPaneContextMenu(_rtbResult);
        _gutterResult.Sync(_rtbResult);
        bottomSplit.Panel2.Padding = new Padding(4, 4, 8, 8);
        bottomSplit.Panel2.Controls.Add(MakePaneCard("Result (editable)", Color.FromArgb(15, 23, 42), _btnHeaderTakeBoth, _gutterResult, _rtbResult));

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

    private MenuStrip BuildMenu()
    {
        var menu = new MenuStrip { ShowItemToolTips = true, BackColor = Color.White, Renderer = new ModernToolStripRenderer() };

        var fileMenu = new ToolStripMenuItem("File") { Image = IconFactory.OpenFiles() };
        fileMenu.DropDownItems.Add(MakeMenuItem("Open Base/Local/Remote...", IconFactory.OpenFiles(), "Load separate BASE, LOCAL and REMOTE files and diff them", (_, _) => OpenThreeFiles()));
        fileMenu.DropDownItems.Add(MakeMenuItem("Open Conflicted File...", IconFactory.OpenConflicted(), "Open a file that already contains <<<<<<< conflict markers", (_, _) => OpenConflictedFile()));
        fileMenu.DropDownItems.Add(new ToolStripSeparator());
        fileMenu.DropDownItems.Add(MakeMenuItem("Save", IconFactory.Save(), "Save the resolved result to the merged file path", (_, _) => Save()));
        fileMenu.DropDownItems.Add(MakeMenuItem("Save As...", IconFactory.SaveAs(), "Save the resolved result to a new file", (_, _) => SaveAs()));
        fileMenu.DropDownItems.Add(new ToolStripSeparator());
        fileMenu.DropDownItems.Add(MakeMenuItem("Preferences...", IconFactory.Preferences(), "Edit pane font size, word wrap, and the remembered last session", (_, _) => OpenPreferences()));
        fileMenu.DropDownItems.Add(new ToolStripSeparator());
        fileMenu.DropDownItems.Add(MakeMenuItem("Exit", IconFactory.Exit(), "Close Diff & Merge", (_, _) => Close()));

        var editMenu = new ToolStripMenuItem("Edit") { Image = IconFactory.Edit() };
        editMenu.DropDownItems.Add(MakeMenuItem("Take Base", IconFactory.TakeBase(), "Resolve the selected conflict using the BASE (common ancestor) content", (_, _) => ApplyResolution(ConflictResolution.Base)));
        editMenu.DropDownItems.Add(MakeMenuItem("Take Local", IconFactory.TakeLocal(), "Resolve the selected conflict using the LOCAL (ours) content", (_, _) => ApplyResolution(ConflictResolution.Local)));
        editMenu.DropDownItems.Add(MakeMenuItem("Take Remote", IconFactory.TakeRemote(), "Resolve the selected conflict using the REMOTE (theirs) content", (_, _) => ApplyResolution(ConflictResolution.Remote)));
        editMenu.DropDownItems.Add(MakeMenuItem("Take Both", IconFactory.TakeBoth(), "Resolve the selected conflict by keeping both LOCAL and REMOTE content", (_, _) => ApplyResolution(ConflictResolution.Both)));
        editMenu.DropDownItems.Add(new ToolStripSeparator());
        editMenu.DropDownItems.Add(MakeMenuItem("Previous Conflict", IconFactory.PrevConflict(), "Jump to the previous conflict in the list", (_, _) => SelectConflict(SelectedConflictIndex() - 1)));
        editMenu.DropDownItems.Add(MakeMenuItem("Next Conflict", IconFactory.NextConflict(), "Jump to the next conflict in the list", (_, _) => SelectConflict(SelectedConflictIndex() + 1)));
        editMenu.DropDownItems.Add(new ToolStripSeparator());
        editMenu.DropDownItems.Add(MakeMenuItem("Copy", IconFactory.Copy(), "Copy the selected text from the focused pane", (_, _) => CopyFromActivePane()));

        var viewMenu = new ToolStripMenuItem("View") { Image = IconFactory.View() };
        _wordWrapMenuItem = MakeMenuItem("Word Wrap", IconFactory.WordWrap(), "Toggle word wrap in the source and result panes", (_, _) => ToggleWordWrap());
        _wordWrapMenuItem.CheckOnClick = false;
        viewMenu.DropDownItems.Add(_wordWrapMenuItem);

        var helpMenu = new ToolStripMenuItem("Help") { Image = IconFactory.Info() };
        helpMenu.DropDownItems.Add(MakeMenuItem("About Diff & Merge", IconFactory.Info(), "Show application information", (_, _) => ShowAbout()));

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

        _tsbOpenThree.ToolTipText = "Load separate BASE, LOCAL and REMOTE files and diff them";
        _tsbOpenConflicted.ToolTipText = "Open a file that already contains <<<<<<< conflict markers";
        _tsbSave.ToolTipText = "Save the resolved result to the merged file path";
        _tsbSaveAs.ToolTipText = "Save the resolved result to a new file";
        _tsbPrev.ToolTipText = "Jump to the previous conflict in the list";
        _tsbNext.ToolTipText = "Jump to the next conflict in the list";
        _tsbTakeBase.ToolTipText = "Resolve the selected conflict using the BASE (common ancestor) content";
        _tsbTakeLocal.ToolTipText = "Resolve the selected conflict using the LOCAL (ours) content";
        _tsbTakeRemote.ToolTipText = "Resolve the selected conflict using the REMOTE (theirs) content";
        _tsbTakeBoth.ToolTipText = "Resolve the selected conflict by keeping both LOCAL and REMOTE content";

        foreach (var item in new ToolStripItem[] { _tsbOpenThree, _tsbOpenConflicted, _tsbSave, _tsbSaveAs, _tsbPrev, _tsbNext, _tsbTakeBase, _tsbTakeLocal, _tsbTakeRemote, _tsbTakeBoth })
        {
            item.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
            item.TextImageRelation = TextImageRelation.ImageBeforeText;
            item.Padding = new Padding(4, 2, 6, 2);
        }

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
        toolStrip.Items.Add(_tslFontSize);
        toolStrip.Items.Add(fontSizeHost);

        _tsbInfo.ToolTipText = "About Diff & Merge";
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
        menu.Items.Add(MakeMenuItem("Take Base", IconFactory.TakeBase(), "Resolve the selected conflict using the BASE content", (_, _) => ApplyResolution(ConflictResolution.Base)));
        menu.Items.Add(MakeMenuItem("Take Local", IconFactory.TakeLocal(), "Resolve the selected conflict using the LOCAL content", (_, _) => ApplyResolution(ConflictResolution.Local)));
        menu.Items.Add(MakeMenuItem("Take Remote", IconFactory.TakeRemote(), "Resolve the selected conflict using the REMOTE content", (_, _) => ApplyResolution(ConflictResolution.Remote)));
        menu.Items.Add(MakeMenuItem("Take Both", IconFactory.TakeBoth(), "Resolve the selected conflict by keeping both LOCAL and REMOTE content", (_, _) => ApplyResolution(ConflictResolution.Both)));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(MakeMenuItem("Previous Conflict", IconFactory.PrevConflict(), "Jump to the previous conflict in the list", (_, _) => SelectConflict(SelectedConflictIndex() - 1)));
        menu.Items.Add(MakeMenuItem("Next Conflict", IconFactory.NextConflict(), "Jump to the next conflict in the list", (_, _) => SelectConflict(SelectedConflictIndex() + 1)));
        if (box != null)
        {
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(MakeMenuItem("Copy", IconFactory.Copy(), "Copy the selected text", (_, _) => box.Copy()));
        }
        return menu;
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
        if (e.Index < 0 || e.Index >= _conflicts.Count)
        {
            e.DrawBackground();
            return;
        }

        bool selected = (e.State & DrawItemState.Selected) == DrawItemState.Selected;
        var rowColor = selected
            ? SelectedConflictColor
            : _conflicts[e.Index].Resolution == ConflictResolution.Unresolved ? ConflictColor : ResolvedColor;
        using var rowBrush = new SolidBrush(rowColor);
        e.Graphics.FillRectangle(rowBrush, e.Bounds);

        var textBounds = new Rectangle(e.Bounds.X + 8, e.Bounds.Y, e.Bounds.Width - 8, e.Bounds.Height);
        TextRenderer.DrawText(
            e.Graphics,
            _lstConflicts.Items[e.Index].ToString(),
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
            "Diff & Merge Win V10\nGit 3-way merge conflict resolution tool.\n\nCopyright (c) SHKWON(knix008@naver.com)",
            "About Diff & Merge",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
    }

    private static ToolStripMenuItem MakeMenuItem(string text, Image image, string tooltip, EventHandler onClick)
    {
        return new ToolStripMenuItem(text, image, onClick) { ToolTipText = tooltip };
    }

    private const int HeaderHeight = 40;

    private static Control MakePaneHeader(string text, Color accent, Button takeButton)
    {
        var header = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, BackColor = Color.White };
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        header.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));

        var label = new Label
        {
            Text = text,
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            ForeColor = accent,
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(6, 0, 0, 0),
        };

        takeButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        int verticalGap = Math.Max(0, (HeaderHeight - takeButton.PreferredSize.Height) / 2);
        takeButton.Margin = new Padding(0, verticalGap, 6, 0);

        header.Controls.Add(label, 0, 0);
        header.Controls.Add(takeButton, 1, 0);
        return header;
    }

    private static Label MakeCardHeader(string text, Color accent) => new()
    {
        Text = text,
        Dock = DockStyle.Fill,
        Font = new Font("Segoe UI", 9f, FontStyle.Bold),
        ForeColor = accent,
        BackColor = Color.White,
        TextAlign = ContentAlignment.MiddleLeft,
        Padding = new Padding(6, 0, 0, 0),
    };

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

    private static Control MakePaneCard(string title, Color accent, Button takeButton, LineNumberGutter gutter, RichTextBox box)
    {
        var content = new Panel { Dock = DockStyle.Fill, BackColor = Color.White };
        gutter.Dock = DockStyle.Left;
        box.Dock = DockStyle.Fill;
        content.Controls.Add(gutter);
        content.Controls.Add(box);

        return MakeCardWithRows(MakePaneHeader(title, accent, takeButton), content);
    }

    private static Button MakeHeaderButton(string text, Image icon) => new IconTextButton
    {
        Text = text,
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
        box.BackColor = Color.White;
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
        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            ApplyPanePreferences();
            AppSettingsStore.Save(_settings);
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
        catch (IOException)
        {
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
            "The merge has not been saved. Close without saving?",
            "Diff & Merge",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Warning);
        if (choice == DialogResult.No)
        {
            e.Cancel = true;
        }
    }

    private void OpenThreeFiles()
    {
        string? basePath = PromptOpenFile("Select the BASE (common ancestor) file");
        if (basePath == null)
        {
            return;
        }
        string? localPath = PromptOpenFile("Select the LOCAL (ours) file");
        if (localPath == null)
        {
            return;
        }
        string? remotePath = PromptOpenFile("Select the REMOTE (theirs) file");
        if (remotePath == null)
        {
            return;
        }

        using var saveDialog = new SaveFileDialog { Title = "Save merged result as", FileName = Path.GetFileName(localPath) };
        if (saveDialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        LoadSession(MergeSession.FromThreeFiles(basePath, localPath, remotePath, saveDialog.FileName));
    }

    private void OpenConflictedFile()
    {
        string? path = PromptOpenFile("Select the conflicted file");
        if (path == null)
        {
            return;
        }
        LoadSession(MergeSession.FromConflictedFile(path, path));
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
        Text = $"Diff & Merge - {Path.GetFileName(session.MergedPath)}";

        RenderSourcePanes();
        RenderResultPane();
        RenderConflictList();
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
        _rtbBase.Clear();
        _rtbLocal.Clear();
        _rtbRemote.Clear();
        int baseLine = 0, localLine = 0, remoteLine = 0;

        foreach (var region in _session!.Document.Regions)
        {
            if (region.Hunk is { } hunk)
            {
                AppendLines(_rtbBase, hunk.HasBase ? hunk.BaseLines : new List<string> { "(base unavailable)" }, ConflictColor, ref baseLine);
                AppendLines(_rtbLocal, hunk.LocalLines, ConflictColor, ref localLine);
                AppendLines(_rtbRemote, hunk.RemoteLines, ConflictColor, ref remoteLine);
            }
            else if (region.CleanLines != null)
            {
                AppendLines(_rtbBase, region.CleanLines, null, ref baseLine);
                AppendLines(_rtbLocal, region.CleanLines, null, ref localLine);
                AppendLines(_rtbRemote, region.CleanLines, null, ref remoteLine);
            }
        }

        ResetScrollToTop(_rtbBase);
        ResetScrollToTop(_rtbLocal);
        ResetScrollToTop(_rtbRemote);
    }

    private static void ResetScrollToTop(SyncRichTextBox box)
    {
        box.ScrollToTopLeft();
    }

    private void RenderResultPane()
    {
        _resultHunkOffsets.Clear();
        _rtbResult.Clear();
        int resultLine = 0;

        foreach (var region in _session!.Document.Regions)
        {
            if (region.Hunk is { } hunk)
            {
                _resultHunkOffsets[hunk] = _rtbResult.TextLength;
                var color = hunk.Resolution == ConflictResolution.Unresolved ? ConflictColor : ResolvedColor;
                AppendLines(_rtbResult, hunk.GetResolvedLines(), color, ref resultLine);
            }
            else if (region.CleanLines != null)
            {
                AppendLines(_rtbResult, region.CleanLines, null, ref resultLine);
            }
        }

        ResetScrollToTop(_rtbResult);
    }

    private void RenderConflictList()
    {
        _lstConflicts.Items.Clear();
        for (int i = 0; i < _conflicts.Count; i++)
        {
            _lstConflicts.Items.Add(DescribeConflict(i));
        }
    }

    private string DescribeConflict(int index) => $"Conflict #{index + 1} - {_conflicts[index].Resolution}";

    private static void AppendLines(RichTextBox box, IEnumerable<string> lines, Color? backColor, ref int lineIndex)
    {
        // RichTextBox.SelectionBackColor only paints behind the actual characters, not the
        // rest of the line out to the right edge. Padding with trailing spaces (when not
        // word-wrapping) extends the colored selection far enough to look like a full-width
        // row background instead of a highlight that stops where the text ends.
        // Stay strictly under the visible width: padding past the right edge would make the
        // RichTextBox's content wider than the viewport, which makes it auto-scroll
        // horizontally while the long padded lines are being appended (the caret trails the
        // text being typed) and that scroll position doesn't reliably reset afterwards,
        // clipping the start of every line behind the gutter.
        int padTo = box.WordWrap ? 0 : Math.Max(0, (int)(box.ClientSize.Width / (float)Math.Max(1, MeasureSpaceWidth(box))) - 1);

        foreach (string line in lines)
        {
            string paddedLine = padTo > line.Length ? line.PadRight(padTo) : line;
            int start = box.TextLength;
            box.AppendText(paddedLine + Environment.NewLine);
            var rowColor = backColor ?? (lineIndex % 2 == 0 ? Color.White : ZebraColor);
            box.Select(start, box.TextLength - start);
            box.SelectionBackColor = rowColor;
            box.Select(box.TextLength, 0);
            lineIndex++;
        }
    }

    private static int MeasureSpaceWidth(RichTextBox box) => TextRenderer.MeasureText(" ", box.Font).Width;

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
            _statusLabel.Text = "Open a base/local/remote set or a conflicted file to begin.";
            return;
        }
        int resolved = _conflicts.Count(c => c.Resolution != ConflictResolution.Unresolved);
        _statusLabel.Text = $"{resolved} of {_conflicts.Count} conflicts resolved - {_session.MergedPath}";
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

        File.WriteAllText(_session.MergedPath, _rtbResult.Text);
        Saved = true;
        UpdateStatus();
        MessageBox.Show($"Saved to {_session.MergedPath}", "Diff & Merge", MessageBoxButtons.OK, MessageBoxIcon.Information);
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

        File.WriteAllText(dialog.FileName, _rtbResult.Text);
        Saved = true;
        UpdateStatus();
    }

    private bool ConfirmUnresolvedConflicts()
    {
        int unresolved = _conflicts.Count(c => c.Resolution == ConflictResolution.Unresolved);
        if (unresolved == 0)
        {
            return true;
        }

        var choice = MessageBox.Show(
            $"{unresolved} conflict(s) are still unresolved. They will be saved with <<<<<<< conflict markers. Save anyway?",
            "Diff & Merge",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Warning);
        return choice == DialogResult.Yes;
    }
}
