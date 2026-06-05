using MyDiagramWinV10.Models;
using MyDiagramWinV10.Rendering;

using System.ComponentModel;

namespace MyDiagramWinV10.Controls;

public enum ToolboxTool { Select, Shape, Connector }

public sealed class ToolboxSelectionChangedEventArgs(
    ToolboxTool tool, ShapeKind? shapeKind, ConnectorKind? connectorKind) : EventArgs
{
    public ToolboxTool Tool { get; } = tool;
    public ShapeKind? ShapeKind { get; } = shapeKind;
    public ConnectorKind? ConnectorKind { get; } = connectorKind;
}

public sealed class DiagramToolbox : UserControl
{
    private static readonly Color s_sidebarBg  = Color.FromArgb(250, 251, 253);
    private static readonly Color s_borderColor = Color.FromArgb(209, 213, 219);

    private readonly List<ToolboxTile> _tiles = [];
    private ToolboxTile? _selectedTile;
    private bool _initialized;

    public event EventHandler<ToolboxSelectionChangedEventArgs>? SelectionChanged;

    public DiagramToolbox()
    {
        DoubleBuffered = true;
        AutoScroll = true;
        BackColor = s_sidebarBg;
        Padding = new Padding(8, 6, 8, 10);
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        if (DesignMode || _initialized)
            return;

        _initialized = true;
        BuildTiles();
        LayoutTiles();
        Resize += (_, _) => LayoutTiles();
    }

    // ── Public API ────────────────────────────────────────────────────────
    public void SelectSelectTool()
    {
        // "선택" tile removed — no-op kept for API compatibility
    }

    public void SelectShapeTool(ShapeKind kind)
    {
        var tile = _tiles.FirstOrDefault(t => t.ShapeKind == kind);
        if (tile is not null) SelectTile(tile);
    }

    public void SelectConnectorTool(ConnectorKind kind)
    {
        var tile = _tiles.FirstOrDefault(t => t.ConnectorKind == kind);
        if (tile is not null) SelectTile(tile);
    }

