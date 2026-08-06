using FileMasterWinV10.Helpers;

namespace FileMasterWinV10.Dialogs;

public partial class SearchDialog : Form
{
    private readonly string _searchRoot;
    private CancellationTokenSource? _cts;
    private readonly ImageList _resultIcons = new() { ColorDepth = ColorDepth.Depth32Bit, ImageSize = new Size(16, 16) };

    public event EventHandler<string>? FileSelected;

    public SearchDialog() : this("C:\\")
    {
    }

    public SearchDialog(string searchRoot)
    {
        _searchRoot = searchRoot;
        InitializeComponent();
        ApplyThemeAndWire();
        ApplyLocalization();
    }

    private void ApplyThemeAndWire()
    {
        if (AppIconHelper.IsDesignMode(this)) return;

        UiTheme.ApplyForm(this);
        UiTheme.ApplyControlTree(this);
        UiTheme.StylePrimaryButton(searchBtn);
        UiTheme.StyleSecondaryButton(clearBtn);
        UiTheme.StyleSecondaryButton(closeBtn);
        UiTheme.StyleComboBox(sortCombo);
        statusLabel.BackColor = UiTheme.HeaderBg;
        statusLabel.ForeColor = UiTheme.TextSecondary;
        statusLabel.Font = UiTheme.UiFontSmall;
        resultList.SmallImageList = _resultIcons;
        UiTheme.StyleListView(resultList);
        topPanel.BackColor = UiTheme.Background;
        optionsPanel.BackColor = UiTheme.Background;

        searchContentCheck.CheckedChanged += (_, _) => contentBox.Enabled = searchContentCheck.Checked;
        searchBtn.Click += OnSearch;
        clearBtn.Click += (_, _) => { resultList.Items.Clear(); statusLabel.Text = LocalizationService.T("Search_Cleared"); };
        closeBtn.Click += (_, _) => { _cts?.Cancel(); Close(); };
        resultList.DoubleClick += (_, _) =>
        {
            if (resultList.SelectedItems.Count > 0 && resultList.SelectedItems[0].Tag is string path)
                OpenResult(path);
        };
    }

    // 더블클릭: 폴더는 패널에서 열고(이동), 파일은 연결된 프로그램으로 실행한다.
    private void OpenResult(string path)
    {
        if (Directory.Exists(path))
        {
            FileSelected?.Invoke(this, path);
            Close();
            return;
        }

        if (File.Exists(path))
        {
            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(path) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, ex.Message, LocalizationService.T("Search_Title"), MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            FileSelected?.Invoke(this, path);
        }
    }

    private ListViewItem BuildResultItem(string path)
    {
        string name, sizeStr, typeStr, modStr;
        int img = 0;
        try
        {
            if (Directory.Exists(path))
            {
                var di = new DirectoryInfo(path);
                name = di.Name.Length > 0 ? di.Name : path;
                sizeStr = "<DIR>";
                typeStr = LocalizationService.T("Type_Folder");
                modStr = di.LastWriteTime.ToString("yyyy-MM-dd HH:mm");
                img = IconHelper.GetIconIndex(_resultIcons, path, isDirectory: true);
            }
            else
            {
                var fi = new FileInfo(path);
                name = fi.Name;
                sizeStr = Models.FileEntry.FormatSize(fi.Length);
                var ext = fi.Extension;
                typeStr = ext.Length > 1
                    ? string.Format(LocalizationService.T("Type_FileSuffix"), ext[1..].ToUpper())
                    : LocalizationService.T("Type_File");
                modStr = fi.LastWriteTime.ToString("yyyy-MM-dd HH:mm");
                img = IconHelper.GetIconIndex(_resultIcons, path, isDirectory: false);
            }
        }
        catch
        {
            name = Path.GetFileName(path);
            sizeStr = typeStr = modStr = "";
        }

        var item = new ListViewItem(name, img) { Tag = path, ToolTipText = path };
        item.SubItems.Add(Path.GetDirectoryName(path) ?? "");
        item.SubItems.Add(sizeStr);
        item.SubItems.Add(typeStr);
        item.SubItems.Add(modStr);
        return item;
    }

