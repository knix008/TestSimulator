using MyUML20WinV10.Models;
using MyUML20WinV10.Rendering;

namespace MyUML20WinV10.Controls;

public sealed class UmlToolboxSelectionChangedEventArgs(UmlToolMode mode) : EventArgs
{
    public UmlToolMode Mode { get; } = mode;
}

public sealed class UmlToolbox : UserControl
{
    private static readonly Color SidebarBg = Color.FromArgb(250, 251, 253);
    private static readonly Color BorderColor = Color.FromArgb(209, 213, 219);
    private static readonly Color Accent = Color.FromArgb(79, 70, 229);
    private static readonly Color AccentMuted = Color.FromArgb(237, 233, 254);
    private static readonly Color Idle = Color.White;
    private static readonly Color Hover = Color.FromArgb(243, 244, 246);
    private static readonly Color Selected = Color.FromArgb(237, 233, 254);
    private static readonly Color TextColor = Color.FromArgb(17, 24, 39);

    private const int TileW = 72;
    private const int TileH = 64;
    private const int TileGap = 6;
    private const int HeaderH = 28;
    private const int GroupGap = 8;

    private readonly List<(SectionHeader Header, List<ToolboxTile> Tiles)> _groups = [];
    private readonly List<ToolboxTile> _allTiles = [];
    private bool _initialized;

    public event EventHandler<UmlToolboxSelectionChangedEventArgs>? SelectionChanged;

    public UmlToolbox()
    {
        DoubleBuffered = true;
        AutoScroll = true;
        BackColor = SidebarBg;
        Padding = new Padding(6, 4, 6, 10);
        Resize += (_, _) => LayoutAll();
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        EnsureInitialized();
    }

    public void SelectTool(UmlToolMode mode)
    {
        var tile = _allTiles.FirstOrDefault(t => t.Mode == mode);
        if (tile is not null)
            SelectTile(tile);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        using var pen = new Pen(BorderColor);
        e.Graphics.DrawLine(pen, Width - 1, 0, Width - 1, Height);
    }

    private void EnsureInitialized()
    {
        if (DesignMode || _initialized)
            return;

        _initialized = true;
        BuildGroups();
        LayoutAll();
        SelectTile(_allTiles[0]);
    }

    private void BuildGroups()
    {
        SuspendLayout();
        Controls.Clear();
        _groups.Clear();
        _allTiles.Clear();

        AddGroup("기본", [
            (UmlToolMode.Select, "선택", UmlNotationPreview.DrawSelect),
            (UmlToolMode.Pan, "이동", UmlNotationPreview.DrawPan),
        ]);

        AddGroup("분류자", [
            (UmlToolMode.CreateClass, "Class", UmlNotationPreview.DrawClass),
            (UmlToolMode.CreateInterface, "Interface", UmlNotationPreview.DrawInterface),
            (UmlToolMode.CreateEnumeration, "Enum", UmlNotationPreview.DrawEnumeration),
            (UmlToolMode.CreatePackage, "Package", UmlNotationPreview.DrawPackage),
        ]);

        AddGroup("Use Case", [
            (UmlToolMode.CreateActor, "Actor", UmlNotationPreview.DrawActor),
            (UmlToolMode.CreateUseCase, "UseCase", UmlNotationPreview.DrawUseCase),
            (UmlToolMode.CreateInclude, "Include", UmlNotationPreview.DrawInclude),
            (UmlToolMode.CreateExtend, "Extend", UmlNotationPreview.DrawExtend),
        ]);

        AddGroup("관계", [
            (UmlToolMode.CreateAssociation, "Association", UmlNotationPreview.DrawAssociation),
            (UmlToolMode.CreateDirectedAssociation, "Directed", UmlNotationPreview.DrawDirectedAssociation),
            (UmlToolMode.CreateAggregation, "Aggregation", UmlNotationPreview.DrawAggregation),
            (UmlToolMode.CreateComposition, "Composition", UmlNotationPreview.DrawComposition),
            (UmlToolMode.CreateGeneralization, "Generalization", UmlNotationPreview.DrawGeneralization),
            (UmlToolMode.CreateRealization, "Realization", UmlNotationPreview.DrawRealization),
            (UmlToolMode.CreateDependency, "Dependency", UmlNotationPreview.DrawDependency),
        ]);

        AddGroup("기타", [
            (UmlToolMode.CreateNote, "Note", UmlNotationPreview.DrawNote),
        ]);

        ResumeLayout(false);
    }

    private void AddGroup(string name, IEnumerable<(UmlToolMode Mode, string Caption, Action<Graphics, RectangleF, Color, Color> Draw)> items)
    {
        var header = new SectionHeader(name);
        Controls.Add(header);

        var tiles = new List<ToolboxTile>();
        foreach (var (mode, caption, draw) in items)
        {
            var tile = new ToolboxTile(mode, caption, draw);
            tile.Click += (_, _) => SelectTile(tile);
            tile.MouseEnter += (_, _) => tile.Hovered = true;
            tile.MouseLeave += (_, _) => tile.Hovered = false;
            tiles.Add(tile);
            _allTiles.Add(tile);
            Controls.Add(tile);
        }

        _groups.Add((header, tiles));
    }

