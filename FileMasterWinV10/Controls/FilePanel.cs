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
    private string _sideTitle = "왼쪽";
    private ContextMenuStrip _contextMenu = null!;
    private ToolTip _pathTip = null!;
    private Form? _hookedForm;
    private MouseEventHandler? _outsideClickHandler;

    public event EventHandler? CopyToOtherRequested;
    public event EventHandler? MoveToOtherRequested;
    public event EventHandler<string>? PathChanged;
    public event EventHandler<string[]>? SelectionChanged;
    public event EventHandler? GotFocused;

    public string CurrentPath => _currentPath;

    [DefaultValue(FilePanelSide.Left)]
    [Category("Appearance")]
    [Description("패널이 왼쪽인지 오른쪽인지 지정합니다.")]
    public FilePanelSide PanelSide { get; set; } = FilePanelSide.Left;

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
    }

    public void SetPanelSide(FilePanelSide side)
    {
        if (PanelSide == side) return;
        PanelSide = side;
        ApplyPanelSide();
    }

    private void ApplyPanelSide()
    {
        _sideTitle = PanelSide == FilePanelSide.Left ? "왼쪽" : "오른쪽";
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
        cm.Items.Add("열기", null, (_, _) => OpenSelected());
        cm.Items.Add("연결 프로그램으로 열기", null, (_, _) => OpenWithDialog());
        cm.Items.Add(new ToolStripSeparator());
        cm.Items.Add("→ 다른 패널로 복사", null, (_, _) => CopyToOtherRequested?.Invoke(this, EventArgs.Empty));
        cm.Items.Add("→ 다른 패널로 이동", null, (_, _) => MoveToOtherRequested?.Invoke(this, EventArgs.Empty));
        cm.Items.Add(new ToolStripSeparator());
        cm.Items.Add("잘라내기", null, (_, _) => ClipboardCut());
        cm.Items.Add("복사", null, (_, _) => ClipboardCopy());
        cm.Items.Add("붙여넣기", null, (_, _) => ClipboardPaste());
        cm.Items.Add(new ToolStripSeparator());
        cm.Items.Add("이름 바꾸기", null, (_, _) => BeginRename());
        cm.Items.Add("삭제", null, (_, _) => RequestDelete());
        cm.Items.Add(new ToolStripSeparator());
        cm.Items.Add("새 폴더 만들기", null, (_, _) => RequestNewFolder());
        cm.Items.Add("새 파일 만들기", null, (_, _) => RequestNewFile());
        cm.Items.Add(new ToolStripSeparator());
        cm.Items.Add("속성", null, (_, _) => ShowProperties());
        return cm;
    }

    private void OnContextMenuOpening(object? sender, CancelEventArgs e)
    {
        bool hasSelection = listView.SelectedItems.Count > 0;
        bool singleFile = listView.SelectedItems.Count == 1
            && listView.SelectedItems[0].Tag is FileEntry ff && !ff.IsDirectory;

        var items = _contextMenu.Items;
        items[0].Enabled = hasSelection;
        items[1].Enabled = singleFile;
        items[3].Enabled = hasSelection;
        items[4].Enabled = hasSelection;
        items[6].Enabled = hasSelection;
        items[7].Enabled = hasSelection;
        items[8].Enabled = Clipboard.ContainsFileDropList();
        items[10].Enabled = listView.SelectedItems.Count == 1 && hasSelection;
        items[11].Enabled = hasSelection;
        items[16].Enabled = hasSelection;
    }

    public void Navigate(string path)
    {
        if (!Directory.Exists(path)) return;
        CloseFolderTree();
        _currentPath = path;
        UpdatePathDisplay();
        LoadDirectory();
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

    private void LoadDirectory()
    {
        listView.BeginUpdate();
        listView.Items.Clear();

        try
        {
            var parentDir = Directory.GetParent(_currentPath);
            if (parentDir != null)
            {
                var upEntry = new FileEntry { Name = "..", FullPath = parentDir.FullName, IsDirectory = true };
                var upItem = new ListViewItem("..", GetOrAddIcon(parentDir.FullName, true)) { Tag = upEntry };
                upItem.SubItems.AddRange(new[] { "", "폴더", "" });
                listView.Items.Add(upItem);
            }

            foreach (var dir in Directory.GetDirectories(_currentPath).OrderBy(d => d, StringComparer.OrdinalIgnoreCase))
            {
                try
                {
                    var info = new DirectoryInfo(dir);
                    var entry = new FileEntry
                    {
                        Name = info.Name,
                        FullPath = info.FullName,
                        IsDirectory = true,
                        LastModified = info.LastWriteTime,
                        Attributes = info.Attributes,
                    };
                    listView.Items.Add(CreateItem(entry));
                }
                catch { }
            }

            foreach (var file in Directory.GetFiles(_currentPath).OrderBy(f => f, StringComparer.OrdinalIgnoreCase))
            {
                try
                {
                    var info = new FileInfo(file);
                    var entry = new FileEntry
                    {
                        Name = info.Name,
                        FullPath = info.FullName,
                        IsDirectory = false,
                        Size = info.Length,
                        LastModified = info.LastWriteTime,
                        Extension = info.Extension,
                        Attributes = info.Attributes,
                    };
                    listView.Items.Add(CreateItem(entry));
                }
                catch { }
            }

            int dirCount = listView.Items.Cast<ListViewItem>()
                .Count(i => i.Tag is FileEntry e && e.IsDirectory && e.Name != "..");
            int fileCount = listView.Items.Cast<ListViewItem>()
                .Count(i => i.Tag is FileEntry e && !e.IsDirectory);
            long totalSize = listView.Items.Cast<ListViewItem>()
                .Where(i => i.Tag is FileEntry e && !e.IsDirectory)
                .Sum(i => ((FileEntry)i.Tag!).Size);

            SetStatus($"폴더 {dirCount}개, 파일 {fileCount}개  |  합계 {FileEntry.FormatSize(totalSize)}");
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

    private void OnDragDrop(object? sender, DragEventArgs e)
    {
        var paths = (string[]?)e.Data?.GetData(DataFormats.FileDrop);
        if (paths == null) return;
        try
        {
            FileOperations.CopyFiles(paths, _currentPath, f => SetStatus($"복사 중: {f}"));
            Refresh();
            SetStatus($"{paths.Length}개 항목을 복사했습니다.");
        }
        catch (Exception ex)
        {
            SetStatus($"복사 실패: {ex.Message}");
            MessageBox.Show(ex.Message, "복사 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void OpenSelected()
    {
        if (listView.SelectedItems.Count == 0) return;
        var entry = (FileEntry)listView.SelectedItems[0].Tag!;
        if (entry.IsDirectory) { Navigate(entry.FullPath); return; }
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(entry.FullPath) { UseShellExecute = true });
            SetStatus($"열기: {entry.Name}");
        }
        catch (Exception ex)
        {
            SetStatus($"열기 실패: {ex.Message}");
            MessageBox.Show(ex.Message, "열기 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static void OpenWithDialog() =>
        MessageBox.Show("이 기능은 파일을 선택한 뒤 Shift+우클릭 > 연결 프로그램으로 열기로도 사용할 수 있습니다.", "연결 프로그램", MessageBoxButtons.OK, MessageBoxIcon.Information);

    public void RequestDelete()
    {
        var paths = SelectedPaths;
        if (paths.Length == 0) { SetStatus("삭제할 항목이 선택되지 않았습니다."); return; }
        var msg = paths.Length == 1
            ? $"'{Path.GetFileName(paths[0])}'을(를) 삭제하시겠습니까?"
            : $"선택한 {paths.Length}개 항목을 삭제하시겠습니까?";
        if (MessageBox.Show(msg, "삭제 확인", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        try
        {
            FileOperations.DeleteFiles(paths);
            Refresh();
            SetStatus($"{paths.Length}개 항목을 삭제했습니다.");
        }
        catch (Exception ex)
        {
            SetStatus($"삭제 실패: {ex.Message}");
            MessageBox.Show(ex.Message, "삭제 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
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

    private void ClipboardPaste()
    {
        if (!Clipboard.ContainsFileDropList()) { SetStatus("클립보드에 붙여넣을 파일이 없습니다."); return; }
        var files = Clipboard.GetFileDropList();
        if (files == null || files.Count == 0) return;
        try
        {
            var paths = files.Cast<string>().ToArray();
            FileOperations.CopyFiles(paths, _currentPath, f => SetStatus($"붙여넣는 중: {f}"));
            Refresh();
            SetStatus($"{files.Count}개 항목을 붙여넣었습니다.");
        }
        catch (Exception ex)
        {
            SetStatus($"붙여넣기 실패: {ex.Message}");
            MessageBox.Show(ex.Message, "붙여넣기 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
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

    public new void Refresh() => LoadDirectory();
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
