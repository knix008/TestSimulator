using System.Runtime.CompilerServices;
using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

internal partial class SequenceDiagramTabHost : UserControl
{
    private sealed class SequenceTabSlot
    {
        public required int GlobalIndex { get; init; }
        public required SequenceDiagramPanel Panel { get; init; }
        public required TabPage TabPage { get; init; }
        public bool IsLoaded { get; set; }
    }

    private SequenceDiagramDocument? _document;
    private readonly List<SequenceTabSlot> _tabSlots = [];
    private string? _loadedDocumentSignature;
    private bool _tabSelectHandlerAttached;
    private readonly Panel _headerPanel = new()
    {
        Dock = DockStyle.Top,
        AutoSize = true,
        AutoSizeMode = AutoSizeMode.GrowAndShrink
    };

    public SequenceDiagramTabHost()
    {
        InitializeComponent();
        _headerPanel.Controls.Add(_pager);
        _headerPanel.Controls.Add(_bannerLabel);
        Controls.Add(_headerPanel);
        _headerPanel.BringToFront();
        _pager.PageChanged += RebuildTabsForCurrentPage;
    }

    public void SetLoading(string message)
    {
        _document = null;
        _loadedDocumentSignature = null;
        _pager.Configure(0);
        _tabs.Visible = false;
        ClearTabs();
        _bannerLabel.Visible = false;
        SyncHeaderState();
        _messageLabel.Text = message;
        _messageLabel.Visible = true;
    }

    public void SetEmpty(string message) => SetLoading(message);

    public void SetDocument(SequenceDiagramDocument? document)
    {
        var signature = document is null ? string.Empty : CreateDocumentSignature(document);
        if (signature == _loadedDocumentSignature && _tabSlots.Count > 0)
        {
            return;
        }

        _document = document;
        _loadedDocumentSignature = signature;
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
            SyncHeaderState();
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
        SyncHeaderState();
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

    private void SyncHeaderState()
    {
        _pager.EnsureVisibleState();
        _headerPanel.Visible = _bannerLabel.Visible || _pager.Visible;
        _headerPanel.BringToFront();
    }

    private void RebuildTabsForCurrentPage()
    {
        if (_document is null || _document.Panels.Count == 0)
        {
            return;
        }

        var (startIndex, count) = _pager.GetCurrentPageSlice();
        _tabs.SuspendLayout();
        ClearTabs();
        _tabs.TabPages.Clear();
        _tabSlots.Clear();
        EnsureTabSelectHandler();

        for (var offset = 0; offset < count; offset++)
        {
            var globalIndex = startIndex + offset;
            var panel = _document.Panels[globalIndex];
            var tab = new TabPage(FormatTabTitle(panel, globalIndex, _document.Panels.Count))
            {
                Padding = new Padding(4),
                ToolTipText = panel.Title
            };
            tab.Controls.Add(new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = Color.White
            });
            _tabs.TabPages.Add(tab);
            _tabSlots.Add(new SequenceTabSlot
            {
                GlobalIndex = globalIndex,
                Panel = panel,
                TabPage = tab
            });
        }

        if (_tabs.TabPages.Count > 0)
        {
            _tabs.SelectedIndex = 0;
        }

        _tabs.ResumeLayout();
        EnsureSelectedTabLoaded();
    }

    private void EnsureTabSelectHandler()
    {
        if (_tabSelectHandlerAttached)
        {
            return;
        }

        _tabs.SelectedIndexChanged += (_, _) => EnsureSelectedTabLoaded();
        _tabSelectHandlerAttached = true;
    }

    private void EnsureSelectedTabLoaded()
    {
        if (_tabs.SelectedIndex < 0 || _tabs.SelectedIndex >= _tabSlots.Count)
        {
            return;
        }

        var slot = _tabSlots[_tabs.SelectedIndex];
        if (slot.IsLoaded)
        {
            return;
        }

        var viewer = new SequenceDiagramPanelViewer
        {
            Dock = DockStyle.Fill
        };
        viewer.SetPanel(slot.Panel);
        slot.TabPage.Controls.Clear();
        slot.TabPage.Controls.Add(viewer);
        slot.IsLoaded = true;
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

        _tabSlots.Clear();
        _tabs.TabPages.Clear();
    }

    private static string CreateDocumentSignature(SequenceDiagramDocument document)
    {
        var panelSignatures = document.Panels.Select(panel =>
            string.Join('\u001f',
                panel.Title,
                panel.Diagram.ParticipantIds.Count,
                panel.Diagram.Messages.Count));
        return string.Join('\u001e', document.Panels.Count, string.Join('\u001d', panelSignatures));
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
