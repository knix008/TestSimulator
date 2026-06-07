using MyDiagramWinV10.Models;
using MyDiagramWinV10.Rendering;

using System.ComponentModel;

namespace MyDiagramWinV10.Controls;

public enum ToolboxTool { Select, Shape, Connector }

public sealed class ToolboxSelectionChangedEventArgs(
    ToolboxTool tool, ShapeKind? shapeKind, ConnectorPreset? preset) : EventArgs
{
    public ToolboxTool Tool { get; } = tool;
    public ShapeKind? ShapeKind { get; } = shapeKind;
    public ConnectorPreset? ConnectorPreset { get; } = preset;
    // Kept for backward compatibility
    public ConnectorKind? ConnectorKind => ConnectorPreset?.Kind;
}

public sealed class DiagramToolbox : UserControl
{
    private static readonly Color s_sidebarBg  = Color.FromArgb(250, 251, 253);
    private static readonly Color s_borderColor = Color.FromArgb(209, 213, 219);

    // Tiles always have a fixed size regardless of panel width.
    // Column count changes with panel width; tile dimensions never change.
    private const int TileW    = 52;
    private const int TileH    = 52;
    private const int TileGap  = 4;
    private const int HeaderH  = 30;
    private const int GroupGap = 8;

    // One entry per collapsible section
    private readonly List<(SectionHeader Header, List<ToolboxTile> Tiles)> _groups = [];
    private readonly List<ToolboxTile> _allTiles = [];
    private bool _initialized;
    private int _contentHeight;

    public event EventHandler<ToolboxSelectionChangedEventArgs>? SelectionChanged;

