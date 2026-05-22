using FileMasterWinV10.Controls;
using FileMasterWinV10.Dialogs;
using FileMasterWinV10.Helpers;

namespace FileMasterWinV10;

public partial class MainForm : Form
{
    private BookmarkManager _bookmarks = null!;
    private readonly SessionSettings _session = new();
    private FilePanel _activePanel = null!;

    public MainForm()
    {
        InitializeComponent();
        AppIconHelper.TryApplyFormIcon(this);

        if (AppIconHelper.IsDesignMode(this))
            return;

        _bookmarks = new BookmarkManager();
        _session.Load();
        UiTheme.ApplyForm(this);
        UiTheme.StyleMenuAndToolStrip(menuStrip, toolStrip);
        UiTheme.StyleStatusStrip(statusStrip);

        _activePanel = leftPanel;
        BuildMenus();
        BuildToolbar();
        WireEvents();
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
    }

    private void WireEvents()
    {
        leftPanel.GotFocused += (_, _) => { _activePanel = leftPanel; ShowMainStatus($"왼쪽 패널 활성  |  {leftPanel.CurrentPath}"); };
        rightPanel.GotFocused += (_, _) => { _activePanel = rightPanel; ShowMainStatus($"오른쪽 패널 활성  |  {rightPanel.CurrentPath}"); };

        leftPanel.PathChanged += (_, path) => ShowMainStatus($"왼쪽 이동: {path}");
        rightPanel.PathChanged += (_, path) => ShowMainStatus($"오른쪽 이동: {path}");

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
        var fileMenu = new ToolStripMenuItem("파일(&F)");
        fileMenu.DropDownItems.Add("새 폴더(&D)", null, (_, _) => _activePanel.RequestNewFolder());
        fileMenu.DropDownItems.Add("새 파일(&N)", null, (_, _) => _activePanel.RequestNewFile());
        fileMenu.DropDownItems.Add(new ToolStripSeparator());
        fileMenu.DropDownItems.Add("종료(&X)", null, (_, _) => Close());

        var editMenu = new ToolStripMenuItem("편집(&E)");
        editMenu.DropDownItems.Add("→ 복사 (F5)", null, (_, _) => CopyActiveToOther());
        editMenu.DropDownItems.Add("→ 이동 (F6)", null, (_, _) => MoveActiveToOther());
        editMenu.DropDownItems.Add(new ToolStripSeparator());
        editMenu.DropDownItems.Add("이름 바꾸기 (F2)", null, (_, _) => _activePanel.BeginRename());
        editMenu.DropDownItems.Add("삭제 (F8)", null, (_, _) => _activePanel.RequestDelete());
        editMenu.DropDownItems.Add(new ToolStripSeparator());
        editMenu.DropDownItems.Add("모두 선택 (Ctrl+A)", null, (_, _) => SelectAll());

        var viewMenu = new ToolStripMenuItem("보기(&V)");
        var previewToggle = new ToolStripMenuItem("미리보기 패널 표시") { CheckOnClick = true };
        previewToggle.CheckedChanged += (_, _) =>
        {
            mainSplit.Panel2Collapsed = !previewToggle.Checked;
            ShowMainStatus(previewToggle.Checked ? "미리보기 패널 표시됨" : "미리보기 패널 숨김");
        };
        viewMenu.DropDownItems.Add(previewToggle);
        viewMenu.DropDownItems.Add("새로고침 (F5)", null, (_, _) => { leftPanel.Refresh(); rightPanel.Refresh(); ShowMainStatus("새로고침 완료"); });
        viewMenu.DropDownItems.Add(new ToolStripSeparator());
        viewMenu.DropDownItems.Add("왼쪽 패널 검색", null, (_, _) => OpenSearch(leftPanel));
        viewMenu.DropDownItems.Add("오른쪽 패널 검색", null, (_, _) => OpenSearch(rightPanel));

        var bookmarkMenu = new ToolStripMenuItem("즐겨찾기(&B)");
        bookmarkMenu.DropDownOpening += (_, _) => BuildBookmarkDropDown(bookmarkMenu);

        menuStrip.Items.AddRange(new ToolStripItem[] { fileMenu, editMenu, viewMenu, bookmarkMenu });
    }

