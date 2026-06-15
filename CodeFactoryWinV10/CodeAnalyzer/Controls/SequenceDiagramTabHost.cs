using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

internal partial class SequenceDiagramTabHost : UserControl
{
    private SequenceDiagramDocument? _document;

    public SequenceDiagramTabHost()
    {
        InitializeComponent();
        _pager.PageChanged += RebuildTabsForCurrentPage;
    }

    public void SetLoading(string message)
    {
        _document = null;
        _pager.Configure(0);
        _tabs.Visible = false;
        ClearTabs();
        _bannerLabel.Visible = false;
        _messageLabel.Text = message;
        _messageLabel.Visible = true;
    }

    public void SetEmpty(string message) => SetLoading(message);

    public void SetDocument(SequenceDiagramDocument? document)
    {
        _document = document;
        _tabs.SuspendLayout();
        ClearTabs();
        _tabs.TabPages.Clear();

        if (document is null || document.Panels.Count == 0)
        {
            _pager.Configure(0);
            _tabs.Visible = false;
            _bannerLabel.Visible = false;
            _messageLabel.Text =
                "시퀀스 다이어그램을 표시할 호출 경로가 없습니다.\n호출 그래프에 진입점이 없거나 분석 결과가 비어 있습니다.";
            _messageLabel.Visible = true;
            _tabs.ResumeLayout();
            return;
        }

        _messageLabel.Visible = false;

        if (!string.IsNullOrWhiteSpace(document.TruncationNote))
        {
            _bannerLabel.Text = document.TruncationNote;
            _bannerLabel.Visible = true;
        }
        else
        {
            _bannerLabel.Visible = false;
        }

        _pager.Configure(document.Panels.Count);
        RebuildTabsForCurrentPage();
        _tabs.Visible = true;
        _tabs.ResumeLayout();
    }

    public void ResetView()
    {
        if (_tabs.SelectedTab?.Controls.Count > 0
            && _tabs.SelectedTab.Controls[0] is SequenceDiagramPanelViewer viewer)
        {
            viewer.ResetView();
        }
    }

    public Bitmap? ExportActiveTabBitmap()
    {
        if (_tabs.SelectedTab?.Controls.Count > 0
            && _tabs.SelectedTab.Controls[0] is SequenceDiagramPanelViewer viewer)
        {
            return viewer.ExportToBitmap();
        }

        return null;
    }

    private void RebuildTabsForCurrentPage()
    {
        if (_document is null || _document.Panels.Count == 0)
        {
            return;
        }

        using var _ = ViewProgressScope.BeginIfNeeded(
            FindForm(),
            DiagramViewDisplayNames.Get(DiagramViewKind.SequenceDiagram));

        var (startIndex, count) = _pager.GetCurrentPageSlice();
        _tabs.SuspendLayout();
        ClearTabs();
        _tabs.TabPages.Clear();

        for (var offset = 0; offset < count; offset++)
        {
            var globalIndex = startIndex + offset;
            ViewProgressReporter.ReportStep(
                offset,
                count,
                $"시퀀스 다이어그램 탭을 구성하는 중... ({globalIndex + 1}/{_document.Panels.Count})");

            var panel = _document.Panels[globalIndex];
            var viewer = new SequenceDiagramPanelViewer
            {
                Dock = DockStyle.Fill
            };
            viewer.SetPanel(panel);

            var tab = new TabPage(FormatTabTitle(panel, globalIndex, _document.Panels.Count))
            {
                Padding = new Padding(4),
                ToolTipText = panel.Title
            };
            tab.Controls.Add(viewer);
            _tabs.TabPages.Add(tab);
        }

        if (_tabs.TabPages.Count > 0)
        {
            _tabs.SelectedIndex = 0;
        }

        _tabs.ResumeLayout();
    }

    private void ClearTabs()
    {
        foreach (TabPage tab in _tabs.TabPages)
        {
            foreach (Control control in tab.Controls)
            {
                control.Dispose();
            }
        }

        _tabs.TabPages.Clear();
    }

    private static string FormatTabTitle(SequenceDiagramPanel panel, int index, int total)
    {
        var title = panel.Title;
        if (title.Length > 36)
        {
            title = title[..33] + "...";
        }

        return total > 1 ? $"{index + 1}. {title}" : title;
    }
}
