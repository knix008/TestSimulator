using System.ComponentModel;
using FileMasterWinV10.Dialogs;
using FileMasterWinV10.Helpers;
using FileMasterWinV10.Models;

namespace FileMasterWinV10.Controls;

public enum FilePanelSide { Left, Right }

[ToolboxItem(true)]
public partial class FilePanel : UserControl
{
    private string _currentPath = "";
    private FilePanelSide _panelSide = FilePanelSide.Left;
    private ContextMenuStrip _contextMenu = null!;
    private ToolTip _pathTip = null!;
    private Form? _hookedForm;
    private MouseEventHandler? _outsideClickHandler;
    private DirectoryChangeWatcher? _directoryWatcher;
    private bool _loadInProgress;
    private bool _reloadPending;
    private string? _pendingSelectPath;

    public event EventHandler? CopyToOtherRequested;
    public event EventHandler? MoveToOtherRequested;
    public event EventHandler<string>? PathChanged;
    public event EventHandler<string[]>? SelectionChanged;
    public event EventHandler? GotFocused;

    public string CurrentPath => _currentPath;

    [DefaultValue(FilePanelSide.Left)]
    [Category("Appearance")]
    [Description("패널이 왼쪽인지 오른쪽인지 지정합니다.")]
    public FilePanelSide PanelSide
    {
        get => _panelSide;
        set
        {
            if (_panelSide == value) return;
            _panelSide = value;
            ApplyPanelSide();
        }
    }

    public string[] SelectedPaths =>
        listView.SelectedItems.Cast<ListViewItem>()
            .Select(i => ((FileEntry)i.Tag!).FullPath)
            .Where(p => Path.GetFileName(p) != "..")
            .ToArray();

    public FilePanel() => InitializeFilePanel();

    public FilePanel(FilePanelSide side)
    {
        PanelSide = side;
        InitializeFilePanel();
    }

    private void InitializeFilePanel()
    {
        InitializeComponent();

        DoubleBuffered = true;
        ApplyPanelSide();

        if (AppIconHelper.IsDesignMode(this))
            return;

        UiTheme.StyleListView(listView);
        UiTheme.StyleStatusStrip(statusStrip);
        pathBar.BackColor = UiTheme.Surface;
        UiTheme.StyleComboBox(driveCombo);
        WireUi();
        ApplyLocalization();
        PopulateDriveCombo();
        SetupDirectoryWatcher();
    }

    /// <summary>현재 언어에 맞춰 컬럼 헤더·제목·컨텍스트 메뉴·목록을 갱신한다.</summary>
    public void ApplyLocalization()
    {
        columnName.Text = LocalizationService.T("Col_Name");
        columnSize.Text = LocalizationService.T("Col_Size");
        columnType.Text = LocalizationService.T("Col_Type");
        columnModified.Text = LocalizationService.T("Col_Modified");

        ApplyPanelSide();
        if (!string.IsNullOrEmpty(_currentPath))
            UpdatePathDisplay();

        // 컨텍스트 메뉴 라벨을 새 언어로 다시 생성한다.
        if (_contextMenu != null)
        {
            listView.ContextMenuStrip = null;
            _contextMenu.Opening -= OnContextMenuOpening;
            _contextMenu.Dispose();
            _contextMenu = BuildContextMenu();
            _contextMenu.Opening += OnContextMenuOpening;
            listView.ContextMenuStrip = _contextMenu;
        }

        // 종류 열/상태 텍스트가 언어에 따라 달라지므로 목록을 다시 로드한다.
        if (!string.IsNullOrEmpty(_currentPath))
            Refresh();
    }

    // 활성(선택된) 패널이면 테두리 전체를 강조색으로, 아니면 기본색으로 칠한다.
    // 자식 컨트롤이 Padding 안쪽을 채우므로 Padding 영역이 곧 테두리처럼 보인다.
    private bool _isActive;
    public void SetActive(bool active)
    {
        if (_isActive == active) return;
        _isActive = active;
        ApplyActiveBorder();
    }

    private void ApplyActiveBorder()
    {
        // 두 패널 모두 항상 전체 테두리를 갖는다. 비활성은 옅은 테두리색, 활성은 강조색으로 더 두껍게.
        Padding = new Padding(_isActive ? 2 : 1);
        BackColor = _isActive ? UiTheme.Accent : UiTheme.Border;
    }

    public void ApplyCurrentTheme()
    {
        ApplyActiveBorder();
        UiTheme.StyleListView(listView);
        UiTheme.StyleStatusStrip(statusStrip);
        pathBar.BackColor = UiTheme.Surface;
        UiTheme.StyleComboBox(driveCombo);
        dirBox.BackColor = UiTheme.Surface;
        pathLabel.ForeColor = UiTheme.TextPrimary;
        chevronLabel.ForeColor = UiTheme.TextSecondary;
        folderTree.BackColor = UiTheme.Surface;
        folderTree.ApplyCurrentTheme();
        UiTheme.StyleContextMenu(_contextMenu);
    }

    private void SetupDirectoryWatcher()
    {
        _directoryWatcher = new DirectoryChangeWatcher(this);
        _directoryWatcher.Changed += (_, _) => ScheduleAutoRefresh();
        FileOperationRunner.OperationCompleted += OnFileOperationCompleted;
    }

    private void OnFileOperationCompleted() => ScheduleAutoRefresh();

