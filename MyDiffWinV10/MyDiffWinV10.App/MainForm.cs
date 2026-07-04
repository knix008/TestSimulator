using MyDiffWinV10.App.Controls;
using MyDiffWinV10.App.Core;
using MyDiffWinV10.App.Dialogs;
using MyDiffWinV10.App.Services;

namespace MyDiffWinV10.App;

public sealed class MainForm : Form
{
    private readonly AppSettings _settings = AppSettingsStore.Load();
    private readonly TabControl _tabs = new() { Dock = DockStyle.Fill };
    private readonly ImageList _tabIcons = new() { ColorDepth = ColorDepth.Depth32Bit, ImageSize = new Size(16, 16) };
    private readonly DirectoryComparePanel _directoryPanel = new() { Dock = DockStyle.Fill };
    private readonly FileDiffView _fileDiffView;
    private readonly ToolStripStatusLabel _statusLabel = new();

    private readonly ToolStripButton _tsbOpenLeft = new() { Image = IconFactory.OpenLeftFile() };
    private readonly ToolStripButton _tsbOpenRight = new() { Image = IconFactory.OpenRightFile() };
    private readonly ToolStripButton _tsbReload = new() { Image = IconFactory.Reload() };
    private readonly ToolStripButton _tsbPrev = new() { Image = IconFactory.PrevDiff() };
    private readonly ToolStripButton _tsbNext = new() { Image = IconFactory.NextDiff() };
    private readonly ToolStripButton _tsbWordWrap = new() { Image = IconFactory.WordWrap() };
    private readonly ToolStripButton _tsbCompareDirs = new() { Image = IconFactory.Reload() };
    private readonly ToolStripButton _tsbInfo = new() { Image = IconFactory.Info(), Alignment = ToolStripItemAlignment.Right };
    private readonly ToolStripLabel _tslFontSize = new() { Image = IconFactory.FontSize() };
    private readonly NumericUpDown _nudFontSize = new()
    {
        DecimalPlaces = 1,
        Increment = 0.5m,
        Minimum = 6m,
        Maximum = 32m,
        Width = 55,
    };

    private readonly List<(Control Control, Func<string> GetText)> _localizedControls = new();
    private readonly List<(ToolStripItem Item, Func<string> GetText)> _localizedItems = new();
    private readonly List<(ToolStripItem Item, Func<string> GetToolTip)> _localizedToolTips = new();

    private ToolStripMenuItem _wordWrapMenuItem = null!;
    private ToolStrip? _toolStrip;
    private ToolStripControlHost? _fontSizeHost;
    private readonly ToolTip _fontSizeToolTip = new();
    private bool _fileOnlyMode;
    private bool _restoreDirectoriesOnLoad = true;

    private MainForm(bool fileOnlyMode = false)
    {
        _fileOnlyMode = fileOnlyMode;
        _restoreDirectoriesOnLoad = !fileOnlyMode;
        _fileDiffView = new FileDiffView(_settings) { Dock = DockStyle.Fill };

        Strings.Language = _settings.Language;
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 10f);
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        Width = Math.Max(_settings.WindowWidth, 900);
        Height = Math.Max(_settings.WindowHeight, 600);

