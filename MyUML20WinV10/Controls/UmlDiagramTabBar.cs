using MyUML20WinV10.Models;

namespace MyUML20WinV10.Controls;

public sealed class UmlDiagramTabBar : Control
{
    private static readonly Color BarBg = Color.FromArgb(240, 242, 250);
    private static readonly Color ActiveTabBg = Color.White;
    private static readonly Color InactiveTabBg = Color.FromArgb(218, 222, 238);
    private static readonly Color HoverTabBg = Color.FromArgb(232, 234, 248);
    private static readonly Color AccentColor = Color.FromArgb(79, 70, 229);
    private static readonly Color BorderColor = Color.FromArgb(200, 205, 220);
    private static readonly Color TextActive = Color.FromArgb(79, 70, 229);
    private static readonly Color TextInactive = Color.FromArgb(75, 85, 108);
    private static readonly Color AddBtnBg = Color.FromArgb(210, 214, 235);
    private static readonly Color AddBtnHoverBg = Color.FromArgb(79, 70, 229);

    private static readonly Font TabFont = new("Segoe UI", 8.5f);
    private static readonly Font TabFontBold = new("Segoe UI Semibold", 8.5f, FontStyle.Bold);

    public const int BarHeight = 34;
    private const int TabMinW = 88;
    private const int TabMaxW = 160;
    private const int AddBtnW = 26;
    private const int TabPad = 3;

    private UmlProject? _project;
    private Guid _activeDiagramId;
    private int _hoveredTabIndex = -1;
    private bool _addBtnHovered;

    private readonly List<(Guid Id, Rectangle Bounds)> _tabBounds = [];
    private Rectangle _addBtnBounds;

    public event EventHandler<UmlDiagram>? DiagramSelected;
    public event EventHandler? NewDiagramRequested;

    public UmlDiagramTabBar()
    {
        Height = BarHeight;
        DoubleBuffered = true;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                 ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
    }

    public void Bind(UmlProject project)
    {
        _project = project;
        _activeDiagramId = project.ActiveDiagram.Id;
        Invalidate();
    }

