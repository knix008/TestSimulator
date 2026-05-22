using FileMasterWinV10.Dialogs;
using FileMasterWinV10.Helpers;
using FileMasterWinV10.Models;

namespace FileMasterWinV10.Controls;

public enum FilePanelSide { Left, Right }

public class FilePanel : UserControl
{
    private string _currentPath = "";

    private readonly string _sideTitle;
    private readonly Panel _pathBar;
    private readonly Label _headerLabel;
    private readonly Label _chevronLabel;
    private readonly FolderTreeDropdownPanel _folderTree;
    private Form? _hookedForm;
    private MouseEventHandler? _outsideClickHandler;
    private readonly ListView _listView;
    private readonly ImageList _imageListSmall;
    private readonly StatusStrip _statusStrip;
    private readonly ToolStripStatusLabel _statusLabel;
    private readonly FlowLayoutPanel _driveBar;
    private readonly ContextMenuStrip _contextMenu;

    public event EventHandler? CopyToOtherRequested;
    public event EventHandler? MoveToOtherRequested;
    public event EventHandler<string>? PathChanged;
    public event EventHandler<string[]>? SelectionChanged;
    public event EventHandler? GotFocused;

    public string CurrentPath => _currentPath;

    public string[] SelectedPaths =>
        _listView.SelectedItems.Cast<ListViewItem>()
            .Select(i => ((FileEntry)i.Tag!).FullPath)
            .Where(p => Path.GetFileName(p) != "..")
            .ToArray();

    public FilePanel(FilePanelSide side)
    {
        DoubleBuffered = true;
        BackColor = UiTheme.Background;
        Font = UiTheme.UiFont;
        Padding = new Padding(1);

        _imageListSmall = new ImageList { ImageSize = new Size(16, 16), ColorDepth = ColorDepth.Depth32Bit };
        _sideTitle = side == FilePanelSide.Left ? "왼쪽" : "오른쪽";

        _pathBar = new Panel
        {
            Dock = DockStyle.Top,
            Height = 36,
            BackColor = UiTheme.Surface,
            Padding = new Padding(8, 4, 8, 4),
            Cursor = Cursors.Hand,
        };
        _headerLabel = new Label
        {
            Dock = DockStyle.Fill,
            Text = _sideTitle,
            TextAlign = ContentAlignment.MiddleLeft,
            Font = UiTheme.UiFontSemibold,
            ForeColor = UiTheme.Accent,
            AutoEllipsis = true,
            Cursor = Cursors.Hand,
        };
        _chevronLabel = new Label
        {
            Dock = DockStyle.Right,
            Width = 24,
            Text = "▾",
            TextAlign = ContentAlignment.MiddleCenter,
            Font = UiTheme.UiFont,
            ForeColor = UiTheme.TextSecondary,
            Cursor = Cursors.Hand,
        };
        var pathTip = new ToolTip();
        pathTip.SetToolTip(_pathBar, "클릭하여 폴더 목록을 펼치고 이동할 위치를 선택합니다.");
        pathTip.SetToolTip(_headerLabel, pathTip.GetToolTip(_pathBar));
        pathTip.SetToolTip(_chevronLabel, pathTip.GetToolTip(_pathBar));

        void OnPathBarEnter(object? _, EventArgs __) => _pathBar.BackColor = UiTheme.HeaderBg;
        void OnPathBarLeave(object? _, EventArgs __) => _pathBar.BackColor = UiTheme.Surface;
        _pathBar.MouseEnter += OnPathBarEnter;
        _pathBar.MouseLeave += OnPathBarLeave;
        _headerLabel.MouseEnter += OnPathBarEnter;
        _headerLabel.MouseLeave += (_, _) => OnPathBarLeave(null, EventArgs.Empty);
        _chevronLabel.MouseEnter += OnPathBarEnter;
        _chevronLabel.MouseLeave += (_, _) => OnPathBarLeave(null, EventArgs.Empty);

        _folderTree = new FolderTreeDropdownPanel();
        _folderTree.FolderSelected += (_, path) => Navigate(path);

        void OnPickFolder(object? _, EventArgs __) => ToggleFolderTree();
        _pathBar.Click += OnPickFolder;
        _headerLabel.Click += OnPickFolder;
        _chevronLabel.Click += OnPickFolder;

        _pathBar.Controls.Add(_headerLabel);
        _pathBar.Controls.Add(_chevronLabel);

        _driveBar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 34,
            AutoScroll = true,
            WrapContents = false,
            FlowDirection = FlowDirection.LeftToRight,
            Padding = new Padding(6, 4, 6, 4),
            BackColor = UiTheme.DriveBarBg,
        };

