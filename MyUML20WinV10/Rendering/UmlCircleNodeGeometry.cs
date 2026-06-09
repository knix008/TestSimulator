using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlCircleNodeGeometry
{
    public const float MinDiameter = 24f;

    public static bool IsCircleKind(UmlBehaviorNodeKind kind) =>
        kind is UmlBehaviorNodeKind.InitialState
            or UmlBehaviorNodeKind.FinalState
            or UmlBehaviorNodeKind.InitialNode
            or UmlBehaviorNodeKind.ActivityFinalNode;

    public static bool IsCircleNode(UmlProject project, UmlDiagramNode node) =>
        node.Presentation == UmlNodePresentation.Behavior
        && project.FindElement(node.ModelElementId) is UmlBehaviorNode behaviorNode
        && IsCircleKind(behaviorNode.Kind);

    public static RectangleF GetCircleBounds(RectangleF bounds)
    {
        var size = Math.Max(bounds.Width, bounds.Height);
        return new RectangleF(
            bounds.Left + (bounds.Width - size) / 2f,
            bounds.Top + (bounds.Height - size) / 2f,
            size,
            size);
    }

    public static RectangleF SquareFromDrag(RectangleF dragRect)
    {
        var size = Math.Max(Math.Max(dragRect.Width, dragRect.Height), MinDiameter);
        return new RectangleF(
            dragRect.Left + (dragRect.Width - size) / 2f,
            dragRect.Top + (dragRect.Height - size) / 2f,
            size,
            size);
    }

    public static bool IsCircleCreateTool(UmlToolMode mode) =>
        mode is UmlToolMode.CreateInitialState
            or UmlToolMode.CreateFinalState
            or UmlToolMode.CreateInitialNode
            or UmlToolMode.CreateActivityFinalNode;
}
