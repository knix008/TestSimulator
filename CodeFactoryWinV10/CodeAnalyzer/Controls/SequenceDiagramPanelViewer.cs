using System.Drawing.Drawing2D;
using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

internal sealed class SequenceDiagramPanelViewer : UserControl
{
    private SequenceDiagramPanel? _sourcePanel;
    private SequenceDiagramPanel? _displayPanel;
    private Size _contentSize = new(400, 300);
    private readonly DiagramZoomController _zoom = new();
    private readonly EntryPointTabPager _messagePager = new();
    private readonly Panel _headerPanel = new()
    {
        Dock = DockStyle.Top,
        AutoSize = true,
        AutoSizeMode = AutoSizeMode.GrowAndShrink
    };
    private readonly DiagramScrollSurface _scrollSurface = new();

    public SequenceDiagramPanelViewer()
    {
        DoubleBuffered = true;
        SetStyle(ControlStyles.ResizeRedraw, true);
        BackColor = Color.White;
        AutoScroll = false;
        _zoom.SetMaxZoom(4f);

        _messagePager.Visible = false;
        _messagePager.Dock = DockStyle.Top;
        _messagePager.PageChanged += () => ApplyMessagePage(resetZoom: true);

        _scrollSurface.Dock = DockStyle.Fill;
        _scrollSurface.BackColor = Color.White;
        _scrollSurface.PaintDiagram += OnScrollSurfacePaint;
        _scrollSurface.MouseWheel += OnScrollSurfaceMouseWheel;

        _headerPanel.Controls.Add(_messagePager);
        Controls.Add(_scrollSurface);
        Controls.Add(_headerPanel);
        _headerPanel.BringToFront();
    }

    public void SetPanel(SequenceDiagramPanel? panel)
    {
        _sourcePanel = panel;
        _displayPanel = null;
        _zoom.Reset();
        _zoom.InvalidateCache();

        if (panel is null)
        {
            SyncMessagePager(0);
            _contentSize = new Size(400, 300);
            _zoom.ApplyContentSize(_scrollSurface, _contentSize);
            _scrollSurface.Invalidate();
            Invalidate();
            return;
        }

        try
        {
            SyncMessagePager(panel.Diagram.Messages.Count);
            ApplyMessagePage(resetZoom: false);
        }
        catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
        {
            _sourcePanel = null;
            _displayPanel = null;
            SyncMessagePager(0);
            _contentSize = new Size(400, 300);
            _zoom.ApplyContentSize(_scrollSurface, _contentSize);
            ViewFailureReporter.Report(this, DiagramViewDisplayNames.Get(DiagramViewKind.SequenceDiagram), "구성", ex);
        }

        _scrollSurface.Invalidate();
        Invalidate();
    }

    public void ResetView()
    {
        _zoom.Reset();
        _zoom.ApplyContentSize(_scrollSurface, _contentSize);
        _scrollSurface.AutoScrollPosition = new Point(0, 0);
        _scrollSurface.Invalidate();
        SyncMessagePagerState();
    }

    public Bitmap? ExportToBitmap()
    {
        if (_displayPanel is null)
        {
            return null;
        }

        var w = Math.Max(1, Math.Min(_contentSize.Width, AnalysisScaleLimits.MaxSequenceDiagramCacheDimension));
        var h = Math.Max(1, Math.Min(_contentSize.Height, AnalysisScaleLimits.MaxSequenceDiagramCacheDimension));
        if ((long)w * h > 64L * 1024 * 1024)
        {
            return null;
        }

        var bmp = new Bitmap(w, h, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Color.White);
        DrawContent(g);
        return bmp;
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        using var brush = new SolidBrush(BackColor);
        e.Graphics.FillRectangle(brush, e.ClipRectangle);
    }

    private void OnScrollSurfacePaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;

        if (_displayPanel is null)
        {
            DrawMessage(e.Graphics, "표시할 시퀀스 다이어그램이 없습니다.");
            return;
        }

