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
    private string _sideTitle = "왼쪽";
    private ContextMenuStrip _contextMenu = null!;
    private ToolTip _pathTip = null!;
    private Form? _hookedForm;
    private MouseEventHandler? _outsideClickHandler;
    private DirectoryChangeWatcher? _directoryWatcher;
    private bool _loadInProgress;
    private bool _reloadPending;

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
        driveBar.BackColor = UiTheme.DriveBarBg;
        WireUi();
        PopulateDriveBar();
        SetupDirectoryWatcher();
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
        _sideTitle = _panelSide == FilePanelSide.Left ? "왼쪽" : "오른쪽";
        if (headerLabel == null) return;
        headerLabel.Text = string.IsNullOrEmpty(_currentPath)
            ? _sideTitle
            : $"{_sideTitle}  ·  {_currentPath}";
    }

    private void WireUi()
    {
        _pathTip = new ToolTip(components);
        _pathTip.SetToolTip(pathBar, "클릭하여 폴더 목록을 펼치고 이동할 위치를 선택합니다.");
        _pathTip.SetToolTip(headerLabel, _pathTip.GetToolTip(pathBar));
        _pathTip.SetToolTip(chevronLabel, _pathTip.GetToolTip(pathBar));

        pathBar.MouseEnter += (_, _) => pathBar.BackColor = UiTheme.HeaderBg;
        pathBar.MouseLeave += (_, _) => pathBar.BackColor = UiTheme.Surface;
        headerLabel.MouseEnter += (_, _) => pathBar.BackColor = UiTheme.HeaderBg;
        headerLabel.MouseLeave += (_, _) => pathBar.BackColor = UiTheme.Surface;
        chevronLabel.MouseEnter += (_, _) => pathBar.BackColor = UiTheme.HeaderBg;
        chevronLabel.MouseLeave += (_, _) => pathBar.BackColor = UiTheme.Surface;

        pathBar.Click += (_, _) => ToggleFolderTree();
        headerLabel.Click += (_, _) => ToggleFolderTree();
        chevronLabel.Click += (_, _) => ToggleFolderTree();

        folderTree.FolderSelected += (_, path) => Navigate(path);

        _contextMenu = BuildContextMenu();
        listView.ContextMenuStrip = _contextMenu;

        listView.DoubleClick += OnDoubleClick;
        listView.SelectedIndexChanged += OnSelectionChanged;
        listView.KeyDown += OnKeyDown;
        listView.ColumnClick += OnColumnClick;
        listView.ItemDrag += OnItemDrag;
        listView.DragEnter += OnDragEnter;
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
        // idx 0
        cm.Items.Add(CMI("열기",               I("folder_open"), (_, _) => OpenSelected()));
        // idx 1
        cm.Items.Add(CMI("연결 프로그램으로 열기", I("open_with"),  (_, _) => OpenWithDialog()));
        // idx 2
        cm.Items.Add(new ToolStripSeparator());
        // idx 3
        cm.Items.Add(CMI("압축하기...",          I("zip"),         (_, _) => RequestCompress()));
        // idx 4
        cm.Items.Add(CMI("압축 해제...",         I("unzip"),       (_, _) => RequestExtract()));
        // idx 5
        cm.Items.Add(new ToolStripSeparator());
        // idx 6
        cm.Items.Add(CMI("→ 다른 패널로 복사",   I("copy_right"),  (_, _) => CopyToOtherRequested?.Invoke(this, EventArgs.Empty)));
        // idx 7
        cm.Items.Add(CMI("→ 다른 패널로 이동",   I("move_right"),  (_, _) => MoveToOtherRequested?.Invoke(this, EventArgs.Empty)));
        // idx 8
        cm.Items.Add(new ToolStripSeparator());
        // idx 9
        cm.Items.Add(CMI("잘라내기",             I("cut"),         (_, _) => ClipboardCut()));
        // idx 10
        cm.Items.Add(CMI("복사",                 I("copy"),        (_, _) => ClipboardCopy()));
        // idx 11
        cm.Items.Add(CMI("붙여넣기",             I("paste"),       (_, _) => ClipboardPaste()));
        // idx 12
        cm.Items.Add(new ToolStripSeparator());
        // idx 13
        cm.Items.Add(CMI("이름 바꾸기",           I("rename"),      (_, _) => BeginRename()));
        // idx 14
        cm.Items.Add(CMI("삭제",                  I("delete"),      (_, _) => RequestDelete()));
        // idx 15
        cm.Items.Add(new ToolStripSeparator());
        // idx 16
        cm.Items.Add(CMI("새 폴더 만들기",        I("folder_new"),  (_, _) => RequestNewFolder()));
        // idx 17
        cm.Items.Add(CMI("새 파일 만들기",        I("file_new"),    (_, _) => RequestNewFile()));
        // idx 18
        cm.Items.Add(new ToolStripSeparator());
        // idx 19
        cm.Items.Add(CMI("속성",                  I("properties"),  (_, _) => ShowProperties()));
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

    private void UpdatePathDisplay() =>
        headerLabel.Text = $"{_sideTitle}  ·  {_currentPath}";

    private void ToggleFolderTree()
    {
        if (folderTree.IsOpen)
        {
            CloseFolderTree();
            return;
        }

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
            SetStatus("접근 권한이 없습니다.");
            failed = true;
        }
        catch (Exception ex)
        {
            SetStatus($"오류: {ex.Message}");
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
            SetStatus("접근 권한이 없습니다.");
        }
        catch (Exception ex)
        {
            SetStatus($"오류: {ex.Message}");
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
                    upItem.SubItems.AddRange(new[] { "", "폴더", "" });
                    listView.Items.Add(upItem);
                }
                else
                {
                    listView.Items.Add(CreateItem(entry));
                }
            }

            SetStatus($"폴더 {scan.DirCount}개, 파일 {scan.FileCount}개  |  합계 {FileEntry.FormatSize(scan.TotalSize)}");
        }
        catch (UnauthorizedAccessException)
        {
            SetStatus("접근 권한이 없습니다.");
        }
        catch (Exception ex)
        {
            SetStatus($"오류: {ex.Message}");
        }
        finally
        {
            listView.EndUpdate();
        }
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
            SetStatus($"폴더 {dirCount}개, 파일 {fileCount}개  |  합계 {FileEntry.FormatSize(total)}");
        }
        else
        {
            int selDirs = listView.SelectedItems.Cast<ListViewItem>().Count(i => i.Tag is FileEntry fe && fe.IsDirectory && fe.Name != "..");
            int selFiles = listView.SelectedItems.Cast<ListViewItem>().Count(i => i.Tag is FileEntry fe && !fe.IsDirectory);
            long selSize = listView.SelectedItems.Cast<ListViewItem>().Where(i => i.Tag is FileEntry fe && !fe.IsDirectory).Sum(i => ((FileEntry)i.Tag!).Size);

            var parts = new List<string>();
            if (selDirs > 0) parts.Add($"폴더 {selDirs}개");
            if (selFiles > 0) parts.Add($"파일 {selFiles}개");
            SetStatus($"{string.Join(", ", parts)} 선택됨  |  {FileEntry.FormatSize(selSize)}");
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

    private void OnDragEnter(object? sender, DragEventArgs e) =>
        e.Effect = e.Data?.GetDataPresent(DataFormats.FileDrop) == true ? DragDropEffects.Copy : DragDropEffects.None;

    private async void OnDragDrop(object? sender, DragEventArgs e)
    {
        var paths = (string[]?)e.Data?.GetData(DataFormats.FileDrop);
        if (paths == null) return;

        var owner = FindForm() as Form;
        var (success, error) = await FileOperationRunner.RunAsync(owner, "복사 중",
            (progress, ct) => FileOperations.CopyFiles(paths, _currentPath, progress, ct));

        if (success)
            SetStatus($"{paths.Length}개 항목을 복사했습니다.");
        else if (error != null)
            SetStatus($"복사 실패: {error.Message}");
        else
            SetStatus("복사가 취소되었습니다. 목록을 새로고침했습니다.");
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
            MessageBox.Show(ex.Message, "열기 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
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
                MessageBox.Show(ex.Message, "연결 프로그램 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        SetStatus($"연결 프로그램으로 열기: {Path.GetFileName(path)}");
    }

    public async void RequestDelete()
    {
        var paths = SelectedPaths;
        if (paths.Length == 0) { SetStatus("삭제할 항목이 선택되지 않았습니다."); return; }
        var msg = paths.Length == 1
            ? $"'{Path.GetFileName(paths[0])}'을(를) 삭제하시겠습니까?"
            : $"선택한 {paths.Length}개 항목을 삭제하시겠습니까?";
        if (MessageBox.Show(msg, "삭제 확인", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;

        var owner = FindForm() as Form;
        var (success, error) = await FileOperationRunner.RunAsync(owner, "삭제 중",
            (progress, ct) => FileOperations.DeleteFiles(paths, progress, ct));

        if (success)
            SetStatus($"{paths.Length}개 항목을 삭제했습니다.");
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
            MessageBox.Show(ex.Message, "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
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
            MessageBox.Show(ex.Message, "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
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
            MessageBox.Show(ex.Message, "압축 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
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
            MessageBox.Show(ex.Message, "압축 해제 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
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
            MessageBox.Show(ex.Message, "이름 바꾸기 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
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
            MessageBox.Show(
                $"이름: {entry.Name}\n경로: {entry.FullPath}\n" +
                (entry.IsDirectory ? "" : $"크기: {FileEntry.FormatSize(entry.Size)}\n") +
                $"수정: {info.LastWriteTime:yyyy-MM-dd HH:mm:ss}\n생성: {info.CreationTime:yyyy-MM-dd HH:mm:ss}\n속성: {entry.Attributes}",
                "속성", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }

    private void PopulateDriveBar()
    {
        driveBar.Controls.Clear();
        foreach (var drive in DriveInfo.GetDrives())
        {
            var d = drive;
            var btn = new Button
            {
                Text = d.Name.Replace("\\", ""),
                AutoSize = true,
                MinimumSize = new Size(36, 24),
                Margin = new Padding(0, 0, 4, 0),
            };
            UiTheme.StyleSecondaryButton(btn);
            new ToolTip(components).SetToolTip(btn, $"{d.Name} ({(d.IsReady ? d.DriveType.ToString() : "준비 안됨")})");
            btn.Click += (_, _) => Navigate(d.Name);
            driveBar.Controls.Add(btn);
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
