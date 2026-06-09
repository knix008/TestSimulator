namespace MDMakerWinV10;

public partial class MainForm : Form
{
    private readonly AppSettings _settings = AppSettings.Load();
    private bool _suppressSortRefresh;
    private bool _pickingFolder;
    private bool _syncNumbering;
    private bool _loadingProject;
    private bool _projectDirty;
    private string? _projectPath;

    const string AppTitle = "MD Merge v1.0";

    public MainForm(string? startupFile = null)
    {
        InitializeComponent();
        ConfigureAppearance();
        if (_cmbSort.Items.Count > 0 && _cmbSort.SelectedIndex < 0)
            _cmbSort.SelectedIndex = 0;
        UpdateMoveButtons();

        if (startupFile != null)
            Load += (_, _) => TryLoadProjectOnStartup(startupFile);
    }

    private void TryLoadProjectOnStartup(string path)
    {
        try { LoadProjectFromFile(path); }
        catch (Exception ex) { Log($"[오류] 시작 파일 열기 실패: {ex.Message}"); }
    }

    private void ConfigureAppearance()
    {
        UiTheme.ApplyToMainForm(this);
        UiTheme.StyleMenuStrip(_menuMain);
        UiTheme.StyleGroupBox(_grpSource);
        UiTheme.StyleGroupBox(_grpOptions);
        UiTheme.StyleGroupBox(_grpFiles);
        UiTheme.StyleGroupBox(_grpOutput);
        UiTheme.StyleGroupBox(_grpLog);

        UiTheme.StyleSecondaryButton(_btnBrowseSrc, UiIconKind.Folder);
        UiTheme.StyleSecondaryButton(_btnBrowseOut, UiIconKind.Folder);

        UiTheme.StyleCompactButton(_btnRefresh, UiIconKind.Refresh);
        UiTheme.StyleCompactButton(_btnUp, UiIconKind.MoveUp);
        UiTheme.StyleCompactButton(_btnDown, UiIconKind.MoveDown);
        UiTheme.NormalizeButtonColumn(_btnRefresh, _btnUp, _btnDown);

        UiTheme.StylePrimaryButton(_btnGenerate, UiIconKind.Generate);
        UiTheme.StyleAccentOutlineButton(_btnPreview, UiIconKind.Preview);
        UiTheme.StyleSecondaryButton(_btnExportSettings, UiIconKind.Settings);
        _btnGenerate.Margin = _btnPreview.Margin = _btnExportSettings.Margin = new Padding(0, 4, 8, 4);

        UiTheme.StyleMenuItem(_mnuProject, UiIconKind.Merge);
        UiTheme.StyleMenuItem(_miProjectNew, UiIconKind.ProjectNew);
        UiTheme.StyleMenuItem(_miProjectOpen, UiIconKind.ProjectOpen);
        UiTheme.StyleMenuItem(_miProjectSave, UiIconKind.ProjectSave);
        UiTheme.StyleMenuItem(_miProjectSaveAs, UiIconKind.ProjectSaveAs);

        UiTheme.StyleMenuItem(_mnuWork, UiIconKind.Generate);
        UiTheme.StyleMenuItem(_miGenerate, UiIconKind.Generate);
        UiTheme.StyleMenuItem(_miPreview, UiIconKind.Preview);

        UiTheme.StyleMenuItem(_mnuTools, UiIconKind.Settings);
        UiTheme.StyleMenuItem(_miExportSettings, UiIconKind.Settings);

        _srcDir.TextChanged += (_, _) => MarkProjectDirty();
        _txtOutput.TextChanged += (_, _) => MarkProjectDirty();
        _chkRecursive.CheckedChanged += (_, _) => MarkProjectDirty();
        _cmbSort.SelectedIndexChanged += (_, _) => MarkProjectDirty();
        _txtExclude.TextChanged += (_, _) => MarkProjectDirty();
        _chkNumbering.CheckedChanged += (_, _) => MarkProjectDirty();
        _lstFiles.ItemCheck += (_, _) => MarkProjectDirty();
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
        if (!string.IsNullOrEmpty(_settings.LastProjectPath) && File.Exists(_settings.LastProjectPath))
        {
            TryRestoreLastProject();
        }
        else
        {
            if (!string.IsNullOrEmpty(_settings.LastSourceDir))
                _srcDir.Text = _settings.LastSourceDir;
            if (!string.IsNullOrEmpty(_settings.LastOutputFile))
                _txtOutput.Text = _settings.LastOutputFile;
            RefreshNumberingFromStore();
            if (Directory.Exists(_srcDir.Text.Trim()))
                RefreshFiles();
        }
        UpdateWindowTitle();
    }

