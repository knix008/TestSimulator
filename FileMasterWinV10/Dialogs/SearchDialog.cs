using FileMasterWinV10.Helpers;

namespace FileMasterWinV10.Dialogs;

public partial class SearchDialog : Form
{
    private readonly string _searchRoot;
    private CancellationTokenSource? _cts;

    public event EventHandler<string>? FileSelected;

    public SearchDialog() : this("C:\\")
    {
    }

    public SearchDialog(string searchRoot)
    {
        _searchRoot = searchRoot;
        InitializeComponent();
        ApplyThemeAndWire();
        Text = $"파일 검색 — {searchRoot}";
    }

    private void ApplyThemeAndWire()
    {
        if (AppIconHelper.IsDesignMode(this)) return;

        UiTheme.ApplyForm(this);
        UiTheme.StylePrimaryButton(searchBtn);
        UiTheme.StyleSecondaryButton(clearBtn);
        UiTheme.StyleSecondaryButton(closeBtn);
        statusLabel.BackColor = UiTheme.HeaderBg;
        statusLabel.ForeColor = UiTheme.TextSecondary;
        statusLabel.Font = UiTheme.UiFontSmall;
        resultList.Font = UiTheme.MonoFont;
        resultList.BackColor = UiTheme.Surface;

        searchContentCheck.CheckedChanged += (_, _) => contentBox.Enabled = searchContentCheck.Checked;
        searchBtn.Click += OnSearch;
        clearBtn.Click += (_, _) => { resultList.Items.Clear(); statusLabel.Text = "결과가 지워졌습니다."; };
        closeBtn.Click += (_, _) => { _cts?.Cancel(); Close(); };
        resultList.DoubleClick += (_, _) =>
        {
            if (resultList.SelectedItem is string path)
            {
                FileSelected?.Invoke(this, path);
                Close();
            }
        };
    }

    private async void OnSearch(object? sender, EventArgs e)
    {
        _cts?.Cancel();
        _cts = new CancellationTokenSource();
        resultList.Items.Clear();
        searchBtn.Enabled = false;
        statusLabel.Text = "검색 중...";

        var pattern = string.IsNullOrWhiteSpace(patternBox.Text) ? "*.*" : patternBox.Text;
        var searchContent = searchContentCheck.Checked;
        var contentPattern = contentBox.Text;
        var ct = _cts.Token;
        int found = 0;

        var progress = new Progress<string>(f =>
        {
            found++;
            statusLabel.Text = $"검색 중... {found}개 발견 | {f}";
        });

        try
        {
            var results = await FileOperations.SearchFilesAsync(_searchRoot, pattern, searchContent, contentPattern, progress, ct);
            resultList.Items.Clear();
            foreach (var r in results)
                resultList.Items.Add(r);
            statusLabel.Text = $"검색 완료: {results.Count}개 발견 (더블클릭으로 해당 폴더 이동)";
        }
        catch (OperationCanceledException)
        {
            statusLabel.Text = "검색이 취소되었습니다.";
        }
        finally
        {
            searchBtn.Enabled = true;
        }
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        _cts?.Cancel();
        base.OnFormClosed(e);
    }
}
