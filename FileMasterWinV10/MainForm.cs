using FileMasterWinV10.Controls;
using FileMasterWinV10.Dialogs;
using FileMasterWinV10.Helpers;

namespace FileMasterWinV10;

public partial class MainForm : Form
{
    private BookmarkManager _bookmarks = null!;
    private readonly SessionSettings _session = new();
    private readonly AppPreferences _preferences = new();
    private FilePanel _activePanel = null!;
    private ToolStripStatusLabel _indexStatusLabel = null!;
    private IndexState _lastIndexState = IndexState.NotBuilt;

    public MainForm()
    {
        InitializeComponent();
        AppIconHelper.TryApplyFormIcon(this);

        if (AppIconHelper.IsDesignMode(this))
            return;

        _bookmarks = new BookmarkManager();
        _session.Load();
        _preferences.Load();
        LocalizationService.CurrentLanguage = _preferences.Language;
        UiTheme.CurrentTheme = _preferences.Theme;

        leftPanel.SetPanelSide(FilePanelSide.Left);
        rightPanel.SetPanelSide(FilePanelSide.Right);
        _activePanel = leftPanel;
        BuildMenus();
        BuildToolbar();
        WireEvents();
        ApplyTheme();
        statusLabel.Text = LocalizationService.T("Ready");

        // 상태 표시줄 우측에 검색 인덱스 진척률을 항상 표시한다.
        _indexStatusLabel = new ToolStripStatusLabel { Alignment = ToolStripItemAlignment.Right };
        statusStrip.Items.Add(_indexStatusLabel);
        UpdateIndexStatusLabel();

        // 검색 인덱스: 저장본 로드 또는 백그라운드 색인 + 변경 감시 시작
        SearchIndexService.Instance.StatusChanged += OnIndexStatusChanged;
        SearchIndexService.Instance.Initialize();
    }

    private void MainForm_Load(object? sender, EventArgs e)
    {
        leftPanel.SetInitialPath(_session.LeftPath);
        rightPanel.SetInitialPath(_session.RightPath);

        leftRightSplit.Panel1MinSize = 220;
        leftRightSplit.Panel2MinSize = 220;
        var maxDist = leftRightSplit.Width - 220 - leftRightSplit.SplitterWidth;
        if (maxDist >= 220)
        {
            var dist = _session.SplitterDistance is int saved && saved >= 220 && saved <= maxDist
                ? saved
                : (leftRightSplit.Width - leftRightSplit.SplitterWidth) / 2;
            leftRightSplit.SplitterDistance = Math.Clamp(dist, 220, maxDist);
        }

        mainSplit.Panel2MinSize = 100;
        if (!mainSplit.Panel2Collapsed)
            mainSplit.SplitterDistance = Math.Max(100, ClientSize.Height - 240);
    }

    private void MainForm_FormClosing(object? sender, FormClosingEventArgs e)
    {
        int? splitter = leftRightSplit.Width > 0 ? leftRightSplit.SplitterDistance : null;
        _session.Save(leftPanel.CurrentPath, rightPanel.CurrentPath, splitter);
        SearchIndexService.Instance.StatusChanged -= OnIndexStatusChanged;
        SearchIndexService.Instance.Dispose();
    }

    // 인덱스 상태 변화를 상태 표시줄에 반영(백그라운드 스레드 → UI 스레드 마샬링).
    private void OnIndexStatusChanged(object? sender, EventArgs e)
    {
        if (IsDisposed || Disposing || !IsHandleCreated) return;
        try
        {
            BeginInvoke(() =>
            {
                var svc = SearchIndexService.Instance;
                UpdateIndexStatusLabel();
                if (svc.State == IndexState.Ready && _lastIndexState != IndexState.Ready)
                    ShowMainStatus(string.Format(LocalizationService.T("Index_Ready"), svc.Count));
                _lastIndexState = svc.State;
            });
        }
        catch (InvalidOperationException) { }
    }