    private void LayoutAll()
    {
        if (!_initialized)
            return;

        AutoScrollPosition = Point.Empty;
        SuspendLayout();

        var usableW = Math.Max(TileW + TileGap, ClientSize.Width - Padding.Horizontal - SystemInformation.VerticalScrollBarWidth);
        var cols = Math.Max(1, (usableW + TileGap) / (TileW + TileGap));
        var left = Padding.Left;
        var top = Padding.Top;

        foreach (var (header, tiles) in _groups)
        {
            header.SetBounds(left, top, usableW, HeaderH);
            top += HeaderH + TileGap;

            var col = 0;
            var rowTop = top;
            foreach (var tile in tiles)
            {
                tile.SetBounds(left + col * (TileW + TileGap), rowTop, TileW, TileH);
                tile.Visible = true;
                if (++col >= cols)
                {
                    col = 0;
                    rowTop += TileH + TileGap;
                }
            }

            top = rowTop + (col > 0 ? TileH : 0) + GroupGap;
        }

        AutoScrollMinSize = new Size(0, top + Padding.Bottom);
        ResumeLayout(true);
        Invalidate();
    }

    private void SelectTile(ToolboxTile tile)
    {
        foreach (var t in _allTiles)
            t.Selected = ReferenceEquals(t, tile);

        SelectionChanged?.Invoke(this, new UmlToolboxSelectionChangedEventArgs(tile.Mode));
    }

    private sealed class SectionHeader : Control
    {
        private static readonly Font HeaderFont = new("Segoe UI Semibold", 9f, FontStyle.Bold);

        public SectionHeader(string name)
        {
            Text = name;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            using var bg = new SolidBrush(Color.FromArgb(229, 234, 242));
            e.Graphics.FillRectangle(bg, ClientRectangle);
            using var brush = new SolidBrush(Color.FromArgb(31, 41, 55));
            using var fmt = new StringFormat { LineAlignment = StringAlignment.Center };
            e.Graphics.DrawString(Text, HeaderFont, brush, new RectangleF(8, 0, Width - 8, Height), fmt);
            using var pen = new Pen(Color.FromArgb(156, 163, 175));
            e.Graphics.DrawLine(pen, 0, Height - 1, Width, Height - 1);
        }
    }

    private sealed class ToolboxTile : Control
    {
        private static readonly Font CaptionFont = new("Segoe UI", 7f);
        private static readonly Font CaptionFontBold = new("Segoe UI", 7f, FontStyle.Bold);
        private const int CaptionH = 16;

        public UmlToolMode Mode { get; }
        public string Caption { get; }
        private readonly Action<Graphics, RectangleF, Color, Color> _draw;

        public bool Selected { get; set; }
        public bool Hovered { get; set; }

        public ToolboxTile(UmlToolMode mode, string caption, Action<Graphics, RectangleF, Color, Color> draw)
        {
            Mode = mode;
            Caption = caption;
            _draw = draw;
            Cursor = Cursors.Hand;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

            var bg = Selected ? UmlToolbox.Selected : Hovered ? UmlToolbox.Hover : UmlToolbox.Idle;
            using var bgBrush = new SolidBrush(bg);
            using var path = RoundedRect(ClientRectangle, 6);
            g.FillPath(bgBrush, path);
            using var borderPen = new Pen(Selected ? UmlToolbox.Accent : UmlToolbox.BorderColor, Selected ? 1.5f : 1f);
            g.DrawPath(borderPen, path);

            var previewRect = new RectangleF(6, 4, Width - 12, Height - CaptionH - 6);
            _draw(g, previewRect, UmlToolbox.AccentMuted, UmlToolbox.Accent);

            using var textBrush = new SolidBrush(Selected ? UmlToolbox.Accent : UmlToolbox.TextColor);
            using var fmt = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            g.DrawString(Caption, Selected ? CaptionFontBold : CaptionFont, textBrush,
                new RectangleF(0, Height - CaptionH, Width, CaptionH), fmt);
        }

        private static System.Drawing.Drawing2D.GraphicsPath RoundedRect(Rectangle rect, int radius)
        {
            var path = new System.Drawing.Drawing2D.GraphicsPath();
            var r = Math.Min(radius, Math.Min(rect.Width, rect.Height) / 2);
            if (r < 2)
            {
                path.AddRectangle(rect);
                return path;
            }

            var d = r * 2;
            path.AddArc(rect.X, rect.Y, d, d, 180, 90);
            path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
            path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
            path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }
    }
}
