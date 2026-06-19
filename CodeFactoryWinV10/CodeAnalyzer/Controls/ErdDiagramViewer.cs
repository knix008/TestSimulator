using CodeAnalyzer.Models;
using CodeAnalyzer.Services;
using System.Linq;

namespace CodeAnalyzer.Controls;

public sealed class ErdDiagramViewer : UserControl
{
    private DatabaseSchemaResult? _schema;
    private ConnectionLineStyle _lineStyle = ConnectionLineStyle.Orthogonal;
    private bool _isAnalyzing;
    private Size _contentSize = new(480, 320);
    private readonly List<DiagramBoxNode> _boxes = [];
    private readonly List<DatabaseRelation> _relations = [];
    private readonly Dictionary<string, DiagramBoxNode> _boxMap = new(StringComparer.Ordinal);
    private readonly DiagramZoomController _zoom = new();
    private readonly DiagramScrollPan _pan = new();
    private string? _selectedTableId;
    private bool _buildError;
    private int _lastLayoutWidth;
    private int _rebuildGeneration;
    private DatabaseSchemaResult? _lastBuiltSchema;
    private int _lastBuiltLayoutWidth;

    public ErdDiagramViewer()
    {
        DoubleBuffered = true;
        SetStyle(ControlStyles.ResizeRedraw, true);
        BackColor = Color.White;
        AutoScroll = true;
    }

    public ConnectionLineStyle LineStyle
    {
        get => _lineStyle;
        set
        {
            if (_lineStyle == value)
            {
                return;
            }

            _lineStyle = value;
            _zoom.InvalidateCache();
            Invalidate();
        }
    }

    public void SetSchema(DatabaseSchemaResult? schema)
    {
        _schema = schema;
        _selectedTableId = null;
        _buildError = false;
        ViewFailureReporter.Clear(this);
        _ = RebuildInBackgroundAsync();
    }

    public void BeginAnalysis()
    {
        _zoom.Reset();
        _isAnalyzing = true;
        _buildError = false;
        ViewFailureReporter.Clear(this);
        _schema = null;
        _boxes.Clear();
        _relations.Clear();
        _boxMap.Clear();
        _contentSize = new Size(480, 320);
        _zoom.ApplyContentSize(this, _contentSize);
        Invalidate();
    }

    public void EndAnalysis() => _isAnalyzing = false;

    public void ResetView()
    {
        _zoom.Reset();
        _zoom.ApplyContentSize(this, _contentSize);
        AutoScrollPosition = new Point(0, 0);
        Invalidate();
    }