    private void UpdateIndexStatusLabel()
    {
        if (_indexStatusLabel == null) return;
        _indexStatusLabel.ForeColor = UiTheme.TextSecondary;
        _indexStatusLabel.Font = UiTheme.UiFontSmall;
        _indexStatusLabel.Text = FormatIndexStatus();
    }

    private static string FormatIndexStatus()
    {
        var svc = SearchIndexService.Instance;
        return svc.State switch
        {
            IndexState.Building => string.Format(LocalizationService.T("Index_Status_Building"), svc.IndexedCount),
            IndexState.Ready => string.Format(LocalizationService.T("Index_Status_Ready"), svc.Count),
            _ => LocalizationService.T("Index_Status_NotBuilt"),
        };
    }

    private void WireEvents()
    {
        leftPanel.GotFocused += (_, _) => { _activePanel = leftPanel; ShowMainStatus(string.Format(LocalizationService.T("Panel_ActiveLeft"), leftPanel.CurrentPath)); };
        rightPanel.GotFocused += (_, _) => { _activePanel = rightPanel; ShowMainStatus(string.Format(LocalizationService.T("Panel_ActiveRight"), rightPanel.CurrentPath)); };

        leftPanel.PathChanged += (_, path) => ShowMainStatus(string.Format(LocalizationService.T("Status_MoveLeft"), path));
        rightPanel.PathChanged += (_, path) => ShowMainStatus(string.Format(LocalizationService.T("Status_MoveRight"), path));

        leftPanel.SelectionChanged += (_, paths) =>
        {
            if (paths.Length == 1 && File.Exists(paths[0])) previewPanel.Preview(paths[0]);
            else if (paths.Length == 0) previewPanel.Clear();
        };
        rightPanel.SelectionChanged += (_, paths) =>
        {
            if (paths.Length == 1 && File.Exists(paths[0])) previewPanel.Preview(paths[0]);
            else if (paths.Length == 0) previewPanel.Clear();
        };

        leftPanel.CopyToOtherRequested += async (_, _) => await CopyBetweenPanelsAsync(leftPanel, rightPanel);
        leftPanel.MoveToOtherRequested += async (_, _) => await MoveBetweenPanelsAsync(leftPanel, rightPanel);
        rightPanel.CopyToOtherRequested += async (_, _) => await CopyBetweenPanelsAsync(rightPanel, leftPanel);
        rightPanel.MoveToOtherRequested += async (_, _) => await MoveBetweenPanelsAsync(rightPanel, leftPanel);
    }