    public DiagramToolbox()
    {
        DoubleBuffered = true;
        AutoScroll = true;
        BackColor = s_sidebarBg;
        Padding = new Padding(6, 4, 6, 10);
        Resize += (_, _) => LayoutAll(resetScroll: false);
    }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        EnsureInitialized();
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        EnsureInitialized();
    }

    protected override void OnSizeChanged(EventArgs e)
    {
        base.OnSizeChanged(e);
        if (_initialized)
            LayoutAll(resetScroll: false);
    }

    private void EnsureInitialized()
    {
        if (DesignMode || _initialized)
            return;

        _initialized = true;
        BuildGroups();
        LayoutAll(resetScroll: true);
    }

    // ── Public API ────────────────────────────────────────────────────────
    public void SelectSelectTool() { }  // no-op, kept for API compatibility

    public void SelectShapeTool(ShapeKind kind)
    {
        var tile = _allTiles.FirstOrDefault(t => t.ShapeKind == kind);
        if (tile is not null) SelectTile(tile);
    }

    public void SelectConnectorTool(ConnectorKind kind)
    {
        var tile = _allTiles.FirstOrDefault(t => t.Preset?.Kind == kind);
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

    // ── Group building ────────────────────────────────────────────────────
    private void BuildGroups()
    {
        SuspendLayout();
        Controls.Clear();
        _groups.Clear();
        _allTiles.Clear();

        AddGroup("기본 도형", [
            (ToolboxTool.Shape, "사각형",   ShapeKind.Rectangle,       null),
            (ToolboxTool.Shape, "둥근사각", ShapeKind.RoundedRectangle, null),
            (ToolboxTool.Shape, "타원",     ShapeKind.Ellipse,          null),
            (ToolboxTool.Shape, "마름모",   ShapeKind.Diamond,          null),
            (ToolboxTool.Shape, "삼각형",   ShapeKind.Triangle,         null),
            (ToolboxTool.Shape, "직각삼각", ShapeKind.RightTriangle,    null),
            (ToolboxTool.Shape, "평행사변", ShapeKind.Parallelogram,    null),
            (ToolboxTool.Shape, "사다리꼴", ShapeKind.Trapezoid,        null),
            (ToolboxTool.Shape, "육각형",   ShapeKind.Hexagon,          null),
            (ToolboxTool.Shape, "오각형",   ShapeKind.Pentagon,         null),
            (ToolboxTool.Shape, "팔각형",   ShapeKind.Octagon,          null),
            (ToolboxTool.Shape, "5점별",    ShapeKind.Star,             null),
            (ToolboxTool.Shape, "4점별",    ShapeKind.Star4,            null),
            (ToolboxTool.Shape, "6점별",    ShapeKind.Star6,            null),
            (ToolboxTool.Shape, "폭발",     ShapeKind.Explosion,        null),
            (ToolboxTool.Shape, "십자",     ShapeKind.Cross,            null),
            (ToolboxTool.Shape, "링/도넛",  ShapeKind.Donut,            null),
            (ToolboxTool.Shape, "원통",     ShapeKind.Cylinder,         null),
            (ToolboxTool.Shape, "쉐브론",   ShapeKind.Chevron,          null),
            (ToolboxTool.Shape, "구름",     ShapeKind.Cloud,            null),
        ]);

        AddGroup("순서도", [
            (ToolboxTool.Shape, "프로세스",   ShapeKind.Rectangle,             null),
            (ToolboxTool.Shape, "판단",       ShapeKind.Diamond,               null),
            (ToolboxTool.Shape, "데이터",     ShapeKind.Parallelogram,         null),
            (ToolboxTool.Shape, "시작/끝",    ShapeKind.RoundedRectangle,      null),
            (ToolboxTool.Shape, "내장프로세", ShapeKind.FlowPredefinedProcess, null),
            (ToolboxTool.Shape, "수동입력",   ShapeKind.ManualInput,           null),
            (ToolboxTool.Shape, "수동조작",   ShapeKind.FlowManualOperation,   null),
            (ToolboxTool.Shape, "준비",       ShapeKind.FlowPreparation,       null),
            (ToolboxTool.Shape, "문서",       ShapeKind.Document,              null),
            (ToolboxTool.Shape, "데이터베이스",ShapeKind.Database,             null),
            (ToolboxTool.Shape, "오프페이지", ShapeKind.OffPageConnector,      null),
            (ToolboxTool.Shape, "지연",       ShapeKind.Delay,                 null),
            (ToolboxTool.Shape, "표시기",     ShapeKind.FlowDisplay,           null),
            (ToolboxTool.Shape, "합산교차점", ShapeKind.FlowSummingJunction,   null),
            (ToolboxTool.Shape, "논리합",     ShapeKind.FlowOr,                null),
            (ToolboxTool.Shape, "병합",       ShapeKind.FlowMerge,             null),
            (ToolboxTool.Shape, "추출",       ShapeKind.Triangle,              null),
            (ToolboxTool.Shape, "조합",       ShapeKind.FlowCollate,           null),
            (ToolboxTool.Shape, "정렬",       ShapeKind.FlowSort,              null),
            (ToolboxTool.Shape, "주석",       ShapeKind.FlowAnnotation,        null),
        ], startCollapsed: true);

        AddGroup("화살표", [
            (ToolboxTool.Shape, "오른쪽→",   ShapeKind.Arrow,       null),
            (ToolboxTool.Shape, "←왼쪽",     ShapeKind.ArrowLeft,   null),
            (ToolboxTool.Shape, "↑위쪽",     ShapeKind.ArrowUp,     null),
            (ToolboxTool.Shape, "↓아래쪽",   ShapeKind.ArrowDown,   null),
            (ToolboxTool.Shape, "↔양방향",   ShapeKind.DoubleArrow, null),
            (ToolboxTool.Shape, "↕상하",     ShapeKind.ArrowUpDown, null),
            (ToolboxTool.Shape, "✦사방향",   ShapeKind.ArrowQuad,   null),
            (ToolboxTool.Shape, "꺾인화살",  ShapeKind.ArrowBent,   null),
            (ToolboxTool.Shape, "줄무늬",    ShapeKind.ArrowStriped, null),
            (ToolboxTool.Shape, "쉐브론→",   ShapeKind.Chevron,     null),
        ], startCollapsed: true);

        AddGroup("말풍선", [
            (ToolboxTool.Shape, "각진말풍선", ShapeKind.CallOut,      null),
            (ToolboxTool.Shape, "둥근말풍선", ShapeKind.CalloutRound, null),
            (ToolboxTool.Shape, "구름말풍선", ShapeKind.Cloud,        null),
            (ToolboxTool.Shape, "메모",       ShapeKind.Note,         null),
        ], startCollapsed: true);

        AddGroup("네트워크", [
            (ToolboxTool.Shape, "서버",    ShapeKind.NetworkServer,   null),
            (ToolboxTool.Shape, "라우터",  ShapeKind.NetworkRouter,   null),
            (ToolboxTool.Shape, "스위치",  ShapeKind.NetworkSwitch,   null),
            (ToolboxTool.Shape, "PC",      ShapeKind.NetworkPC,       null),
            (ToolboxTool.Shape, "방화벽",  ShapeKind.NetworkFirewall, null),
            (ToolboxTool.Shape, "허브",    ShapeKind.NetworkHub,      null),
            (ToolboxTool.Shape, "프린터",  ShapeKind.NetworkPrinter,  null),
            (ToolboxTool.Shape, "무선AP",  ShapeKind.NetworkWifi,     null),
            (ToolboxTool.Shape, "인터넷",  ShapeKind.NetworkInternet, null),
            (ToolboxTool.Shape, "스토리지",ShapeKind.NetworkStorage,  null),
            (ToolboxTool.Shape, "노트북",  ShapeKind.NetworkLaptop,   null),
            (ToolboxTool.Shape, "모바일",  ShapeKind.NetworkMobile,   null),
            (ToolboxTool.Shape, "IP전화",  ShapeKind.NetworkIPPhone,  null),
            (ToolboxTool.Shape, "랙",      ShapeKind.NetworkRack,     null),
            (ToolboxTool.Shape, "태블릿",  ShapeKind.NetworkTablet,   null),
            (ToolboxTool.Shape, "게이트웨이", ShapeKind.NetworkGateway, null),
        ], startCollapsed: true);

        AddGroup("3D 도형", [
            (ToolboxTool.Shape, "정육면체", ShapeKind.Shape3DCube,            null),
            (ToolboxTool.Shape, "직육면체", ShapeKind.Shape3DBox,             null),
            (ToolboxTool.Shape, "구",       ShapeKind.Shape3DSphere,          null),
            (ToolboxTool.Shape, "피라미드", ShapeKind.Shape3DPyramid,         null),
            (ToolboxTool.Shape, "원뿔",     ShapeKind.Shape3DCone,            null),
            (ToolboxTool.Shape, "원기둥",   ShapeKind.Shape3DCylinder,        null),
            (ToolboxTool.Shape, "삼각기둥", ShapeKind.Shape3DTriangularPrism, null),
            (ToolboxTool.Shape, "캡슐",     ShapeKind.Shape3DCapsule,         null),
            (ToolboxTool.Shape, "보석",     ShapeKind.Shape3DGem,             null),
            (ToolboxTool.Shape, "토러스",   ShapeKind.Shape3DTorus,           null),
        ], startCollapsed: true);

        AddGroup("연결선", [
            (ToolboxTool.Connector, "직선",    null, new ConnectorPreset(ConnectorKind.Straight,         LineStyle.Solid, ArrowHeadStyle.None,  ArrowHeadStyle.None)),
            (ToolboxTool.Connector, "→ 직선",  null, new ConnectorPreset(ConnectorKind.Straight,         LineStyle.Solid, ArrowHeadStyle.None,  ArrowHeadStyle.Open)),
            (ToolboxTool.Connector, "↔ 직선", null, new ConnectorPreset(ConnectorKind.Straight,         LineStyle.Solid, ArrowHeadStyle.Open,  ArrowHeadStyle.Open)),
            (ToolboxTool.Connector, "꺾은선",  null, new ConnectorPreset(ConnectorKind.Orthogonal,       LineStyle.Solid, ArrowHeadStyle.None,  ArrowHeadStyle.Open)),
            (ToolboxTool.Connector, "완만꺾",  null, new ConnectorPreset(ConnectorKind.RightAngleCurved, LineStyle.Solid, ArrowHeadStyle.None,  ArrowHeadStyle.Open)),
            (ToolboxTool.Connector, "곡선",    null, new ConnectorPreset(ConnectorKind.Curved,           LineStyle.Solid, ArrowHeadStyle.None,  ArrowHeadStyle.Open)),
            (ToolboxTool.Connector, "점선→",   null, new ConnectorPreset(ConnectorKind.Straight,         LineStyle.Dash,  ArrowHeadStyle.None,  ArrowHeadStyle.Open)),
            (ToolboxTool.Connector, "점선꺾",  null, new ConnectorPreset(ConnectorKind.Orthogonal,       LineStyle.Dash,  ArrowHeadStyle.None,  ArrowHeadStyle.Open)),
        ]);

        ResumeLayout(false);
    }

    private void AddGroup(
        string name,
        IEnumerable<(ToolboxTool Tool, string Caption, ShapeKind? Shape, ConnectorPreset? Preset)> items,
        bool startCollapsed = false)
    {
        var header = new SectionHeader(name, startCollapsed);
        header.Toggled += (_, _) => OnSectionToggled(header);
        Controls.Add(header);

        var tiles = new List<ToolboxTile>();
        foreach (var (tool, caption, shape, preset) in items)
        {
            var tile = new ToolboxTile(tool, caption, shape, preset);
            tile.Click      += (_, _) => SelectTile(tile);
            tile.MouseEnter += (_, _) => { tile.Hovered = true; };
            tile.MouseLeave += (_, _) => { tile.Hovered = false; };
            tiles.Add(tile);
            _allTiles.Add(tile);
            Controls.Add(tile);
        }

        _groups.Add((header, tiles));
    }

    // ── Layout ────────────────────────────────────────────────────────────
    // Tiles have fixed dimensions. Width change → column count changes only.
    private void OnSectionToggled(SectionHeader header)
    {
        if (!_initialized)
            return;

        LayoutAll(resetScroll: false);

        if (!header.Collapsed)
        {
            // Just expanded: scroll so the header appears near the top of the viewport
            // header.Top is screen coord; logical Y = header.Top - AutoScrollPosition.Y
            int logicalY = header.Top - AutoScrollPosition.Y;
            ApplyScrollPosition(Math.Max(0, logicalY - Padding.Top));
            Invalidate();
        }
    }

    private void LayoutAll(bool resetScroll = false, int? targetScrollY = null)
    {
        if (!_initialized)
            return;

        int desiredScrollY = resetScroll
            ? 0
            : targetScrollY ?? -AutoScrollPosition.Y;

        // Zero scroll BEFORE positioning controls: SetBounds uses screen-relative
        // coordinates (offset by current scroll), not logical-canvas coordinates.
        // A non-zero scroll during LayoutGroups shifts every control downward,
        // leaving blank space after the scroll is later reset.
        AutoScrollPosition = new Point(0, 0);

        SuspendLayout();

        int usableW = GetUsableWidth();
        int contentHeight = LayoutGroups(usableW);

        _contentHeight = contentHeight;
        AutoScrollMinSize = new Size(0, _contentHeight);
        ResumeLayout(true);

        ApplyScrollPosition(desiredScrollY);
        Invalidate();
    }

    private int MeasureGroupBlockHeight(SectionHeader header, bool collapsed, int usableW)
    {
        var tiles = _groups.First(g => ReferenceEquals(g.Header, header)).Tiles;
        int cols = Math.Max(1, (usableW + TileGap) / (TileW + TileGap));
        int h = HeaderH;

        if (!collapsed && tiles.Count > 0)
        {
            h += TileGap;
            int rows = (tiles.Count + cols - 1) / cols;
            h += rows * TileH;
            if (rows > 1)
                h += (rows - 1) * TileGap;
        }

        h += GroupGap;
        return h;
    }

    private void ApplyScrollPosition(int scrollY)
    {
        if (!AutoScroll)
            return;

        SetScrollY(Math.Clamp(scrollY, 0, GetMaxScrollY()));
    }

    private int GetUsableWidth()
    {
        int width = ClientSize.Width - Padding.Horizontal;
        if (width > SystemInformation.VerticalScrollBarWidth + TileW + TileGap)
            width -= SystemInformation.VerticalScrollBarWidth;

        return Math.Max(TileW + TileGap, width);
    }

    private int LayoutGroups(int usableW)
    {
        int cols = Math.Max(1, (usableW + TileGap) / (TileW + TileGap));
        int left = Padding.Left;
        int top = Padding.Top;

        foreach (var (header, tiles) in _groups)
        {
            header.SetBounds(left, top, usableW, HeaderH);
            header.Visible = true;
            top += HeaderH;

            if (!header.Collapsed)
            {
                top += TileGap;
                int rowTop = top;
                int col = 0;

                foreach (var tile in tiles)
                {
                    tile.Visible = true;
                    tile.SetBounds(left + col * (TileW + TileGap), rowTop, TileW, TileH);
                    if (++col >= cols)
                    {
                        col = 0;
                        rowTop += TileH + TileGap;
                    }
                }

                top = rowTop;
                if (col > 0)
                    top += TileH;
            }
            else
            {
                foreach (var tile in tiles)
                {
                    tile.Visible = false;
                    tile.SetBounds(0, 0, 0, 0);
                }
            }

            top += GroupGap;
        }

        return top + Padding.Bottom;
    }

    private int GetMaxScrollY()
        => Math.Max(0, _contentHeight - ClientSize.Height);

    private void SetScrollY(int scrollY)
    {
        if (!AutoScroll)
            return;

        AutoScrollPosition = new Point(0, scrollY);
    }

    private void ResetScrollPosition() => SetScrollY(0);

    private void SelectTile(ToolboxTile tile)
    {
        foreach (var t in _allTiles)
            t.Selected = t == tile;

        SelectionChanged?.Invoke(this, new ToolboxSelectionChangedEventArgs(
            tile.Tool, tile.ShapeKind, tile.Preset));
    }

    // ── SectionHeader ─────────────────────────────────────────────────────
    private sealed class SectionHeader : Control
    {
        private static readonly Color s_bg      = Color.FromArgb(229, 234, 242);
        private static readonly Color s_bgHover = Color.FromArgb(210, 218, 232);
        private static readonly Color s_text    = Color.FromArgb(31, 41, 55);
        private static readonly Color s_border  = Color.FromArgb(156, 163, 175);
        private static readonly Font  s_font    = new("Segoe UI Semibold", 9f, FontStyle.Bold);

        public string GroupName { get; }
        public bool Collapsed { get; private set; }
        public event EventHandler? Toggled;

        private bool _hovered;

        public SectionHeader(string name, bool startCollapsed = false)
        {
            GroupName = name;
            Collapsed = startCollapsed;
            Cursor    = Cursors.Hand;
            SetStyle(ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.UserPaint, true);
        }

        protected override void OnMouseEnter(EventArgs e) { base.OnMouseEnter(e); _hovered = true;  Invalidate(); }
        protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); _hovered = false; Invalidate(); }

        protected override void OnClick(EventArgs e)
        {
            base.OnClick(e);
            Collapsed = !Collapsed;
            Invalidate();
            Toggled?.Invoke(this, EventArgs.Empty);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

            // Background
            using var bgBrush = new SolidBrush(_hovered ? s_bgHover : s_bg);
            g.FillRectangle(bgBrush, ClientRectangle);

            // Top + bottom rule lines
            using var rulePen = new Pen(s_border);
            g.DrawLine(rulePen, 0, 0, Width, 0);
            g.DrawLine(rulePen, 0, Height - 1, Width, Height - 1);

            // Collapse chevron (▶ collapsed, ▼ expanded)
            float cy  = Height / 2f;
            float arX = 14f;
            using var arrowPen = new Pen(s_text, 2f)
                { LineJoin = System.Drawing.Drawing2D.LineJoin.Round };

            if (Collapsed)
            {
                // Right-pointing ▶
                g.DrawLines(arrowPen, [
                    new PointF(arX - 3, cy - 4.5f),
                    new PointF(arX + 3.5f, cy),
                    new PointF(arX - 3, cy + 4.5f),
                ]);
            }
            else
            {
                // Down-pointing ▼
                g.DrawLines(arrowPen, [
                    new PointF(arX - 4.5f, cy - 2.5f),
                    new PointF(arX,        cy + 3f),
                    new PointF(arX + 4.5f, cy - 2.5f),
                ]);
            }

            // Group name
            using var textBrush = new SolidBrush(s_text);
            using var fmt = new StringFormat { LineAlignment = StringAlignment.Center };
            g.DrawString(GroupName, s_font, textBrush,
                new RectangleF(28, 0, Width - 32, Height), fmt);
        }
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

        private const int PreviewPadL = 4;
        private const int PreviewPadT = 3;
        private const int PreviewPadR = 4;
        private const int CaptionH    = 16;

        public ToolboxTool     Tool      { get; }
        public string          Caption   { get; }
        public ShapeKind?      ShapeKind { get; }
        public ConnectorPreset? Preset   { get; }

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
            ShapeKind? shapeKind, ConnectorPreset? preset)
        {
            Tool      = tool;
            Caption   = caption;
            ShapeKind = shapeKind;
            Preset    = preset;
            Cursor    = Cursors.Hand;
            SetStyle(ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.UserPaint, true);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

            // Background + rounded border
            var bg = _selected ? s_selected : _hovered ? s_hover : s_idle;
            using var bgBrush   = new SolidBrush(bg);
            using var tilePath  = RoundedRect(ClientRectangle, 5);
            g.FillPath(bgBrush, tilePath);

            using var borderPen = new Pen(_selected ? s_accent : s_border, _selected ? 1.5f : 1f);
            g.DrawPath(borderPen, tilePath);

            // Shape / connector preview
            int previewH = Height - PreviewPadT - CaptionH;
            if (previewH > 4)
            {
                var previewRect = new RectangleF(
                    PreviewPadL, PreviewPadT,
                    Width - PreviewPadL - PreviewPadR,
                    previewH);

                if (ShapeKind is not null)
                    DiagramRenderer.DrawShapePreview(g, ShapeKind.Value, previewRect, s_accentMuted, s_accent);
                else if (Preset is not null)
                    DrawConnectorContent(g, Preset, previewRect);
            }

            // Caption
            using var textBrush = new SolidBrush(_selected ? s_accent : s_text);
            using var fmt = new StringFormat
                { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            g.DrawString(Caption, _selected ? s_fontBold : s_font, textBrush,
                new RectangleF(0, Height - CaptionH, Width, CaptionH), fmt);
        }

        private static void DrawConnectorContent(Graphics g, ConnectorPreset preset, RectangleF area)
        {
            int l = (int)area.Left,  r = (int)area.Right;
            int t = (int)area.Top,   b = (int)area.Bottom;
            int w = r - l;
            using var pen = new Pen(s_accent, 2f);

            // Apply line style
            pen.DashStyle = preset.LineStyle switch
            {
                LineStyle.Dash => System.Drawing.Drawing2D.DashStyle.Dash,
                LineStyle.Dot  => System.Drawing.Drawing2D.DashStyle.Dot,
                _              => System.Drawing.Drawing2D.DashStyle.Solid
            };

            switch (preset.Kind)
            {
                case ConnectorKind.Straight:
                    g.DrawLine(pen, l, b, r, t);
                    if (preset.EndArrow != ArrowHeadStyle.None)
                        Tip(g, pen, new Point(l, b), new Point(r, t));
                    if (preset.StartArrow != ArrowHeadStyle.None)
                        Tip(g, pen, new Point(r, t), new Point(l, b));
                    break;

                case ConnectorKind.Orthogonal:
                case ConnectorKind.RightAngleCurved:
                {
                    int midY = (t + b) / 2;
                    g.DrawLines(pen, [
                        new Point(l, b), new Point(l, midY),
                        new Point(r, midY), new Point(r, t)]);
                    if (preset.EndArrow != ArrowHeadStyle.None)
                        Tip(g, pen, new Point(r, midY), new Point(r, t));
                    if (preset.StartArrow != ArrowHeadStyle.None)
                        Tip(g, pen, new Point(l, midY), new Point(l, b));
                    break;
                }

                case ConnectorKind.Curved:
                    g.DrawBezier(pen,
                        l,         b,
                        l + w / 3, b,
                        r - w / 3, t,
                        r,         t);
                    if (preset.EndArrow != ArrowHeadStyle.None)
                        Tip(g, pen, new Point(r - 8, t + 4), new Point(r, t));
                    if (preset.StartArrow != ArrowHeadStyle.None)
                        Tip(g, pen, new Point(l + 8, b - 4), new Point(l, b));
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
            path.AddArc(rect.X,         rect.Y,          d, d, 180, 90);
            path.AddArc(rect.Right - d, rect.Y,          d, d, 270, 90);
            path.AddArc(rect.Right - d, rect.Bottom - d, d, d,   0, 90);
            path.AddArc(rect.X,         rect.Bottom - d, d, d,  90, 90);
            path.CloseFigure();
            return path;
        }
    }
}
