using System.Drawing.Drawing2D;
using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlPackageDiagramNotation
{
    public static string? GetNestingParentLabel(UmlProject project, UmlDiagram diagram, UmlDiagramNode packageNode)
    {
        foreach (var edge in diagram.Edges)
        {
            if (edge.SourceNodeId != packageNode.Id)
                continue;

            if (project.FindRelationship(edge.ModelElementId) is not UmlPackageRelationship { PackageKind: UmlPackageRelationshipKind.Nesting })
                continue;

            var parentNode = diagram.FindNode(edge.TargetNodeId);
            if (parentNode is null)
                continue;

            if (project.FindElement(parentNode.ModelElementId) is UmlPackage parent)
                return parent.Name;
        }

        return null;
    }

    public static void DrawPackageRelationshipGeometry(
        Graphics g,
        Pen pen,
        PointF start,
        PointF end,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        UmlPackageRelationship relationship,
        IReadOnlyList<(float T, PointF Pt)> crossings)
    {
        switch (relationship.PackageKind)
        {
            case UmlPackageRelationshipKind.Nesting:
                UmlEdgeRouting.DrawRoutedPathSegment(g, pen, pathPoints, routingKind, crossings, trimFromEnd: 10f);
                DrawNestingSymbol(g, pen, end);
                break;
            default:
                using (var dashedPen = new Pen(pen.Color, pen.Width) { DashStyle = DashStyle.Dash })
                {
                    UmlEdgeRouting.DrawRoutedPathSegment(g, dashedPen, pathPoints, routingKind, crossings, trimFromEnd: 8f);
                    DrawOpenArrowAtEnd(g, dashedPen, pathPoints, routingKind, end);
                }
                break;
        }
    }

    public static void DrawNestingSymbol(Graphics g, Pen pen, PointF anchor)
    {
        const float radius = 6f;
        g.DrawEllipse(pen, anchor.X - radius, anchor.Y - radius, radius * 2f, radius * 2f);
        g.DrawLine(pen, anchor.X - radius + 2f, anchor.Y, anchor.X + radius - 2f, anchor.Y);
        g.DrawLine(pen, anchor.X, anchor.Y - radius + 2f, anchor.X, anchor.Y + radius - 2f);
    }

    private static void DrawOpenArrowAtEnd(Graphics g, Pen pen, PointF[] pathPoints, UmlEdgeRoutingKind routingKind, PointF end)
    {
        var dir = UmlEdgeRouting.GetPathEndDirection(pathPoints, routingKind);
        var angle = MathF.Atan2(dir.Y, dir.X);
        const float len = 9f;
        const float wing = 5f;
        var p1 = new PointF(
            end.X - (float)(len * Math.Cos(angle) - wing * Math.Sin(angle)),
            end.Y - (float)(len * Math.Sin(angle) + wing * Math.Cos(angle)));
        var p2 = new PointF(
            end.X - (float)(len * Math.Cos(angle) + wing * Math.Sin(angle)),
            end.Y - (float)(len * Math.Sin(angle) - wing * Math.Cos(angle)));
        g.DrawLine(pen, end, p1);
        g.DrawLine(pen, end, p2);
    }
}
