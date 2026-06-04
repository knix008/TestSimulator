using CodeAnalyzer.Models;

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
    private string? _selectedTableId;

    public event Action<MetricsNavigationRequest>? NavigationRequested;

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
            _lineStyle = value;
            Invalidate();
        }
    }

    public void SetSchema(DatabaseSchemaResult? schema)
    {
        _schema = schema;
        _selectedTableId = null;
        Rebuild();
    }

    public void BeginAnalysis()
    {
        _zoom.Reset();
        _isAnalyzing = true;
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
        }

        base.OnMouseWheel(e);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        if (_isAnalyzing)
        {
            DrawCenteredMessage(e.Graphics, "DB ERD 생성 중...");
            return;
        }

        if (_boxes.Count == 0)
        {
            DrawCenteredMessage(
                e.Graphics,
                _schema is null
                    ? "분석 후 DB ERD가 표시됩니다.\n(.sql, EF Core, SQL 문자열 지원)"
                    : "추출된 테이블이 없습니다.\nCREATE TABLE·EF DbContext·마이그레이션 SQL을 확인하세요.");
            return;
        }

        _zoom.PaintDocument(e.Graphics, this, e.ClipRectangle, _contentSize, BackColor, DrawDiagram);
    }

    protected override void OnMouseClick(MouseEventArgs e)
    {
        base.OnMouseClick(e);

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

        if (e.Clicks >= 2 && _schema?.TableMap.TryGetValue(hit.Id, out var table) == true
            && !string.IsNullOrWhiteSpace(table.FilePath))
        {
            NavigationRequested?.Invoke(new MetricsNavigationRequest
            {
                FilePath = table.FilePath,
                LineNumber = table.LineNumber
            });
        }
    }

    private void Rebuild()
    {
        _boxes.Clear();
        _relations.Clear();
        _boxMap.Clear();

        if (_schema is null || _schema.Tables.Count == 0)
        {
            _contentSize = new Size(480, 320);
            _zoom.ApplyContentSize(this, _contentSize);
            Invalidate();
            return;
        }

        foreach (var table in _schema.Tables)
        {
            var box = ErdDiagramRenderer.CreateTableBox(table);
            _boxes.Add(box);
            _boxMap[box.Id] = box;
        }

        _relations.AddRange(_schema.Relations);
        _contentSize = ErdDiagramRenderer.Layout(_boxes, _relations);
        _zoom.ApplyContentSize(this, _contentSize);
        Invalidate();
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

            ErdDiagramRenderer.DrawRelation(graphics, from, to, edge.Label, _lineStyle);
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