    private void UpdateDirectoryWatcher(string path)
    {
        if (AppIconHelper.IsDesignMode(this)) return;
        _directoryWatcher?.Watch(path);
    }

    private void ScheduleAutoRefresh()
    {
        if (AppIconHelper.IsDesignMode(this) || string.IsNullOrEmpty(_currentPath)) return;

        if (FileOperationRunner.IsRunning) return;

        _ = LoadDirectoryAsync();
    }

    public void SetPanelSide(FilePanelSide side)
    {
        if (PanelSide == side) return;
        PanelSide = side;
        ApplyPanelSide();
    }

    private void ApplyPanelSide()
    {
        // 좌/우 구분 레이블은 제거됨. PanelSide는 내부 로직(복사/이동 방향)에만 사용된다.
    }

    private void WireUi()
    {
        _pathTip = new ToolTip(components);
        _pathTip.SetToolTip(pathBar, "클릭하여 폴더 목록을 펼치고 이동할 위치를 선택합니다.");
        _pathTip.SetToolTip(pathLabel, _pathTip.GetToolTip(pathBar));
        _pathTip.SetToolTip(chevronLabel, _pathTip.GetToolTip(pathBar));

        void HoverIn(object? s, EventArgs e) => pathBar.BackColor = UiTheme.HeaderBg;
        void HoverOut(object? s, EventArgs e) => pathBar.BackColor = UiTheme.Surface;
        pathBar.MouseEnter += HoverIn;   pathBar.MouseLeave += HoverOut;
        pathLabel.MouseEnter += HoverIn; pathLabel.MouseLeave += HoverOut;
        chevronLabel.MouseEnter += HoverIn; chevronLabel.MouseLeave += HoverOut;

        // 현재 디렉토리 표시 영역(경로 레이블 + ▾)을 누르면 폴더 트리를 펼친다.
        // '왼쪽/오른쪽' 제목과 드라이브 드롭다운은 트리를 열지 않는다.
        pathBar.Click += (_, _) => ToggleFolderTree();
        pathLabel.Click += (_, _) => ToggleFolderTree();
        chevronLabel.Click += (_, _) => ToggleFolderTree();

        folderTree.FolderSelected += (_, path) => Navigate(path);

        // 헤더 옆 드라이브 드롭다운: 사용자가 직접 고른 경우에만 항해한다.
        driveCombo.SelectionChangeCommitted += (_, _) =>
        {
            if (driveCombo.SelectedItem is DriveItem di && Directory.Exists(di.Root))
                Navigate(di.Root);
        };

        _contextMenu = BuildContextMenu();
        listView.ContextMenuStrip = _contextMenu;

        listView.DoubleClick += OnDoubleClick;
        listView.SelectedIndexChanged += OnSelectionChanged;
        listView.KeyDown += OnKeyDown;
        listView.ColumnClick += OnColumnClick;
        listView.ItemDrag += OnItemDrag;
        listView.DragEnter += OnDragEnter;
        listView.DragOver += OnDragOver;
        listView.DragDrop += OnDragDrop;
        listView.GotFocus += (_, _) => GotFocused?.Invoke(this, EventArgs.Empty);
        listView.AfterLabelEdit += OnAfterLabelEdit;
        _contextMenu.Opening += OnContextMenuOpening;
    }

    public void SetInitialPath(string? path)
    {
        var target = !string.IsNullOrWhiteSpace(path) && Directory.Exists(path)
            ? path
            : Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        _currentPath = "";
        Navigate(target);
    }

    private ContextMenuStrip BuildContextMenu()
    {
        var cm = new ContextMenuStrip { Font = UiTheme.UiFont };
        var I = MenuIconProvider.Get;
        Func<string, string> L = LocalizationService.T;
        // idx 0
        cm.Items.Add(CMI(L("Cm_Open"),        I("folder_open"), (_, _) => OpenSelected()));
        // idx 1
        cm.Items.Add(CMI(L("Cm_OpenWith"),    I("open_with"),  (_, _) => OpenWithDialog()));
        // idx 2
        cm.Items.Add(new ToolStripSeparator());
        // idx 3
        cm.Items.Add(CMI(L("Cm_Compress"),    I("zip"),         (_, _) => RequestCompress()));
        // idx 4
        cm.Items.Add(CMI(L("Cm_Extract"),     I("unzip"),       (_, _) => RequestExtract()));
        // idx 5
        cm.Items.Add(new ToolStripSeparator());
        // idx 6
        cm.Items.Add(CMI(L("Cm_CopyOther"),   I("copy_right"),  (_, _) => CopyToOtherRequested?.Invoke(this, EventArgs.Empty)));
        // idx 7
        cm.Items.Add(CMI(L("Cm_MoveOther"),   I("move_right"),  (_, _) => MoveToOtherRequested?.Invoke(this, EventArgs.Empty)));
        // idx 8
        cm.Items.Add(new ToolStripSeparator());
        // idx 9
        cm.Items.Add(CMI(L("Cm_Cut"),         I("cut"),         (_, _) => ClipboardCut()));
        // idx 10
        cm.Items.Add(CMI(L("Cm_Copy"),        I("copy"),        (_, _) => ClipboardCopy()));
        // idx 11
        cm.Items.Add(CMI(L("Cm_Paste"),       I("paste"),       (_, _) => ClipboardPaste()));
        // idx 12
        cm.Items.Add(new ToolStripSeparator());
        // idx 13
        cm.Items.Add(CMI(L("Cm_Rename"),      I("rename"),      (_, _) => BeginRename()));
        // idx 14
        cm.Items.Add(CMI(L("Cm_Delete"),      I("delete"),      (_, _) => RequestDelete()));
        // idx 15
        cm.Items.Add(new ToolStripSeparator());
        // idx 16
        cm.Items.Add(CMI(L("Cm_NewFolder"),   I("folder_new"),  (_, _) => RequestNewFolder()));
        // idx 17
        cm.Items.Add(CMI(L("Cm_NewFile"),     I("file_new"),    (_, _) => RequestNewFile()));
        // idx 18
        cm.Items.Add(new ToolStripSeparator());
        // idx 19
        cm.Items.Add(CMI(L("Cm_Properties"),  I("properties"),  (_, _) => ShowProperties()));
        UiTheme.StyleContextMenu(cm);
        return cm;
    }