    private void BuildMenus()
    {
        var I = MenuIconProvider.Get; // shortcut

        var fileMenu = new ToolStripMenuItem(LocalizationService.T("Menu_File"));
        fileMenu.DropDownItems.Add(MI(LocalizationService.T("NewFolder"), "folder_new", (_, _) => _activePanel.RequestNewFolder()));
        fileMenu.DropDownItems.Add(MI(LocalizationService.T("NewFile"), "file_new",   (_, _) => _activePanel.RequestNewFile()));
        fileMenu.DropDownItems.Add(new ToolStripSeparator());
        fileMenu.DropDownItems.Add(MI(LocalizationService.T("Menu_Exit"),    "exit",       (_, _) => Close()));

        var editMenu = new ToolStripMenuItem(LocalizationService.T("Menu_Edit"));
        editMenu.DropDownItems.Add(MI($"{LocalizationService.T("CopyRight")} (F5)", "copy_right",  (_, _) => CopyActiveToOther()));
        editMenu.DropDownItems.Add(MI($"{LocalizationService.T("MoveRight")} (F6)", "move_right",  (_, _) => MoveActiveToOther()));
        editMenu.DropDownItems.Add(new ToolStripSeparator());
        editMenu.DropDownItems.Add(MI($"{LocalizationService.T("Rename")} (F2)", "rename", (_, _) => _activePanel.BeginRename()));
        editMenu.DropDownItems.Add(MI($"{LocalizationService.T("Delete")} (F8)",        "delete", (_, _) => _activePanel.RequestDelete()));
        editMenu.DropDownItems.Add(new ToolStripSeparator());
        editMenu.DropDownItems.Add(MI(LocalizationService.T("Menu_SelectAll"), "select_all", (_, _) => SelectAll()));

        var viewMenu = new ToolStripMenuItem(LocalizationService.T("Menu_View"));
        var previewToggle = new ToolStripMenuItem(LocalizationService.T("Menu_ShowPreview"), I("preview"))
            { CheckOnClick = true };
        previewToggle.CheckedChanged += (_, _) =>
        {
            mainSplit.Panel2Collapsed = !previewToggle.Checked;
            ShowMainStatus(LocalizationService.T(previewToggle.Checked ? "Status_PreviewShown" : "Status_PreviewHidden"));
        };
        viewMenu.DropDownItems.Add(previewToggle);
        viewMenu.DropDownItems.Add(MI(LocalizationService.T("Menu_Refresh_Sc"), "refresh",
            (_, _) => { leftPanel.Refresh(); rightPanel.Refresh(); ShowMainStatus(LocalizationService.T("Status_Refreshed")); }));

        // 검색 관련 항목은 별도의 "검색" 메뉴로 분리한다.
        var searchMenu = new ToolStripMenuItem(LocalizationService.T("Menu_SearchTop"), I("search"));
        searchMenu.DropDownItems.Add(MI(LocalizationService.T("Menu_SearchLeft"),  "search", (_, _) => OpenSearch(leftPanel)));
        searchMenu.DropDownItems.Add(MI(LocalizationService.T("Menu_SearchRight"), "search", (_, _) => OpenSearch(rightPanel)));
        searchMenu.DropDownItems.Add(new ToolStripSeparator());
        searchMenu.DropDownItems.Add(MI(LocalizationService.T("Menu_Reindex"), "refresh", (_, _) =>
        {
            ShowMainStatus(LocalizationService.T("Index_Building"));
            _ = SearchIndexService.Instance.RebuildAsync();
        }));
        var indexStatusItem = new ToolStripMenuItem { Enabled = false };
        searchMenu.DropDownItems.Add(indexStatusItem);
        searchMenu.DropDownOpening += (_, _) => indexStatusItem.Text = FormatIndexStatus();

        var bookmarkMenu = new ToolStripMenuItem(LocalizationService.T("Menu_Bookmark"), I("bookmark"));
        bookmarkMenu.DropDownOpening += (_, _) => BuildBookmarkDropDown(bookmarkMenu);

        var settingsMenu = new ToolStripMenuItem(LocalizationService.T("Menu_Settings"), I("settings"));
        var languageMenu = new ToolStripMenuItem(LocalizationService.T("Menu_Language"), I("language"));
        languageMenu.DropDownItems.Add(CreateLanguageItem(AppLanguage.Korean, LocalizationService.T("Menu_Korean"), I("language")));
        languageMenu.DropDownItems.Add(CreateLanguageItem(AppLanguage.English, LocalizationService.T("Menu_English"), I("language")));
        var themeMenu = new ToolStripMenuItem(LocalizationService.T("Menu_Theme"), I("theme"));
        themeMenu.DropDownItems.Add(CreateThemeItem(AppTheme.Light, LocalizationService.T("Menu_Light"), I("light")));
        themeMenu.DropDownItems.Add(CreateThemeItem(AppTheme.Dark, LocalizationService.T("Menu_Dark"), I("dark")));
        settingsMenu.DropDownItems.Add(languageMenu);
        settingsMenu.DropDownItems.Add(themeMenu);

        menuStrip.Items.AddRange(new ToolStripItem[] { fileMenu, editMenu, viewMenu, searchMenu, bookmarkMenu, settingsMenu });
    }

    private ToolStripMenuItem CreateLanguageItem(AppLanguage language, string text, Image? icon)
    {
        var item = new ToolStripMenuItem(text, icon) { Checked = _preferences.Language == language };
        item.Click += (_, _) =>
        {
            _preferences.Language = language;
            _preferences.Save();
            LocalizationService.CurrentLanguage = language;
            RebuildChrome();
        };
        return item;
    }