    protected override void OnActivated(EventArgs e)
    {
        base.OnActivated(e);
        RefreshNumberingFromStore();
    }

    private void RefreshNumberingFromStore() => ApplyNumberingFromSettings();

    private void ApplyNumberingFromSettings()
    {
        _syncNumbering = true;
        try { _chkNumbering.Checked = AppSettings.GetPdfSettings().NumberHeadings; }
        finally { _syncNumbering = false; }
    }

    private void _chkNumbering_CheckedChanged(object? sender, EventArgs e)
    {
        if (_syncNumbering) return;
        AppSettings.SetNumberHeadings(_chkNumbering.Checked);
        MarkProjectDirty();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (!ConfirmDiscardProjectChanges())
        {
            e.Cancel = true;
            return;
        }
        PersistSettings();
        base.OnFormClosing(e);
    }

    private void PersistSettings()
    {
        var src = _srcDir.Text.Trim();
        var output = _txtOutput.Text.Trim();
        var settings = AppSettings.Load();
        if (!string.IsNullOrEmpty(src))
            settings.LastSourceDir = src;
        if (!string.IsNullOrEmpty(output))
            settings.LastOutputFile = output;
        settings.Save();
        _settings.LastSourceDir = settings.LastSourceDir;
        _settings.LastOutputFile = settings.LastOutputFile;
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
        MarkProjectDirty();
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
            _lstFiles.Items.Add(new FileItem(f), check);
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
            string content = MarkdownConverter.StripHeadingNumbers(MdMerger.Merge(files, opts));
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
            string content = MarkdownConverter.StripHeadingNumbers(MdMerger.Merge(files, opts));
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

    private string? TryGetGeneratedDocumentText()
    {
        try
        {
            var (files, opts) = GetCheckedFiles();
            if (files.Count == 0 && _lstFiles.Items.Count > 0)
            {
                files = Enumerable.Range(0, _lstFiles.Items.Count)
                    .Select(i => ((FileItem)_lstFiles.Items[i]!).FullPath)
                    .ToList();
            }
            if (files.Count > 0)
                return MarkdownConverter.StripHeadingNumbers(MdMerger.Merge(files, opts));

            var outPath = _txtOutput.Text.Trim();
            if (!string.IsNullOrEmpty(outPath) && File.Exists(outPath))
                return File.ReadAllText(outPath, System.Text.Encoding.UTF8);
        }
        catch { }
        return null;
    }

    private string SuggestProjectFileName()
    {
        var content = TryGetGeneratedDocumentText();
        if (!string.IsNullOrEmpty(content))
        {
            var baseName = MarkdownConverter.GetDocumentExportBaseName(content);
            if (!string.IsNullOrEmpty(baseName))
                return baseName + MdmProject.Extension;
        }

        if (_projectPath != null)
            return Path.GetFileName(_projectPath);

        var output = _txtOutput.Text.Trim();
        if (!string.IsNullOrEmpty(output))
        {
            var fromOutput = Path.GetFileNameWithoutExtension(output);
            if (!string.IsNullOrEmpty(fromOutput))
                return fromOutput + MdmProject.Extension;
        }

        return "project" + MdmProject.Extension;
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
            ExcludePatterns = excludePatterns,
            OutputFile = _txtOutput.Text.Trim()
        };
    }

    private void ExportSettings_Click(object? sender, EventArgs e)
    {
        using var dlg = new PdfSettingsDialog(AppSettings.GetPdfSettings());
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        AppSettings.SavePdfSettings(dlg.Result);
        RefreshNumberingFromStore();
        MarkProjectDirty();
    }

    private void ProjectNew_Click(object? sender, EventArgs e)
    {
        if (!ConfirmDiscardProjectChanges()) return;
        ResetToNewProject();
        Log("[프로젝트] 새 프로젝트");
    }

    private void ProjectOpen_Click(object? sender, EventArgs e) => OpenProjectInteractive();

    private void ProjectSave_Click(object? sender, EventArgs e)
    {
        if (string.IsNullOrEmpty(_projectPath))
            ProjectSaveAs_Click(sender, e);
        else
            SaveProjectToFile(_projectPath);
    }

