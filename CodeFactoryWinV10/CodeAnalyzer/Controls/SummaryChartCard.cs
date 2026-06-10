using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

internal sealed class SummaryChartCard : Panel
{
    private readonly ToolTip _toolTip;
    private SummarySection? _section;
    private IReadOnlyList<SummaryChartHitRegion> _regions = [];
    private SummaryChartHitRegion? _hoverRegion;

    public SummaryChartCard(ToolTip toolTip)
    {
        _toolTip = toolTip;
        BackColor = Color.Transparent;
        Cursor = Cursors.Default;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
    }

    public event Action<DiagramViewKind>? NavigationRequested;

    public void Bind(SummarySection section)
    {
        _section = section;
        Tag = section;
        RebuildRegions();
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        if (_section is null)
        {
            return;
        }

        SummaryChartPainter.DrawCard(e.Graphics, ClientRectangle, _section);
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        RebuildRegions();
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        UpdateHover(e.Location);
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        UpdateHover(null);
    }

    protected override void OnMouseClick(MouseEventArgs e)
    {
        base.OnMouseClick(e);
        if (e.Button != MouseButtons.Left)
        {
            return;
        }

        var hit = SummaryChartHitTester.HitTest(e.Location, _regions);
        var target = hit?.TargetView ?? _section?.TargetViewKind;
        if (target is { } viewKind)
        {
            NavigationRequested?.Invoke(viewKind);
        }
    }

    private void RebuildRegions()
    {
        _regions = _section is null || ClientRectangle.Width <= 0 || ClientRectangle.Height <= 0
            ? []
            : SummaryChartHitTester.BuildRegions(ClientRectangle, _section);
    }

    private void UpdateHover(Point? location)
    {
        SummaryChartHitRegion? hit = location is { } point
            ? SummaryChartHitTester.HitTest(point, _regions)
            : null;

        if (hit == _hoverRegion || hit?.Tooltip == _hoverRegion?.Tooltip)
        {
            return;
        }

        _hoverRegion = hit;
        Cursor = hit?.TargetView is not null || _section?.TargetViewKind is not null
            ? Cursors.Hand
            : Cursors.Default;
        _toolTip.SetToolTip(this, hit?.Tooltip ?? string.Empty);
    }
}