        _listView = new ListView
        {
            Dock = DockStyle.Fill,
            View = View.Details,
            SmallImageList = _imageListSmall,
            FullRowSelect = true,
            AllowColumnReorder = true,
            MultiSelect = true,
            LabelEdit = false,
            AllowDrop = true,
        };
        UiTheme.StyleListView(_listView);
        _listView.Columns.Add("이름", 240);
        _listView.Columns.Add("크기", 90, HorizontalAlignment.Right);
        _listView.Columns.Add("종류", 100);
        _listView.Columns.Add("수정된 날짜", 150);

        _contextMenu = BuildContextMenu();
        _listView.ContextMenuStrip = _contextMenu;

        _statusStrip = new StatusStrip { SizingGrip = false };
        UiTheme.StyleStatusStrip(_statusStrip);
        _statusLabel = new ToolStripStatusLabel
        {
            Spring = true,
            TextAlign = ContentAlignment.MiddleLeft,
            Text = "준비",
        };
        _statusStrip.Items.Add(_statusLabel);

        _listView.DoubleClick += OnDoubleClick;
        _listView.SelectedIndexChanged += OnSelectionChanged;
        _listView.KeyDown += OnKeyDown;
        _listView.ColumnClick += OnColumnClick;
        _listView.ItemDrag += OnItemDrag;
        _listView.DragEnter += OnDragEnter;
        _listView.DragDrop += OnDragDrop;
        _listView.GotFocus += (_, _) => GotFocused?.Invoke(this, EventArgs.Empty);
        _listView.AfterLabelEdit += OnAfterLabelEdit;
        _contextMenu.Opening += OnContextMenuOpening;

        Controls.Add(_listView);
        Controls.Add(_statusStrip);
        Controls.Add(_driveBar);
        Controls.Add(_folderTree);
        Controls.Add(_pathBar);

