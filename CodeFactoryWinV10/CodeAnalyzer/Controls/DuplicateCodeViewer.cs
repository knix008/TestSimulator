using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

public sealed class DuplicateCodeViewer : UserControl
{
    private readonly SplitContainer _split = new()
    {
        Dock = DockStyle.Fill,
        Orientation = Orientation.Horizontal,
        SplitterDistance = 220,
        FixedPanel = FixedPanel.Panel1
    };

    private readonly ListView _groupList = new()
    {
        Dock = DockStyle.Fill,
        View = View.Details,
        FullRowSelect = true,
        GridLines = true,
        MultiSelect = false
    };

    private readonly ListView _fragmentList = new()
    {
        Dock = DockStyle.Fill,
        View = View.Details,
        FullRowSelect = true,
        GridLines = true,
        MultiSelect = false
    };

    private readonly TextBox _sampleBox = new()
    {
        Dock = DockStyle.Bottom,
        Height = 120,
        Multiline = true,
        ReadOnly = true,
        ScrollBars = ScrollBars.Both,
        Font = new Font(FontFamily.GenericMonospace, 9f),
        BackColor = Color.FromArgb(248, 248, 252),
        BorderStyle = BorderStyle.FixedSingle
    };

    private readonly Label _summaryLabel = new()
    {
        Dock = DockStyle.Top,
        Height = 44,
        Padding = new Padding(8, 6, 8, 4),
        AutoEllipsis = true
    };

    private DuplicateCodeResult? _duplicates;
    private bool _isAnalyzing;

    public event Action<MetricsNavigationRequest>? NavigationRequested;

    public DuplicateCodeViewer()
    {
        DoubleBuffered = true;
        BackColor = Color.White;

        _groupList.Columns.Add("그룹", 56);
        _groupList.Columns.Add("줄 수", 52, HorizontalAlignment.Right);
        _groupList.Columns.Add("위치 수", 64, HorizontalAlignment.Right);
        _groupList.SelectedIndexChanged += (_, _) => ShowSelectedGroup();

        _fragmentList.Columns.Add("파일", 280);
        _fragmentList.Columns.Add("언어", 72);
        _fragmentList.Columns.Add("시작", 52, HorizontalAlignment.Right);
        _fragmentList.Columns.Add("끝", 52, HorizontalAlignment.Right);

        var detailPanel = new Panel { Dock = DockStyle.Fill };
        detailPanel.Controls.Add(_sampleBox);
        detailPanel.Controls.Add(_fragmentList);

        _split.Panel1.Controls.Add(_groupList);
        _split.Panel2.Controls.Add(detailPanel);

        _fragmentList.DoubleClick += OnFragmentDoubleClick;

        Controls.Add(_split);
        Controls.Add(_summaryLabel);
    }

    private void OnFragmentDoubleClick(object? sender, EventArgs e)
    {
        if (_fragmentList.SelectedItems.Count == 0
            || _fragmentList.SelectedItems[0].Tag is not DuplicateCodeFragment fragment)
        {
            return;
        }

        NavigationRequested?.Invoke(new MetricsNavigationRequest
        {
            FilePath = fragment.FilePath,
            LineNumber = fragment.StartLine
        });
    }

    public void SetDuplicates(DuplicateCodeResult? duplicates)
    {
        _duplicates = duplicates;
        RebuildGroupList();
    }

    public void BeginAnalysis()
    {
        _isAnalyzing = true;
        _duplicates = null;
        _groupList.Items.Clear();
        _fragmentList.Items.Clear();
        _sampleBox.Clear();
        _summaryLabel.Text = "중복 코드 분석 중...";
    }

    public void EndAnalysis()
    {
        _isAnalyzing = false;
    }

    private void RebuildGroupList()
    {
        _groupList.BeginUpdate();
        _groupList.Items.Clear();
        _fragmentList.Items.Clear();
        _sampleBox.Clear();

        if (_duplicates is null || _duplicates.Groups.Count == 0)
        {
            _summaryLabel.Text = _isAnalyzing
                ? "중복 코드 분석 중..."
                : "표시할 중복 코드가 없습니다. 분석 실행 후 결과가 여기에 표시됩니다.";
            _groupList.EndUpdate();
            return;
        }

        var totalFragments = _duplicates.Groups.Sum(group => group.Fragments.Count);
        _summaryLabel.Text =
            $"최소 {_duplicates.MinDuplicateLines}줄 이상 동일 · 그룹 {_duplicates.Groups.Count}건 · 위치 {totalFragments}곳";

        foreach (var group in _duplicates.Groups)
        {
            var item = new ListViewItem(group.Id);
            item.SubItems.Add(group.LineCount.ToString());
            item.SubItems.Add(group.Fragments.Count.ToString());
            item.Tag = group;
            _groupList.Items.Add(item);
        }

        if (_groupList.Items.Count > 0)
        {
            _groupList.Items[0].Selected = true;
        }

        _groupList.EndUpdate();
    }

    private void ShowSelectedGroup()
    {
        _fragmentList.BeginUpdate();
        _fragmentList.Items.Clear();

        if (_groupList.SelectedItems.Count == 0 || _groupList.SelectedItems[0].Tag is not DuplicateCodeGroup group)
        {
            _sampleBox.Clear();
            _fragmentList.EndUpdate();
            return;
        }

        _sampleBox.Text = group.SampleLines.Count > 0
            ? string.Join(Environment.NewLine, group.SampleLines)
            : "(샘플 없음)";

        foreach (var fragment in group.Fragments)
        {
            var item = new ListViewItem(fragment.FilePath);
            item.SubItems.Add(fragment.LanguageId);
            item.SubItems.Add(fragment.StartLine.ToString());
            item.SubItems.Add(fragment.EndLine.ToString());
            _fragmentList.Items.Add(item);
        }

        _fragmentList.EndUpdate();
    }
}
