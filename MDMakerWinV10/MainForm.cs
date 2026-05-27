namespace MDMakerWinV10;

public partial class MainForm : Form
{
    private readonly AppSettings _settings = AppSettings.Load();
    private bool _suppressSortRefresh;
    private bool _pickingFolder;

    public MainForm()
    {
        InitializeComponent();
        // 정렬, 정렬방법, 파일명을 헤더로 삽입 그룹 초기화
        if (_cmbSort.Items.Count > 0 && _cmbSort.SelectedIndex < 0)
            _cmbSort.SelectedIndex = 0;
        UpdateMoveButtons();
    }

    private void LstFiles_MouseDown(object? sender, MouseEventArgs e)
    {
        int idx = _lstFiles.IndexFromPoint(e.Location);
        if (idx != ListBox.NoMatches)
            _lstFiles.SelectedIndex = idx;
    }

    private void UpdateMoveButtons()
    {
        int count = _lstFiles.Items.Count;
        if (count < 2)
        {
            _btnUp.Enabled = false;
            _btnDown.Enabled = false;
            return;
        }

        int i = GetMoveIndex(_lstFiles);
        if (i < 0)
        {
            _btnUp.Enabled = true;
            _btnDown.Enabled = true;
            return;
        }

        _btnUp.Enabled = i > 0;
        _btnDown.Enabled = i < count - 1;
    }

    private void EnsureCustomOrder()
    {
        if (_cmbSort.SelectedIndex == 4) return;
        _suppressSortRefresh = true;
        try { _cmbSort.SelectedIndex = 4; }
        finally { _suppressSortRefresh = false; }
    }

    private void EnsureMoveSelection()
    {
        if (GetMoveIndex(_lstFiles) >= 0) return;
        if (_lstFiles.Items.Count > 0)
            _lstFiles.SelectedIndex = 0;
    }