    private ToolStripMenuItem CreateThemeItem(AppTheme theme, string text, Image? icon)
    {
        var item = new ToolStripMenuItem(text, icon) { Checked = _preferences.Theme == theme };
        item.Click += (_, _) =>
        {
            _preferences.Theme = theme;
            _preferences.Save();
            UiTheme.CurrentTheme = theme;
            RebuildChrome();
        };
        return item;
    }

    private void RebuildChrome()
    {
        menuStrip.Items.Clear();
        toolStrip.Items.Clear();
        BuildMenus();
        BuildToolbar();
        ApplyTheme();
        leftPanel.ApplyLocalization();
        rightPanel.ApplyLocalization();
        statusLabel.Text = LocalizationService.T("Ready");
    }

    // 폼 전체에 현재 테마를 일관되게 적용한다.
    // 메뉴/툴바 항목이 만들어진 뒤 호출해야 항목·드롭다운까지 스타일이 반영된다.
    private void ApplyTheme()
    {
        UiTheme.ApplyForm(this);
        UiTheme.ApplyControlTree(this);
        UiTheme.StyleMenuAndToolStrip(menuStrip, toolStrip);
        UiTheme.StyleStatusStrip(statusStrip);
        leftPanel.ApplyCurrentTheme();
        rightPanel.ApplyCurrentTheme();
        previewPanel.ApplyCurrentTheme();
    }

    // ToolStripMenuItem factory with icon
    private static ToolStripMenuItem MI(string text, string iconKey, EventHandler handler)
    {
        var item = new ToolStripMenuItem(text, MenuIconProvider.Get(iconKey));
        item.Click += handler;
        return item;
    }

    private void BuildBookmarkDropDown(ToolStripMenuItem menu)
    {
        var I = MenuIconProvider.Get;
        menu.DropDownItems.Clear();
        menu.DropDownItems.Add(LocalizationService.T("Bm_AddLeft"), I("bookmark"), (_, _) =>
        {
            string name = Path.GetFileName(leftPanel.CurrentPath) is { Length: > 0 } n ? n : leftPanel.CurrentPath;
            bool added = _bookmarks.Add(leftPanel.CurrentPath, name);
            ShowMainStatus(added ? string.Format(LocalizationService.T("Bm_Added"), name) : LocalizationService.T("Bm_Exists"));
        });
        menu.DropDownItems.Add(LocalizationService.T("Bm_AddRight"), I("bookmark"), (_, _) =>
        {
            string name = Path.GetFileName(rightPanel.CurrentPath) is { Length: > 0 } n ? n : rightPanel.CurrentPath;
            bool added = _bookmarks.Add(rightPanel.CurrentPath, name);
            ShowMainStatus(added ? string.Format(LocalizationService.T("Bm_Added"), name) : LocalizationService.T("Bm_Exists"));
        });

        if (_bookmarks.Bookmarks.Count > 0)
        {
            menu.DropDownItems.Add(new ToolStripSeparator());
            foreach (var bm in _bookmarks.Bookmarks)
            {
                var b = bm;
                var item = new ToolStripMenuItem(b.Name, I("folder")) { ToolTipText = b.Path };
                item.Click += (_, _) =>
                {
                    if (Directory.Exists(b.Path)) _activePanel.Navigate(b.Path);
                    else
                    {
                        ShowMainStatus($"경로를 찾을 수 없습니다: {b.Path}");
                        if (MessageBox.Show($"'{b.Path}' 경로가 없습니다. 즐겨찾기에서 제거할까요?", "경로 없음", MessageBoxButtons.YesNo) == DialogResult.Yes)
                            _bookmarks.Remove(b.Path);
                    }
                };
                menu.DropDownItems.Add(item);
            }
            menu.DropDownItems.Add(new ToolStripSeparator());
            menu.DropDownItems.Add(LocalizationService.T("Bm_Manage"), I("settings"), (_, _) => ManageBookmarks());
        }
    }

