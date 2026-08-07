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
    private Panel? _centerBar;
    private string _lastSearchTerm = "";
    private ToolStripLabel _searchLabel = null!;
    private ToolStripComboBox _searchBox = null!;
    private ToolStripButton _indexBtn = null!;
    private ComboBoxDropDownTooltip _searchTip = null!;
    private const int SearchBoxMinWidth = 220;          // 기본(최소) 검색창 폭
    private readonly ToolTip _tips = new();

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

        // 가운데 구분바는 잡기 좋은 얇은 두께로 하고, 잔상 방지를 위해 이중 버퍼링을 켠다.
        // (넓은 색상 스플리터 위에 버튼을 오버레이하면 드래그 시 세로 잔상이 남아, 버튼 막대는 도킹 방식으로 배치한다.)
        leftRightSplit.SplitterWidth = 8;
        mainSplit.SplitterWidth = 8;
        UiTheme.EnableDoubleBuffered(mainSplit);
        UiTheme.EnableDoubleBuffered(mainSplit.Panel1);
        UiTheme.EnableDoubleBuffered(mainSplit.Panel2);
        UiTheme.EnableDoubleBuffered(leftRightSplit);
        UiTheme.EnableDoubleBuffered(leftRightSplit.Panel1);
        UiTheme.EnableDoubleBuffered(leftRightSplit.Panel2);

        // 툴바는 항상 한 줄로 유지하고, 넘치면 오버플로 버튼으로 처리한다(줄바꿈 방지).
        toolStrip.LayoutStyle = ToolStripLayoutStyle.HorizontalStackWithOverflow;

        // 애플리케이션 좌·우측에 여백을 준다(파일 영역이 창 가장자리에 붙지 않도록).
        mainSplit.Panel1.Padding = new Padding(10, 0, 10, 0);
        mainSplit.Panel2.Padding = new Padding(10, 0, 10, 0);

        leftPanel.SetPanelSide(FilePanelSide.Left);
        rightPanel.SetPanelSide(FilePanelSide.Right);
        _activePanel = leftPanel;
        CreateSearchToolItems();
        BuildMenus();
        BuildToolbar();
        WireEvents();
        ApplyTheme();
        SetActivePanel(leftPanel);
        statusLabel.Text = LocalizationService.T("Ready");

        // 상태 표시줄 우측에 검색 인덱스 진척률을 항상 표시한다.
        _indexStatusLabel = new ToolStripStatusLabel { Alignment = ToolStripItemAlignment.Right };
        statusStrip.Items.Add(_indexStatusLabel);
        UpdateIndexStatusLabel();

        // 검색 인덱스: 저장본 로드 또는 백그라운드 색인 + 변경 감시 시작
        SearchIndexService.Instance.StatusChanged += OnIndexStatusChanged;
        SearchIndexService.Instance.Initialize();
    }

    // 창이 처음 표시되면 툴바가 한 줄에 다 들어가는 폭을 최소 폭으로 고정하고, 검색창 폭을 맞춘다.
    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        UiTheme.ApplyTitleBar(this);   // 핸들 생성 후 제목 표시줄 색을 테마에 맞춘다
        UpdateMinimumWidthForToolbar();
        Size = MinimumSize;            // 시작 시 창을 최소 크기로 연다
        AdjustSearchBoxWidth();
    }

    // 툴바 항목이 잘리지(오버플로되지) 않도록 필요한 폭을 계산해 창 최소 폭으로 설정한다.
    // 검색창은 '기본 폭(SearchBoxMinWidth)' 기준으로 계산해, 확대된 상태가 최소 폭에 반영되지 않게 한다.
    private void UpdateMinimumWidthForToolbar()
    {
        if (!IsHandleCreated || toolStrip.Items.Count == 0) return;

        // 최소 폭은 항상 '영어' 기준으로 계산해, 한/영 전환 시 창 크기가 바뀌지 않게 한다.
        // 각 항목의 텍스트를 잠깐 영어로 바꿔 정확한 폭을 측정한 뒤 원래대로 되돌린다.
        toolStrip.SuspendLayout();
        int content = toolStrip.Padding.Horizontal;
        foreach (ToolStripItem it in toolStrip.Items)
        {
            if (it == _searchBox) { content += SearchBoxMinWidth + it.Margin.Horizontal; continue; }

            string? saved = null;
            string? english = it.Tag switch
            {
                string key => LocalizationService.T(key, AppLanguage.English),
                EnglishLabel el => el.Text,
                _ => null,
            };
            if (english != null) { saved = it.Text; it.Text = english; }

            content += it.GetPreferredSize(Size.Empty).Width + it.Margin.Horizontal;

            if (saved != null) it.Text = saved;
        }
        toolStrip.ResumeLayout(false);

        int chrome = Width - ClientSize.Width;        // 좌우 비클라이언트 테두리 합
        int minW = content + chrome + 12;             // 약간의 여유
        int minH = Math.Max(MinimumSize.Height, 700);
        MinimumSize = new Size(minW, minH);

        // 최소 폭이 현재 폭보다 커지면 창을 새 최소 폭으로 넓혀 툴바가 넘치지 않게 한다.
        if (Width < minW) Width = minW;
    }

    // 창이 넓어지면 검색창이 남는 폭을 모두 차지하도록 확대한다(윈도우 폭과 함께 늘어남, 상한 없음).
    private void AdjustSearchBoxWidth()
    {
        if (_searchBox == null || !IsHandleCreated || !toolStrip.Items.Contains(_searchBox)) return;

        int others = toolStrip.Padding.Horizontal + _searchBox.Margin.Horizontal;
        foreach (ToolStripItem it in toolStrip.Items)
            if (it != _searchBox) others += it.GetPreferredSize(Size.Empty).Width + it.Margin.Horizontal;

        int avail = toolStrip.ClientSize.Width - others;
        int w = Math.Max(SearchBoxMinWidth, avail);
        if (_searchBox.Width != w) _searchBox.Width = w;
    }

    // 결과 드롭다운 폭을 가장 긴 항목에 맞추되, 오른쪽 끝이 '창 오른쪽 경계'를 넘지 않게 한정한다.
    private void AdjustResultDropDownWidth(ComboBox box)
    {
        int content = box.Width;
        foreach (var obj in box.Items)
        {
            int w = TextRenderer.MeasureText(obj?.ToString() ?? "", box.Font).Width;
            if (w > content) content = w;
        }
        // 드롭다운은 콤보 왼쪽에서 펼쳐지므로, (창 오른쪽 경계 − 콤보 왼쪽)까지만 허용한다.
        int comboScreenX = box.PointToScreen(Point.Empty).X;
        int maxToWindowRight = Right - comboScreenX - 16;   // Right = 폼 오른쪽(화면 좌표)
        box.DropDownWidth = Math.Min(content + 24, Math.Max(box.Width, maxToWindowRight));
    }

    private void MainForm_Load(object? sender, EventArgs e)
    {
        leftPanel.SetInitialPath(_session.LeftPath);
        rightPanel.SetInitialPath(_session.RightPath);

        leftRightSplit.Panel1MinSize = 220;
        leftRightSplit.Panel2MinSize = 220;
        // 좌우를 균등하게 분할한다(구분자를 정중앙에).
        var avail = leftRightSplit.Width - leftRightSplit.SplitterWidth;
        if (avail >= 440)
            leftRightSplit.SplitterDistance = avail / 2;

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
                UpdateIndexButtons();
                if (svc.State == IndexState.Ready && _lastIndexState != IndexState.Ready)
                    ShowMainStatus(string.Format(LocalizationService.T("Index_Ready"), svc.Count));
                _lastIndexState = svc.State;
            });
        }
        catch (InvalidOperationException) { }
    }

    // 색인 시작/중지 토글.
    private void ToggleIndexing()
    {
        var svc = SearchIndexService.Instance;
        if (svc.State == IndexState.Building)
        {
            svc.CancelBuild();
            ShowMainStatus(LocalizationService.T("Index_Stopped"));
        }
        else
        {
            ShowMainStatus(LocalizationService.T("Index_Building"));
            _ = svc.RebuildAsync();
        }
        UpdateIndexButtons();
    }

    // 색인 진행 중이면 버튼을 '멈춤'으로, 아니면 'Indexing'으로 토글하고 아이콘도 바꾼다.
    private void UpdateIndexButtons()
    {
        if (_indexBtn == null) return;
        bool building = SearchIndexService.Instance.State == IndexState.Building;
        bool ko = LocalizationService.CurrentLanguage == AppLanguage.Korean;
        _indexBtn.Text = building ? (ko ? "멈춤" : "Stop") : "Indexing";
        _indexBtn.ToolTipText = _indexBtn.Text;
        _indexBtn.Image = MenuIconProvider.Get(building ? "stop" : "index");
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

    // 활성 패널을 바꾸고 좌/우 패널의 선택 테두리를 갱신한다.
    private void SetActivePanel(FilePanel panel)
    {
        _activePanel = panel;
        leftPanel.SetActive(panel == leftPanel);
        rightPanel.SetActive(panel == rightPanel);
    }

    private void WireEvents()
    {
        // 창 폭이 바뀌면 검색창 폭을 남는 공간에 맞춰 조정한다(최대 2배까지).
        Resize += (_, _) => AdjustSearchBoxWidth();

        leftPanel.GotFocused += (_, _) => { SetActivePanel(leftPanel); ShowMainStatus(string.Format(LocalizationService.T("Panel_ActiveLeft"), leftPanel.CurrentPath)); };
        rightPanel.GotFocused += (_, _) => { SetActivePanel(rightPanel); ShowMainStatus(string.Format(LocalizationService.T("Panel_ActiveRight"), rightPanel.CurrentPath)); };

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

        var fileMenu = new ToolStripMenuItem(LocalizationService.T("Menu_File"), I("file"));
        fileMenu.DropDownItems.Add(MI(LocalizationService.T("NewFolder"), "folder_new", (_, _) => _activePanel.RequestNewFolder()));
        fileMenu.DropDownItems.Add(MI(LocalizationService.T("NewFile"), "file_new", (_, _) => _activePanel.RequestNewFile()));
        fileMenu.DropDownItems.Add(new ToolStripSeparator());
        fileMenu.DropDownItems.Add(MI(LocalizationService.T("Menu_Exit"), "exit", (_, _) => Close()));

        var editMenu = new ToolStripMenuItem(LocalizationService.T("Menu_Edit"), I("copy"));
        editMenu.DropDownItems.Add(MI($"{LocalizationService.T("CopyRight")} (F5)", "copy_right", (_, _) => CopyActiveToOther()));
        editMenu.DropDownItems.Add(MI($"{LocalizationService.T("MoveRight")} (F6)", "move_right", (_, _) => MoveActiveToOther()));
        editMenu.DropDownItems.Add(new ToolStripSeparator());
        editMenu.DropDownItems.Add(MI($"{LocalizationService.T("Rename")} (F2)", "rename", (_, _) => _activePanel.BeginRename()));
        editMenu.DropDownItems.Add(MI($"{LocalizationService.T("Delete")} (F8)", "delete", (_, _) => _activePanel.RequestDelete()));
        editMenu.DropDownItems.Add(new ToolStripSeparator());
        editMenu.DropDownItems.Add(MI(LocalizationService.T("Menu_SelectAll"), "select_all", (_, _) => SelectAll()));

        var viewMenu = new ToolStripMenuItem(LocalizationService.T("Menu_View"), I("preview"));
        viewMenu.DropDownItems.Add(MI(LocalizationService.T("Menu_Refresh_Sc"), "refresh",
            (_, _) => { leftPanel.Refresh(); rightPanel.Refresh(); ShowMainStatus(LocalizationService.T("Status_Refreshed")); }));

        var settingsMenu = new ToolStripMenuItem(LocalizationService.T("Menu_Settings"), I("settings"));
        var languageMenu = new ToolStripMenuItem(LocalizationService.T("Menu_Language"), I("language"));
        languageMenu.DropDownItems.Add(CreateLanguageItem(AppLanguage.Korean, LocalizationService.T("Menu_Korean"), I("lang_ko")));
        languageMenu.DropDownItems.Add(CreateLanguageItem(AppLanguage.English, LocalizationService.T("Menu_English"), I("lang_en")));
        var themeMenu = new ToolStripMenuItem(LocalizationService.T("Menu_Theme"), I("theme"));
        themeMenu.DropDownItems.Add(CreateThemeItem(AppTheme.Light, LocalizationService.T("Menu_Light"), I("light")));
        themeMenu.DropDownItems.Add(CreateThemeItem(AppTheme.Dark, LocalizationService.T("Menu_Dark"), I("dark")));
        settingsMenu.DropDownItems.Add(languageMenu);
        settingsMenu.DropDownItems.Add(themeMenu);

        // 설정 메뉴 안에 검색 인덱스 관련 항목
        settingsMenu.DropDownItems.Add(new ToolStripSeparator());
        var indexMenu = new ToolStripMenuItem(LocalizationService.T("Menu_IndexSettings"), I("settings"));
        var startStopItem = MI(LocalizationService.T("Menu_IndexStart"), "index", (_, _) => ToggleIndexing());
        indexMenu.DropDownItems.Add(startStopItem);
        indexMenu.DropDownItems.Add(MI(LocalizationService.T("Menu_Reindex"), "refresh", (_, _) =>
        {
            ShowMainStatus(LocalizationService.T("Index_Building"));
            _ = SearchIndexService.Instance.RebuildAsync();
        }));
        indexMenu.DropDownItems.Add(new ToolStripSeparator());
        var settingsIndexStatus = new ToolStripMenuItem { Enabled = false };
        indexMenu.DropDownItems.Add(settingsIndexStatus);
        indexMenu.DropDownOpening += (_, _) =>
        {
            bool building = SearchIndexService.Instance.State == IndexState.Building;
            startStopItem.Text = LocalizationService.T(building ? "Menu_IndexStop" : "Menu_IndexStart");
            settingsIndexStatus.Text = FormatIndexStatus();
        };
        settingsMenu.DropDownItems.Add(indexMenu);

        // 도움말 메뉴 + 프로그램 정보
        bool ko = LocalizationService.CurrentLanguage == AppLanguage.Korean;
        var helpMenu = new ToolStripMenuItem(ko ? "도움말" : "Help", I("info"));
        helpMenu.DropDownItems.Add(MI(ko ? "프로그램 정보" : "About", "info", (_, _) => ShowAbout()));

        menuStrip.Items.AddRange(new ToolStripItem[] { fileMenu, editMenu, viewMenu, settingsMenu, helpMenu });
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
        _searchLabel.Text = LocalizationService.T("Search");
        UpdateIndexButtons();
        leftPanel.ApplyLocalization();
        rightPanel.ApplyLocalization();
        statusLabel.Text = LocalizationService.T("Ready");
        // 툴바가 새 라벨로 완전히 배치된 뒤에 최소 폭·검색창 폭을 계산한다(재배치 중 넘침/줄바꿈 방지).
        if (IsHandleCreated)
            BeginInvoke(() => { UpdateMinimumWidthForToolbar(); AdjustSearchBoxWidth(); });
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

        // 스플리터를 테두리 색으로 칠해 눈에 잘 띄고 잡기 쉽게 한다.
        leftRightSplit.BackColor = UiTheme.Border;
        mainSplit.BackColor = UiTheme.Border;

        // 검색 입력창은 네이티브(System) 렌더링을 사용한다(깜빡임 방지 + 화살표 가독성).
        // 커스텀 색을 강제하면 Flat 렌더링이 되어 다시 깜빡이므로 폰트만 맞추고 이중 버퍼링을 켠다.
        if (_searchBox != null)
        {
            _searchBox.ComboBox.Font = UiTheme.UiFont;
            UiTheme.EnableDoubleBuffered(_searchBox.ComboBox);
        }
        BuildCenterBar();
    }

    // 오른쪽 패널 왼쪽 가장자리(두 목록 사이)에 이동/복사 버튼 막대를 도킹한다.
    // 도킹 방식이라 스플리터 드래그 시 오버레이 잔상이 생기지 않는다. 버튼은 막대 안에서 수직·수평 중앙 정렬한다.
    private void BuildCenterBar()
    {
        var host = leftRightSplit.Panel2;
        if (_centerBar != null)
        {
            host.Controls.Remove(_centerBar);
            _centerBar.Dispose();
        }

        var bar = new Panel { Dock = DockStyle.Left, Width = 40, BackColor = UiTheme.DriveBarBg };
        UiTheme.EnableDoubleBuffered(bar);
        var stack = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.TopDown,
            AutoSize = true,
            WrapContents = false,
            BackColor = Color.Transparent,
        };

        void Add(string iconKey, bool flip, string tipKey, Func<Task> action)
        {
            var img = MenuIconProvider.Get(iconKey);
            if (img != null && flip)
            {
                img = (Image)img.Clone();
                img.RotateFlip(RotateFlipType.RotateNoneFlipX);
            }
            var b = new Button { Size = new Size(30, 30), Margin = new Padding(0, 3, 0, 3), Image = img, ImageAlign = ContentAlignment.MiddleCenter };
            UiTheme.StyleSecondaryButton(b);
            _tips.SetToolTip(b, LocalizationService.T(tipKey));
            b.Click += async (_, _) => await action();
            stack.Controls.Add(b);
        }

        Add("copy_right", false, "Center_CopyRight", () => CopyBetweenPanelsAsync(leftPanel, rightPanel));
        Add("move_right", false, "Center_MoveRight", () => MoveBetweenPanelsAsync(leftPanel, rightPanel));
        Add("copy_right", true, "Center_CopyLeft", () => CopyBetweenPanelsAsync(rightPanel, leftPanel));
        Add("move_right", true, "Center_MoveLeft", () => MoveBetweenPanelsAsync(rightPanel, leftPanel));

        bar.Controls.Add(stack);
        // 막대 크기가 바뀔 때마다 버튼 묶음을 수직·수평 중앙에 놓는다.
        void CenterStack() => stack.Location = new Point(
            Math.Max(0, (bar.Width - stack.Width) / 2),
            Math.Max(0, (bar.Height - stack.Height) / 2));
        bar.Resize += (_, _) => CenterStack();
        host.Controls.Add(bar);
        _centerBar = bar;
        CenterStack();
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
                        ShowMainStatus(string.Format(LocalizationService.T("Status_PathNotFound"), b.Path));
                        if (ThemedMessageBox.Show(this, string.Format(LocalizationService.T("Dlg_PathMissing_Msg"), b.Path), LocalizationService.T("Dlg_PathMissing_Title"), MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes)
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
        AddToolBtn(LocalizationService.T("NewFolder"), "folder_new", LocalizationService.T("NewFolder"), (_, _) => _activePanel.RequestNewFolder(), "NewFolder");
        AddToolBtn(LocalizationService.T("NewFile"), "file_new", LocalizationService.T("NewFile"), (_, _) => _activePanel.RequestNewFile(), "NewFile");
        toolStrip.Items.Add(new ToolStripSeparator());
        AddToolBtn(LocalizationService.T("CopyRight"), "copy_right", "F5", (_, _) => CopyActiveToOther(), "CopyRight");
        AddToolBtn(LocalizationService.T("MoveRight"), "move_right", "F6", (_, _) => MoveActiveToOther(), "MoveRight");
        toolStrip.Items.Add(new ToolStripSeparator());
        AddToolBtn(LocalizationService.T("Rename"), "rename", "F2", (_, _) => _activePanel.BeginRename(), "Rename");
        AddToolBtn(LocalizationService.T("Delete"), "delete", "F8", (_, _) => _activePanel.RequestDelete(), "Delete");
        toolStrip.Items.Add(new ToolStripSeparator());
        AddToolBtn(LocalizationService.T("Refresh"), "refresh", LocalizationService.T("Refresh"),
            (_, _) => { leftPanel.Refresh(); rightPanel.Refresh(); ShowMainStatus("새로고침 완료"); }, "Refresh");
        toolStrip.Items.Add(new ToolStripSeparator());

        // 검색 레이블·입력창·Indexing 버튼(좌측 흐름, 한 번 만든 인스턴스를 재사용).
        // 재구성 시 이전에 확대됐던 폭이 남아 툴바가 넘치지 않도록 기본 폭으로 되돌린 뒤 추가한다.
        _searchBox.Width = SearchBoxMinWidth;
        _searchLabel.Text = LocalizationService.T("Search");
        _searchLabel.Tag = "Search";                    // 영어 기준 폭 측정용
        _indexBtn.Tag = new EnglishLabel("Indexing");   // 색인 버튼은 'Indexing' 폭 기준
        toolStrip.Items.Add(_searchLabel);
        toolStrip.Items.Add(_searchBox);
        toolStrip.Items.Add(_indexBtn);
        UpdateIndexButtons();

        // 우측 정렬 그룹: 정보 · 테마 · 언어 (창 폭이 늘어도 항상 우측에 붙어 함께 이동).
        // 우측 정렬은 먼저 추가한 항목이 더 오른쪽에 오므로, 맨 오른쪽 '정보'부터 추가한다.
        var aboutBtn = AddToolBtn(LocalizationService.T("About"), "info", LocalizationService.T("About_Title"), (_, _) => ShowAbout(), "About");
        aboutBtn.Alignment = ToolStripItemAlignment.Right;

        bool isDark = _preferences.Theme == AppTheme.Dark;
        var themeBtn = AddToolBtn(
            LocalizationService.T(isDark ? "Menu_Light" : "Menu_Dark"),
            isDark ? "light" : "dark", LocalizationService.T("Menu_Theme"), (_, _) => ToggleTheme());
        // 테마 라벨(Light/Dark)은 언어와 무관하게 동일하므로 별도 기준 불필요.
        themeBtn.Tag = new EnglishLabel(LocalizationService.T(isDark ? "Menu_Light" : "Menu_Dark"));
        themeBtn.Alignment = ToolStripItemAlignment.Right;

        bool isKorean = _preferences.Language == AppLanguage.Korean;
        var langBtn = AddToolBtn(
            isKorean ? "English" : "한국어",
            "language", LocalizationService.T("Menu_Language"), (_, _) => ToggleLanguage());
        // 언어 버튼은 영어 UI에서 '한국어'를 표시하므로, 그 폭을 기준으로 삼는다.
        langBtn.Tag = new EnglishLabel("한국어");
        langBtn.Alignment = ToolStripItemAlignment.Right;
    }

    private void ToggleLanguage()
    {
        _preferences.Language = _preferences.Language == AppLanguage.Korean ? AppLanguage.English : AppLanguage.Korean;
        _preferences.Save();
        LocalizationService.CurrentLanguage = _preferences.Language;
        RebuildChrome();
    }

    private void ToggleTheme()
    {
        _preferences.Theme = _preferences.Theme == AppTheme.Dark ? AppTheme.Light : AppTheme.Dark;
        _preferences.Save();
        UiTheme.CurrentTheme = _preferences.Theme;
        RebuildChrome();
    }

    // 최소 폭 계산 시 '영어 기준'으로 측정하기 위한 마커(리소스 키 또는 고정 영어 라벨).
    private sealed record EnglishLabel(string Text);

    private ToolStripButton AddToolBtn(string text, string iconKey, string tooltip, EventHandler handler, string? resKey = null)
    {
        var icon = MenuIconProvider.Get(iconKey);
        var btn = new ToolStripButton(text, icon)
        {
            ToolTipText = tooltip,
            DisplayStyle = icon != null
                ? ToolStripItemDisplayStyle.ImageAndText
                : ToolStripItemDisplayStyle.Text,
            ImageAlign = ContentAlignment.MiddleLeft,
            TextAlign = ContentAlignment.MiddleRight,
            Margin = new Padding(2, 0, 2, 0),
            Padding = new Padding(4, 2, 6, 2),
            Tag = resKey,   // 영어 기준 폭 측정용 리소스 키
        };
        btn.Click += handler;
        toolStrip.Items.Add(btn);
        return btn;
    }

    private void ShowAbout()
    {
        using var appIcon = AppIconHelper.GetAppIconImage(48);
        ThemedMessageBox.Show(
            this,
            $"{AppInfo.DisplayName}\n\n" +
            $"{LocalizationService.T("About_Version")}: {AppInfo.Version}\n" +
            $"{LocalizationService.T("About_Build")}: {AppInfo.BuildDate}\n" +
            $"{LocalizationService.T("About_Creator")}: SHKWON (knix008@naver.com)\n" +
            $"{LocalizationService.T("About_Copyright")}",
            LocalizationService.T("About_Title"),
            MessageBoxButtons.OK,
            MessageBoxIcon.Information,
            appIcon);
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

    // ──────────────────── 툴바 아래 인라인 검색 패널 ────────────────────

    // 결과 드롭다운 항목: 표시는 "파일명 — 전체경로", 값은 전체경로.
    private sealed record SearchHit(string FullPath)
    {
        public override string ToString()
        {
            string name = Path.GetFileName(FullPath.TrimEnd(Path.DirectorySeparatorChar));
            return string.IsNullOrEmpty(name) ? FullPath : $"{name}   —   {FullPath}";
        }
    }

    // 툴바에 올릴 검색 항목(레이블·입력창·Indexing 버튼)을 한 번만 만들고 이벤트를 건다.
    // 툴바는 언어/테마 전환 시 Items를 비우고 다시 채우므로, 인스턴스는 재사용하고 BuildToolbar에서 다시 add한다.
    private void CreateSearchToolItems()
    {
        _searchLabel = new ToolStripLabel { Image = MenuIconProvider.Get("search"), ImageScaling = ToolStripItemImageScaling.None };
        _searchBox = new ToolStripComboBox
        {
            AutoSize = false,
            Width = 220,
            DropDownStyle = ComboBoxStyle.DropDown,
            // 네이티브 렌더링: 깜빡임이 적고 드롭다운 화살표가 또렷하게 보인다.
            FlatStyle = FlatStyle.System,
        };
        _indexBtn = new ToolStripButton { DisplayStyle = ToolStripItemDisplayStyle.ImageAndText };
        // 결과 드롭다운에서 마우스 아래 항목의 전체 경로를 툴팁으로 표시.
        _searchTip = new ComboBoxDropDownTooltip(_searchBox.ComboBox);

        // Enter로 검색 실행(항상 이름 기준, 전체 드라이브 대상).
        _searchBox.ComboBox.KeyDown += (_, e) =>
        {
            if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; RunInlineSearch(); }
        };
        // 입력창 바로 아래 드롭다운에서 결과를 고르면 해당 위치로 이동.
        _searchBox.ComboBox.SelectionChangeCommitted += (_, _) =>
        {
            if (_searchBox.SelectedItem is SearchHit hit)
            {
                OpenSearchHit(hit.FullPath);
                BeginInvoke(() => { _searchBox.Text = _lastSearchTerm; });
            }
        };
        // Indexing/멈춤 토글.
        _indexBtn.Click += (_, _) =>
        {
            var svc = SearchIndexService.Instance;
            if (svc.State == IndexState.Building)
            {
                svc.CancelBuild();
                ShowMainStatus(LocalizationService.T("Index_Stopped"));
            }
            else
            {
                ShowMainStatus(LocalizationService.T("Index_Building"));
                _ = svc.RebuildAsync();
            }
            UpdateIndexButtons();
        };

        _searchLabel.Text = LocalizationService.T("Search");
        UpdateIndexButtons();
    }

    private async void RunInlineSearch()
    {
        string term = _searchBox.Text.Trim();
        if (term.Length == 0) { ShowMainStatus(LocalizationService.T("Search_Hint")); return; }

        _lastSearchTerm = term;
        ShowMainStatus(LocalizationService.T("Search_Working"));
        var options = new FileSearchOptions
        {
            CaseSensitive = false,
            UseRegex = false,
            IncludeFolders = true,
            SortOrder = SearchResultSortOrder.MatchQuality,
        };

        try
        {
            var index = SearchIndexService.Instance;
            List<string> results;
            // 이름 기준 검색. 인덱스가 준비됐으면 전체 드라이브 인덱스(root=null)에서 빠르게 검색하고,
            // 아직 색인 중/미완이면 현재 디렉토리 하위를 파일시스템으로 훑는 것으로 대체한다.
            if (index.State == IndexState.Ready)
                results = await Task.Run(() => index.Search(term, options, null, CancellationToken.None));
            else
                results = await FileOperations.SearchFilesAsync(
                    _activePanel.CurrentPath, term, false, term, null, CancellationToken.None, options);

            var box = _searchBox.ComboBox;
            box.BeginUpdate();
            box.Items.Clear();
            foreach (var r in results.Take(500))
                box.Items.Add(new SearchHit(r));
            box.EndUpdate();
            _searchBox.Text = term;   // 결과를 채워도 입력칸엔 검색어 유지

            // 결과 드롭다운은 입력창 폭과 무관하게 가장 긴 항목에 맞춰 넓힌다(전체 라인 표시).
            AdjustResultDropDownWidth(box);

            if (box.Items.Count > 0)
            {
                _searchBox.DroppedDown = true;   // 입력창 바로 아래에 결과 드롭다운을 펼친다.
                ShowMainStatus($"'{term}' 검색: {results.Count}개" + (index.State == IndexState.Ready ? "" : " (색인 준비 중 — 현재 폴더만)"));
            }
            else
            {
                ShowMainStatus($"'{term}' 검색 결과 없음");
            }
        }
        catch (Exception ex)
        {
            ShowMainStatus($"검색 실패: {ex.Message}");
        }
    }

    private void OpenSearchHit(string path)
    {
        if (Directory.Exists(path)) _activePanel.Navigate(path);
        else if (File.Exists(path)) _activePanel.RevealFile(path);   // 폴더로 이동 후 해당 파일 선택·표시
        ShowMainStatus(string.Format(LocalizationService.T("Search_Result"), path));
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

    private void rightPanel_Load(object sender, EventArgs e)
    {

    }
}
