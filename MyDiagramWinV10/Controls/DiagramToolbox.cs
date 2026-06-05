using MyDiagramWinV10.Models;
using MyDiagramWinV10.Rendering;
using MyDiagramWinV10.Ui;

using System.ComponentModel;

namespace MyDiagramWinV10.Controls;

public enum ToolboxTool
{
    Select,
    Shape,
    Connector
}

public sealed class ToolboxSelectionChangedEventArgs(ToolboxTool tool, ShapeKind? shapeKind, ConnectorKind? connectorKind) : EventArgs
{
    public ToolboxTool Tool { get; } = tool;
    public ShapeKind? ShapeKind { get; } = shapeKind;
    public ConnectorKind? ConnectorKind { get; } = connectorKind;
}

public sealed class DiagramToolbox : UserControl
{
    private readonly List<ToolboxTile> _tiles = [];
    private ToolboxTile? _selectedTile;

    public event EventHandler<ToolboxSelectionChangedEventArgs>? SelectionChanged;

    public DiagramToolbox()
    {
        DoubleBuffered = true;
        BackColor = ModernTheme.SidebarBackground;
        Padding = new Padding(12, 8, 12, 12);
        AutoScroll = true;
        Width = 220;
        BuildTiles();
        SelectSelectTool();
    }

    public void SelectSelectTool() => SelectTile(_tiles.First(t => t.Tool == ToolboxTool.Select));

    public void SelectShapeTool(ShapeKind kind)
        => SelectTile(_tiles.First(t => t.ShapeKind == kind));