    private static ToolStripMenuItem CMI(string text, Image? icon, EventHandler handler)
    {
        var item = new ToolStripMenuItem(text, icon);
        item.Click += handler;
        return item;
    }

    private void OnContextMenuOpening(object? sender, CancelEventArgs e)
    {
        bool hasSelection = listView.SelectedItems.Count > 0;
        bool singleItem = listView.SelectedItems.Count == 1 && hasSelection;
        bool singleFile = singleItem && listView.SelectedItems[0].Tag is FileEntry ff && !ff.IsDirectory;
        bool singleZip = singleFile
            && listView.SelectedItems[0].Tag is FileEntry fz
            && (fz.Extension.Equals(".zip", StringComparison.OrdinalIgnoreCase)
                || ArchiveHelper.IsSplitArchive(fz.FullPath)   // archive.zip → .001 존재
                || ArchiveHelper.IsSplitPart(fz.FullPath));    // archive.zip.001 직접 선택

        var items = _contextMenu.Items;
        items[0].Enabled = hasSelection;               // 열기
        items[1].Enabled = singleFile;                 // 연결 프로그램으로 열기
        items[3].Enabled = hasSelection;               // 압축하기...
        items[4].Enabled = singleZip;                  // 압축 해제...
        items[6].Enabled = hasSelection;               // → 다른 패널로 복사
        items[7].Enabled = hasSelection;               // → 다른 패널로 이동
        items[9].Enabled = hasSelection;               // 잘라내기
        items[10].Enabled = hasSelection;              // 복사
        items[11].Enabled = Clipboard.ContainsFileDropList(); // 붙여넣기
        items[13].Enabled = singleItem;                // 이름 바꾸기
        items[14].Enabled = hasSelection;              // 삭제
        items[19].Enabled = hasSelection;              // 속성
    }

    public void Navigate(string path)
    {
        if (!Directory.Exists(path)) return;
        CloseFolderTree();
        _currentPath = path;
        UpdatePathDisplay();
        UpdateDirectoryWatcher(path);
        _ = LoadDirectoryAsync();
        PathChanged?.Invoke(this, path);
    }

    private void UpdatePathDisplay()
    {
        pathLabel.Text = _currentPath;
        SyncDriveCombo();
    }

    private void ToggleFolderTree()
    {
        if (folderTree.IsOpen)
        {
            CloseFolderTree();
            return;
        }

        folderTree.Location = new Point(Padding.Left, pathBar.Bottom);
        folderTree.Width = ClientSize.Width - Padding.Horizontal;
        folderTree.BringToFront();
        folderTree.Toggle(_currentPath);
        chevronLabel.Text = folderTree.IsOpen ? "▴" : "▾";
        if (folderTree.IsOpen)
            RegisterOutsideClose();
        else
            UnregisterOutsideClose();
    }

    private void CloseFolderTree()
    {
        if (!folderTree.IsOpen) return;
        folderTree.Collapse();
        chevronLabel.Text = "▾";
        UnregisterOutsideClose();
    }

    private void RegisterOutsideClose()
    {
        _hookedForm = FindForm();
        if (_hookedForm == null) return;
        _outsideClickHandler ??= OnOutsideMouseDown;
        _hookedForm.MouseDown += _outsideClickHandler;
    }

    private void UnregisterOutsideClose()
    {
        if (_hookedForm == null || _outsideClickHandler == null) return;
        _hookedForm.MouseDown -= _outsideClickHandler;
    }

    private void OnOutsideMouseDown(object? sender, MouseEventArgs e)
    {
        if (!folderTree.IsOpen) return;
        var pos = Control.MousePosition;
        var treeRect = folderTree.RectangleToScreen(folderTree.ClientRectangle);
        var pathRect = pathBar.RectangleToScreen(pathBar.ClientRectangle);
        if (!treeRect.Contains(pos) && !pathRect.Contains(pos))
            CloseFolderTree();
    }

    private void GoUp()
    {
        var parent = Directory.GetParent(_currentPath);
        if (parent != null) Navigate(parent.FullName);
    }