    private void ManageBookmarks()
    {
        if (_bookmarks.Bookmarks.Count == 0) { ShowMainStatus("즐겨찾기가 비어있습니다."); return; }
        using var form = new Form
        {
            Text = "즐겨찾기 관리",
            Size = new Size(500, 350),
            StartPosition = FormStartPosition.CenterParent,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
        };
        UiTheme.ApplyForm(form);
        var lb = new ListBox { Dock = DockStyle.Fill, Font = UiTheme.UiFont, BorderStyle = BorderStyle.FixedSingle };
        foreach (var b in _bookmarks.Bookmarks)
            lb.Items.Add($"{b.Name}  →  {b.Path}");

        var removeBtn = new Button { Text = "선택 항목 제거", Dock = DockStyle.Bottom, Height = 36 };
        UiTheme.StylePrimaryButton(removeBtn);
        removeBtn.Click += (_, _) =>
        {
            if (lb.SelectedIndex < 0) return;
            var bm = _bookmarks.Bookmarks[lb.SelectedIndex];
            _bookmarks.Remove(bm.Path);
            lb.Items.RemoveAt(lb.SelectedIndex);
            ShowMainStatus($"즐겨찾기 '{bm.Name}' 제거됨");
        };
        form.Controls.Add(lb);
        form.Controls.Add(removeBtn);
        form.ShowDialog(this);
    }

    private void BuildToolbar()
    {
        AddToolBtn(LocalizationService.T("NewFolder"),   "folder_new",  LocalizationService.T("NewFolder"),                   (_, _) => _activePanel.RequestNewFolder());
        AddToolBtn(LocalizationService.T("NewFile"),   "file_new",    LocalizationService.T("NewFile"),                   (_, _) => _activePanel.RequestNewFile());
        toolStrip.Items.Add(new ToolStripSeparator());
        AddToolBtn(LocalizationService.T("CopyRight"),    "copy_right",  "F5",            (_, _) => CopyActiveToOther());
        AddToolBtn(LocalizationService.T("MoveRight"),    "move_right",  "F6",            (_, _) => MoveActiveToOther());
        toolStrip.Items.Add(new ToolStripSeparator());
        AddToolBtn(LocalizationService.T("Rename"),"rename",      "F2",                 (_, _) => _activePanel.BeginRename());
        AddToolBtn(LocalizationService.T("Delete"),      "delete",      "F8",                        (_, _) => _activePanel.RequestDelete());
        toolStrip.Items.Add(new ToolStripSeparator());
        AddToolBtn(LocalizationService.T("Refresh"),  "refresh",     LocalizationService.T("Refresh"),
            (_, _) => { leftPanel.Refresh(); rightPanel.Refresh(); ShowMainStatus("새로고침 완료"); });
        AddToolBtn(LocalizationService.T("Search"),      "search",      "F9",              (_, _) => OpenSearch(_activePanel));
        toolStrip.Items.Add(new ToolStripSeparator());
        AddToolBtn(LocalizationService.T("Preview"),  "preview",     LocalizationService.T("Preview"),               (_, _) => mainSplit.Panel2Collapsed = !mainSplit.Panel2Collapsed);
        // About 버튼은 툴바 우측에 정렬한다.
        var aboutBtn = AddToolBtn(LocalizationService.T("About"), "info", LocalizationService.T("About_Title"), (_, _) => ShowAbout());
        aboutBtn.Alignment = ToolStripItemAlignment.Right;
    }

    private ToolStripButton AddToolBtn(string text, string iconKey, string tooltip, EventHandler handler)
    {
        var icon = MenuIconProvider.Get(iconKey);
        var btn = new ToolStripButton(text, icon)
        {
            ToolTipText = tooltip,
            DisplayStyle = icon != null
                ? ToolStripItemDisplayStyle.ImageAndText
                : ToolStripItemDisplayStyle.Text,
            ImageAlign = ContentAlignment.MiddleLeft,
            TextAlign  = ContentAlignment.MiddleRight,
            Margin  = new Padding(2, 0, 2, 0),
            Padding = new Padding(4, 2, 6, 2),
        };
        btn.Click += handler;
        toolStrip.Items.Add(btn);
        return btn;
    }