    private void ProjectSaveAs_Click(object? sender, EventArgs e)
    {
        using var dlg = new SaveFileDialog
        {
            Title = "프로젝트 저장",
            Filter = MdmProject.FileFilter,
            DefaultExt = MdmProject.Extension.TrimStart('.'),
            FileName = SuggestProjectFileName()
        };
        if (!string.IsNullOrEmpty(_projectPath))
            dlg.InitialDirectory = Path.GetDirectoryName(_projectPath);
        else if (Directory.Exists(_srcDir.Text.Trim()))
            dlg.InitialDirectory = _srcDir.Text.Trim();
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        SaveProjectToFile(dlg.FileName);
    }

    private void TryRestoreLastProject()
    {
        var path = _settings.LastProjectPath;
        if (string.IsNullOrEmpty(path) || !File.Exists(path)) return;
        try
        {
            LoadProjectFromFile(path, quiet: true);
            Log($"[프로젝트] 복구: {path}");
        }
        catch (Exception ex)
        {
            Log($"[경고] 마지막 프로젝트 복구 실패: {ex.Message}");
        }
    }

    private void OpenProjectInteractive()
    {
        if (!ConfirmDiscardProjectChanges()) return;
        using var dlg = new OpenFileDialog
        {
            Title = "프로젝트 열기",
            Filter = MdmProject.FileFilter,
            DefaultExt = MdmProject.Extension.TrimStart('.')
        };
        if (!string.IsNullOrEmpty(_settings.LastProjectPath))
            dlg.InitialDirectory = Path.GetDirectoryName(_settings.LastProjectPath);
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        try
        {
            LoadProjectFromFile(dlg.FileName);
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "프로젝트 열기 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void LoadProjectFromFile(string path, bool quiet = false)
    {
        var project = MdmProject.Load(path);
        ApplyProject(project);
        _projectPath = path;
        _projectDirty = false;
        _settings.LastProjectPath = path;
        _settings.Save();
        UpdateWindowTitle();
        if (!quiet)
            Log($"[프로젝트] 열림: {path}");
    }

    private bool SaveProjectToFile(string path)
    {
        try
        {
            var project = CaptureProject();
            project.Save(path);
            _projectPath = path;
            _projectDirty = false;
            _settings.LastProjectPath = path;
            _settings.LastSourceDir = project.SourceDirectory;
            _settings.LastOutputFile = project.OutputFile;
            PersistSettings();
            UpdateWindowTitle();
            Log($"[프로젝트] 저장: {path}");
            return true;
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "프로젝트 저장 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return false;
        }
    }

    private MdmProject CaptureProject()
    {
        var sortIdx = _cmbSort.SelectedIndex;
        if (sortIdx < 0) sortIdx = 0;
        var source = _srcDir.Text.Trim();
        var export = AppSettings.GetPdfSettings();

        var files = string.IsNullOrEmpty(source) || !Directory.Exists(source)
            ? Enumerable.Empty<(string FullPath, bool Checked)>()
            : Enumerable.Range(0, _lstFiles.Items.Count)
                .Select(i => (((FileItem)_lstFiles.Items[i]!).FullPath, _lstFiles.GetItemChecked(i)));

        return MdmProject.FromUi(
            source,
            _txtOutput.Text.Trim(),
            _chkRecursive.Checked,
            (FileSortOrder)sortIdx,
            _txtExclude.Text.Trim(),
            export.NumberHeadings,
            export,
            files);
    }

    private void ApplyProject(MdmProject project)
    {
        _loadingProject = true;
        try
        {
            project.Normalize();

            _srcDir.Text = project.SourceDirectory;
            _txtOutput.Text = project.OutputFile;
            _chkRecursive.Checked = project.Recursive;
            _txtExclude.Text = project.ExcludePatterns;

            _suppressSortRefresh = true;
            _cmbSort.SelectedIndex = Math.Clamp((int)project.SortOrder, 0, _cmbSort.Items.Count - 1);
            _suppressSortRefresh = false;

            var export = project.ExportSettings.Clone();
            export.MigrateLegacyDefaults();
            AppSettings.SavePdfSettings(export);
            RefreshNumberingFromStore();

            _settings.LastSourceDir = project.SourceDirectory;
            _settings.LastOutputFile = project.OutputFile;

            RestoreFileList(project);
            UpdateMoveButtons();
        }
        finally
        {
            _loadingProject = false;
        }
    }

    private void RestoreFileList(MdmProject project)
    {
        var dir = project.SourceDirectory.Trim();
        if (!Directory.Exists(dir))
        {
            _lstFiles.Items.Clear();
            _lblCount.Text = "0개 파일";
            return;
        }

        var checkMap = BuildCheckMap(project, dir);
        List<string> onDisk;
        try { onDisk = MdMerger.GetFiles(project.ToMergeOptions(forRefresh: project.SortOrder != FileSortOrder.Custom)); }
        catch { onDisk = []; }

        var resolved = new List<(string FullPath, bool Checked)>();
        var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (project.SortOrder == FileSortOrder.Custom && project.Files.Count > 0)
        {
            foreach (var entry in project.Files)
            {
                if (string.IsNullOrWhiteSpace(entry.RelativePath)) continue;
                var full = Path.GetFullPath(Path.Combine(dir, entry.RelativePath));
                if (!File.Exists(full) || !used.Add(full)) continue;
                resolved.Add((full, entry.Checked));
            }
            foreach (var f in onDisk)
            {
                if (!used.Contains(f))
                    resolved.Add((f, true));
            }
        }
        else
        {
            foreach (var f in onDisk)
                resolved.Add((f, checkMap.TryGetValue(f, out var check) ? check : true));
        }

        _lstFiles.BeginUpdate();
        _lstFiles.Items.Clear();
        foreach (var (full, check) in resolved)
            _lstFiles.Items.Add(new FileItem(full), check);
        _lstFiles.EndUpdate();
        _lblCount.Text = $"{resolved.Count}개 파일";
    }

    static Dictionary<string, bool> BuildCheckMap(MdmProject project, string dir)
    {
        var map = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in project.Files)
        {
            if (string.IsNullOrWhiteSpace(entry.RelativePath)) continue;
            map[Path.GetFullPath(Path.Combine(dir, entry.RelativePath))] = entry.Checked;
        }
        return map;
    }

    private void ResetToNewProject()
    {
        _loadingProject = true;
        try
        {
            _projectPath = null;
            _srcDir.Clear();
            _txtOutput.Clear();
            _chkRecursive.Checked = true;
            _suppressSortRefresh = true;
            _cmbSort.SelectedIndex = 0;
            _suppressSortRefresh = false;
            _txtExclude.Clear();
            _lstFiles.Items.Clear();
            _lblCount.Text = "0개 파일";
            AppSettings.SavePdfSettings(PdfSettings.CreateDefault());
            RefreshNumberingFromStore();
            UpdateMoveButtons();
        }
        finally
        {
            _loadingProject = false;
            _projectDirty = false;
            UpdateWindowTitle();
        }
    }

    private bool ConfirmDiscardProjectChanges()
    {
        if (!_projectDirty) return true;
        var answer = MessageBox.Show(
            "프로젝트 변경 사항을 저장하시겠습니까?",
            AppTitle,
            MessageBoxButtons.YesNoCancel,
            MessageBoxIcon.Question);
        if (answer == DialogResult.Cancel) return false;
        if (answer == DialogResult.Yes)
            return string.IsNullOrEmpty(_projectPath) ? PromptSaveAs() : SaveProjectToFile(_projectPath);
        return true;
    }

    private bool PromptSaveAs()
    {
        using var dlg = new SaveFileDialog
        {
            Title = "프로젝트 저장",
            Filter = MdmProject.FileFilter,
            DefaultExt = MdmProject.Extension.TrimStart('.'),
            FileName = SuggestProjectFileName()
        };
        if (Directory.Exists(_srcDir.Text.Trim()))
            dlg.InitialDirectory = _srcDir.Text.Trim();
        if (dlg.ShowDialog(this) != DialogResult.OK) return false;
        return SaveProjectToFile(dlg.FileName);
    }

    private void MarkProjectDirty()
    {
        if (_loadingProject) return;
        if (_projectDirty) return;
        _projectDirty = true;
        UpdateWindowTitle();
    }

    private void UpdateWindowTitle()
    {
        var name = _projectPath != null ? Path.GetFileName(_projectPath) : "제목 없음";
        Text = _projectDirty ? $"{AppTitle} - {name} *" : $"{AppTitle} - {name}";
    }

    private void Log(string msg)
    {
        _txtLog.AppendText($"[{DateTime.Now:HH:mm:ss}] {msg}{Environment.NewLine}");
        _txtLog.ScrollToCaret();
    }

    private void _lstFiles_SelectedIndexChanged(object? sender, EventArgs e) => UpdateMoveButtons();

    private void _lstFiles_ItemCheck(object? sender, ItemCheckEventArgs e) => UpdateMoveButtons();
}