    public async Task LoadDirectoryAsync()
    {
        if (_loadInProgress)
        {
            _reloadPending = true;
            return;
        }

        if (AppIconHelper.IsDesignMode(this))
        {
            LoadDirectorySync();
            return;
        }

        var path = _currentPath;
        if (string.IsNullOrEmpty(path)) return;

        _loadInProgress = true;
        DirectoryScanResult? scan = null;
        var failed = false;
        try
        {
            scan = await Task.Run(() => ScanDirectory(path)).ConfigureAwait(true);
        }
        catch (UnauthorizedAccessException)
        {
            SetStatus(LocalizationService.T("Status_NoAccess"));
            failed = true;
        }
        catch (Exception ex)
        {
            SetStatus(string.Format(LocalizationService.T("Status_Error"), ex.Message));
            failed = true;
        }
        finally
        {
            _loadInProgress = false;
        }

        if (_reloadPending)
        {
            _reloadPending = false;
            _ = LoadDirectoryAsync();
            return;
        }

        if (failed || path != _currentPath || scan == null) return;
        ApplyDirectoryScan(scan);
    }

    private void LoadDirectorySync()
    {
        if (string.IsNullOrEmpty(_currentPath)) return;
        try
        {
            ApplyDirectoryScan(ScanDirectory(_currentPath));
        }
        catch (UnauthorizedAccessException)
        {
            SetStatus(LocalizationService.T("Status_NoAccess"));
        }
        catch (Exception ex)
        {
            SetStatus(string.Format(LocalizationService.T("Status_Error"), ex.Message));
        }
    }

    private DirectoryScanResult ScanDirectory(string path)
    {
        var entries = new List<FileEntry>();
        var parentDir = Directory.GetParent(path);
        if (parentDir != null)
        {
            entries.Add(new FileEntry { Name = "..", FullPath = parentDir.FullName, IsDirectory = true });
        }

        foreach (var dir in Directory.GetDirectories(path).OrderBy(d => d, StringComparer.OrdinalIgnoreCase))
        {
            try
            {
                var info = new DirectoryInfo(dir);
                entries.Add(new FileEntry
                {
                    Name = info.Name,
                    FullPath = info.FullName,
                    IsDirectory = true,
                    LastModified = info.LastWriteTime,
                    Attributes = info.Attributes,
                });
            }
            catch { }
        }

        foreach (var file in Directory.GetFiles(path).OrderBy(f => f, StringComparer.OrdinalIgnoreCase))
        {
            try
            {
                var info = new FileInfo(file);
                entries.Add(new FileEntry
                {
                    Name = info.Name,
                    FullPath = info.FullName,
                    IsDirectory = false,
                    Size = info.Length,
                    LastModified = info.LastWriteTime,
                    Extension = info.Extension,
                    Attributes = info.Attributes,
                });
            }
            catch { }
        }

        int dirCount = entries.Count(e => e.IsDirectory && e.Name != "..");
        int fileCount = entries.Count(e => !e.IsDirectory);
        long totalSize = entries.Where(e => !e.IsDirectory).Sum(e => e.Size);
        return new DirectoryScanResult(entries, dirCount, fileCount, totalSize);
    }

    private void ApplyDirectoryScan(DirectoryScanResult scan)
    {
        listView.BeginUpdate();
        listView.Items.Clear();
        try
        {
            foreach (var entry in scan.Entries)
            {
                if (entry.Name == "..")
                {
                    var upItem = new ListViewItem("..", GetOrAddIcon(entry.FullPath, true)) { Tag = entry };
                    upItem.SubItems.AddRange(new[] { "", LocalizationService.T("Type_Folder"), "" });
                    listView.Items.Add(upItem);
                }
                else
                {
                    listView.Items.Add(CreateItem(entry));
                }
            }

            SetStatus(string.Format(LocalizationService.T("Status_Summary"), scan.DirCount, scan.FileCount, FileEntry.FormatSize(scan.TotalSize)));
        }
        catch (UnauthorizedAccessException)
        {
            SetStatus(LocalizationService.T("Status_NoAccess"));
        }
        catch (Exception ex)
        {
            SetStatus(string.Format(LocalizationService.T("Status_Error"), ex.Message));
        }
        finally
        {
            listView.EndUpdate();
        }
        SelectPendingFile();
    }

    // 검색 결과 등에서 지정한 파일이 목록에 로드되면 선택·포커스한다.
    private void SelectPendingFile()
    {
        if (_pendingSelectPath == null) return;
        var target = _pendingSelectPath;
        _pendingSelectPath = null;
        foreach (ListViewItem item in listView.Items)
        {
            if (item.Tag is FileEntry fe && string.Equals(fe.FullPath, target, StringComparison.OrdinalIgnoreCase))
            {
                listView.SelectedItems.Clear();
                item.Selected = true;
                item.Focused = true;
                item.EnsureVisible();
                listView.Select();
                break;
            }
        }
    }

    /// <summary>파일이 있는 폴더로 이동한 뒤 그 파일을 목록에서 선택해 보여준다.</summary>
    public void RevealFile(string fullPath)
    {
        string? dir = Path.GetDirectoryName(fullPath);
        if (string.IsNullOrEmpty(dir) || !Directory.Exists(dir)) return;

        _pendingSelectPath = fullPath;
        if (string.Equals(_currentPath, dir, StringComparison.OrdinalIgnoreCase))
            SelectPendingFile();        // 이미 그 폴더면 바로 선택
        else
            Navigate(dir);              // 이동 후 로드 완료 시 SelectPendingFile이 선택
    }

    private sealed record DirectoryScanResult(
        List<FileEntry> Entries,
        int DirCount,
        int FileCount,
        long TotalSize);