    private static int GetMoveIndex(CheckedListBox list)
    {
        if (list.SelectedIndex >= 0)
            return list.SelectedIndex;
        for (int i = 0; i < list.Items.Count; i++)
            if (list.GetItemChecked(i))
                return i;
        return -1;
    }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        if (!string.IsNullOrEmpty(_settings.LastSourceDir))
            _srcDir.Text = _settings.LastSourceDir;
        if (!string.IsNullOrEmpty(_settings.LastOutputFile))
            _txtOutput.Text = _settings.LastOutputFile;
        if (Directory.Exists(_srcDir.Text.Trim()))
            RefreshFiles();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        PersistSettings();
        base.OnFormClosing(e);
    }

    private void PersistSettings()
    {
        var src = _srcDir.Text.Trim();
        var output = _txtOutput.Text.Trim();
        if (!string.IsNullOrEmpty(src))
            _settings.LastSourceDir = src;
        if (!string.IsNullOrEmpty(output))
            _settings.LastOutputFile = output;
        _settings.Save();
    }

    private void _srcDir_Leave(object? sender, EventArgs e)
    {
        if (_pickingFolder) return;
        if (Directory.Exists(_srcDir.Text.Trim()))
            PersistSettings();
        RefreshFiles();
    }

    private bool TryPickFolder(string title, string initial, out string selectedPath)
    {
        selectedPath = "";
        if (!Directory.Exists(initial) && Directory.Exists(_settings.LastSourceDir))
            initial = _settings.LastSourceDir;

        using var dlg = new FolderBrowserDialog
        {
            Description = title,
            UseDescriptionForTitle = true,
            ShowNewFolderButton = false
        };
        if (Directory.Exists(initial))
            dlg.InitialDirectory = initial;

        return dlg.ShowDialog(this) == DialogResult.OK
            && !string.IsNullOrEmpty(selectedPath = dlg.SelectedPath);
    }

    private void _chkRecursive_CheckedChanged(object? sender, EventArgs e) => RefreshFiles();

    private void _txtExclude_Leave(object? sender, EventArgs e) => RefreshFiles();

    private void _txtOutput_Leave(object? sender, EventArgs e)
    {
        if (!string.IsNullOrWhiteSpace(_txtOutput.Text))
            PersistSettings();
    }

    private void _btnRefresh_Click(object? sender, EventArgs e) => RefreshFiles();

    private void BrowseSrc_Click(object? sender, EventArgs e)
    {
        _pickingFolder = true;
        try
        {
            if (!TryPickFolder("소스 디렉토리 선택", _srcDir.Text.Trim(), out var folder))
                return;
            _srcDir.Text = folder;
            if (string.IsNullOrEmpty(_txtOutput.Text))
                _txtOutput.Text = Path.Combine(folder, "merged.md");
            PersistSettings();
            RefreshFiles();
        }
        finally
        {
            _pickingFolder = false;
        }
    }

    private void BrowseOut_Click(object? sender, EventArgs e)
    {
        using var dlg = new SaveFileDialog
        {
            Title = "출력 파일 저장",
            Filter = "Markdown (*.md)|*.md|모든 파일 (*.*)|*.*",
            DefaultExt = "md",
            FileName = "merged.md"
        };
        if (!string.IsNullOrEmpty(_txtOutput.Text))
        {
            dlg.InitialDirectory = Path.GetDirectoryName(_txtOutput.Text);
            dlg.FileName = Path.GetFileName(_txtOutput.Text);
        }
        else if (!string.IsNullOrEmpty(_settings.LastOutputFile))
        {
            var dir = Path.GetDirectoryName(_settings.LastOutputFile);
            if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir))
                dlg.InitialDirectory = dir;
            dlg.FileName = Path.GetFileName(_settings.LastOutputFile);
        }
        else if (Directory.Exists(_srcDir.Text))
        {
            dlg.InitialDirectory = _srcDir.Text;
        }
        if (dlg.ShowDialog(this) == DialogResult.OK)
        {
            _txtOutput.Text = dlg.FileName;
            PersistSettings();
        }
    }

    private void OnSortChanged(object? sender, EventArgs e)
    {
        if (!_suppressSortRefresh && _cmbSort.SelectedIndex != 4)
            RefreshFiles();
        UpdateMoveButtons();
    }

    private void MoveUp_Click(object? sender, EventArgs e)
    {
        EnsureCustomOrder();
        EnsureMoveSelection();
        int i = GetMoveIndex(_lstFiles);
        if (i <= 0) return;
        SwapItems(i, i - 1);
        _lstFiles.SelectedIndex = i - 1;
        UpdateMoveButtons();
    }

    private void MoveDown_Click(object? sender, EventArgs e)
    {
        EnsureCustomOrder();
        EnsureMoveSelection();
        int i = GetMoveIndex(_lstFiles);
        if (i < 0 || i >= _lstFiles.Items.Count - 1) return;
        SwapItems(i, i + 1);
        _lstFiles.SelectedIndex = i + 1;
        UpdateMoveButtons();
    }

    private void SwapItems(int a, int b)
    {
        _lstFiles.BeginUpdate();
        var ia = (FileItem)_lstFiles.Items[a]!;
        var ib = (FileItem)_lstFiles.Items[b]!;
        bool ca = _lstFiles.GetItemChecked(a);
        bool cb = _lstFiles.GetItemChecked(b);
        _lstFiles.Items[a] = ib;
        _lstFiles.SetItemChecked(a, cb);
        _lstFiles.Items[b] = ia;
        _lstFiles.SetItemChecked(b, ca);
        _lstFiles.EndUpdate();
    }

    private void RefreshFiles()
    {
        var dir = _srcDir.Text.Trim();
        if (!Directory.Exists(dir))
        {
            _lstFiles.Items.Clear();
            _lblCount.Text = "0개 파일";
            UpdateMoveButtons();
            return;
        }

        bool isCustom = _cmbSort.SelectedIndex == 4;
        var previousOrder = isCustom
            ? _lstFiles.Items.Cast<FileItem>().Select(f => f.FullPath).ToList()
            : null;
        var previousChecked = isCustom
            ? Enumerable.Range(0, _lstFiles.Items.Count).Where(i => _lstFiles.GetItemChecked(i)).Select(i => ((FileItem)_lstFiles.Items[i]!).FullPath).ToHashSet(StringComparer.OrdinalIgnoreCase)
            : null;

        var opts = BuildOptions(forRefresh: !isCustom);
        List<string> files;
        try { files = MdMerger.GetFiles(opts); }
        catch (Exception ex) { Log($"[오류] {ex.Message}"); return; }

        if (isCustom && previousOrder is { Count: > 0 })
        {
            var remaining = files.ToHashSet(StringComparer.OrdinalIgnoreCase);
            var ordered = previousOrder.Where(remaining.Contains).ToList();
            foreach (var f in remaining)
            {
                if (!ordered.Contains(f, StringComparer.OrdinalIgnoreCase))
                    ordered.Add(f);
            }
            files = ordered;
        }

        _lstFiles.BeginUpdate();
        _lstFiles.Items.Clear();
        foreach (var f in files)
        {
            bool check = previousChecked?.Contains(f) ?? true;
            _lstFiles.Items.Add(new FileItem(f, dir), check);
        }
        _lstFiles.EndUpdate();

        _lblCount.Text = $"{files.Count}개 파일";
        Log($"[새로고침] {files.Count}개 파일 로드됨");
        UpdateMoveButtons();
    }

    private void Generate_Click(object? sender, EventArgs e)
    {
        var outPath = _txtOutput.Text.Trim();
        if (string.IsNullOrEmpty(outPath))
        {
            MessageBox.Show("출력 파일 경로를 입력해 주세요.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        var (files, opts) = GetCheckedFiles();
        if (files.Count == 0)
        {
            MessageBox.Show("병합할 파일을 선택해 주세요.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        try
        {
            string content = MdMerger.Merge(files, opts);
            // 헤더 번호 붙이기
            content = MarkdownConverter.ApplyHeadingNumberingToMarkdown(content);
            var outDir = Path.GetDirectoryName(outPath);
            if (!string.IsNullOrEmpty(outDir)) Directory.CreateDirectory(outDir);
            File.WriteAllText(outPath, content, new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            Log($"[완료] {files.Count}개 파일 → {outPath}");
            PersistSettings();
            new DocumentViewForm(content, outPath).Show();
        }
        catch (Exception ex)
        {
            Log($"[오류] {ex.Message}");
            MessageBox.Show(ex.Message, "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void Preview_Click(object? sender, EventArgs e)
    {
        var (files, opts) = GetCheckedFiles();
        if (files.Count == 0)
        {
            MessageBox.Show("미리볼 파일이 없습니다.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        try
        {
            string content = MdMerger.Merge(files, opts);
            // 헤더 번호 붙이기
            content = MarkdownConverter.ApplyHeadingNumberingToMarkdown(content);
            new DocumentViewForm(content).Show();
        }
        catch (Exception ex) { Log($"[오류] {ex.Message}"); }
    }

    private (List<string>, MergeOptions) GetCheckedFiles()
    {
        var opts = BuildOptions();
        var files = Enumerable.Range(0, _lstFiles.Items.Count)
            .Where(i => _lstFiles.GetItemChecked(i))
            .Select(i => ((FileItem)_lstFiles.Items[i]!).FullPath)
            .ToList();
        return (files, opts);
    }

    private MergeOptions BuildOptions(bool forRefresh = false)
    {
        var sortIdx = _cmbSort.SelectedIndex;
        if (forRefresh && sortIdx == 4) sortIdx = 0;

        var excludePatterns = (_txtExclude.Text ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        return new MergeOptions
        {
            SourceDirectory = _srcDir.Text.Trim(),
            Recursive = _chkRecursive.Checked,
            SortOrder = (FileSortOrder)sortIdx,
            InsertHeader = _chkHeader.Checked,
            ExcludePatterns = excludePatterns,
            OutputFile = _txtOutput.Text.Trim()
        };
    }

    private void Log(string msg)
    {
        _txtLog.AppendText($"[{DateTime.Now:HH:mm:ss}] {msg}{Environment.NewLine}");
        _txtLog.ScrollToCaret();
    }

    private void _lstFiles_SelectedIndexChanged(object? sender, EventArgs e) => UpdateMoveButtons();

    private void _lstFiles_ItemCheck(object? sender, ItemCheckEventArgs e) => UpdateMoveButtons();
}