    public Bitmap? ExportToBitmap()
    {
        if (_boxes.Count == 0)
        {
            return null;
        }

        var w = Math.Max(1, _contentSize.Width);
        var h = Math.Max(1, _contentSize.Height);
        var bmp = new Bitmap(w, h, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        g.Clear(Color.White);
        DrawDiagram(g);
        return bmp;
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        e.Graphics.Clear(BackColor);
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

    protected override void OnScroll(ScrollEventArgs se)
    {
        base.OnScroll(se);
        Invalidate();
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        RelayoutIfNeeded();
    }

    private void RelayoutIfNeeded()
    {
        var w = ClientSize.Width;
        if (_boxes.Count == 0 || w == _lastLayoutWidth)
        {
            _zoom.ApplyContentSize(this, _contentSize);
            return;
        }

        _lastLayoutWidth = w;
        _contentSize = ErdDiagramRenderer.Layout(_boxes, _relations, w);
        _zoom.ApplyContentSize(this, _contentSize);
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        if (_isAnalyzing)
        {
            DrawCenteredMessage(e.Graphics, "DB ERD 생성 중...");
            return;
        }

        if (_buildError)
        {
            DrawCenteredMessage(
                e.Graphics,
                ViewFailureReporter.FormatCanvasMessage(
                    ViewFailureReporter.GetLastException(this),
                    "DB ERD 구성"));
            return;
        }

        if (_boxes.Count == 0)
        {
            DrawCenteredMessage(
                e.Graphics,
                _schema is null
                    ? "분석 후 DB ERD가 표시됩니다.\n(Java JPA · JS/TS Prisma/TypeORM · .sql)"
                    : "추출된 테이블이 없습니다.\nJPA @Entity · Prisma model · TypeORM · CREATE TABLE SQL을 확인하세요.");
            return;
        }

        try
        {
            _zoom.PaintDocument(e.Graphics, this, e.ClipRectangle, _contentSize, BackColor, DrawDiagram);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
        {
            ViewFailureReporter.Report(this, DiagramViewDisplayNames.Get(DiagramViewKind.DatabaseErd), "표시", ex);
            DrawCenteredMessage(
                e.Graphics,
                ViewFailureReporter.FormatCanvasMessage(ex, "DB ERD 표시"));
        }
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (_isAnalyzing)
        {
            return;
        }

        _pan.Begin(e, this);
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        var blockSelection = _pan.End(this);
        base.OnMouseUp(e);

        if (blockSelection || e.Button != MouseButtons.Left || _isAnalyzing)
        {
            return;
        }

        var docPoint = _zoom.ClientToDocument(this, e.Location);
        var hit = _boxes.FirstOrDefault(box => box.Bounds.Contains(docPoint));
        if (hit is null)
        {
            return;
        }

        _selectedTableId = hit.Id;
        Invalidate();
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        if (_pan.HandleMove(e, this, _zoom, _contentSize))
        {
            Invalidate();
            return;
        }

        base.OnMouseMove(e);
    }

    protected override void OnMouseClick(MouseEventArgs e)
    {
        if (_pan.ShouldBlockClick(e.Location))
        {
            return;
        }

        _pan.AcknowledgeClick();
        base.OnMouseClick(e);
    }

    protected override void OnMouseDoubleClick(MouseEventArgs e)
    {
        if (_pan.ShouldBlockClick(e.Location))
        {
            return;
        }

        _pan.AcknowledgeClick();
        base.OnMouseDoubleClick(e);

        if (e.Button != MouseButtons.Left)
        {
            return;
        }

        var docPoint = _zoom.ClientToDocument(this, e.Location);
        var hit = _boxes.FirstOrDefault(box => box.Bounds.Contains(docPoint));
        if (hit is null)
        {
            return;
        }

        _selectedTableId = hit.Id;
        Invalidate();

        if (_schema?.TableMap.TryGetValue(hit.Id, out var table) == true)
        {
            SourceFileOpener.TryOpen(table.FilePath, table.LineNumber);
        }
    }

    private async Task RebuildInBackgroundAsync()
    {
        var generation = ++_rebuildGeneration;
        var layoutWidth = ClientSize.Width > 0 ? ClientSize.Width : 480;
        var title = DiagramViewDisplayNames.Get(DiagramViewKind.DatabaseErd);

        if (_schema is null || _schema.Tables.Count == 0)
        {
            _lastBuiltSchema = null;
            ApplyEmptyBuild();
            return;
        }

        if (ReferenceEquals(_schema, _lastBuiltSchema)
            && layoutWidth == _lastBuiltLayoutWidth
            && _boxes.Count > 0
            && !_buildError)
        {
            return;
        }

        var session = new ErdDiagramBuildSession
        {
            Schema = _schema,
            LayoutWidth = layoutWidth
        };

        try
        {
            var built = await ViewProgressRunner.RunBackgroundAsync(
                FindForm(),
                title,
                _ => BuildSession(session)).ConfigureAwait(true);

            if (generation != _rebuildGeneration || IsDisposed)
            {
                return;
            }

            ApplyBuildSession(built);
            _lastBuiltSchema = _schema;
            _lastBuiltLayoutWidth = layoutWidth;
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
        {
            if (generation != _rebuildGeneration || IsDisposed)
            {
                return;
            }

            ApplyBuildFailure(ex);
        }
    }

    private void ApplyEmptyBuild()
    {
        _boxes.Clear();
        _relations.Clear();
        _boxMap.Clear();
        _buildError = false;
        _contentSize = new Size(480, 320);
        _zoom.ApplyContentSize(this, _contentSize);
        Invalidate();
    }

    private void ApplyBuildSession(ErdDiagramBuildSession session)
    {
        _boxes.Clear();
        _boxes.AddRange(session.Boxes);
        _relations.Clear();
        _relations.AddRange(session.Relations);
        _boxMap.Clear();
        foreach (var pair in session.BoxMap)
        {
            _boxMap[pair.Key] = pair.Value;
        }

        _buildError = session.BuildError;
        ViewFailureReporter.Clear(this);

        if (session.Error is not null)
        {
            _buildError = true;
            _boxes.Clear();
            _relations.Clear();
            _boxMap.Clear();
            _contentSize = new Size(480, 320);
            _zoom.ApplyContentSize(this, _contentSize);
            ViewFailureReporter.Report(this, DiagramViewDisplayNames.Get(DiagramViewKind.DatabaseErd), "구성", session.Error);
        }
        else
        {
            _contentSize = session.ContentSize;
            _lastLayoutWidth = session.LayoutWidth;
            _zoom.ApplyContentSize(this, _contentSize);
        }

        Invalidate();
    }

    private void ApplyBuildFailure(Exception ex)
    {
        _buildError = true;
        _boxes.Clear();
        _relations.Clear();
        _boxMap.Clear();
        _contentSize = new Size(480, 320);
        _zoom.ApplyContentSize(this, _contentSize);
        ViewFailureReporter.Report(this, DiagramViewDisplayNames.Get(DiagramViewKind.DatabaseErd), "구성", ex);
        Invalidate();
    }

    private static ErdDiagramBuildSession BuildSession(ErdDiagramBuildSession session)
    {
        try
        {
            ViewProgressReporter.Report(20, "테이블 노드를 구성하는 중...");
            foreach (var table in session.Schema!.Tables.Where(t => t.SourceKind != "sql-detected"))
            {
                var box = ErdDiagramRenderer.CreateTableBox(table);
                session.Boxes.Add(box);
                session.BoxMap[box.Id] = box;
            }

            ViewProgressReporter.Report(70, "관계를 구성하는 중...");
            session.Relations.AddRange(session.Schema.Relations);
            ViewProgressReporter.Report(90, "ERD 레이아웃을 계산하는 중...");
            session.ContentSize = ErdDiagramRenderer.Layout(session.Boxes, session.Relations, session.LayoutWidth);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
        {
            session.BuildError = true;
            session.Error = ex;
            session.Boxes.Clear();
            session.Relations.Clear();
            session.BoxMap.Clear();
            session.ContentSize = new Size(480, 320);
        }

        return session;
    }

    private void Rebuild()
    {
        _ = RebuildInBackgroundAsync();
    }

    private void DrawDiagram(Graphics graphics)
    {
        foreach (var edge in _relations)
        {
            if (!_boxMap.TryGetValue(edge.FromTableId, out var from)
                || !_boxMap.TryGetValue(edge.ToTableId, out var to))
            {
                continue;
            }

            var childIsMany = _schema is null || DatabaseRelationCardinalityResolver.IsChildMany(_schema, edge);
            var parentIsMany = _schema is not null && DatabaseRelationCardinalityResolver.IsParentMany(_schema, edge);

            ErdDiagramRenderer.DrawRelation(graphics, from, to, edge.Label, _lineStyle, childIsMany, parentIsMany);
        }

        foreach (var box in _boxes)
        {
            var isSelected = string.Equals(box.Id, _selectedTableId, StringComparison.Ordinal);
            ErdDiagramRenderer.DrawTable(graphics, box, isHighlight: isSelected, isCurrent: isSelected);
        }
    }

    private void DrawCenteredMessage(Graphics graphics, string message)
    {
        using var font = new Font(Font.FontFamily, 10f);
        using var brush = new SolidBrush(Color.FromArgb(80, 90, 110));
        var lines = message.Split('\n');
        var lineHeight = font.Height + 4;
        var totalHeight = lines.Length * lineHeight;
        var y = Math.Max(24, (Height - totalHeight) / 2);

        foreach (var line in lines)
        {
            var size = graphics.MeasureString(line, font);
            var x = Math.Max(12, (Width - size.Width) / 2f);
            graphics.DrawString(line, font, brush, x, y);
            y += lineHeight;
        }
    }
}
