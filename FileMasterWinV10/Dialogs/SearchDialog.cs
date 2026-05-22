using FileMasterWinV10.Helpers;

namespace FileMasterWinV10.Dialogs;

public class SearchDialog : Form
{
    private readonly string _searchRoot;
    private readonly TextBox _patternBox;
    private readonly TextBox _contentBox;
    private readonly CheckBox _searchContentCheck;
    private readonly Button _searchBtn;
    private readonly ListBox _resultList;
    private readonly Label _statusLabel;
    private CancellationTokenSource? _cts;

    public event EventHandler<string>? FileSelected;

    public SearchDialog(string searchRoot)
    {
        _searchRoot = searchRoot;
        Text = $"파일 검색 — {searchRoot}";
        Size = new Size(680, 540);
        MinimumSize = new Size(480, 360);
        StartPosition = FormStartPosition.CenterParent;
        UiTheme.ApplyForm(this);

        var topPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 88,
            ColumnCount = 2,
            RowCount = 2,
            Padding = new Padding(12, 10, 12, 6),
        };
        topPanel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        topPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));

        var lblName = new Label { Text = "파일 이름:", AutoSize = true, Margin = new Padding(0, 6, 10, 0) };
        _patternBox = new TextBox { Dock = DockStyle.Fill, Text = "*.*", Margin = new Padding(0, 2, 0, 6) };

        _searchContentCheck = new CheckBox { Text = "내용 검색:", AutoSize = true, Margin = new Padding(0, 6, 10, 0) };
        _contentBox = new TextBox { Dock = DockStyle.Fill, Enabled = false, Margin = new Padding(0, 2, 0, 0) };
        _searchContentCheck.CheckedChanged += (_, _) => _contentBox.Enabled = _searchContentCheck.Checked;

        topPanel.Controls.Add(lblName, 0, 0);
        topPanel.Controls.Add(_patternBox, 1, 0);
        topPanel.Controls.Add(_searchContentCheck, 0, 1);
        topPanel.Controls.Add(_contentBox, 1, 1);

        var btnPanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 44,
            FlowDirection = FlowDirection.LeftToRight,
            Padding = new Padding(12, 4, 12, 8),
            WrapContents = false,
        };
        _searchBtn = new Button { Text = "검색 시작", Width = 96, Height = 32 };
        var clearBtn = new Button { Text = "결과 지우기", Width = 96, Height = 32, Margin = new Padding(8, 0, 0, 0) };
        var cancelBtn = new Button { Text = "닫기", Width = 80, Height = 32, Margin = new Padding(8, 0, 0, 0) };
        UiTheme.StylePrimaryButton(_searchBtn);
        UiTheme.StyleSecondaryButton(clearBtn);
        UiTheme.StyleSecondaryButton(cancelBtn);
        btnPanel.Controls.AddRange(new Control[] { _searchBtn, clearBtn, cancelBtn });

        _statusLabel = new Label
        {
            Dock = DockStyle.Bottom,
            Text = "검색할 파일 이름 패턴을 입력하세요. (예: *.txt, report*.xlsx)",
            Padding = new Padding(10, 6, 10, 6),
            Height = 28,
            BackColor = UiTheme.HeaderBg,
            ForeColor = UiTheme.TextSecondary,
            Font = UiTheme.UiFontSmall,
        };

        _resultList = new ListBox
        {
            Dock = DockStyle.Fill,
            Font = UiTheme.MonoFont,
            BorderStyle = BorderStyle.None,
            BackColor = UiTheme.Surface,
        };

        _searchBtn.Click += OnSearch;
        clearBtn.Click += (_, _) => { _resultList.Items.Clear(); _statusLabel.Text = "결과가 지워졌습니다."; };
        cancelBtn.Click += (_, _) => { _cts?.Cancel(); Close(); };
        _resultList.DoubleClick += (_, _) =>
        {
            if (_resultList.SelectedItem is string path)
            {
                FileSelected?.Invoke(this, path);
                Close();
            }
        };

        Controls.Add(_resultList);
        Controls.Add(_statusLabel);
        Controls.Add(btnPanel);
        Controls.Add(topPanel);
    }

    private async void OnSearch(object? sender, EventArgs e)
    {
        _cts?.Cancel();
        _cts = new CancellationTokenSource();
        _resultList.Items.Clear();
        _searchBtn.Enabled = false;
        _statusLabel.Text = "검색 중...";

        var pattern = string.IsNullOrWhiteSpace(_patternBox.Text) ? "*.*" : _patternBox.Text;
        var searchContent = _searchContentCheck.Checked;
        var contentPattern = _contentBox.Text;
        var ct = _cts.Token;
        int found = 0;

        var progress = new Progress<string>(f =>
        {
            found++;
            _statusLabel.Text = $"검색 중... {found}개 발견 | {f}";
        });

        try
        {
            var results = await FileOperations.SearchFilesAsync(_searchRoot, pattern, searchContent, contentPattern, progress, ct);
            _resultList.Items.Clear();
            foreach (var r in results)
                _resultList.Items.Add(r);
            _statusLabel.Text = $"검색 완료: {results.Count}개 발견 (더블클릭으로 해당 폴더 이동)";
        }
        catch (OperationCanceledException)
        {
            _statusLabel.Text = "검색이 취소되었습니다.";
        }
        finally
        {
            _searchBtn.Enabled = true;
        }
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        _cts?.Cancel();
        base.OnFormClosed(e);
    }
}
