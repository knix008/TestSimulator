using CodeAnalyzer.Models;
using CodeAnalyzer.Services.Duplicates;

namespace CodeAnalyzer.Controls;

public sealed class DuplicateCodeViewer : UserControl
{
    private readonly SplitContainer _mainSplit = new()
    {
        Dock = DockStyle.Fill,
        Orientation = Orientation.Horizontal,
        SplitterDistance = 240
    };

    private readonly SplitContainer _listSplit = new()
    {
        Dock = DockStyle.Fill,
        Orientation = Orientation.Vertical,
        SplitterDistance = 260
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

    private readonly TabControl _previewTabs = new() { Dock = DockStyle.Fill };
    private readonly TextBox _sourcePreview = CreatePreviewBox();
    private readonly TextBox _duplicatePreview = CreatePreviewBox();
    private readonly TextBox _locationPreview = CreatePreviewBox();
    private readonly TextBox _comparePreview = CreatePreviewBox();

    private readonly Label _summaryLabel = new()
    {
        Dock = DockStyle.Top,
        Height = 44,
        Padding = new Padding(8, 6, 8, 4),
        AutoEllipsis = true
    };

    private readonly Button _openFileButton = new()
    {
        Text = "선택 위치 파일 열기",
        AutoSize = true,
        Enabled = false
    };

    private DuplicateCodeResult? _duplicates;
    private DuplicateCodeGroup? _selectedGroup;
    private DuplicateCodeFragment? _selectedFragment;
    private string? _projectRoot;
    private bool _isAnalyzing;
    private readonly ListViewColumnHeaderToolTip _groupListHeaderToolTip;
    private readonly ListViewColumnHeaderToolTip _fragmentListHeaderToolTip;

    public event Action<MetricsNavigationRequest>? NavigationRequested;

    public DuplicateCodeViewer()
    {
        DoubleBuffered = true;
        BackColor = Color.White;

        _groupList.Columns.Add("그룹", 90);
        _groupList.Columns.Add("줄 수", 52, HorizontalAlignment.Right);
        _groupList.Columns.Add("위치 수", 64, HorizontalAlignment.Right);
        _groupListHeaderToolTip = ListViewColumnHeaderToolTip.Attach(_groupList, ListViewHeaderToolTipTexts.DuplicateCodeGroup);
        _groupList.SelectedIndexChanged += (_, _) => ShowSelectedGroup();

        _fragmentList.Columns.Add("파일", 220);
        _fragmentList.Columns.Add("경로", 240);
        _fragmentList.Columns.Add("언어", 72);
        _fragmentList.Columns.Add("줄", 88, HorizontalAlignment.Right);
        _fragmentListHeaderToolTip = ListViewColumnHeaderToolTip.Attach(_fragmentList, ListViewHeaderToolTipTexts.DuplicateCodeFragment);
        _fragmentList.SelectedIndexChanged += (_, _) => ShowSelectedFragment();
        _fragmentList.DoubleClick += (_, _) => OpenSelectedFragment();

        _previewTabs.TabPages.Add(CreatePreviewTab("원본 소스", _sourcePreview));
        _previewTabs.TabPages.Add(CreatePreviewTab("중복 텍스트", _duplicatePreview));
        _previewTabs.TabPages.Add(CreatePreviewTab("모든 위치", _locationPreview));
        _previewTabs.TabPages.Add(CreatePreviewTab("위치 비교", _comparePreview));

        _openFileButton.Click += (_, _) => OpenSelectedFragment();
        var actionPanel = new Panel
        {
            Dock = DockStyle.Top,
            Height = 40,
            Padding = new Padding(8, 6, 8, 4)
        };
        _openFileButton.Location = new Point(8, 8);
        actionPanel.Controls.Add(_openFileButton);

        _listSplit.Panel1.Controls.Add(_groupList);
        _listSplit.Panel2.Controls.Add(_fragmentList);

        _mainSplit.Panel1.Controls.Add(_listSplit);
        _mainSplit.Panel2.Controls.Add(_previewTabs);
        _mainSplit.Panel2.Controls.Add(actionPanel);

        Controls.Add(_mainSplit);
        Controls.Add(_summaryLabel);

        Load += (_, _) => ApplySplitLayout();
        SizeChanged += (_, _) => ApplySplitLayout();
    }

    private void ApplySplitLayout()
    {
        ApplyMainSplitRatio();
        ApplyListSplitRatio();
    }

    private void ApplyMainSplitRatio()
    {
        var height = _mainSplit.Height;
        if (height <= _mainSplit.SplitterWidth + 20)
        {
            return;
        }

        const int listRowMin = 200;
        const int previewMin = 160;
        var maxDistance = height - previewMin - _mainSplit.SplitterWidth;
        if (maxDistance < listRowMin)
        {
            return;
        }

        var desired = Math.Clamp((int)(height * 0.38), listRowMin, Math.Min(340, maxDistance));
        if (Math.Abs(_mainSplit.SplitterDistance - desired) > 2)
        {
            _mainSplit.SplitterDistance = desired;
        }
    }

    private void ApplyListSplitRatio()
    {
        var width = _listSplit.Width;
        if (width <= _listSplit.SplitterWidth + 20)
        {
            return;
        }

        const int groupMin = 200;
        const int fragmentMin = 280;
        var maxDistance = width - fragmentMin - _listSplit.SplitterWidth;
        if (maxDistance < groupMin)
        {
            return;
        }

        var desired = Math.Clamp((int)(width * 0.34), groupMin, Math.Min(380, maxDistance));
        if (Math.Abs(_listSplit.SplitterDistance - desired) > 2)
        {
            _listSplit.SplitterDistance = desired;
        }
    }

    public void SetDuplicates(DuplicateCodeResult? duplicates, string? projectRoot = null)
    {
        _duplicates = duplicates;
        _projectRoot = projectRoot;
        RebuildGroupList();
    }

    public void BeginAnalysis()
    {
        _isAnalyzing = true;
        _duplicates = null;
        _selectedGroup = null;
        _selectedFragment = null;
        _groupList.Items.Clear();
        _fragmentList.Items.Clear();
        ClearPreview();
        _openFileButton.Enabled = false;
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
        ClearPreview();
        _selectedGroup = null;
        _selectedFragment = null;
        _openFileButton.Enabled = false;

        if (_duplicates is null || _duplicates.Groups.Count == 0)
        {
            _summaryLabel.Text = _isAnalyzing
                ? "중복 코드 분석 중..."
                : "표시할 중복 코드가 없습니다. 분석 실행 후 결과가 여기에 표시됩니다.";
            _groupList.EndUpdate();
            return;
        }

        var totalFragments = _duplicates.Groups.Sum(group => group.Fragments.Count);
        var duplicateLines = _duplicates.Groups.Sum(group =>
            group.LineCount * Math.Max(0, group.Fragments.Count - 1));
        _summaryLabel.Text =
            $"기준 {_duplicates.MinDuplicateLines}줄 이상(≥) 중복 · 그룹 {_duplicates.Groups.Count}건 · " +
            $"위치 {totalFragments}곳 · 중복 줄 {duplicateLines:N0} · 더블클릭/버튼: 파일 열기";

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
        _selectedFragment = null;
        _openFileButton.Enabled = false;

        if (_groupList.SelectedItems.Count == 0 || _groupList.SelectedItems[0].Tag is not DuplicateCodeGroup group)
        {
            _selectedGroup = null;
            ClearPreview();
            _fragmentList.EndUpdate();
            return;
        }

        _selectedGroup = group;
        var duplicateLines = group.DuplicateLines.Count > 0 ? group.DuplicateLines : group.SampleLines;
        _duplicatePreview.Text = DuplicateCodeSourceReader.FormatDuplicateLines(duplicateLines);
        _locationPreview.Text = DuplicateCodeSourceReader.FormatLocationSummary(group, _projectRoot);
        _comparePreview.Text = BuildComparisonPreview(group);

        foreach (var fragment in group.Fragments)
        {
            var displayPath = DuplicateCodeSourceReader.FormatDisplayPath(fragment.FilePath, _projectRoot);
            var item = new ListViewItem(Path.GetFileName(fragment.FilePath));
            item.SubItems.Add(displayPath);
            item.SubItems.Add(fragment.LanguageId);
            item.SubItems.Add($"{fragment.StartLine}-{fragment.EndLine}");
            item.Tag = fragment;
            _fragmentList.Items.Add(item);
        }

        if (_fragmentList.Items.Count > 0)
        {
            _fragmentList.Items[0].Selected = true;
        }
        else
        {
            _sourcePreview.Text = "(위치 없음)";
        }

        _fragmentList.EndUpdate();
    }

    private void ShowSelectedFragment()
    {
        if (_fragmentList.SelectedItems.Count == 0
            || _fragmentList.SelectedItems[0].Tag is not DuplicateCodeFragment fragment)
        {
            _selectedFragment = null;
            _openFileButton.Enabled = false;
            return;
        }

        _selectedFragment = fragment;
        _openFileButton.Enabled = File.Exists(fragment.FilePath);
        _sourcePreview.Text = DuplicateCodeSourceReader.FormatSourceBlock(fragment, _projectRoot);

        if (_selectedGroup is not null)
        {
            _comparePreview.Text = BuildComparisonPreview(_selectedGroup, fragment);
        }
    }

    private string BuildComparisonPreview(DuplicateCodeGroup group, DuplicateCodeFragment? focusFragment = null)
    {
        if (group.Fragments.Count < 2)
        {
            return "비교할 위치가 2곳 이상일 때 나란히 확인할 수 있습니다.";
        }

        var first = focusFragment ?? group.Fragments[0];
        var second = group.Fragments.FirstOrDefault(fragment => fragment.FilePath != first.FilePath
            || fragment.StartLine != first.StartLine)
            ?? group.Fragments[1];

        var left = DuplicateCodeSourceReader.FormatSourceBlock(first, _projectRoot);
        var right = DuplicateCodeSourceReader.FormatSourceBlock(second, _projectRoot);
        return
            "=== 위치 A ===" + Environment.NewLine + left + Environment.NewLine + Environment.NewLine +
            "=== 위치 B ===" + Environment.NewLine + right;
    }

    private void OpenSelectedFragment()
    {
        if (_selectedFragment is null)
        {
            return;
        }

        NavigationRequested?.Invoke(new MetricsNavigationRequest
        {
            FilePath = _selectedFragment.FilePath,
            LineNumber = _selectedFragment.StartLine
        });
    }

    private void ClearPreview()
    {
        _sourcePreview.Clear();
        _duplicatePreview.Clear();
        _locationPreview.Clear();
        _comparePreview.Clear();
    }

    private static TextBox CreatePreviewBox() => new()
    {
        Dock = DockStyle.Fill,
        Multiline = true,
        ReadOnly = true,
        ScrollBars = ScrollBars.Both,
        Font = new Font(FontFamily.GenericMonospace, 9f),
        BackColor = Color.FromArgb(248, 248, 252),
        BorderStyle = BorderStyle.None,
        WordWrap = false
    };

    private static TabPage CreatePreviewTab(string title, Control content)
    {
        var page = new TabPage(title) { Padding = new Padding(4) };
        page.Controls.Add(content);
        return page;
    }
}