    private ListViewItem CreateItem(FileEntry entry)
    {
        var item = new ListViewItem(entry.Name, GetOrAddIcon(entry.FullPath, entry.IsDirectory)) { Tag = entry };
        item.SubItems.Add(entry.SizeDisplay);
        item.SubItems.Add(entry.TypeDisplay);
        item.SubItems.Add(entry.LastModified.ToString("yyyy-MM-dd HH:mm"));

        if ((entry.Attributes & FileAttributes.Hidden) != 0)
            item.ForeColor = UiTheme.TextSecondary;

        return item;
    }

    private int GetOrAddIcon(string path, bool isDirectory) =>
        IconHelper.GetIconIndex(imageListSmall, path, isDirectory);

    public void SetStatus(string message) => statusLabel.Text = message;

    private void OnSelectionChanged(object? sender, EventArgs e)
    {
        var paths = SelectedPaths;
        SelectionChanged?.Invoke(this, paths);

        if (listView.SelectedItems.Count == 0)
        {
            int dirCount = listView.Items.Cast<ListViewItem>().Count(i => i.Tag is FileEntry fe && fe.IsDirectory && fe.Name != "..");
            int fileCount = listView.Items.Cast<ListViewItem>().Count(i => i.Tag is FileEntry fe && !fe.IsDirectory);
            long total = listView.Items.Cast<ListViewItem>().Where(i => i.Tag is FileEntry fe && !fe.IsDirectory).Sum(i => ((FileEntry)i.Tag!).Size);
            SetStatus(string.Format(LocalizationService.T("Status_Summary"), dirCount, fileCount, FileEntry.FormatSize(total)));
        }
        else
        {
            int selDirs = listView.SelectedItems.Cast<ListViewItem>().Count(i => i.Tag is FileEntry fe && fe.IsDirectory && fe.Name != "..");
            int selFiles = listView.SelectedItems.Cast<ListViewItem>().Count(i => i.Tag is FileEntry fe && !fe.IsDirectory);
            long selSize = listView.SelectedItems.Cast<ListViewItem>().Where(i => i.Tag is FileEntry fe && !fe.IsDirectory).Sum(i => ((FileEntry)i.Tag!).Size);

            var parts = new List<string>();
            if (selDirs > 0) parts.Add(string.Format(LocalizationService.T("Sel_Folders"), selDirs));
            if (selFiles > 0) parts.Add(string.Format(LocalizationService.T("Sel_Files"), selFiles));
            SetStatus(string.Format(LocalizationService.T("Status_Selected"), string.Join(", ", parts), FileEntry.FormatSize(selSize)));
        }
    }

    private void OnDoubleClick(object? sender, EventArgs e)
    {
        if (listView.SelectedItems.Count == 0) return;
        var entry = (FileEntry)listView.SelectedItems[0].Tag!;
        if (entry.IsDirectory)
            Navigate(entry.FullPath);
        else
            OpenSelected();
    }

    private void OnKeyDown(object? sender, KeyEventArgs e)
    {
        switch (e.KeyCode)
        {
            case Keys.Enter: OnDoubleClick(sender, e); e.Handled = true; break;
            case Keys.Back: GoUp(); e.Handled = true; break;
            case Keys.Delete: RequestDelete(); e.Handled = true; break;
            case Keys.F5: Refresh(); e.Handled = true; break;
            case Keys.F2: BeginRename(); e.Handled = true; break;
            case Keys.A when e.Control: SelectAll(); e.Handled = true; break;
            case Keys.C when e.Control: ClipboardCopy(); e.Handled = true; break;
            case Keys.X when e.Control: ClipboardCut(); e.Handled = true; break;
            case Keys.V when e.Control: ClipboardPaste(); e.Handled = true; break;
        }
    }

    private void OnColumnClick(object? sender, ColumnClickEventArgs e)
    {
        listView.ListViewItemSorter = new FileEntryComparer(e.Column);
        listView.Sort();
        SetStatus($"'{listView.Columns[e.Column].Text}' 기준으로 정렬됨");
    }

    private void OnItemDrag(object? sender, ItemDragEventArgs e)
    {
        var paths = SelectedPaths;
        if (paths.Length == 0) return;
        var data = new DataObject(DataFormats.FileDrop, paths);
        listView.DoDragDrop(data, DragDropEffects.Copy | DragDropEffects.Move);
    }

    // Shift를 누르고 드롭하면 이동, 그 외에는 복사. (KeyState 비트 4 = Shift)
    private static DragDropEffects EffectFor(DragEventArgs e) =>
        e.Data?.GetDataPresent(DataFormats.FileDrop) == true
            ? ((e.KeyState & 4) == 4 ? DragDropEffects.Move : DragDropEffects.Copy)
            : DragDropEffects.None;

    private void OnDragEnter(object? sender, DragEventArgs e) => e.Effect = EffectFor(e);

    private void OnDragOver(object? sender, DragEventArgs e) => e.Effect = EffectFor(e);