    private void ApplyLocalization()
    {
        Text = $"{LocalizationService.T("Search_Title")} - {_searchRoot}";
        lblFileName.Text = LocalizationService.T("Search_FileName");
        searchContentCheck.Text = LocalizationService.T("Search_Content");
        caseSensitiveCheck.Text = LocalizationService.T("Search_Case");
        regexCheck.Text = LocalizationService.T("Search_Regex");
        includeFoldersCheck.Text = LocalizationService.T("Search_Folders");
        sortLabel.Text = LocalizationService.T("Search_Sort");
        searchBtn.Text = LocalizationService.T("Search_Start");
        clearBtn.Text = LocalizationService.T("Search_Clear");
        closeBtn.Text = LocalizationService.T("Close");
        statusLabel.Text = LocalizationService.T("Search_Hint");

        colName.Text = LocalizationService.T("Col_Name");
        colPath.Text = LocalizationService.T("Col_Path");
        colSize.Text = LocalizationService.T("Col_Size");
        colType.Text = LocalizationService.T("Col_Type");
        colModified.Text = LocalizationService.T("Col_Modified");

        sortCombo.Items.Clear();
        sortCombo.Items.Add(new SortOption(SearchResultSortOrder.MatchQuality, LocalizationService.T("Sort_MatchQuality")));
        sortCombo.Items.Add(new SortOption(SearchResultSortOrder.NameAsc, LocalizationService.T("Sort_NameAsc")));
        sortCombo.Items.Add(new SortOption(SearchResultSortOrder.NameDesc, LocalizationService.T("Sort_NameDesc")));
        sortCombo.Items.Add(new SortOption(SearchResultSortOrder.PathAsc, LocalizationService.T("Sort_PathAsc")));
        sortCombo.Items.Add(new SortOption(SearchResultSortOrder.PathDesc, LocalizationService.T("Sort_PathDesc")));
        sortCombo.Items.Add(new SortOption(SearchResultSortOrder.ModifiedDesc, LocalizationService.T("Sort_ModifiedDesc")));
        sortCombo.SelectedIndex = 0;
    }

    private async void OnSearch(object? sender, EventArgs e)
    {
        _cts?.Cancel();
        _cts = new CancellationTokenSource();
        resultList.Items.Clear();
        searchBtn.Enabled = false;
        statusLabel.Text = LocalizationService.T("Search_Working");

        var pattern = string.IsNullOrWhiteSpace(patternBox.Text) ? "*.*" : patternBox.Text;
        var searchContent = searchContentCheck.Checked;
        var contentPattern = contentBox.Text;
        var options = new FileSearchOptions
        {
            CaseSensitive = caseSensitiveCheck.Checked,
            UseRegex = regexCheck.Checked,
            IncludeFolders = includeFoldersCheck.Checked,
            SortOrder = sortCombo.SelectedItem is SortOption option ? option.SortOrder : SearchResultSortOrder.MatchQuality,
        };
        var ct = _cts.Token;
        int found = 0;

        var progress = new Progress<string>(f =>
        {
            found++;
            statusLabel.Text = $"{LocalizationService.T("Search_Working")} {found} | {f}";
        });

        try
        {
            List<string> results;
            var index = SearchIndexService.Instance;
            // 내용 검색이 아니고 인덱스가 준비됐으면 인덱스로 빠르게 이름 검색한다.
            if (!searchContent && index.State == IndexState.Ready)
                results = await Task.Run(() => index.Search(pattern, options, _searchRoot, ct), ct);
            else
                results = await FileOperations.SearchFilesAsync(_searchRoot, pattern, searchContent, contentPattern, progress, ct, options);

            resultList.BeginUpdate();
            resultList.Items.Clear();
            _resultIcons.Images.Clear();
            foreach (var r in results)
                resultList.Items.Add(BuildResultItem(r));
            resultList.EndUpdate();
            statusLabel.Text = LocalizationService.CurrentLanguage == AppLanguage.English
                ? $"Search complete: {results.Count} found (double-click to open location)"
                : $"검색 완료: {results.Count}개 발견 (더블클릭으로 해당 폴더 이동)";
        }
        catch (OperationCanceledException)
        {
            statusLabel.Text = LocalizationService.T("Search_Canceled");
        }
        finally
        {
            searchBtn.Enabled = true;
        }
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        _cts?.Cancel();
        _resultIcons.Dispose();
        base.OnFormClosed(e);
    }

    private sealed record SortOption(SearchResultSortOrder SortOrder, string Text)
    {
        public override string ToString() => Text;
    }
}