        PopulateDriveBar();
    }

    public void SetInitialPath(string? path)
    {
        var target = !string.IsNullOrWhiteSpace(path) && Directory.Exists(path)
            ? path
            : Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        _currentPath = "";
        Navigate(target);
    }

    // ──────────────────── Context menu ────────────────────

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

    private void OnContextMenuOpening(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        bool hasSelection = _listView.SelectedItems.Count > 0;
        bool singleFile = _listView.SelectedItems.Count == 1
            && _listView.SelectedItems[0].Tag is FileEntry ff && !ff.IsDirectory;

        var items = _contextMenu.Items;
        items[0].Enabled = hasSelection;
        items[1].Enabled = singleFile;
        items[3].Enabled = hasSelection;
        items[4].Enabled = hasSelection;
        items[6].Enabled = hasSelection;
        items[7].Enabled = hasSelection;
        items[8].Enabled = Clipboard.ContainsFileDropList();
        items[10].Enabled = _listView.SelectedItems.Count == 1 && hasSelection;
        items[11].Enabled = hasSelection;
        items[16].Enabled = hasSelection;
    }

    // ──────────────────── Navigation ────────────────────

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
        _headerLabel.Text = $"{_sideTitle}  ·  {_currentPath}";

    private void ToggleFolderTree()
    {
        if (_folderTree.IsOpen)
        {
            CloseFolderTree();
            return;
        }

        _folderTree.Toggle(_currentPath);
        _chevronLabel.Text = _folderTree.IsOpen ? "▴" : "▾";
        if (_folderTree.IsOpen)
            RegisterOutsideClose();
        else
            UnregisterOutsideClose();
    }

    private void CloseFolderTree()
    {
        if (!_folderTree.IsOpen) return;
        _folderTree.Collapse();
        _chevronLabel.Text = "▾";
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
        if (!_folderTree.IsOpen) return;
        var pos = Control.MousePosition;
        var treeRect = _folderTree.RectangleToScreen(_folderTree.ClientRectangle);
        var pathRect = _pathBar.RectangleToScreen(_pathBar.ClientRectangle);
        if (!treeRect.Contains(pos) && !pathRect.Contains(pos))
            CloseFolderTree();
    }

    private void GoUp()
    {
        var parent = Directory.GetParent(_currentPath);
        if (parent != null) Navigate(parent.FullName);
    }

    // ──────────────────── Directory loading ────────────────────

    private void LoadDirectory()
    {
        _listView.BeginUpdate();
        _listView.Items.Clear();

        try
        {
            var parentDir = Directory.GetParent(_currentPath);
            if (parentDir != null)
            {
                var upEntry = new FileEntry { Name = "..", FullPath = parentDir.FullName, IsDirectory = true };
                var upItem = new ListViewItem("..", GetOrAddIcon(parentDir.FullName, true)) { Tag = upEntry };
                upItem.SubItems.AddRange(new[] { "", "폴더", "" });
                _listView.Items.Add(upItem);
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
                    _listView.Items.Add(CreateItem(entry));
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
                    _listView.Items.Add(CreateItem(entry));
                }
                catch { }
            }

            int dirCount = _listView.Items.Cast<ListViewItem>()
                .Count(i => i.Tag is FileEntry e && e.IsDirectory && e.Name != "..");
            int fileCount = _listView.Items.Cast<ListViewItem>()
                .Count(i => i.Tag is FileEntry e && !e.IsDirectory);
            long totalSize = _listView.Items.Cast<ListViewItem>()
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
            _listView.EndUpdate();
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
        IconHelper.GetIconIndex(_imageListSmall, path, isDirectory);

    public void SetStatus(string message) => _statusLabel.Text = message;

    private void OnSelectionChanged(object? sender, EventArgs e)
    {
        var paths = SelectedPaths;
        SelectionChanged?.Invoke(this, paths);

        if (_listView.SelectedItems.Count == 0)
        {
            int dirCount = _listView.Items.Cast<ListViewItem>().Count(i => i.Tag is FileEntry fe && fe.IsDirectory && fe.Name != "..");
            int fileCount = _listView.Items.Cast<ListViewItem>().Count(i => i.Tag is FileEntry fe && !fe.IsDirectory);
            long total = _listView.Items.Cast<ListViewItem>().Where(i => i.Tag is FileEntry fe && !fe.IsDirectory).Sum(i => ((FileEntry)i.Tag!).Size);
            SetStatus($"폴더 {dirCount}개, 파일 {fileCount}개  |  합계 {FileEntry.FormatSize(total)}");
        }
        else
        {
            int selDirs = _listView.SelectedItems.Cast<ListViewItem>().Count(i => i.Tag is FileEntry fe && fe.IsDirectory && fe.Name != "..");
            int selFiles = _listView.SelectedItems.Cast<ListViewItem>().Count(i => i.Tag is FileEntry fe && !fe.IsDirectory);
            long selSize = _listView.SelectedItems.Cast<ListViewItem>().Where(i => i.Tag is FileEntry fe && !fe.IsDirectory).Sum(i => ((FileEntry)i.Tag!).Size);

            var parts = new List<string>();
            if (selDirs > 0) parts.Add($"폴더 {selDirs}개");
            if (selFiles > 0) parts.Add($"파일 {selFiles}개");
            SetStatus($"{string.Join(", ", parts)} 선택됨  |  {FileEntry.FormatSize(selSize)}");
        }
    }

    private void OnDoubleClick(object? sender, EventArgs e)
    {
        if (_listView.SelectedItems.Count == 0) return;
        var entry = (FileEntry)_listView.SelectedItems[0].Tag!;
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
        _listView.ListViewItemSorter = new FileEntryComparer(e.Column);
        _listView.Sort();
        SetStatus($"'{_listView.Columns[e.Column].Text}' 기준으로 정렬됨");
    }

    private void OnItemDrag(object? sender, ItemDragEventArgs e)
    {
        var paths = SelectedPaths;
        if (paths.Length == 0) return;
        var data = new DataObject(DataFormats.FileDrop, paths);
        _listView.DoDragDrop(data, DragDropEffects.Copy | DragDropEffects.Move);
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
        if (_listView.SelectedItems.Count == 0) return;
        var entry = (FileEntry)_listView.SelectedItems[0].Tag!;
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
        if (_listView.SelectedItems.Count != 1) return;
        var entry = (FileEntry)_listView.SelectedItems[0].Tag!;
        if (entry.Name == "..") return;
        _listView.LabelEdit = true;
        _listView.SelectedItems[0].BeginEdit();
    }

    private void OnAfterLabelEdit(object? sender, LabelEditEventArgs e)
    {
        _listView.LabelEdit = false;
        if (e.Label == null || string.IsNullOrWhiteSpace(e.Label)) { e.CancelEdit = true; return; }
        var entry = (FileEntry)_listView.Items[e.Item].Tag!;
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
        foreach (ListViewItem item in _listView.Items)
            item.Selected = true;
    }

    private void ShowProperties()
    {
        if (_listView.SelectedItems.Count == 0) return;
        var entry = (FileEntry)_listView.SelectedItems[0].Tag!;
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
        _driveBar.Controls.Clear();
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
            new ToolTip().SetToolTip(btn, $"{d.Name} ({(d.IsReady ? d.DriveType.ToString() : "준비 안됨")})");
            btn.Click += (_, _) => Navigate(d.Name);
            _driveBar.Controls.Add(btn);
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