        BuildLayout();
        WireEvents();
        ApplyLocalization();
        UpdateFileActionItemsEnabled();
        UpdateToolbarForActiveTab();
    }

    public static MainForm Standalone()
    {
        var form = new MainForm();
        form._restoreDirectoriesOnLoad = true;
        return form;
    }

    public static MainForm FromFiles(string leftFile, string rightFile)
    {
        var form = new MainForm(fileOnlyMode: true);
        form._fileDiffView.SetInitialSessionFactory(() => DiffSession.Load(leftFile, rightFile));
        return form;
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);

        if (_fileOnlyMode)
        {
            ShowFileCompareTab();
            _fileDiffView.OnViewShown();
            return;
        }

        if (_restoreDirectoriesOnLoad)
        {
            _directoryPanel.RestoreLastDirectories(_settings);
        }

        _fileDiffView.OnViewShown();
        UpdateStatusForActiveTab();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        _settings.WindowWidth = Width;
        _settings.WindowHeight = Height;
        AppSettingsStore.Save(_settings);
        base.OnFormClosing(e);
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if (keyData == Keys.F3)
        {
            _fileDiffView.GoToDiff(1);
            return true;
        }

        if (keyData == (Keys.F3 | Keys.Shift))
        {
            _fileDiffView.GoToDiff(-1);
            return true;
        }

        return base.ProcessCmdKey(ref msg, keyData);
    }

    private void BuildLayout()
    {
        BackColor = Color.FromArgb(241, 243, 247);

        var menu = BuildMenu();
        var toolStrip = BuildToolStrip();
        _toolStrip = toolStrip;

        ConfigureTabs();

        var statusStrip = new StatusStrip { SizingGrip = true, BackColor = Color.FromArgb(241, 243, 247) };
        _statusLabel.Spring = true;
        statusStrip.Items.Add(_statusLabel);

        Controls.Add(_tabs);
        Controls.Add(toolStrip);
        Controls.Add(statusStrip);
        Controls.Add(menu);

        _directoryPanel.BindSettings(_settings);
    }

    private void ConfigureTabs()
    {
        _tabIcons.Images.Clear();
        _tabIcons.Images.Add("directory", IconFactory.DirectoryCompare());
        _tabIcons.Images.Add("file", IconFactory.FileCompare());

        _tabs.Appearance = TabAppearance.Normal;
        _tabs.DrawMode = TabDrawMode.OwnerDrawFixed;
        _tabs.SizeMode = TabSizeMode.Fixed;
        _tabs.ItemSize = new Size(168, 30);
        _tabs.Padding = new Point(10, 4);
        _tabs.DrawItem += DrawTabItem;

        var directoryTab = new TabPage(Strings.TabDirectoryCompare)
        {
            Padding = Padding.Empty,
            BackColor = Color.FromArgb(241, 243, 247),
            ImageKey = "directory",
        };
        var fileTab = new TabPage(Strings.TabFileCompare)
        {
            Padding = Padding.Empty,
            BackColor = Color.FromArgb(241, 243, 247),
            ImageKey = "file",
        };
        directoryTab.Controls.Add(_directoryPanel);
        fileTab.Controls.Add(_fileDiffView);
        _tabs.TabPages.Add(directoryTab);
        _tabs.TabPages.Add(fileTab);
        _tabs.SelectedIndex = 0;

        if (_fileOnlyMode)
        {
            _tabs.TabPages.Remove(directoryTab);
            _tabs.SelectedIndex = 0;
            _tabs.ItemSize = new Size(140, 30);
        }

        _tabs.SelectedIndexChanged += (_, _) =>
        {
            UpdateToolbarForActiveTab();
            UpdateStatusForActiveTab();
            _tabs.Invalidate();
        };
    }

    private void DrawTabItem(object? sender, DrawItemEventArgs e)
    {
        TabPage page = _tabs.TabPages[e.Index];
        bool selected = e.Index == _tabs.SelectedIndex;

        Color backColor = selected ? Color.White : Color.FromArgb(241, 243, 247);
        using (var background = new SolidBrush(backColor))
        {
            e.Graphics.FillRectangle(background, e.Bounds);
        }

        if (selected)
        {
            using var border = new Pen(Color.FromArgb(226, 232, 240));
            e.Graphics.DrawLine(border, e.Bounds.Left, e.Bounds.Bottom - 1, e.Bounds.Right, e.Bounds.Bottom - 1);
        }

        Image? icon = page.ImageKey switch
        {
            "directory" => _tabIcons.Images["directory"],
            "file" => _tabIcons.Images["file"],
            _ => null,
        };

        const int iconSize = 16;
        const int leftPadding = 8;
        const int iconTextGap = 6;
        int contentX = e.Bounds.X + leftPadding;

        if (icon != null)
        {
            int iconY = e.Bounds.Y + (e.Bounds.Height - iconSize) / 2;
            e.Graphics.DrawImage(icon, contentX, iconY, iconSize, iconSize);
            contentX += iconSize + iconTextGap;
        }

        var textBounds = new Rectangle(
            contentX,
            e.Bounds.Y,
            Math.Max(0, e.Bounds.Right - contentX - 4),
            e.Bounds.Height);

        TextRenderer.DrawText(
            e.Graphics,
            page.Text,
            e.Font ?? Font,
            textBounds,
            selected ? Color.FromArgb(30, 41, 59) : Color.FromArgb(71, 85, 105),
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);

        if ((e.State & DrawItemState.Focus) == DrawItemState.Focus)
        {
            ControlPaint.DrawFocusRectangle(e.Graphics, e.Bounds);
        }
    }

    private MenuStrip BuildMenu()
    {
        var menu = new MenuStrip { ShowItemToolTips = true, BackColor = Color.White, Renderer = new ModernToolStripRenderer() };

        var fileMenu = RegisterLocalizedItem(new ToolStripMenuItem { Image = IconFactory.OpenLeft() }, () => Strings.MenuFile);
        RegisterLocalizedToolTip(fileMenu, () => Strings.TipMenuFile);

        fileMenu.DropDownItems.Add(MakeMenuItem(() => Strings.ShowDirectoryCompare, IconFactory.DirectoryCompare(), () => Strings.TipShowDirectoryCompare, (_, _) => ShowDirectoryCompareTab()));
        fileMenu.DropDownItems.Add(MakeMenuItem(() => Strings.ShowFileCompare, IconFactory.FileCompare(), () => Strings.TipShowFileCompare, (_, _) => ShowFileCompareTab()));
        fileMenu.DropDownItems.Add(new ToolStripSeparator());
        fileMenu.DropDownItems.Add(MakeMenuItem(() => Strings.SelectLeftDirectory, IconFactory.OpenLeft(), () => Strings.TipSelectLeftDirectory, (_, _) => _directoryPanel.SelectDirectory(left: true)));
        fileMenu.DropDownItems.Add(MakeMenuItem(() => Strings.SelectRightDirectory, IconFactory.OpenRight(), () => Strings.TipSelectRightDirectory, (_, _) => _directoryPanel.SelectDirectory(left: false)));
        fileMenu.DropDownItems.Add(MakeMenuItem(() => Strings.CompareDirectories, IconFactory.Reload(), () => Strings.TipCompareDirectories, (_, _) => _directoryPanel.CompareDirectories()));
        fileMenu.DropDownItems.Add(new ToolStripSeparator());
        fileMenu.DropDownItems.Add(MakeMenuItem(() => Strings.OpenLeft, IconFactory.OpenLeftFile(), () => Strings.TipOpenLeft, (_, _) => _fileDiffView.OpenLeft()));
        fileMenu.DropDownItems.Add(MakeMenuItem(() => Strings.OpenRight, IconFactory.OpenRightFile(), () => Strings.TipOpenRight, (_, _) => _fileDiffView.OpenRight()));
        fileMenu.DropDownItems.Add(MakeMenuItem(() => Strings.Reload, IconFactory.Reload(), () => Strings.TipReload, (_, _) => _fileDiffView.Reload()));
        fileMenu.DropDownItems.Add(new ToolStripSeparator());
        fileMenu.DropDownItems.Add(MakeMenuItem(() => Strings.Preferences, IconFactory.Preferences(), () => Strings.TipPreferences, (_, _) => OpenPreferences()));
        fileMenu.DropDownItems.Add(new ToolStripSeparator());
        fileMenu.DropDownItems.Add(MakeMenuItem(() => Strings.Exit, IconFactory.Exit(), () => Strings.TipExit, (_, _) => Close()));

        var viewMenu = RegisterLocalizedItem(new ToolStripMenuItem { Image = IconFactory.View() }, () => Strings.MenuView);
        RegisterLocalizedToolTip(viewMenu, () => Strings.TipMenuView);
        _wordWrapMenuItem = MakeMenuItem(() => Strings.WordWrap, IconFactory.WordWrap(), () => Strings.TipWordWrap, (_, _) => ToggleWordWrap());
        _fileDiffView.SetWordWrapMenuItem(_wordWrapMenuItem);
        viewMenu.DropDownItems.Add(_wordWrapMenuItem);
        viewMenu.DropDownItems.Add(new ToolStripSeparator());
        viewMenu.DropDownItems.Add(MakeMenuItem(() => Strings.PreviousDiff, IconFactory.PrevDiff(), () => Strings.TipPrevDiff, (_, _) => _fileDiffView.GoToDiff(-1)));
        viewMenu.DropDownItems.Add(MakeMenuItem(() => Strings.NextDiff, IconFactory.NextDiff(), () => Strings.TipNextDiff, (_, _) => _fileDiffView.GoToDiff(1)));
        viewMenu.DropDownItems.Add(new ToolStripSeparator());
        viewMenu.DropDownItems.Add(MakeMenuItem(() => Strings.Copy, IconFactory.Copy(), () => Strings.TipCopyFocused, (_, _) => _fileDiffView.CopyFromActivePane()));

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

        RegisterLocalizedToolTip(_tsbCompareDirs, () => Strings.TipCompareDirectories);
        RegisterLocalizedToolTip(_tsbReload, () => Strings.TipReload);
        RegisterLocalizedToolTip(_tsbPrev, () => Strings.TipPrevDiff);
        RegisterLocalizedToolTip(_tsbNext, () => Strings.TipNextDiff);
        RegisterLocalizedToolTip(_tsbWordWrap, () => Strings.TipWordWrap);

        foreach (ToolStripButton button in new ToolStripButton[] { _tsbCompareDirs, _tsbOpenLeft, _tsbOpenRight, _tsbReload, _tsbPrev, _tsbNext, _tsbWordWrap, _tsbInfo })
        {
            button.AutoToolTip = true;
            button.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
            button.TextImageRelation = TextImageRelation.ImageBeforeText;
            button.Padding = new Padding(4, 2, 6, 2);
        }

        RegisterLocalizedItem(_tsbCompareDirs, () => Strings.CompareDirectories);
        RegisterLocalizedItem(_tsbOpenLeft, () => Strings.TsbOpenLeft);
        RegisterLocalizedItem(_tsbOpenRight, () => Strings.TsbOpenRight);
        RegisterLocalizedItem(_tsbReload, () => Strings.TsbReload);
        RegisterLocalizedItem(_tsbPrev, () => Strings.TsbPrevDiff);
        RegisterLocalizedItem(_tsbNext, () => Strings.TsbNextDiff);
        RegisterLocalizedItem(_tsbWordWrap, () => Strings.WordWrap);

        _tsbCompareDirs.Click += (_, _) => _directoryPanel.CompareDirectories();
        _tsbOpenLeft.Click += (_, _) =>
        {
            if (IsDirectoryTabActive)
            {
                _directoryPanel.SelectDirectory(left: true);
            }
            else
            {
                _fileDiffView.OpenLeft();
            }
        };
        _tsbOpenRight.Click += (_, _) =>
        {
            if (IsDirectoryTabActive)
            {
                _directoryPanel.SelectDirectory(left: false);
            }
            else
            {
                _fileDiffView.OpenRight();
            }
        };
        _tsbReload.Click += (_, _) => _fileDiffView.Reload();
        _tsbPrev.Click += (_, _) => _fileDiffView.GoToDiff(-1);
        _tsbNext.Click += (_, _) => _fileDiffView.GoToDiff(1);
        _tsbWordWrap.Click += (_, _) => ToggleWordWrap();

        _nudFontSize.Value = Math.Clamp((decimal)_settings.PaneFontSize, _nudFontSize.Minimum, _nudFontSize.Maximum);
        _nudFontSize.ValueChanged += (_, _) =>
        {
            _settings.PaneFontSize = (float)_nudFontSize.Value;
            _fileDiffView.ApplyPanePreferences();
            AppSettingsStore.Save(_settings);
        };

        var fontSizeHost = new ToolStripControlHost(_nudFontSize) { Margin = new Padding(2, 4, 6, 4) };
        _fontSizeHost = fontSizeHost;
        _fontSizeHost.AutoToolTip = true;
        RegisterLocalizedItem(_tslFontSize, () => Strings.FontSizeLabel);
        RegisterLocalizedToolTip(_tslFontSize, () => Strings.TipFontSize);
        _tslFontSize.AutoToolTip = true;
        _tslFontSize.Image = IconFactory.FontSize();
        _tslFontSize.TextImageRelation = TextImageRelation.ImageBeforeText;
        RegisterLocalizedToolTip(fontSizeHost, () => Strings.TipFontSize);
        _fontSizeToolTip.SetToolTip(_nudFontSize, Strings.TipFontSize);

        RegisterLocalizedToolTip(_tsbInfo, () => Strings.TipAboutButton);
        RegisterLocalizedItem(_tsbInfo, () => Strings.TsbInfo);
        _tsbInfo.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        _tsbInfo.TextImageRelation = TextImageRelation.ImageBeforeText;
        _tsbInfo.Padding = new Padding(4, 2, 6, 2);
        _tsbInfo.Click += (_, _) => ShowAbout();

        toolStrip.Items.Add(_tsbCompareDirs);
        toolStrip.Items.Add(_tsbOpenLeft);
        toolStrip.Items.Add(_tsbOpenRight);
        toolStrip.Items.Add(_tsbReload);
        toolStrip.Items.Add(new ToolStripSeparator());
        toolStrip.Items.Add(_tsbPrev);
        toolStrip.Items.Add(_tsbNext);
        toolStrip.Items.Add(new ToolStripSeparator());
        toolStrip.Items.Add(_tsbWordWrap);
        toolStrip.Items.Add(new ToolStripSeparator());
        toolStrip.Items.Add(_tslFontSize);
        toolStrip.Items.Add(fontSizeHost);
        toolStrip.Items.Add(_tsbInfo);

        UpdateToolbarToolTips();
        return toolStrip;
    }

    private void WireEvents()
    {
        _directoryPanel.FileCompareRequested += (_, paths) => OpenFileCompare(paths.LeftPath, paths.RightPath);
        _directoryPanel.StatusChanged += (_, message) =>
        {
            if (IsDirectoryTabActive)
            {
                _statusLabel.Text = message;
            }
        };
        _fileDiffView.StatusChanged += (_, message) =>
        {
            if (!IsDirectoryTabActive)
            {
                _statusLabel.Text = message;
            }
        };
        _fileDiffView.SessionChanged += (_, _) =>
        {
            UpdateFileActionItemsEnabled();
            UpdateWindowTitle();
            bool isBinary = _fileDiffView.Session?.Mode == DiffMode.Binary;
            _tsbWordWrap.Enabled = !isBinary && !IsDirectoryTabActive;
            _wordWrapMenuItem.Enabled = !isBinary;
        };
    }

    private bool IsDirectoryTabActive => !_fileOnlyMode && _tabs.SelectedIndex == 0;

    private void OpenFileCompare(string leftPath, string rightPath)
    {
        try
        {
            _fileDiffView.LoadSession(DiffSession.LoadFlexible(leftPath, rightPath));
            ShowFileCompareTab();
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(this, Strings.ErrorOpenFile, ex);
        }
    }

    private void ShowDirectoryCompareTab()
    {
        _tabs.SelectedIndex = 0;
        UpdateToolbarForActiveTab();
        UpdateStatusForActiveTab();
    }

    private void ShowFileCompareTab()
    {
        _tabs.SelectedIndex = 1;
        UpdateToolbarForActiveTab();
        UpdateStatusForActiveTab();
    }

    private void UpdateToolbarForActiveTab()
    {
        bool directoryTab = IsDirectoryTabActive;
        _tsbCompareDirs.Visible = directoryTab;
        _tsbReload.Visible = !directoryTab;
        _tsbPrev.Visible = !directoryTab;
        _tsbNext.Visible = !directoryTab;
        _tsbWordWrap.Visible = !directoryTab;
        _tslFontSize.Visible = !directoryTab;
        if (_fontSizeHost != null)
        {
            _fontSizeHost.Visible = !directoryTab;
        }

        _tsbOpenLeft.Image = directoryTab ? IconFactory.OpenLeft() : IconFactory.OpenLeftFile();
        _tsbOpenRight.Image = directoryTab ? IconFactory.OpenRight() : IconFactory.OpenRightFile();
        UpdateToolbarToolTips();
    }

    private void UpdateToolbarToolTips()
    {
        if (IsDirectoryTabActive)
        {
            _tsbOpenLeft.ToolTipText = Strings.TipSelectLeftDirectory;
            _tsbOpenRight.ToolTipText = Strings.TipSelectRightDirectory;
        }
        else
        {
            _tsbOpenLeft.ToolTipText = Strings.TipOpenLeft;
            _tsbOpenRight.ToolTipText = Strings.TipOpenRight;
        }
    }

    private void UpdateStatusForActiveTab()
    {
        _statusLabel.Text = IsDirectoryTabActive
            ? Strings.StatusDirectoryReady
            : (_fileDiffView.HasSession ? _statusLabel.Text : Strings.StatusNoSession);
    }

    private void UpdateFileActionItemsEnabled()
    {
        bool hasSession = _fileDiffView.HasSession;
        _tsbReload.Enabled = hasSession;
        _tsbPrev.Enabled = hasSession;
        _tsbNext.Enabled = hasSession;
    }

    private void UpdateWindowTitle()
    {
        Text = _fileDiffView.Session == null
            ? Strings.AppTitle
            : string.Format(Strings.WindowTitleFormat, Path.GetFileName(_fileDiffView.Session.RightPath));
    }

    private void ToggleWordWrap()
    {
        _fileDiffView.ToggleWordWrap();
        _wordWrapMenuItem.Checked = _settings.WordWrap;
        _tsbWordWrap.Checked = _settings.WordWrap;
    }

    private void OpenPreferences()
    {
        using var dialog = new PreferencesDialog(_settings);
        dialog.SettingsChanged += (_, _) => ApplySettingsPreview();

        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            AppSettingsStore.Save(_settings);
        }

        ApplySettingsPreview();
    }

    private void ApplySettingsPreview()
    {
        ApplyLocalization();
        _fileDiffView.ApplyPanePreferences();
        _fileDiffView.ApplyPaneHeaderColors();
        _directoryPanel.ApplyHeaderColors();
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

        foreach (var (item, getText) in _localizedItems)
        {
            item.Text = getText();
        }

        foreach (var (item, getToolTip) in _localizedToolTips)
        {
            item.ToolTipText = getToolTip();
        }

        if (_tabs.TabPages.Count >= 1)
        {
            if (!_fileOnlyMode && _tabs.TabPages.Count >= 2)
            {
                _tabs.TabPages[0].Text = Strings.TabDirectoryCompare;
                _tabs.TabPages[0].ImageKey = "directory";
                _tabs.TabPages[1].Text = Strings.TabFileCompare;
                _tabs.TabPages[1].ImageKey = "file";
            }
            else
            {
                _tabs.TabPages[0].Text = Strings.TabFileCompare;
                _tabs.TabPages[0].ImageKey = "file";
            }

            _tabs.Invalidate();
        }

        _directoryPanel.ApplyLocalization();
        _fileDiffView.ApplyLocalization();
        _wordWrapMenuItem.Checked = _settings.WordWrap;
        _tsbWordWrap.Checked = _settings.WordWrap;
        UpdateToolbarToolTips();
        _fontSizeToolTip.SetToolTip(_nudFontSize, Strings.TipFontSize);
        UpdateWindowTitle();
        UpdateStatusForActiveTab();
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

        item.AutoToolTip = true;
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