    private async void OnDragDrop(object? sender, DragEventArgs e)
    {
        var paths = (string[]?)e.Data?.GetData(DataFormats.FileDrop);
        if (paths == null || paths.Length == 0) return;

        bool move = e.Effect == DragDropEffects.Move;

        // 원본이 이미 이 폴더에 있으면(같은 폴더 내 드롭) 아무 것도 하지 않는다.
        paths = paths.Where(p =>
            !string.Equals(Path.GetDirectoryName(p.TrimEnd(Path.DirectorySeparatorChar)),
                           _currentPath, StringComparison.OrdinalIgnoreCase)).ToArray();
        if (paths.Length == 0) { SetStatus("같은 폴더입니다. 작업하지 않았습니다."); return; }

        var owner = FindForm() as Form;
        string title = move ? "이동 중" : "복사 중";
        var target = paths;
        var (success, error) = await FileOperationRunner.RunAsync(owner, title,
            (progress, ct) =>
            {
                if (move) FileOperations.MoveFiles(target, _currentPath, progress, ct);
                else FileOperations.CopyFiles(target, _currentPath, progress, ct);
            });

        string verb = move ? "이동" : "복사";
        if (success)
            SetStatus($"{paths.Length}개 항목을 {verb}했습니다.");
        else if (error != null)
            SetStatus($"{verb} 실패: {error.Message}");
        else
            SetStatus($"{verb}가 취소되었습니다. 목록을 새로고침했습니다.");
    }

    private void OpenSelected()
    {
        if (listView.SelectedItems.Count == 0) return;
        var entry = (FileEntry)listView.SelectedItems[0].Tag!;
        if (entry.IsDirectory) { Navigate(entry.FullPath); return; }
        OpenFileWithShell(entry.FullPath);
    }