        try
        {
            _zoom.PaintDocument(
                e.Graphics,
                _scrollSurface,
                e.ClipRectangle,
                _contentSize,
                BackColor,
                DrawContent,
                useDocumentCache: false);
        }
        catch (OutOfMemoryException ex)
        {
            ViewFailureReporter.Report(this, DiagramViewDisplayNames.Get(DiagramViewKind.SequenceDiagram), "표시", ex);
            DrawMessage(e.Graphics, ViewFailureReporter.FormatCanvasMessage(ex, "시퀀스 다이어그램 표시"));
        }
        catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
        {
            ViewFailureReporter.Report(this, DiagramViewDisplayNames.Get(DiagramViewKind.SequenceDiagram), "표시", ex);
            DrawMessage(e.Graphics, ViewFailureReporter.FormatCanvasMessage(ex, "시퀀스 다이어그램 표시"));
        }
    }

    private void OnScrollSurfaceMouseWheel(object? sender, MouseEventArgs e)
    {
        if (_zoom.HandleMouseWheel(_scrollSurface, e, _contentSize))
        {
            _scrollSurface.Invalidate();
        }
    }

    private void ApplyMessagePage(bool resetZoom)
    {
        if (_sourcePanel is null)
        {
            _displayPanel = null;
            _contentSize = new Size(400, 300);
            _zoom.ApplyContentSize(_scrollSurface, _contentSize);
            return;
        }

        var pageDiagram = SequenceDiagramMessagePaginator.CreatePage(_sourcePanel.Diagram, _messagePager.PageIndex);
        var layout = UmlSequenceDiagramRenderer.BuildLayout(pageDiagram);
        _displayPanel = new SequenceDiagramPanel
        {
            RootId = _sourcePanel.RootId,
            Title = _sourcePanel.Title,
            Diagram = pageDiagram,
            Layout = layout,
            LayoutSize = layout.DiagramSize
        };

        var measured = UmlSequenceDiagramRenderer.MeasurePanel(_displayPanel);
        _contentSize = new Size(
            Math.Min(measured.Width, AnalysisScaleLimits.MaxSequenceDiagramCacheDimension),
            measured.Height);

        if (resetZoom)
        {
            _zoom.Reset();
            _scrollSurface.AutoScrollPosition = new Point(0, 0);
        }

        _zoom.InvalidateCache();
        _zoom.ApplyContentSize(_scrollSurface, _contentSize);
        SyncMessagePagerState();
        _scrollSurface.Invalidate();
    }

    private void SyncMessagePager(int messageCount)
    {
        var preserveIndex = _messagePager.Visible
            ? _messagePager.PageIndex * AnalysisScaleLimits.MaxSequenceDiagramMessagesPerPage
            : (int?)null;
        _messagePager.Configure(
            messageCount,
            AnalysisScaleLimits.MaxSequenceDiagramMessagesPerPage,
            "메시지",
            preserveIndex,
            oneBasedRangeLabels: true);
        _headerPanel.Visible = _messagePager.Visible;
        _headerPanel.BringToFront();
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        SyncMessagePagerState();
    }

    private void SyncMessagePagerState()
    {
        if (_sourcePanel is null)
        {
            return;
        }

        _messagePager.EnsureVisibleState();
        _headerPanel.Visible = _messagePager.Visible;
        _headerPanel.BringToFront();
    }

    private void DrawContent(Graphics graphics)
    {
        if (_displayPanel is null)
        {
            return;
        }

        UmlSequenceDiagramRenderer.DrawSinglePanel(graphics, _displayPanel);
    }

    private static void DrawMessage(Graphics graphics, string message)
    {
        using var font = new Font("Segoe UI", 10f);
        using var brush = new SolidBrush(Color.FromArgb(100, 110, 125));
        graphics.DrawString(message, font, brush, 12, 12);
    }

    private sealed class DiagramScrollSurface : Panel
    {
        public event Action<PaintEventArgs>? PaintDiagram;

        public DiagramScrollSurface()
        {
            DoubleBuffered = true;
            AutoScroll = true;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
        }

        protected override void OnPaintBackground(PaintEventArgs e)
        {
            using var brush = new SolidBrush(BackColor);
            e.Graphics.FillRectangle(brush, e.ClipRectangle);
        }

        protected override void OnPaint(PaintEventArgs e) => PaintDiagram?.Invoke(e);
    }
}