    public void SyncActiveDiagram(UmlDiagram diagram)
    {
        _activeDiagramId = diagram.Id;
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        if (DesignMode)
        {
            e.Graphics.Clear(BarBg);
            using var pen = new Pen(BorderColor);
            e.Graphics.DrawRectangle(pen, 0, 0, Width - 1, Height - 1);
            using var brush = new SolidBrush(TextInactive);
            using var font = new Font("Segoe UI", 8f);
            e.Graphics.DrawString("Diagram Tabs", font, brush, 8, 10);
            return;
        }

        var g = e.Graphics;
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        _tabBounds.Clear();

        using var bg = new SolidBrush(BarBg);
        g.FillRectangle(bg, ClientRectangle);

        using var bottomLine = new Pen(BorderColor);
        g.DrawLine(bottomLine, 0, Height - 1, Width, Height - 1);

        if (_project is null) return;

        var x = 6;
        for (var i = 0; i < _project.Diagrams.Count; i++)
        {
            var diagram = _project.Diagrams[i];
            var isActive = diagram.Id == _activeDiagramId;
            var isHovered = i == _hoveredTabIndex;

            var label = $"{GetKindShort(diagram.Kind)}  {diagram.Name}";
            var mFont = isActive ? TabFontBold : TabFont;
            var textW = (int)g.MeasureString(label, mFont).Width + 28;
            var w = Math.Clamp(textW, TabMinW, TabMaxW);
            var bounds = new Rectangle(x, 0, w, Height);
            _tabBounds.Add((diagram.Id, bounds));

            if (isActive)
            {
                using var tabBg = new SolidBrush(ActiveTabBg);
                g.FillRectangle(tabBg, bounds.X, bounds.Y + 1, bounds.Width - 1, bounds.Height - 1);
                using var accentPen = new Pen(AccentColor, 3f);
                g.DrawLine(accentPen, bounds.X + 2, bounds.Y + 1, bounds.Right - 3, bounds.Y + 1);
                using var sidePen = new Pen(BorderColor);
                g.DrawLine(sidePen, bounds.X, bounds.Y + 1, bounds.X, bounds.Bottom - 1);
                g.DrawLine(sidePen, bounds.Right - 1, bounds.Y + 1, bounds.Right - 1, bounds.Bottom - 1);
            }
            else
            {
                var tabBgColor = isHovered ? HoverTabBg : InactiveTabBg;
                using var tabBg = new SolidBrush(tabBgColor);
                g.FillRectangle(tabBg, bounds.X + 1, bounds.Y + 5, bounds.Width - 2, bounds.Height - 5);
                using var sidePen = new Pen(BorderColor);
                g.DrawLine(sidePen, bounds.X, bounds.Y + 5, bounds.X, bounds.Bottom - 1);
                g.DrawLine(sidePen, bounds.Right - 1, bounds.Y + 5, bounds.Right - 1, bounds.Bottom - 1);
            }

            using var textBrush = new SolidBrush(isActive ? TextActive : TextInactive);
            using var fmt = new StringFormat
            {
                Alignment = StringAlignment.Center,
                LineAlignment = StringAlignment.Center,
                Trimming = StringTrimming.EllipsisCharacter,
            };
            g.DrawString(label, isActive ? TabFontBold : TabFont, textBrush,
                new RectangleF(bounds.X, bounds.Y + 2, bounds.Width, bounds.Height - 2), fmt);

            x += w + TabPad;
        }

        var addX = x + 4;
        _addBtnBounds = new Rectangle(addX, 7, AddBtnW, Height - 14);
        using var addBg = new SolidBrush(_addBtnHovered ? AddBtnHoverBg : AddBtnBg);
        using var addPath = new System.Drawing.Drawing2D.GraphicsPath();
        addPath.AddEllipse(_addBtnBounds);
        g.FillPath(addBg, addPath);
        using var addFore = new SolidBrush(_addBtnHovered ? Color.White : Color.FromArgb(79, 70, 229));
        using var addFont = new Font("Segoe UI", 12f, FontStyle.Bold);
        using var addFmt = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        g.DrawString("+", addFont, addFore, _addBtnBounds, addFmt);
    }

    protected override void OnMouseClick(MouseEventArgs e)
    {
        base.OnMouseClick(e);
        if (e.Button != MouseButtons.Left || _project is null) return;

        if (_addBtnBounds.Contains(e.Location))
        {
            NewDiagramRequested?.Invoke(this, EventArgs.Empty);
            return;
        }

        for (var i = 0; i < _tabBounds.Count; i++)
        {
            var (id, bounds) = _tabBounds[i];
            if (!bounds.Contains(e.Location)) continue;

            var diagram = _project.Diagrams.FirstOrDefault(d => d.Id == id);
            if (diagram is null) continue;

            _activeDiagramId = id;
            DiagramSelected?.Invoke(this, diagram);
            Invalidate();
            return;
        }
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        var newHoveredTab = -1;
        for (var i = 0; i < _tabBounds.Count; i++)
        {
            if (_tabBounds[i].Bounds.Contains(e.Location))
            {
                newHoveredTab = i;
                break;
            }
        }

        var addHov = _addBtnBounds.Contains(e.Location);
        if (newHoveredTab != _hoveredTabIndex || addHov != _addBtnHovered)
        {
            _hoveredTabIndex = newHoveredTab;
            _addBtnHovered = addHov;
            Cursor = addHov ? Cursors.Hand : newHoveredTab >= 0 ? Cursors.Hand : Cursors.Default;
            Invalidate();
        }
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        _hoveredTabIndex = -1;
        _addBtnHovered = false;
        Cursor = Cursors.Default;
        Invalidate();
    }

    private static string GetKindShort(UmlDiagramKind kind) => kind switch
    {
        UmlDiagramKind.ClassDiagram => "CD",
        UmlDiagramKind.UseCaseDiagram => "UC",
        UmlDiagramKind.SequenceDiagram => "SD",
        UmlDiagramKind.StateMachineDiagram => "SM",
        UmlDiagramKind.ActivityDiagram => "AD",
        _ => "??",
    };
}
