using System.Drawing.Drawing2D;
using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

internal sealed class SequenceDiagramPanelViewer : UserControl
{
    private SequenceDiagramPanel? _panel;
    private Size _contentSize = new(400, 300);
    private readonly DiagramZoomController _zoom = new();

    public SequenceDiagramPanelViewer()
    {
        DoubleBuffered = true;
        SetStyle(ControlStyles.ResizeRedraw, true);
        BackColor = Color.White;
        AutoScroll = true;
        _zoom.SetMaxZoom(4f);
    }

    public void SetPanel(SequenceDiagramPanel? panel)
    {
        _panel = panel;
        _zoom.Reset();
        _zoom.InvalidateCache();

        if (panel is null)
        {
            _contentSize = new Size(400, 300);
            _zoom.ApplyContentSize(this, _contentSize);
            Invalidate();
            return;
        }

        try
        {
            var measured = UmlSequenceDiagramRenderer.MeasurePanel(panel);
            _contentSize = new Size(
                Math.Min(measured.Width, AnalysisScaleLimits.MaxSequenceDiagramCacheDimension),
                measured.Height);
            _zoom.ApplyContentSize(this, _contentSize);
        }
        catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
        {
            _panel = null;
            _contentSize = new Size(400, 300);
            _zoom.ApplyContentSize(this, _contentSize);
            ViewFailureReporter.Report(this, DiagramViewDisplayNames.Get(DiagramViewKind.SequenceDiagram), "구성", ex);
        }

        Invalidate();
    }

    public void ResetView()
    {
        _zoom.Reset();
        _zoom.ApplyContentSize(this, _contentSize);
        AutoScrollPosition = new Point(0, 0);
        Invalidate();
    }

    public Bitmap? ExportToBitmap()
    {
        if (_panel is null)
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

    protected override void OnMouseWheel(MouseEventArgs e)
    {
        if (_zoom.HandleMouseWheel(this, e, _contentSize))
        {
            Invalidate();
            return;
        }

        base.OnMouseWheel(e);
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        using var brush = new SolidBrush(BackColor);
        e.Graphics.FillRectangle(brush, e.ClipRectangle);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;

        if (_panel is null)
        {
            DrawMessage(e.Graphics, "표시할 시퀀스 다이어그램이 없습니다.");
            return;
        }

        try
        {
            _zoom.PaintDocument(
                e.Graphics,
                this,
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

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        _zoom.ApplyContentSize(this, _contentSize);
    }

    private void DrawContent(Graphics graphics)
    {
        if (_panel is null)
        {
            return;
        }

        UmlSequenceDiagramRenderer.DrawSinglePanel(graphics, _panel);
    }

    private static void DrawMessage(Graphics graphics, string message)
    {
        using var font = new Font("Segoe UI", 10f);
        using var brush = new SolidBrush(Color.FromArgb(100, 110, 125));
        graphics.DrawString(message, font, brush, 12, 12);
    }
}