    private void ShowAbout()
    {
        AppIconHelper.TryApplyFormIcon(this);
        MessageBox.Show(
            this,
            $"{AppInfo.DisplayName}\n\n{LocalizationService.T("About_Creator")}: SHKWON (knix008@naver.com)\n{LocalizationService.T("About_Copyright")}",
            LocalizationService.T("About_Title"),
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
    }

    private async void CopyActiveToOther()
    {
        var (src, dest) = _activePanel == leftPanel ? (leftPanel, rightPanel) : (rightPanel, leftPanel);
        await CopyBetweenPanelsAsync(src, dest);
    }

    private async void MoveActiveToOther()
    {
        var (src, dest) = _activePanel == leftPanel ? (leftPanel, rightPanel) : (rightPanel, leftPanel);
        await MoveBetweenPanelsAsync(src, dest);
    }

    private async Task CopyBetweenPanelsAsync(FilePanel src, FilePanel dest)
    {
        var paths = src.SelectedPaths;
        if (paths.Length == 0) { ShowMainStatus("복사할 항목을 선택하세요."); return; }

        var (success, error) = await FileOperationRunner.RunAsync(this, "복사 중",
            (progress, ct) => FileOperations.CopyFiles(paths, dest.CurrentPath, progress, ct));

        if (success)
            ShowMainStatus($"{paths.Length}개 항목을 '{dest.CurrentPath}'에 복사했습니다.");
        else if (error != null)
            ShowMainStatus($"복사 실패: {error.Message}");
        else
            ShowMainStatus("복사가 취소되었습니다. 목록을 새로고침했습니다.");
    }

    private async Task MoveBetweenPanelsAsync(FilePanel src, FilePanel dest)
    {
        var paths = src.SelectedPaths;
        if (paths.Length == 0) { ShowMainStatus("이동할 항목을 선택하세요."); return; }

        var (success, error) = await FileOperationRunner.RunAsync(this, "이동 중",
            (progress, ct) => FileOperations.MoveFiles(paths, dest.CurrentPath, progress, ct));

        if (success)
            ShowMainStatus($"{paths.Length}개 항목을 '{dest.CurrentPath}'으로 이동했습니다.");
        else if (error != null)
            ShowMainStatus($"이동 실패: {error.Message}");
        else
            ShowMainStatus("이동이 취소되었습니다. 목록을 새로고침했습니다.");
    }

    private void SelectAll()
    {
        var lv = GetActiveListView();
        if (lv == null) return;
        foreach (ListViewItem item in lv.Items)
            item.Selected = true;
    }

    private ListView? GetActiveListView() => FindListView(_activePanel);

    private static ListView? FindListView(Control parent)
    {
        foreach (Control c in parent.Controls)
        {
            if (c is ListView lv) return lv;
            var nested = FindListView(c);
            if (nested != null) return nested;
        }
        return null;
    }

    private void OpenSearch(FilePanel panel)
    {
        var dlg = new SearchDialog(panel.CurrentPath);
        dlg.FileSelected += (_, path) =>
        {
            if (Directory.Exists(path)) panel.Navigate(path);
            else { string? dir = Path.GetDirectoryName(path); if (dir != null) panel.Navigate(dir); }
            ShowMainStatus(string.Format(LocalizationService.T("Search_Result"), path));
        };
        dlg.Show(this);
    }

    private void ShowMainStatus(string message)
    {
        if (InvokeRequired) { Invoke(() => ShowMainStatus(message)); return; }
        statusLabel.Text = message;
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        switch (keyData)
        {
            case Keys.F2: _activePanel.BeginRename(); return true;
            case Keys.F5: CopyActiveToOther(); return true;
            case Keys.F6: MoveActiveToOther(); return true;
            case Keys.F7: _activePanel.RequestNewFolder(); return true;
            case Keys.F8: _activePanel.RequestDelete(); return true;
            case Keys.F9: OpenSearch(_activePanel); return true;
        }
        return base.ProcessCmdKey(ref msg, keyData);
    }
}