    private void OpenFileWithShell(string path)
    {
        try
        {
            System.Diagnostics.Process.Start(
                new System.Diagnostics.ProcessStartInfo(path) { UseShellExecute = true });
            SetStatus($"열기: {Path.GetFileName(path)}");
        }
        catch (System.ComponentModel.Win32Exception ex) when (ex.NativeErrorCode == 1155) // ERROR_NO_ASSOCIATION
        {
            // 연결된 앱이 없으면 "연결 프로그램" 대화상자를 직접 띄운다
            OpenWithDialog(path);
        }
        catch (Exception ex)
        {
            SetStatus($"열기 실패: {ex.Message}");
            ThemedMessageBox.Show(ex.Message, LocalizationService.T("Dlg_OpenFailed"), MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void OpenWithDialog()
    {
        if (listView.SelectedItems.Count == 1
            && listView.SelectedItems[0].Tag is FileEntry e && !e.IsDirectory)
            OpenWithDialog(e.FullPath);
    }

    private void OpenWithDialog(string path)
    {
        try
        {
            // Windows 10/11 기본 "연결 프로그램" 대화상자
            System.Diagnostics.Process.Start(
                new System.Diagnostics.ProcessStartInfo("openwith.exe", $"\"{path}\"")
                { UseShellExecute = true });
        }
        catch
        {
            try
            {
                // 폴백: rundll32 방식
                System.Diagnostics.Process.Start(
                    new System.Diagnostics.ProcessStartInfo(
                        "rundll32.exe", $"shell32.dll,OpenAs_RunDLL \"{path}\"")
                    { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                SetStatus($"연결 프로그램 열기 실패: {ex.Message}");
                ThemedMessageBox.Show(ex.Message, LocalizationService.T("Dlg_OpenWithError"), MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        SetStatus($"연결 프로그램으로 열기: {Path.GetFileName(path)}");
    }

    public async void RequestDelete()
    {
        var paths = SelectedPaths;
        if (paths.Length == 0) { SetStatus("삭제할 항목이 선택되지 않았습니다."); return; }
        var msg = paths.Length == 1
            ? $"'{Path.GetFileName(paths[0])}'을(를) 휴지통으로 이동하시겠습니까?"
            : $"선택한 {paths.Length}개 항목을 휴지통으로 이동하시겠습니까?";
        if (ThemedMessageBox.Show(msg, LocalizationService.T("Dlg_DeleteConfirm"), MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;

        var owner = FindForm() as Form;
        var (success, error) = await FileOperationRunner.RunAsync(owner, "휴지통으로 이동 중",
            (progress, ct) => FileOperations.DeleteFiles(paths, progress, ct));

        if (success)
            SetStatus($"{paths.Length}개 항목을 휴지통으로 이동했습니다.");
        else if (error != null)
            SetStatus($"삭제 실패: {error.Message}");
        else
            SetStatus("삭제가 취소되었습니다. 목록을 새로고침했습니다.");
    }

    public void RequestNewFolder()
    {
        using var dlg = new InputDialog("새 폴더 만들기", "폴더 이름:", "새 폴더");
        if (dlg.ShowDialog(this) != DialogResult.OK || string.IsNullOrWhiteSpace(dlg.InputText)) return;
        try
        {
            Directory.CreateDirectory(Path.Combine(_currentPath, dlg.InputText));
            Refresh();
            SetStatus($"폴더 '{dlg.InputText}'를 만들었습니다.");
        }
        catch (Exception ex)
        {
            SetStatus($"폴더 생성 실패: {ex.Message}");
            ThemedMessageBox.Show(ex.Message, LocalizationService.T("Dlg_Error"), MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    public void RequestNewFile()
    {
        using var dlg = new InputDialog("새 파일 만들기", "파일 이름:", "새 파일.txt");
        if (dlg.ShowDialog(this) != DialogResult.OK || string.IsNullOrWhiteSpace(dlg.InputText)) return;
        try
        {
            File.WriteAllText(Path.Combine(_currentPath, dlg.InputText), "");
            Refresh();
            SetStatus($"파일 '{dlg.InputText}'를 만들었습니다.");
        }
        catch (Exception ex)
        {
            SetStatus($"파일 생성 실패: {ex.Message}");
            ThemedMessageBox.Show(ex.Message, LocalizationService.T("Dlg_Error"), MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    // ──────────────────── 압축 / 해제 ────────────────────

    public async void RequestCompress()
    {
        var paths = SelectedPaths;
        if (paths.Length == 0) { SetStatus("압축할 항목을 선택하세요."); return; }

        using var dlg = new CompressDialog(paths, _currentPath);
        if (dlg.ShowDialog(this) != DialogResult.OK || dlg.Result == null) return;

        var opts = dlg.Result;
        string destDisplay = Path.GetFileName(opts.DestPath);
        string splitInfo = opts.SplitSizeBytes > 0
            ? $" ({FormatSize(opts.SplitSizeBytes)} 단위 분할)"
            : "";

        using var prog = new ProgressDialog($"압축 중 — {destDisplay}{splitInfo}");
        var progress = new Progress<string>(msg =>
        {
            prog.UpdateDetail(msg);
            SetStatus($"압축 중: {msg}");
        });

        prog.Show(FindForm());

        try
        {
            await ArchiveHelper.CompressAsync(paths, opts.DestPath, opts.Level, opts.SplitSizeBytes, progress, prog.CancellationToken);
            prog.Close();
            Refresh();
            SetStatus(opts.SplitSizeBytes > 0
                ? $"분할 압축 완료: {destDisplay}.001 ~ (각 {FormatSize(opts.SplitSizeBytes)})"
                : $"압축 완료: {destDisplay}");
        }
        catch (OperationCanceledException)
        {
            prog.Close();
            SetStatus("압축이 취소되었습니다.");
            // 취소된 경우 생성 중이던 파일 정리
            try { if (File.Exists(opts.DestPath)) File.Delete(opts.DestPath); } catch { }
        }
        catch (Exception ex)
        {
            prog.Close();
            SetStatus($"압축 실패: {ex.Message}");
            ThemedMessageBox.Show(ex.Message, LocalizationService.T("Dlg_CompressError"), MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    public async void RequestExtract()
    {
        if (listView.SelectedItems.Count != 1) return;
        var entry = (FileEntry)listView.SelectedItems[0].Tag!;
        if (entry.IsDirectory) return;

        // 분할 파트를 직접 선택한 경우: 베이스(.zip) 경로 기준으로 이름 표시
        bool isSplitPart = ArchiveHelper.IsSplitPart(entry.FullPath);
        string basePath = isSplitPart
            ? ArchiveHelper.GetSplitBasePath(entry.FullPath)
            : entry.FullPath;
        bool isSplit = isSplitPart || ArchiveHelper.IsSplitArchive(entry.FullPath);
        string archiveName = isSplit
            ? $"{Path.GetFileName(basePath)} (분할 아카이브)"
            : entry.Name;

        // 해제 위치 기본값: 베이스 파일명(확장자 제거) 하위 폴더
        string defaultDest = Path.Combine(_currentPath, Path.GetFileNameWithoutExtension(basePath));
        using var destDlg = new InputDialog("압축 해제 위치", "해제할 폴더 경로:", defaultDest);
        if (destDlg.ShowDialog(this) != DialogResult.OK || string.IsNullOrWhiteSpace(destDlg.InputText)) return;

        string destDir = destDlg.InputText;

        using var prog = new ProgressDialog($"압축 해제 중 — {archiveName}");
        var progress = new Progress<string>(msg =>
        {
            prog.UpdateDetail(msg);
            SetStatus($"압축 해제 중: {msg}");
        });
        prog.Show(FindForm());

        try
        {
            await ArchiveHelper.ExtractAsync(entry.FullPath, destDir, progress, prog.CancellationToken);
            prog.Close();
            Refresh();
            SetStatus($"압축 해제 완료: {destDir}");
        }
        catch (OperationCanceledException)
        {
            prog.Close();
            SetStatus("압축 해제가 취소되었습니다.");
        }
        catch (Exception ex)
        {
            prog.Close();
            SetStatus($"압축 해제 실패: {ex.Message}");
            ThemedMessageBox.Show(ex.Message, LocalizationService.T("Dlg_ExtractError"), MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static string FormatSize(long bytes)
    {
        if (bytes < 1024) return $"{bytes} B";
        if (bytes < 1024 * 1024) return $"{bytes / 1024.0:F1} KB";
        if (bytes < 1024L * 1024 * 1024) return $"{bytes / (1024.0 * 1024):F1} MB";
        return $"{bytes / (1024.0 * 1024 * 1024):F1} GB";
    }

    public void BeginRename()
    {
        if (listView.SelectedItems.Count != 1) return;
        var entry = (FileEntry)listView.SelectedItems[0].Tag!;
        if (entry.Name == "..") return;
        listView.LabelEdit = true;
        listView.SelectedItems[0].BeginEdit();
    }

    private void OnAfterLabelEdit(object? sender, LabelEditEventArgs e)
    {
        listView.LabelEdit = false;
        if (e.Label == null || string.IsNullOrWhiteSpace(e.Label)) { e.CancelEdit = true; return; }
        var entry = (FileEntry)listView.Items[e.Item].Tag!;
        string newPath = Path.Combine(_currentPath, e.Label);
        try
        {
            if (entry.IsDirectory) Directory.Move(entry.FullPath, newPath);
            else File.Move(entry.FullPath, newPath);
            entry.Name = e.Label;
            entry.FullPath = newPath;
            SetStatus($"이름을 '{e.Label}'로 변경했습니다.");
        }
        catch (Exception ex)
        {
            e.CancelEdit = true;
            SetStatus($"이름 바꾸기 실패: {ex.Message}");
            ThemedMessageBox.Show(ex.Message, LocalizationService.T("Dlg_RenameError"), MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void ClipboardCopy()
    {
        var paths = SelectedPaths;
        if (paths.Length == 0) return;
        var list = new System.Collections.Specialized.StringCollection();
        list.AddRange(paths);
        Clipboard.SetFileDropList(list);
        SetStatus($"{paths.Length}개 항목을 클립보드에 복사했습니다.");
    }

    private void ClipboardCut()
    {
        ClipboardCopy();
        SetStatus($"{SelectedPaths.Length}개 항목이 잘라내기 됩니다 (붙여넣기 후 원본 삭제).");
    }

    private async void ClipboardPaste()
    {
        if (!Clipboard.ContainsFileDropList()) { SetStatus("클립보드에 붙여넣을 파일이 없습니다."); return; }
        var files = Clipboard.GetFileDropList();
        if (files == null || files.Count == 0) return;
        var paths = files.Cast<string>().ToArray();

        var owner = FindForm() as Form;
        var (success, error) = await FileOperationRunner.RunAsync(owner, "붙여넣는 중",
            (progress, ct) => FileOperations.CopyFiles(paths, _currentPath, progress, ct));

        if (success)
            SetStatus($"{files.Count}개 항목을 붙여넣었습니다.");
        else if (error != null)
            SetStatus($"붙여넣기 실패: {error.Message}");
        else
            SetStatus("붙여넣기가 취소되었습니다. 목록을 새로고침했습니다.");
    }

    private void SelectAll()
    {
        foreach (ListViewItem item in listView.Items)
            item.Selected = true;
    }

    private void ShowProperties()
    {
        if (listView.SelectedItems.Count == 0) return;
        var entry = (FileEntry)listView.SelectedItems[0].Tag!;
        if (entry.Name == "..") return;
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = "rundll32.exe",
                Arguments = $"shell32.dll,SH_ShowPropertiesDialog \"{entry.FullPath}\"",
                UseShellExecute = true,
            });
        }
        catch
        {
            var info = entry.IsDirectory ? (FileSystemInfo)new DirectoryInfo(entry.FullPath) : new FileInfo(entry.FullPath);
            ThemedMessageBox.Show(
                $"이름: {entry.Name}\n경로: {entry.FullPath}\n" +
                (entry.IsDirectory ? "" : $"크기: {FileEntry.FormatSize(entry.Size)}\n") +
                $"수정: {info.LastWriteTime:yyyy-MM-dd HH:mm:ss}\n생성: {info.CreationTime:yyyy-MM-dd HH:mm:ss}\n속성: {entry.Attributes}",
                LocalizationService.T("Dlg_Properties"), MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }

    // 헤더 옆 드롭다운에 드라이브 목록을 채운다(드라이브는 동적이라 런타임에 채운다).
    private sealed class DriveItem
    {
        public string Root { get; init; } = "";
        public string Display { get; init; } = "";
        public override string ToString() => Display;
    }

    private void PopulateDriveCombo()
    {
        driveCombo.BeginUpdate();
        driveCombo.Items.Clear();
        foreach (var drive in DriveInfo.GetDrives())
        {
            string label = drive.IsReady && !string.IsNullOrEmpty(drive.VolumeLabel)
                ? $"{drive.Name.Replace("\\", "")} {drive.VolumeLabel}"
                : drive.Name.Replace("\\", "");
            driveCombo.Items.Add(new DriveItem { Root = drive.Name, Display = label });
        }
        driveCombo.EndUpdate();
        SyncDriveCombo();
    }

    // 현재 경로가 속한 드라이브를 드롭다운에 반영한다(SelectionChangeCommitted만 항해를 유발하므로 안전).
    private void SyncDriveCombo()
    {
        if (driveCombo == null || string.IsNullOrEmpty(_currentPath)) return;
        string? root = Path.GetPathRoot(_currentPath);
        if (string.IsNullOrEmpty(root)) return;
        foreach (var obj in driveCombo.Items)
        {
            if (obj is DriveItem di && string.Equals(di.Root, root, StringComparison.OrdinalIgnoreCase))
            {
                driveCombo.SelectedItem = obj;
                return;
            }
        }
    }

    public new void Refresh() => _ = LoadDirectoryAsync();

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            FileOperationRunner.OperationCompleted -= OnFileOperationCompleted;
            _directoryWatcher?.Dispose();
            components?.Dispose();
        }
        base.Dispose(disposing);
    }
}

internal class FileEntryComparer : System.Collections.IComparer
{
    private readonly int _col;
    public FileEntryComparer(int col) => _col = col;

    public int Compare(object? x, object? y)
    {
        var lx = (ListViewItem)x!;
        var ly = (ListViewItem)y!;
        var ex = lx.Tag as FileEntry;
        var ey = ly.Tag as FileEntry;

        if (ex?.Name == "..") return -1;
        if (ey?.Name == "..") return 1;

        if (ex?.IsDirectory == true && ey?.IsDirectory == false) return -1;
        if (ex?.IsDirectory == false && ey?.IsDirectory == true) return 1;

        return string.Compare(
            lx.SubItems[_col].Text,
            ly.SubItems[_col].Text,
            StringComparison.OrdinalIgnoreCase);
    }
}