    // ── Paint ─────────────────────────────────────────────────────────────
    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        if (DesignMode)
        {
            e.Graphics.Clear(s_sidebarBg);
            using var pen = new Pen(s_borderColor);
            e.Graphics.DrawRectangle(pen, 0, 0, Width - 1, Height - 1);
            using var brush = new SolidBrush(Color.FromArgb(150, 150, 150));
            e.Graphics.DrawString("DiagramToolbox", Font, brush, 6, 6);
            return;
        }
        using var borderPen = new Pen(s_borderColor);
        e.Graphics.DrawLine(borderPen, Width - 1, 0, Width - 1, Height);
    }

    // ── Tile building ─────────────────────────────────────────────────────
    private void BuildTiles()
    {
        SuspendLayout();
        Controls.Clear();
        _tiles.Clear();

        AddSection("기본 도형");
        AddTile(ToolboxTool.Shape, "사각형",   ShapeKind.Rectangle,        null);
        AddTile(ToolboxTool.Shape, "둥근사각", ShapeKind.RoundedRectangle,  null);
        AddTile(ToolboxTool.Shape, "타원",     ShapeKind.Ellipse,           null);
        AddTile(ToolboxTool.Shape, "마름모",   ShapeKind.Diamond,           null);
        AddTile(ToolboxTool.Shape, "삼각형",   ShapeKind.Triangle,          null);
        AddTile(ToolboxTool.Shape, "평행사변", ShapeKind.Parallelogram,     null);

        AddSection("다각형");
        AddTile(ToolboxTool.Shape, "육각형",   ShapeKind.Hexagon,           null);
        AddTile(ToolboxTool.Shape, "오각형",   ShapeKind.Pentagon,          null);
        AddTile(ToolboxTool.Shape, "별",       ShapeKind.Star,              null);
        AddTile(ToolboxTool.Shape, "십자",     ShapeKind.Cross,             null);

        AddSection("특수 도형");
        AddTile(ToolboxTool.Shape, "원통",     ShapeKind.Cylinder,          null);
        AddTile(ToolboxTool.Shape, "구름",     ShapeKind.Cloud,             null);
        AddTile(ToolboxTool.Shape, "문서",     ShapeKind.Document,          null);
        AddTile(ToolboxTool.Shape, "데이터베이스", ShapeKind.Database,       null);

        AddSection("흐름도");
        AddTile(ToolboxTool.Shape, "화살표",   ShapeKind.Arrow,             null);
        AddTile(ToolboxTool.Shape, "사다리꼴", ShapeKind.Trapezoid,         null);
        AddTile(ToolboxTool.Shape, "쉐브론",   ShapeKind.Chevron,           null);

        AddSection("연결선");
        AddTile(ToolboxTool.Connector, "직선",   null, ConnectorKind.Straight);
        AddTile(ToolboxTool.Connector, "꺾은선", null, ConnectorKind.Orthogonal);
        AddTile(ToolboxTool.Connector, "곡선",   null, ConnectorKind.Curved);

        ResumeLayout(false);
    }

    private void AddSection(string text)
    {
        var label = new Label
        {
            Text = text,
            Font = new Font("Segoe UI", 8f, FontStyle.Bold),
            ForeColor = Color.FromArgb(107, 114, 128),
            AutoSize = false,
            Height = 20,
            TextAlign = ContentAlignment.MiddleLeft
        };
        Controls.Add(label);
    }

    private void AddTile(ToolboxTool tool, string caption, ShapeKind? shapeKind, ConnectorKind? connectorKind)
    {
        var tile = new ToolboxTile(tool, caption, shapeKind, connectorKind);
        tile.Click      += (_, _) => SelectTile(tile);
        tile.MouseEnter += (_, _) => { tile.Hovered = true; };
        tile.MouseLeave += (_, _) => { tile.Hovered = false; };
        _tiles.Add(tile);
        Controls.Add(tile);
    }

    // ── Layout ────────────────────────────────────────────────────────────
    private void LayoutTiles()
    {
        const int gap    = 4;
        const int tileH  = 56;
        const int cols   = 3;
        const int lblH   = 20;
        const int lblGap = 22;

        int left    = Padding.Left;
        int top     = Padding.Top;
        int col     = 0;
        int usableW = Math.Max(160, ClientSize.Width - Padding.Horizontal);
        int tileW   = (usableW - (cols - 1) * gap) / cols;

        SuspendLayout();
        foreach (Control ctrl in Controls)
        {
            if (ctrl is Label lbl)
            {
                if (col > 0) { top += tileH + gap; col = 0; }
                lbl.SetBounds(left, top, usableW, lblH);
                top += lblGap;
                continue;
            }

            if (ctrl is not ToolboxTile tile)
                continue;

            tile.SetBounds(left + col * (tileW + gap), top, tileW, tileH);
            if (++col >= cols) { col = 0; top += tileH + gap; }
        }

        if (col > 0) top += tileH + gap;
        AutoScrollMinSize = new Size(0, top + Padding.Bottom);
        ResumeLayout(false);
    }

    private void SelectTile(ToolboxTile tile)
    {
        _selectedTile = tile;
        foreach (var t in _tiles)
            t.Selected = t == tile;

        SelectionChanged?.Invoke(this, new ToolboxSelectionChangedEventArgs(
            tile.Tool, tile.ShapeKind, tile.ConnectorKind));
    }

    // ── ToolboxTile ───────────────────────────────────────────────────────
    private sealed class ToolboxTile : Control
    {
        private static readonly Color s_accent      = Color.FromArgb(37, 99, 235);
        private static readonly Color s_accentMuted = Color.FromArgb(219, 234, 254);
        private static readonly Color s_idle        = Color.FromArgb(255, 255, 255);
        private static readonly Color s_hover       = Color.FromArgb(243, 244, 246);
        private static readonly Color s_selected    = Color.FromArgb(219, 234, 254);
        private static readonly Color s_border      = Color.FromArgb(209, 213, 219);
        private static readonly Color s_text        = Color.FromArgb(17, 24, 39);
        private static readonly Font  s_font        = new("Segoe UI", 7f);
        private static readonly Font  s_fontBold    = new("Segoe UI", 7f, FontStyle.Bold);

        public ToolboxTool    Tool          { get; }
        public string         Caption       { get; }
        public ShapeKind?     ShapeKind     { get; }
        public ConnectorKind? ConnectorKind { get; }

        private bool _selected;
        private bool _hovered;

        [Browsable(false)]
        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public bool Selected
        {
            get => _selected;
            set { if (_selected != value) { _selected = value; Invalidate(); } }
        }

        [Browsable(false)]
        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public bool Hovered
        {
            get => _hovered;
            set { if (_hovered != value) { _hovered = value; Invalidate(); } }
        }

        public ToolboxTile(
            ToolboxTool tool, string caption,
            ShapeKind? shapeKind, ConnectorKind? connectorKind)
        {
            Tool          = tool;
            Caption       = caption;
            ShapeKind     = shapeKind;
            ConnectorKind = connectorKind;
            Cursor        = Cursors.Hand;
            SetStyle(ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.UserPaint, true);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

            var bg = _selected ? s_selected : _hovered ? s_hover : s_idle;
            using var bgBrush = new SolidBrush(bg);
            using var path    = RoundedRect(ClientRectangle, 5);
            g.FillPath(bgBrush, path);

            using var borderPen = new Pen(_selected ? s_accent : s_border, _selected ? 1.5f : 1f);
            g.DrawPath(borderPen, path);

            if (ShapeKind is not null)
                DrawShapeContent(g);
            else if (ConnectorKind is not null)
                DrawConnectorContent(g, ConnectorKind.Value);

            using var textBrush = new SolidBrush(_selected ? s_accent : s_text);
            using var fmt = new StringFormat { Alignment = StringAlignment.Center };
            g.DrawString(Caption, _selected ? s_fontBold : s_font, textBrush,
                new RectangleF(0, Height - 15, Width, 14), fmt);
        }

        private void DrawShapeContent(Graphics g)
        {
            if (Width <= 14 || Height <= 22) return;
            DiagramRenderer.DrawShapePreview(g, ShapeKind!.Value,
                new RectangleF(5, 4, Width - 10, Height - 22),
                s_accentMuted, s_accent);
        }

        private void DrawConnectorContent(Graphics g, Models.ConnectorKind kind)
        {
            if (Width <= 14 || Height <= 20) return;
            var area = new Rectangle(6, 6, Width - 12, Height - 20);
            using var pen = new Pen(s_accent, 2f);
            switch (kind)
            {
                case Models.ConnectorKind.Straight:
                    g.DrawLine(pen, area.Left, area.Bottom, area.Right, area.Top);
                    Tip(g, pen, new Point(area.Left, area.Bottom), new Point(area.Right, area.Top));
                    break;

                case Models.ConnectorKind.Orthogonal:
                    int midY = (area.Top + area.Bottom) / 2;
                    g.DrawLines(pen, [
                        new Point(area.Left, area.Bottom),
                        new Point(area.Left, midY),
                        new Point(area.Right, midY),
                        new Point(area.Right, area.Top)]);
                    Tip(g, pen, new Point(area.Right, midY), new Point(area.Right, area.Top));
                    break;

                case Models.ConnectorKind.Curved:
                    g.DrawBezier(pen,
                        area.Left, area.Bottom,
                        area.Left + area.Width / 3, area.Bottom,
                        area.Right - area.Width / 3, area.Top,
                        area.Right, area.Top);
                    Tip(g, pen, new Point(area.Right - 8, area.Top + 4), new Point(area.Right, area.Top));
                    break;
            }
        }

        private static void Tip(Graphics g, Pen pen, Point from, Point to)
        {
            float dx = to.X - from.X, dy = to.Y - from.Y;
            float len = MathF.Sqrt(dx * dx + dy * dy);
            if (len < 0.001f) return;
            dx /= len; dy /= len;
            const float s = 7f;
            g.DrawLine(pen, to, new PointF(to.X - dx * s - dy * (s / 2), to.Y - dy * s + dx * (s / 2)));
            g.DrawLine(pen, to, new PointF(to.X - dx * s + dy * (s / 2), to.Y - dy * s - dx * (s / 2)));
        }

        private static System.Drawing.Drawing2D.GraphicsPath RoundedRect(Rectangle rect, int radius)
        {
            var path = new System.Drawing.Drawing2D.GraphicsPath();
            int r = Math.Min(radius, Math.Min(rect.Width, rect.Height) / 2);
            if (r < 2) { path.AddRectangle(rect); return path; }
            int d = r * 2;
            path.AddArc(rect.X,           rect.Y,            d, d, 180, 90);
            path.AddArc(rect.Right - d,   rect.Y,            d, d, 270, 90);
            path.AddArc(rect.Right - d,   rect.Bottom - d,   d, d,   0, 90);
            path.AddArc(rect.X,           rect.Bottom - d,   d, d,  90, 90);
            path.CloseFigure();
            return path;
        }
    }
}