    private void BuildBookmarkDropDown(ToolStripMenuItem menu)
    {
        menu.DropDownItems.Clear();
        menu.DropDownItems.Add("현재 폴더 추가 (왼쪽)", null, (_, _) =>
        {
            string name = Path.GetFileName(leftPanel.CurrentPath) is { Length: > 0 } n ? n : leftPanel.CurrentPath;
            bool added = _bookmarks.Add(leftPanel.CurrentPath, name);
            ShowMainStatus(added ? $"'{name}' 즐겨찾기에 추가됨" : "이미 즐겨찾기에 있습니다.");
        });
        menu.DropDownItems.Add("현재 폴더 추가 (오른쪽)", null, (_, _) =>
        {
            string name = Path.GetFileName(rightPanel.CurrentPath) is { Length: > 0 } n ? n : rightPanel.CurrentPath;
            bool added = _bookmarks.Add(rightPanel.CurrentPath, name);
            ShowMainStatus(added ? $"'{name}' 즐겨찾기에 추가됨" : "이미 즐겨찾기에 있습니다.");
        });

        if (_bookmarks.Bookmarks.Count > 0)
        {
            menu.DropDownItems.Add(new ToolStripSeparator());
            foreach (var bm in _bookmarks.Bookmarks)
            {
                var b = bm;
                var item = new ToolStripMenuItem(b.Name) { ToolTipText = b.Path };
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
            menu.DropDownItems.Add("즐겨찾기 관리...", null, (_, _) => ManageBookmarks());
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
        AddToolBtn("새 폴더", "새 폴더 만들기", (_, _) => _activePanel.RequestNewFolder());
        AddToolBtn("새 파일", "새 파일 만들기", (_, _) => _activePanel.RequestNewFile());
        toolStrip.Items.Add(new ToolStripSeparator());
        AddToolBtn("→ 복사", "활성 패널에서 반대 패널로 복사 (F5)", (_, _) => CopyActiveToOther());
        AddToolBtn("→ 이동", "활성 패널에서 반대 패널로 이동 (F6)", (_, _) => MoveActiveToOther());
        toolStrip.Items.Add(new ToolStripSeparator());
        AddToolBtn("이름 바꾸기", "선택 항목 이름 바꾸기 (F2)", (_, _) => _activePanel.BeginRename());
        AddToolBtn("삭제", "선택 항목 삭제 (F8)", (_, _) => _activePanel.RequestDelete());
        toolStrip.Items.Add(new ToolStripSeparator());
        AddToolBtn("새로고침", "양쪽 패널 새로고침 (F5)", (_, _) => { leftPanel.Refresh(); rightPanel.Refresh(); ShowMainStatus("새로고침 완료"); });
        AddToolBtn("검색", "활성 패널 검색", (_, _) => OpenSearch(_activePanel));
        toolStrip.Items.Add(new ToolStripSeparator());
        AddToolBtn("미리보기", "미리보기 패널 토글", (_, _) => mainSplit.Panel2Collapsed = !mainSplit.Panel2Collapsed);
    }

    private void AddToolBtn(string text, string tooltip, EventHandler handler)
    {
        var btn = new ToolStripButton(text)
        {
            ToolTipText = tooltip,
            DisplayStyle = ToolStripItemDisplayStyle.Text,
            Margin = new Padding(2, 0, 2, 0),
            Padding = new Padding(6, 2, 6, 2),
        };
        btn.Click += handler;
        toolStrip.Items.Add(btn);
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
            string? dir = Path.GetDirectoryName(path);
            if (dir != null) panel.Navigate(dir);
            ShowMainStatus($"검색 결과: {path}");
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
