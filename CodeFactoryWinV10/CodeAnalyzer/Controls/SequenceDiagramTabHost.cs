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
    private readonly Panel _contentPanel = new() { Dock = DockStyle.Fill };

    public SequenceDiagramTabHost()
    {
        InitializeComponent();
        Controls.Remove(_tabs);
        Controls.Remove(_messageLabel);
        _contentPanel.Controls.Add(_tabs);
        _contentPanel.Controls.Add(_messageLabel);
        Controls.Add(_contentPanel);
        Controls.Add(_bannerLabel);
    }

    public void SetLoading(string message)
    {
        _document = null;
        _loadedDocumentSignature = null;
        _tabs.Visible = false;
        ClearTabs();
        _bannerLabel.Visible = false;
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

        if (document is null || document.Panels.Count == 0)
        {
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
            _bannerLabel.BringToFront();
        }
        else
        {
            _bannerLabel.Visible = false;
        }

        BuildAllTabs();
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

    private void BuildAllTabs()
    {
        if (_document is null)
        {
            return;
        }

        _tabSlots.Clear();
        EnsureTabSelectHandler();

        for (var index = 0; index < _document.Panels.Count; index++)
        {
            var panel = _document.Panels[index];
            var tab = new TabPage(FormatTabTitle(panel, index, _document.Panels.Count))
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
                GlobalIndex = index,
                Panel = panel,
                TabPage = tab
            });
        }

        if (_tabs.TabPages.Count > 0)
        {
            _tabs.SelectedIndex = 0;
        }

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

            tab.Dispose();
        }

        _tabSlots.Clear();
        _tabs.TabPages.Clear();
    }

    private static string CreateDocumentSignature(SequenceDiagramDocument document)
    {
        var panelSignatures = document.Panels.Select(panel =>
            string.Join('',
                panel.Title,
                panel.Diagram.ParticipantIds.Count,
                panel.Diagram.Messages.Count));
        return string.Join('', document.Panels.Count, string.Join('', panelSignatures));
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