    public void SelectConnectorTool(ConnectorKind kind)
        => SelectTile(_tiles.First(t => t.ConnectorKind == kind));

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        using var borderPen = new Pen(ModernTheme.Border);
        var rect = ClientRectangle;
        rect.Width -= 1;
        rect.Height -= 1;
        e.Graphics.DrawLine(borderPen, rect.Right, rect.Top, rect.Right, rect.Bottom);
    }

    private void BuildTiles()
    {
        AddSectionLabel("도구", 0);
        AddTile(ToolboxTool.Select, "선택", null, null, DrawSelectPreview, 1);

        AddSectionLabel("도형", 2);
        var shapeRow = 3;
        AddTile(ToolboxTool.Shape, "사각형", ShapeKind.Rectangle, null, DrawRectanglePreview, shapeRow++);
        AddTile(ToolboxTool.Shape, "둥근 사각형", ShapeKind.RoundedRectangle, null, DrawRoundedRectPreview, shapeRow++);
        AddTile(ToolboxTool.Shape, "타원", ShapeKind.Ellipse, null, DrawEllipsePreview, shapeRow++);
        AddTile(ToolboxTool.Shape, "마름모", ShapeKind.Diamond, null, DrawDiamondPreview, shapeRow++);
        AddTile(ToolboxTool.Shape, "삼각형", ShapeKind.Triangle, null, DrawTrianglePreview, shapeRow++);
        AddTile(ToolboxTool.Shape, "평행사변형", ShapeKind.Parallelogram, null, DrawParallelogramPreview, shapeRow++);
        AddTile(ToolboxTool.Shape, "육각형", ShapeKind.Hexagon, null, DrawHexagonPreview, shapeRow++);

        AddSectionLabel("연결선", shapeRow++);
        AddTile(ToolboxTool.Connector, "직선", null, ConnectorKind.Straight, DrawStraightConnectorPreview, shapeRow++);
        AddTile(ToolboxTool.Connector, "꺾은선", null, ConnectorKind.Orthogonal, DrawOrthogonalConnectorPreview, shapeRow++);
        AddTile(ToolboxTool.Connector, "곡선", null, ConnectorKind.Curved, DrawCurvedConnectorPreview, shapeRow);

        LayoutTiles();
        Resize += (_, _) => LayoutTiles();
    }

    private void AddSectionLabel(string text, int row)
    {
        var label = new Label
        {
            Text = text,
            Font = ModernTheme.SectionFont,
            ForeColor = ModernTheme.TextSecondary,
            AutoSize = false,
            Height = 24,
            TextAlign = ContentAlignment.MiddleLeft,
            Tag = row
        };
        Controls.Add(label);
    }

    private void AddTile(
        ToolboxTool tool,
        string caption,
        ShapeKind? shapeKind,
        ConnectorKind? connectorKind,
        Action<Graphics, Rectangle> drawPreview,
        int row)
    {
        var tile = new ToolboxTile(tool, caption, shapeKind, connectorKind, drawPreview, row);
        tile.Click += (_, _) => SelectTile(tile);
        tile.MouseEnter += (_, _) => tile.Hovered = true;
        tile.MouseLeave += (_, _) => tile.Hovered = false;
        _tiles.Add(tile);
        Controls.Add(tile);
    }

    private void LayoutTiles()
    {
        const int left = 12;
        const int gap = 8;
        const int tileWidth = 88;
        const int tileHeight = 72;
        int top = 8;
        int col = 0;

        foreach (Control control in Controls)
        {
            if (control is Label label)
            {
                if (col > 0)
                {
                    top += tileHeight + gap;
                    col = 0;
                }

                label.SetBounds(left, top, Math.Max(120, ClientSize.Width - left * 2), 24);
                top += 28;
                continue;
            }

            if (control is not ToolboxTile tile)
                continue;

            if (tile.Tool == ToolboxTool.Select)
            {
                tile.SetBounds(left, top, Math.Max(120, ClientSize.Width - left * 2), 40);
                top += 48;
                col = 0;
                continue;
            }

            int x = left + col * (tileWidth + gap);
            tile.SetBounds(x, top, tileWidth, tileHeight);
            col++;
            if (col >= 2)
            {
                col = 0;
                top += tileHeight + gap;
            }
        }

        if (col > 0)
            top += tileHeight + gap;

        MinimumSize = new Size(180, top + 12);
    }

    private void SelectTile(ToolboxTile tile)
    {
        _selectedTile = tile;
        foreach (var item in _tiles)
            item.Selected = item == tile;

        SelectionChanged?.Invoke(this, new ToolboxSelectionChangedEventArgs(
            tile.Tool,
            tile.ShapeKind,
            tile.ConnectorKind));
    }

    private static void DrawSelectPreview(Graphics g, Rectangle bounds)
    {
        var rect = Inset(bounds, 10, 6);
        using var pen = new Pen(ModernTheme.Accent, 2f);
        g.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);
        g.FillEllipse(Brushes.White, rect.Right - 8, rect.Bottom - 8, 8, 8);
        using var handlePen = new Pen(ModernTheme.Accent, 1.5f);
        g.DrawRectangle(handlePen, rect.Right - 10, rect.Bottom - 10, 8, 8);
    }

    private static void DrawRectanglePreview(Graphics g, Rectangle bounds)
        => DrawShapePreview(g, bounds, ShapeKind.Rectangle);

    private static void DrawRoundedRectPreview(Graphics g, Rectangle bounds)
        => DrawShapePreview(g, bounds, ShapeKind.RoundedRectangle);

    private static void DrawEllipsePreview(Graphics g, Rectangle bounds)
        => DrawShapePreview(g, bounds, ShapeKind.Ellipse);

    private static void DrawDiamondPreview(Graphics g, Rectangle bounds)
        => DrawShapePreview(g, bounds, ShapeKind.Diamond);

    private static void DrawTrianglePreview(Graphics g, Rectangle bounds)
        => DrawShapePreview(g, bounds, ShapeKind.Triangle);

    private static void DrawParallelogramPreview(Graphics g, Rectangle bounds)
        => DrawShapePreview(g, bounds, ShapeKind.Parallelogram);

    private static void DrawHexagonPreview(Graphics g, Rectangle bounds)
        => DrawShapePreview(g, bounds, ShapeKind.Hexagon);

    private static void DrawShapePreview(Graphics g, Rectangle bounds, ShapeKind kind)
    {
        var rect = Inset(bounds, 14, 18);
        DiagramRenderer.DrawShapePreview(
            g,
            kind,
            rect,
            ModernTheme.AccentMuted,
            ModernTheme.Accent);
    }

    private static void DrawStraightConnectorPreview(Graphics g, Rectangle bounds)
    {
        var rect = Inset(bounds, 14, 24);
        using var pen = new Pen(ModernTheme.Accent, 2f);
        var start = new Point(rect.Left + 4, rect.Bottom - 4);
        var end = new Point(rect.Right - 4, rect.Top + 4);
        g.DrawLine(pen, start, end);
        DrawArrow(g, pen, start, end);
    }

    private static void DrawOrthogonalConnectorPreview(Graphics g, Rectangle bounds)
    {
        var rect = Inset(bounds, 14, 24);
        using var pen = new Pen(ModernTheme.Accent, 2f);
        var p1 = new Point(rect.Left + 4, rect.Bottom - 4);
        var p2 = new Point(rect.Right - 4, rect.Bottom - 4);
        var p3 = new Point(rect.Right - 4, rect.Top + 4);
        g.DrawLines(pen, [p1, p2, p3]);
        DrawArrow(g, pen, p2, p3);
    }

    private static void DrawCurvedConnectorPreview(Graphics g, Rectangle bounds)
    {
        var rect = Inset(bounds, 14, 24);
        using var pen = new Pen(ModernTheme.Accent, 2f);
        var p1 = new Point(rect.Left + 4, rect.Bottom - 4);
        var p2 = new Point((rect.Left + rect.Right) / 2, rect.Bottom - 4);
        var p3 = new Point((rect.Left + rect.Right) / 2, rect.Top + 4);
        var p4 = new Point(rect.Right - 4, rect.Top + 4);
        g.DrawBezier(pen, p1, p2, p3, p4);
        DrawArrow(g, pen, p3, p4);
    }

    private static void DrawArrow(Graphics g, Pen pen, Point from, Point to)
    {
        float dx = to.X - from.X;
        float dy = to.Y - from.Y;
        float len = MathF.Sqrt(dx * dx + dy * dy);
        if (len < 0.001f)
            return;

        dx /= len;
        dy /= len;
        var tip = new PointF(to.X, to.Y);
        var left = new PointF(tip.X - dx * 8 - dy * 4, tip.Y - dy * 8 + dx * 4);
        var right = new PointF(tip.X - dx * 8 + dy * 4, tip.Y - dy * 8 - dx * 4);
        g.DrawLine(pen, tip, left);
        g.DrawLine(pen, tip, right);
    }

    private static Rectangle Inset(Rectangle bounds, int horizontal, int vertical)
    {
        return new Rectangle(
            bounds.Left + horizontal,
            bounds.Top + vertical,
            Math.Max(8, bounds.Width - horizontal * 2),
            Math.Max(8, bounds.Height - vertical));
    }

    private sealed class ToolboxTile : Control
    {
        private readonly Action<Graphics, Rectangle> _drawPreview;

        public ToolboxTile(
            ToolboxTool tool,
            string caption,
            ShapeKind? shapeKind,
            ConnectorKind? connectorKind,
            Action<Graphics, Rectangle> drawPreview,
            int row)
        {
            Tool = tool;
            Caption = caption;
            ShapeKind = shapeKind;
            ConnectorKind = connectorKind;
            _drawPreview = drawPreview;
            Tag = row;
            Cursor = Cursors.Hand;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
        }

        public ToolboxTool Tool { get; }
        public string Caption { get; }
        public ShapeKind? ShapeKind { get; }
        public ConnectorKind? ConnectorKind { get; }
        private bool _selected;
        private bool _hovered;

        [Browsable(false)]
        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public bool Selected
        {
            get => _selected;
            set
            {
                if (_selected == value)
                    return;
                _selected = value;
                Invalidate();
            }
        }

        [Browsable(false)]
        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public bool Hovered
        {
            get => _hovered;
            set
            {
                if (_hovered == value)
                    return;
                _hovered = value;
                Invalidate();
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            var back = Selected ? ModernTheme.ToolSelected : Hovered ? ModernTheme.ToolHover : ModernTheme.ToolIdle;
            using var backBrush = new SolidBrush(back);
            e.Graphics.FillRectangle(backBrush, ClientRectangle);

            using var borderPen = new Pen(Selected ? ModernTheme.Accent : ModernTheme.Border);
            var rect = ClientRectangle;
            rect.Width -= 1;
            rect.Height -= 1;
            e.Graphics.DrawRectangle(borderPen, rect);

            _drawPreview(e.Graphics, ClientRectangle);

            using var font = ModernTheme.UiFont;
            using var brush = new SolidBrush(ModernTheme.TextPrimary);
            var size = e.Graphics.MeasureString(Caption, font);
            e.Graphics.DrawString(
                Caption,
                font,
                brush,
                (Width - size.Width) / 2,
                Height - size.Height - 4);
        }
    }
}
