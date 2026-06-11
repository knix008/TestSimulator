using System.Drawing.Drawing2D;
using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlNotationPreview
{
    private static Pen CreatePreviewBorderPen(float width = UmlDiagramStyle.PreviewPenWidth) =>
        UmlDiagramStyle.CreateBorderPen(selected: false, width: width);

    private static Pen CreatePreviewEdgePen(bool dashed = false, float width = UmlDiagramStyle.PreviewPenWidth) =>
        new(UmlDiagramStyle.BorderColor, width)
        {
            DashStyle = dashed ? DashStyle.Dash : DashStyle.Solid,
        };

    private static SolidBrush CreatePreviewFillBrush() => new(UmlDiagramStyle.BorderColor);

    public static void DrawSelect(Graphics g, RectangleF area, Color fill, Color stroke)    {
        var cx = area.Left + area.Width / 2f;
        var cy = area.Top + area.Height / 2f;
        using var pen = new Pen(stroke, 2f)
        {
            StartCap = System.Drawing.Drawing2D.LineCap.Round,
            EndCap = System.Drawing.Drawing2D.LineCap.Round,
        };
        g.DrawLine(pen, cx - 10, cy + 8, cx - 2, cy);
        g.DrawLine(pen, cx - 2, cy, cx + 12, cy - 12);
        using var brush = new SolidBrush(stroke);
        g.FillEllipse(brush, cx - 3, cy - 3, 6, 6);
    }

    public static void DrawClass(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawStyledClassifierBox(g, area, roundedRight: false, compartments: 3);

    public static void DrawInterface(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawStyledClassifierBox(g, area, roundedRight: true, compartments: 2);

    public static void DrawEnumeration(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var rect = FitBox(area, 1.15f);
        using var pen = CreatePreviewBorderPen(1.8f);
        UmlDiagramStyle.DrawStyledRectangle(g, rect, pen);

        var y1 = rect.Y + rect.Height * 0.34f;
        g.DrawLine(pen, rect.Left, y1, rect.Right, y1);

        using var textBrush = new SolidBrush(UmlDiagramStyle.TextColor);
        using var font = new Font("Segoe UI", Math.Max(5f, rect.Height * 0.12f));
        g.DrawString("A", font, textBrush, rect.Left + 4, rect.Y + 3);
        g.DrawString("B", font, textBrush, rect.Left + 4, y1 + 3);
    }

    public static void DrawAssociation(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        float y = area.Top + area.Height * 0.5f;
        using var pen = CreatePreviewEdgePen(width: 1.8f);
        g.DrawLine(pen, area.Left + 6f, y, area.Right - 6f, y);
    }
    public static void DrawGeneralization(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        const float tw = 13f, th = 11f;
        float y = area.Top + area.Height * 0.5f;
        float x1 = area.Left + 6f;
        float triTip = area.Right - 6f;
        float triBase = triTip - tw;
        using var pen = CreatePreviewEdgePen(width: 1.8f);
        g.DrawLine(pen, x1, y, triBase, y);
        g.DrawPolygon(pen, [new PointF(triTip, y), new PointF(triBase, y - th / 2f), new PointF(triBase, y + th / 2f)]);
    }
    public static void DrawPan(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        using var pen = new Pen(stroke, 2f);
        g.DrawLine(pen, area.Left + 8, area.Top + area.Height * 0.55f, area.Right - 8, area.Top + area.Height * 0.55f);
        g.DrawLine(pen, area.Right - 14, area.Top + area.Height * 0.55f - 6, area.Right - 8, area.Top + area.Height * 0.55f);
        g.DrawLine(pen, area.Right - 14, area.Top + area.Height * 0.55f + 6, area.Right - 8, area.Top + area.Height * 0.55f);
        g.DrawLine(pen, area.Left + 8, area.Top + area.Height * 0.55f - 6, area.Left + 8, area.Top + area.Height * 0.55f + 6);
    }

    public static void DrawPackage(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var rect = FitBox(area, 1.55f);
        using var pen = CreatePreviewBorderPen(1.8f);
        UmlPackageNotation.DrawPackagePreview(g, rect, pen);
    }

    public static void DrawActor(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var bounds = UmlActorGeometry.GetPreviewBounds(area);
        using var pen = CreatePreviewBorderPen(1.8f);
        UmlActorGeometry.DrawStickFigure(g, pen, bounds);
    }

    public static void DrawFlowFinalNode(Graphics g, RectangleF area, Color fill, Color stroke) =>
        UmlCircleNodeGeometry.DrawFlowFinalPreview(g, area, stroke);

    public static void DrawChoice(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawStyledDiamond(g, area);

    public static void DrawJunction(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawPreviewFilledCircle(g, area);

    public static void DrawShallowHistory(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawPreviewHistoryCircle(g, area, deep: false);

    public static void DrawDeepHistory(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawPreviewHistoryCircle(g, area, deep: true);
    public static void DrawLoopFragment(Graphics g, RectangleF area, Color fill, Color stroke) =>
        UmlCombinedFragmentRenderer.DrawPreview(g, area, UmlDiagramStyle.BorderColor);

    public static void DrawAltFragment(Graphics g, RectangleF area, Color fill, Color stroke) =>
        UmlCombinedFragmentRenderer.DrawPreview(g, area, UmlDiagramStyle.BorderColor);

    public static void DrawOptFragment(Graphics g, RectangleF area, Color fill, Color stroke) =>
        UmlCombinedFragmentRenderer.DrawPreview(g, area, UmlDiagramStyle.BorderColor);

    public static void DrawParFragment(Graphics g, RectangleF area, Color fill, Color stroke) =>
        UmlCombinedFragmentRenderer.DrawPreview(g, area, UmlDiagramStyle.BorderColor);

    public static void DrawBreakFragment(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawLabeledFragmentPreview(g, area, "break");

    public static void DrawRefFragment(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawLabeledFragmentPreview(g, area, "ref");

    public static void DrawInteractionOccurrence(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        DrawLabeledFragmentPreview(g, area, "sd");
        var bounds = UmlCombinedFragmentRenderer.FitPreviewBounds(area);
        using var dashPen = new Pen(stroke, UmlDiagramStyle.PreviewPenWidth)
        {
            DashStyle = System.Drawing.Drawing2D.DashStyle.Dash,
        };
        var inset = new RectangleF(bounds.X + 3f, bounds.Y + 3f, bounds.Width - 6f, bounds.Height - 6f);
        var tabHeight = Math.Clamp(inset.Height * 0.12f, 3f, 10f);
        var tabWidth = Math.Clamp(Math.Max(tabHeight * 2.4f, inset.Width * 0.4f), tabHeight * 2f, inset.Width - 4f);
        UmlCombinedFragmentRenderer.DrawFrameOutline(g, dashPen, inset, tabHeight, tabWidth);
    }

    public static void DrawDecomposedLifeline(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        DrawLifeline(g, area, fill, stroke);
        using var pen = CreatePreviewEdgePen(width: UmlDiagramStyle.PreviewPenWidth);
        var cx = area.Left + area.Width / 2f;
        var forkY = area.Top + area.Height * 0.12f;
        g.DrawLine(pen, cx - area.Width * 0.2f, forkY, cx + area.Width * 0.2f, forkY);
    }

    public static void DrawPackageMerge(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawLabeledEdge(g, area, stroke, "«merge»");

    public static void DrawPackageImport(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawLabeledEdge(g, area, stroke, "«import»");

    public static void DrawPackageNesting(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        float y = area.Top + area.Height * 0.5f;
        float x1 = area.Left + 6f;
        float x2 = area.Right - 14f;
        using var pen = CreatePreviewEdgePen(dashed: true, width: 1.8f);
        g.DrawLine(pen, x1, y, x2, y);
        g.DrawEllipse(pen, x2 - 4f, y - 4f, 8f, 8f);
        using var font = new Font("Segoe UI", 6.5f);
        using var brush = new SolidBrush(UmlDiagramStyle.TextColor);
        g.DrawString("nesting", font, brush, area.Left + 8, area.Top + 2);
    }

    public static void DrawPort(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var center = new PointF(area.Left + area.Width / 2f, area.Top + area.Height / 2f);
        using var pen = CreatePreviewBorderPen(1.8f);
        UmlComponentNotation.DrawPort(g, center, pen);
    }

    public static void DrawSwimlane(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var rect = FitBox(area, 0.65f);
        using var pen = CreatePreviewBorderPen(1.4f);
        var headerHeight = Math.Min(12f, rect.Height * 0.18f);
        UmlDiagramStyle.DrawStyledRectangle(g, rect, pen);
        g.DrawLine(pen, rect.Left, rect.Top + headerHeight, rect.Right, rect.Top + headerHeight);
    }

    public static void DrawObjectNode(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var rect = FitBox(area, 1.8f);
        using var pen = CreatePreviewBorderPen(1.8f);
        UmlDiagramStyle.DrawStyledRectangle(g, rect, pen);
    }

    public static void DrawAssociationClass(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        float y = area.Top + area.Height * 0.5f;
        float x1 = area.Left + 6f;
        float x2 = area.Right - 6f;
        var midX = (x1 + x2) / 2f;
        using var pen = CreatePreviewEdgePen(width: 1.8f);
        g.DrawLine(pen, x1, y, midX - 18f, y);
        g.DrawLine(pen, midX + 18f, y, x2, y);
        var box = new RectangleF(midX - 18f, y - 10f, 36f, 20f);
        UmlDiagramStyle.DrawStyledRectangle(g, box, pen);
    }

    public static void DrawUseCase(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var rect = FitBox(area, 1.6f);
        using var pen = CreatePreviewBorderPen(1.8f);
        UmlDiagramStyle.DrawStyledEllipse(g, rect, pen);
    }

    public static void DrawSystemBoundary(Graphics g, RectangleF area, Color fill, Color stroke) =>
        UmlSystemBoundaryRenderer.DrawPreview(g, area, UmlDiagramStyle.BorderColor);

    public static void DrawNoteLink(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var noteRect = new RectangleF(area.Left + 2f, area.Top + area.Height * 0.18f, area.Width * 0.34f, area.Height * 0.52f);
        var targetRect = new RectangleF(area.Right - area.Width * 0.36f, area.Top + area.Height * 0.28f, area.Width * 0.3f, area.Height * 0.44f);
        using var solidPen = CreatePreviewBorderPen(1.6f);
        using var dashPen = CreatePreviewEdgePen(dashed: true, width: 1.6f);
        DrawStyledNote(g, noteRect, solidPen);
        UmlDiagramStyle.DrawStyledRectangle(g, targetRect, solidPen);
        g.DrawLine(dashPen, noteRect.Right, noteRect.Top + noteRect.Height / 2f, targetRect.Left, targetRect.Top + targetRect.Height / 2f);
    }

    public static void DrawNote(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var rect = FitBox(area, 1.1f);
        using var pen = CreatePreviewBorderPen(1.8f);
        DrawStyledNote(g, rect, pen);
    }

    public static void DrawState(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawStyledRoundedBox(g, area, 14f);

    public static void DrawInitialState(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawPreviewFilledCircle(g, area);

    public static void DrawFinalState(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawPreviewFinalCircle(g, area);

    public static void DrawAction(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawStyledRoundedBox(g, area, 10f);

    public static void DrawInitialNode(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawPreviewFilledCircle(g, area);

    public static void DrawActivityFinalNode(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawPreviewFinalCircle(g, area);

    public static void DrawDecision(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        DrawStyledDiamond(g, area);
        var rect = FitBox(area, 1f);
        using var brush = new SolidBrush(stroke);
        using var font = new Font("Segoe UI", Math.Max(5f, rect.Height * 0.28f), FontStyle.Bold);
        var qs = g.MeasureString("?", font);
        var cx = rect.Left + rect.Width / 2f;
        var cy = rect.Top + rect.Height / 2f;
        g.DrawString("?", font, brush, cx - qs.Width / 2f, cy - qs.Height / 2f);
    }

    public static void DrawMerge(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawStyledDiamond(g, area);

    public static void DrawFork(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawPreviewSyncBar(g, area);

    public static void DrawJoin(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawPreviewSyncBar(g, area);

    public static void DrawLifeline(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var headerHeight = UmlSequenceLayout.HeaderHeight - 4f;
        var header = new RectangleF(area.Left + 2, area.Top + 2, area.Width - 4, headerHeight);
        using var pen = CreatePreviewBorderPen(1.5f);
        UmlDiagramStyle.FillGradientRectangle(g, header);
        g.DrawRectangle(pen, header.X, header.Y, header.Width, header.Height);

        var cx = area.Left + area.Width / 2f;
        using var dashPen = CreatePreviewEdgePen(dashed: true, width: 1.2f);
        g.DrawLine(dashPen, cx, header.Bottom, cx, area.Bottom - 2);
    }

    public static void DrawActivation(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var rect = FitBox(area, 0.35f);
        using var pen = CreatePreviewBorderPen(1.4f);
        UmlDiagramStyle.DrawStyledRectangle(g, rect, pen);
    }

    public static void DrawMessage(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawSyncMessage(g, area, fill, stroke);

    public static void DrawSyncMessage(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawArrowConnector(g, area, dashed: false, openArrow: false);

    public static void DrawAsyncMessage(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawArrowConnector(g, area, dashed: false, openArrow: true);

    public static void DrawReturnMessage(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawArrowConnector(g, area, dashed: true, openArrow: true);

    public static void DrawCreateMessage(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawArrowConnector(g, area, dashed: true, openArrow: false);

    public static void DrawDestroyMessage(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        DrawArrowConnector(g, area, dashed: false, openArrow: false);
        var cx = area.Right - 10f;
        var cy = area.Top + area.Height / 2f;
        using var pen = CreatePreviewEdgePen(width: 1.8f);
        g.DrawLine(pen, cx - 6, cy - 6, cx + 6, cy + 6);
        g.DrawLine(pen, cx + 6, cy - 6, cx - 6, cy + 6);
    }

    public static void DrawSelfMessage(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var cx = area.Left + area.Width * 0.28f;
        var top = area.Top + area.Height * 0.42f;
        var right = area.Right - 6;
        var bottom = top + area.Height * 0.28f;
        using var pen = CreatePreviewEdgePen(width: 1.8f);
        g.DrawLine(pen, cx, top, right, top);
        g.DrawLine(pen, right, top, right, bottom);
        g.DrawLine(pen, right, bottom, cx, bottom);
        DrawOpenArrow(g, pen, new PointF(cx, top), new PointF(right, top));
    }
    public static void DrawTransition(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawArrowConnector(g, area, dashed: false, openArrow: true);

    public static void DrawControlFlow(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawArrowConnector(g, area, dashed: false, openArrow: true);

    public static void DrawObjectFlow(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawArrowConnector(g, area, dashed: true, openArrow: true);

    public static void DrawDirectedAssociation(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        float y = area.Top + area.Height * 0.5f;
        float x1 = area.Left + 6f, x2 = area.Right - 6f;
        using var pen = CreatePreviewEdgePen(width: 1.8f);
        g.DrawLine(pen, x1, y, x2, y);
        DrawOpenArrow(g, pen, new PointF(x1, y), new PointF(x2, y));
    }

    public static void DrawAggregation(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        const float dw = 17f, dh = 9f;
        float y = area.Top + area.Height * 0.5f;
        float tipX = area.Left + 6f;
        float x2 = area.Right - 6f;
        using var pen = CreatePreviewEdgePen(width: 1.8f);
        g.DrawPolygon(pen, [
            new PointF(tipX,        y),
            new PointF(tipX + dw / 2f, y - dh / 2f),
            new PointF(tipX + dw,   y),
            new PointF(tipX + dw / 2f, y + dh / 2f),
        ]);
        g.DrawLine(pen, tipX + dw, y, x2, y);
    }

    public static void DrawComposition(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        const float dw = 17f, dh = 9f;
        float y = area.Top + area.Height * 0.5f;
        float tipX = area.Left + 6f;
        float x2 = area.Right - 6f;
        using var pen = CreatePreviewEdgePen(width: 1.8f);
        using var brush = CreatePreviewFillBrush();
        PointF[] diamond = [
            new PointF(tipX,        y),
            new PointF(tipX + dw / 2f, y - dh / 2f),
            new PointF(tipX + dw,   y),
            new PointF(tipX + dw / 2f, y + dh / 2f),
        ];
        g.FillPolygon(brush, diamond);
        g.DrawPolygon(pen, diamond);
        g.DrawLine(pen, tipX + dw, y, x2, y);
    }

    public static void DrawRealization(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        const float tw = 13f, th = 11f;
        float y = area.Top + area.Height * 0.5f;
        float x1 = area.Left + 6f;
        float triTip = area.Right - 6f;
        float triBase = triTip - tw;
        using var dashedPen = CreatePreviewEdgePen(dashed: true, width: 1.8f);
        using var solidPen = CreatePreviewEdgePen(width: 1.8f);
        g.DrawLine(dashedPen, x1, y, triBase, y);
        g.DrawPolygon(solidPen, [new PointF(triTip, y), new PointF(triBase, y - th / 2f), new PointF(triBase, y + th / 2f)]);
    }
    public static void DrawInclude(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawLabeledEdge(g, area, stroke, "«inc»");

    public static void DrawExtend(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawLabeledEdge(g, area, stroke, "«ext»");

    private static void DrawLabeledEdge(Graphics g, RectangleF area, Color stroke, string label)
    {
        float y = area.Top + area.Height * 0.65f;
        float x1 = area.Left + 6f, x2 = area.Right - 6f;
        using var pen = CreatePreviewEdgePen(dashed: true, width: 1.5f);
        g.DrawLine(pen, x1, y, x2, y);
        DrawOpenArrow(g, pen, new PointF(x1, y), new PointF(x2, y));
        using var font = new Font("Segoe UI", 6.5f);
        using var brush = new SolidBrush(UmlDiagramStyle.TextColor);
        using var fmt = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Far };
        g.DrawString(label, font, brush, new RectangleF(x1, area.Top + 2f, x2 - x1, y - area.Top - 4f), fmt);
    }

    public static void DrawDependency(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        float y = area.Top + area.Height * 0.5f;
        float x1 = area.Left + 6f, x2 = area.Right - 6f;
        using var pen = CreatePreviewEdgePen(dashed: true, width: 1.8f);
        g.DrawLine(pen, x1, y, x2, y);
        DrawOpenArrow(g, pen, new PointF(x1, y), new PointF(x2, y));
    }

    private static void DrawStyledClassifierBox(Graphics g, RectangleF area, bool roundedRight, int compartments)
    {
        var rect = FitBox(area, 1.1f);
        using var pen = CreatePreviewBorderPen(1.8f);

        if (roundedRight)
        {
            using var path = CreateInterfacePath(rect);
            UmlDiagramStyle.DrawShadowPath(g, path);
            UmlDiagramStyle.FillGradientPath(g, path, rect);
            g.DrawPath(pen, path);
        }
        else
        {
            UmlDiagramStyle.DrawStyledRectangle(g, rect, pen);
        }

        for (var i = 1; i < compartments; i++)
        {
            var y = rect.Y + rect.Height * i / compartments;
            g.DrawLine(pen, rect.Left, y, rect.Right, y);
        }
    }

    private static void DrawStyledRoundedBox(Graphics g, RectangleF area, float radius)
    {
        var rect = FitBox(area, 1.55f);
        using var pen = CreatePreviewBorderPen(1.8f);
        UmlDiagramStyle.DrawStyledRoundedRect(g, rect, pen, radius);
    }

    private static void DrawStyledDiamond(Graphics g, RectangleF area)
    {
        var rect = FitBox(area, 1f);
        var cx = rect.Left + rect.Width / 2f;
        var cy = rect.Top + rect.Height / 2f;
        PointF[] points =
        [
            new PointF(cx, rect.Top),
            new PointF(rect.Right, cy),
            new PointF(cx, rect.Bottom),
            new PointF(rect.Left, cy),
        ];
        using var path = new GraphicsPath();
        path.AddPolygon(points);
        using var pen = CreatePreviewBorderPen(1.8f);
        UmlDiagramStyle.DrawShadowPath(g, path);
        UmlDiagramStyle.FillGradientPath(g, path, rect);
        g.DrawPolygon(pen, points);
    }

    private static void DrawPreviewFilledCircle(Graphics g, RectangleF area)
    {
        var rect = FitSquare(area);
        using var brush = CreatePreviewFillBrush();
        g.FillEllipse(brush, rect.X, rect.Y, rect.Width, rect.Height);
    }

    private static void DrawPreviewFinalCircle(Graphics g, RectangleF area)
    {
        var rect = FitSquare(area);
        using var pen = CreatePreviewBorderPen(1.8f);
        UmlDiagramStyle.DrawStyledEllipse(g, rect, pen);
        using var brush = CreatePreviewFillBrush();
        g.FillEllipse(brush, rect.X + rect.Width * 0.25f, rect.Y + rect.Height * 0.25f, rect.Width * 0.5f, rect.Height * 0.5f);
    }

    private static void DrawPreviewHistoryCircle(Graphics g, RectangleF area, bool deep)
    {
        var rect = FitSquare(area);
        using var pen = CreatePreviewBorderPen(1.8f);
        UmlDiagramStyle.DrawStyledEllipse(g, rect, pen);
        using var brush = new SolidBrush(UmlDiagramStyle.TextColor);
        using var font = new Font("Segoe UI", Math.Max(4f, rect.Height * (deep ? 0.28f : 0.36f)), FontStyle.Bold);
        var label = deep ? "H*" : "H";
        var size = g.MeasureString(label, font);
        g.DrawString(label, font, brush, rect.Left + (rect.Width - size.Width) / 2f, rect.Top + (rect.Height - size.Height) / 2f);
    }

    private static void DrawPreviewSyncBar(Graphics g, RectangleF area)
    {
        var rect = FitBox(area, 3.5f);
        using var brush = CreatePreviewFillBrush();
        g.FillRectangle(brush, rect.X, rect.Y, rect.Width, rect.Height);
    }

    private static void DrawStyledNote(Graphics g, RectangleF rect, Pen pen)
    {
        UmlDiagramStyle.DrawStyledRectangle(g, rect, pen, UmlDiagramStyle.NoteGradientTop, UmlDiagramStyle.NoteGradientBottom);
        var fold = Math.Min(8f, rect.Width * 0.18f);
        g.DrawLine(pen, rect.Right - fold, rect.Top, rect.Right, rect.Top + fold);
        g.DrawLine(pen, rect.Right - fold, rect.Top, rect.Right - fold, rect.Top + fold);
        g.DrawLine(pen, rect.Right - fold, rect.Top + fold, rect.Right, rect.Top + fold);
    }
    private static RectangleF FitBox(RectangleF area, float aspect)
    {
        var w = area.Width * 0.82f;
        var h = w / aspect;
        if (h > area.Height * 0.88f)
        {
            h = area.Height * 0.88f;
            w = h * aspect;
        }

        return new RectangleF(
            area.Left + (area.Width - w) / 2f,
            area.Top + (area.Height - h) / 2f,
            w, h);
    }

    private static RectangleF FitSquare(RectangleF area, float fillRatio = 0.82f)
    {
        var size = Math.Min(area.Width, area.Height) * fillRatio;
        return new RectangleF(
            area.Left + (area.Width - size) / 2f,
            area.Top + (area.Height - size) / 2f,
            size,
            size);
    }

    private static System.Drawing.Drawing2D.GraphicsPath CreateInterfacePath(RectangleF rect)
    {
        var r = Math.Min(8f, rect.Width * 0.18f);
        var path = new System.Drawing.Drawing2D.GraphicsPath();
        path.AddArc(rect.Right - r * 2, rect.Y, r * 2, r * 2, 270, 90);
        path.AddArc(rect.Right - r * 2, rect.Bottom - r * 2, r * 2, r * 2, 0, 90);
        path.AddLine(rect.Right - r, rect.Bottom, rect.Left, rect.Bottom);
        path.AddLine(rect.Left, rect.Bottom, rect.Left, rect.Top);
        path.AddLine(rect.Left, rect.Top, rect.Right - r, rect.Top);
        path.CloseFigure();
        return path;
    }

    private static void DrawOpenArrow(Graphics g, Pen pen, PointF from, PointF to)
    {
        var angle = Math.Atan2(to.Y - from.Y, to.X - from.X);
        const float len = 9f;
        const float wing = 5f;
        var p1 = new PointF(
            (float)(to.X - len * Math.Cos(angle) + wing * Math.Sin(angle)),
            (float)(to.Y - len * Math.Sin(angle) - wing * Math.Cos(angle)));
        var p2 = new PointF(
            (float)(to.X - len * Math.Cos(angle) - wing * Math.Sin(angle)),
            (float)(to.Y - len * Math.Sin(angle) + wing * Math.Cos(angle)));
        g.DrawLine(pen, to, p1);
        g.DrawLine(pen, to, p2);
    }

    public static void DrawObjectInstance(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var rect = FitBox(area, 1.8f);
        using var pen = CreatePreviewBorderPen(1.8f);
        UmlObjectNotation.DrawPreview(g, rect, pen);
    }

    public static void DrawDeploymentHost(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var rect = FitBox(area, 1.4f);
        using var pen = CreatePreviewBorderPen(1.8f);
        UmlDeploymentNotation.DrawHostPreview(g, rect, pen);
    }

    public static void DrawArtifact(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var rect = FitBox(area, 1.4f);
        using var pen = CreatePreviewBorderPen(1.8f);
        UmlDeploymentNotation.DrawArtifactPreview(g, rect, pen);
    }

    public static void DrawDeployment(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawArrowConnector(g, area, dashed: true, openArrow: true);

    public static void DrawDeploymentPath(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawArrowConnector(g, area, dashed: false, openArrow: false);

    public static void DrawSequenceEndpoint(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var rect = FitSquare(area);
        using var pen = CreatePreviewBorderPen(1.8f);
        g.DrawEllipse(pen, rect.X, rect.Y, rect.Width, rect.Height);
    }

    public static void DrawGate(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var rect = FitSquare(area, 0.55f);
        using var pen = CreatePreviewBorderPen(1.8f);
        UmlDiagramStyle.DrawStyledRectangle(g, rect, pen);
    }

    public static void DrawExpansionRegion(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var rect = FitBox(area, 1.6f);
        using var pen = CreatePreviewBorderPen(1.5f);
        UmlActivityRegionRenderer.DrawPreview(g, rect, pen, expansion: true);
    }

    public static void DrawInterruptibleRegion(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var rect = FitBox(area, 1.6f);
        using var pen = CreatePreviewBorderPen(1.5f);
        UmlActivityRegionRenderer.DrawPreview(g, rect, pen, expansion: false);
    }

    // Draws the actual notation shape as a semi-transparent ghost at full rect size.
    public static void DrawGhost(Graphics g, UmlToolMode mode, RectangleF rect)
    {
        var fill = Color.FromArgb(110, 100, 160, 240);
        var stroke = Color.FromArgb(210, 40, 80, 210);

        switch (mode)
        {
            case UmlToolMode.CreateClass:
                DrawGhostBox(g, rect, fill, stroke, false, 3);
                break;
            case UmlToolMode.CreateInterface:
                DrawGhostBox(g, rect, fill, stroke, true, 2);
                break;
            case UmlToolMode.CreateEnumeration:
                DrawGhostBox(g, rect, fill, stroke, false, 2);
                break;
            case UmlToolMode.CreatePackage:
                DrawGhostPackage(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateActor:
                DrawGhostActor(g, rect, stroke);
                break;
            case UmlToolMode.CreateUseCase:
                DrawGhostUseCase(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateSystemBoundary:
                DrawGhostSystemBoundary(g, rect, stroke);
                break;
            case UmlToolMode.CreateNote:
                DrawGhostNote(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateComponent:
                DrawGhostComponent(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateProvidedInterface:
                DrawGhostProvidedInterface(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateRequiredInterface:
                DrawGhostRequiredInterface(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateState:
            case UmlToolMode.CreateAction:
                DrawGhostRoundedBox(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateInitialState:
            case UmlToolMode.CreateInitialNode:
                DrawGhostFilledCircle(g, rect, stroke);
                break;
            case UmlToolMode.CreateFinalState:
            case UmlToolMode.CreateActivityFinalNode:
                DrawGhostFinalCircle(g, rect, stroke);
                break;
            case UmlToolMode.CreateDecision:
            case UmlToolMode.CreateMerge:
            case UmlToolMode.CreateChoice:
                DrawGhostDiamond(g, rect, stroke);
                break;
            case UmlToolMode.CreateJunction:
            case UmlToolMode.CreateShallowHistory:
            case UmlToolMode.CreateDeepHistory:
                DrawGhostFilledCircle(g, rect, stroke);
                break;
            case UmlToolMode.CreateFork:
            case UmlToolMode.CreateJoin:
                DrawGhostSyncBar(g, rect, stroke);
                break;
            case UmlToolMode.CreateLifeline:
            case UmlToolMode.CreateDecomposedLifeline:
                DrawGhostLifeline(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateActivation:
                DrawGhostActivation(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateLoopFragment:
            case UmlToolMode.CreateAltFragment:
            case UmlToolMode.CreateOptFragment:
            case UmlToolMode.CreateParFragment:
            case UmlToolMode.CreateBreakFragment:
            case UmlToolMode.CreateRefFragment:
            case UmlToolMode.CreateInteractionOccurrence:
            case UmlToolMode.CreateSeqFragment:
            case UmlToolMode.CreateStrictFragment:
            case UmlToolMode.CreateNegFragment:
            case UmlToolMode.CreateCriticalFragment:
            case UmlToolMode.CreateIgnoreFragment:
            case UmlToolMode.CreateConsiderFragment:
            case UmlToolMode.CreateAssertFragment:
                DrawGhostLoopFragment(g, rect, stroke);
                break;
            case UmlToolMode.CreateSwimlane:
                DrawSwimlane(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateObjectNode:
                DrawObjectNode(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateObjectInstance:
                DrawObjectInstance(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateDeploymentHost:
                DrawDeploymentHost(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateArtifact:
                DrawArtifact(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateSequenceEndpoint:
                DrawSequenceEndpoint(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateGate:
                DrawGate(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateExpansionRegion:
                DrawExpansionRegion(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateInterruptibleRegion:
                DrawInterruptibleRegion(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreatePort:
                DrawPort(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreatePackageMerge:
            case UmlToolMode.CreatePackageImport:
            case UmlToolMode.CreatePackageNesting:
            case UmlToolMode.CreateAssociationClass:
            case UmlToolMode.CreateAssociation:
            case UmlToolMode.CreateDirectedAssociation:
            case UmlToolMode.CreateAggregation:
            case UmlToolMode.CreateComposition:
            case UmlToolMode.CreateGeneralization:
            case UmlToolMode.CreateRealization:
            case UmlToolMode.CreateDependency:
            case UmlToolMode.CreateInclude:
            case UmlToolMode.CreateExtend:
            case UmlToolMode.CreateAssembly:
            case UmlToolMode.CreateDeployment:
            case UmlToolMode.CreateDeploymentPath:
                UmlToolModeHelper.DrawPreview(g, mode, rect, fill, stroke);
                break;
            case UmlToolMode.CreateMessage:
            case UmlToolMode.CreateAsyncMessage:
            case UmlToolMode.CreateReturnMessage:
            case UmlToolMode.CreateSelfMessage:
            case UmlToolMode.CreateCreateMessage:
            case UmlToolMode.CreateDestroyMessage:
            case UmlToolMode.CreateTransition:
            case UmlToolMode.CreateControlFlow:
            case UmlToolMode.CreateObjectFlow:
                DrawGhostArrow(g, rect, stroke, mode == UmlToolMode.CreateObjectFlow || mode == UmlToolMode.CreateReturnMessage || mode == UmlToolMode.CreateCreateMessage);
                break;
            case UmlToolMode.CreateCompositeState:
                UmlStateNotation.DrawCompositeGhost(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateOrthogonalRegion:
                UmlStateNotation.DrawOrthogonalGhost(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateSubmachineState:
                UmlStateNotation.DrawSubmachineGhost(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateEntryPoint:
            case UmlToolMode.CreateExitPoint:
                DrawGhostFilledCircle(g, FitSquare(rect), stroke);
                break;
            case UmlToolMode.CreateTerminateState:
            case UmlToolMode.CreateFlowFinalNode:
                UmlCircleNodeGeometry.DrawFlowFinalGhost(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateStateInvariant:
            case UmlToolMode.CreateContinuation:
                DrawStateInvariant(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateActivityContainer:
                DrawActivityContainer(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateDataStore:
                DrawDataStore(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateNaryAssociationHub:
                DrawNaryAssociationHub(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateTable:
                DrawTable(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateProfilePackage:
                DrawProfilePackage(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateMetaclass:
                DrawMetaclass(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateTimingLifeline:
                DrawTimingLifeline(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateTimingState:
                DrawTimingState(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateInteractionUse:
                DrawInteractionUse(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateInputPin:
            case UmlToolMode.CreateOutputPin:
                DrawInputPin(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateExceptionHandler:
                DrawExceptionHandler(g, rect, fill, stroke);
                break;
            default:
                UmlToolModeHelper.GetPreviewDrawer(mode)?.Invoke(g, rect, fill, stroke);
                break;
        }
    }

    private static void DrawLabeledFragmentPreview(Graphics g, RectangleF area, string label)
    {
        UmlCombinedFragmentRenderer.DrawPreview(g, area, UmlDiagramStyle.BorderColor);
        if (UmlDiagramStyle.SilhouetteMode) return;
        using var font = new Font("Segoe UI", 6.5f, FontStyle.Bold);
        using var brush = new SolidBrush(UmlDiagramStyle.TextColor);
        g.DrawString(label, font, brush, area.Left + 6f, area.Top + 4f);
    }

    private static void DrawArrowConnector(Graphics g, RectangleF area, bool dashed, bool openArrow)
    {
        var start = new PointF(area.Left + 6, area.Top + area.Height / 2f);
        var end = new PointF(area.Right - 6, area.Top + area.Height / 2f);
        using var pen = CreatePreviewEdgePen(dashed, width: 1.8f);
        g.DrawLine(pen, start, end);
        DrawOpenArrow(g, pen, start, end, openArrow);
    }

    private static void DrawGhostRoundedBox(Graphics g, RectangleF rect, Color fill, Color stroke) =>
        DrawStyledRoundedBox(g, rect, 12f);

    private static void DrawGhostFilledCircle(Graphics g, RectangleF rect, Color stroke) =>
        DrawPreviewFilledCircle(g, rect);

    private static void DrawGhostFinalCircle(Graphics g, RectangleF rect, Color stroke) =>
        DrawPreviewFinalCircle(g, rect);

    private static void DrawGhostDiamond(Graphics g, RectangleF rect, Color stroke) =>
        DrawStyledDiamond(g, rect);

    private static void DrawGhostSyncBar(Graphics g, RectangleF rect, Color stroke) =>
        DrawPreviewSyncBar(g, rect);

    private static void DrawGhostLifeline(Graphics g, RectangleF rect, Color fill, Color stroke) =>
        DrawLifeline(g, rect, fill, stroke);

    private static void DrawGhostActivation(Graphics g, RectangleF rect, Color fill, Color stroke) =>
        DrawActivation(g, rect, fill, stroke);

    private static void DrawGhostArrow(Graphics g, RectangleF rect, Color stroke, bool dashed) =>
        DrawArrowConnector(g, rect, dashed, openArrow: true);

    private static void DrawGhostBox(Graphics g, RectangleF rect, Color fill, Color stroke, bool roundedRight, int compartments)
    {
        using var pen = CreatePreviewBorderPen(1.5f);

        if (roundedRight)
        {
            using var path = CreateInterfacePath(rect);
            UmlDiagramStyle.DrawShadowPath(g, path);
            UmlDiagramStyle.FillGradientPath(g, path, rect);
            g.DrawPath(pen, path);
        }
        else
        {
            UmlDiagramStyle.DrawStyledRectangle(g, rect, pen);
        }

        for (var i = 1; i < compartments; i++)
        {
            var lineY = rect.Y + rect.Height * i / (float)compartments;
            g.DrawLine(pen, rect.Left, lineY, rect.Right, lineY);
        }
    }

    private static void DrawGhostPackage(Graphics g, RectangleF rect, Color fill, Color stroke)
    {
        using var pen = CreatePreviewBorderPen(1.5f);
        UmlPackageNotation.DrawPackagePreview(g, rect, pen);
    }

    private static void DrawGhostActor(Graphics g, RectangleF rect, Color stroke)
    {
        using var pen = CreatePreviewBorderPen(1.5f);
        var bounds = UmlActorGeometry.GetPreviewBounds(rect, padding: 1f);
        UmlActorGeometry.DrawStickFigure(g, pen, bounds);
    }

    private static void DrawGhostLoopFragment(Graphics g, RectangleF rect, Color stroke) =>
        UmlCombinedFragmentRenderer.DrawPreview(g, rect, UmlDiagramStyle.BorderColor);

    private static void DrawGhostUseCase(Graphics g, RectangleF rect, Color fill, Color stroke)
    {
        using var pen = CreatePreviewBorderPen(1.5f);
        UmlDiagramStyle.DrawStyledEllipse(g, rect, pen);
    }

    private static void DrawGhostSystemBoundary(Graphics g, RectangleF rect, Color stroke)
    {
        using var pen = CreatePreviewBorderPen(1.5f);
        UmlSystemBoundaryRenderer.Draw(g, "System", rect, pen, selected: false);
    }

    private static void DrawGhostNote(Graphics g, RectangleF rect, Color fill, Color stroke)
    {
        using var pen = CreatePreviewBorderPen(1.5f);
        DrawStyledNote(g, rect, pen);
    }

    private static void DrawGhostComponent(Graphics g, RectangleF rect, Color fill, Color stroke)
    {
        using var pen = CreatePreviewBorderPen(1.5f);
        UmlComponentNotation.DrawComponentPreview(g, rect, pen);
    }

    private static void DrawGhostProvidedInterface(Graphics g, RectangleF rect, Color fill, Color stroke)
    {
        using var pen = CreatePreviewBorderPen(1.5f);
        UmlComponentNotation.DrawProvidedInterface(g, rect, "I", pen);
    }

    private static void DrawGhostRequiredInterface(Graphics g, RectangleF rect, Color fill, Color stroke)
    {
        using var pen = CreatePreviewBorderPen(1.5f);
        UmlComponentNotation.DrawRequiredInterface(g, rect, "I", pen);
    }

    private static System.Drawing.Drawing2D.GraphicsPath CreateRoundedPath(RectangleF rect, float radius) =>
        UmlDiagramStyle.CreateRoundedPath(rect, radius);

    public static void DrawComponent(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var rect = FitBox(area, 1.12f);
        using var pen = CreatePreviewBorderPen(1.8f);
        // Draw box outline
        UmlDiagramStyle.DrawStyledRectangle(g, rect, pen);
        // Component glyph (small rectangles with notches) — outline only in silhouette mode
        DrawComponentGlyphSilhouette(g, rect, pen);
    }

    private static void DrawComponentGlyphSilhouette(Graphics g, RectangleF bounds, Pen pen)
    {
        var margin = 3f;
        var barW = Math.Clamp(bounds.Width * 0.10f, 4f, 8f);
        var barH = Math.Clamp(bounds.Height * 0.32f, 10f, 20f);
        var barX = bounds.Right - margin - barW;
        var barY = bounds.Y + margin;
        var tabH = Math.Max(3f, barH * 0.26f);
        var gap = Math.Max(1f, barH * 0.08f);
        var topTabW = barW * 1.6f;
        var bottomTabW = barW * 1.4f;
        g.DrawRectangle(pen, barX, barY, barW, barH);
        g.DrawRectangle(pen, barX - topTabW, barY, topTabW, tabH);
        g.DrawRectangle(pen, barX - bottomTabW, barY + tabH + gap, bottomTabW, tabH);
    }

    public static void DrawProvidedInterface(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        // Lollipop: short stem + circle (○──) centered in tile
        var cy = area.Top + area.Height / 2f;
        var r = Math.Min(area.Height * 0.30f, 11f);
        var circCx = area.Left + area.Width * 0.68f;
        var stemStart = area.Left + area.Width * 0.18f;
        using var pen = CreatePreviewBorderPen(1.8f);
        g.DrawLine(pen, stemStart, cy, circCx - r, cy);
        if (!UmlDiagramStyle.SilhouetteMode)
        {
            using var fb = new SolidBrush(fill);
            g.FillEllipse(fb, circCx - r, cy - r, r * 2f, r * 2f);
        }
        g.DrawEllipse(pen, circCx - r, cy - r, r * 2f, r * 2f);
    }

    public static void DrawRequiredInterface(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        // Socket: half-circle arc (⊃) on right + stem
        var cy = area.Top + area.Height / 2f;
        var r = Math.Min(area.Height * 0.30f, 11f);
        var arcCx = area.Left + area.Width * 0.68f;
        var stemEnd = area.Left + area.Width * 0.18f;
        using var pen = CreatePreviewBorderPen(1.8f);
        g.DrawLine(pen, stemEnd, cy, arcCx - r * 0.15f, cy);
        g.DrawArc(pen, arcCx - r, cy - r, r * 2f, r * 2f, -90f, 180f);
    }

    public static void DrawAssembly(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        // Socket on left ⊃ + line + lollipop on right ○
        float y = area.Top + area.Height * 0.5f;
        using var pen = CreatePreviewEdgePen(width: 1.8f);
        var sockR = 5f;
        var ballR = 4f;
        var x1 = area.Left + 8f;
        var x2 = area.Right - 10f;
        g.DrawLine(pen, x1 + sockR * 0.15f, y, x2 - ballR, y);
        // Socket (left)
        g.DrawArc(pen, x1 - sockR, y - sockR, sockR * 2f, sockR * 2f, -90f, 180f);
        // Ball/lollipop (right)
        if (!UmlDiagramStyle.SilhouetteMode)
        {
            using var fb = new SolidBrush(fill);
            g.FillEllipse(fb, x2 - ballR, y - ballR, ballR * 2f, ballR * 2f);
        }
        g.DrawEllipse(pen, x2 - ballR, y - ballR, ballR * 2f, ballR * 2f);
    }

    private static void DrawOpenArrow(Graphics g, Pen pen, PointF from, PointF to, bool open)
    {
        var angle = Math.Atan2(to.Y - from.Y, to.X - from.X);
        const float len = 9f;
        const float wing = 5f;
        var p1 = new PointF(
            (float)(to.X - len * Math.Cos(angle) + wing * Math.Sin(angle)),
            (float)(to.Y - len * Math.Sin(angle) - wing * Math.Cos(angle)));
        var p2 = new PointF(
            (float)(to.X - len * Math.Cos(angle) - wing * Math.Sin(angle)),
            (float)(to.Y - len * Math.Sin(angle) + wing * Math.Cos(angle)));

        if (open)
        {
            g.DrawLine(pen, to, p1);
            g.DrawLine(pen, to, p2);
            return;
        }

        using var brush = CreatePreviewFillBrush();
        g.FillPolygon(brush, [to, p1, p2]);
        g.DrawLine(pen, to, p1);
        g.DrawLine(pen, to, p2);
    }

    public static void DrawNaryAssociationHub(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawGhostDiamond(g, FitSquare(area), stroke);

    public static void DrawClassNesting(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawPackageNesting(g, area, fill, stroke);

    public static void DrawTable(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var r = Shrink(area, 6f, 4f);
        using var pen = CreatePreviewBorderPen(1.4f);
        using var fillBrush = CreatePreviewFillBrush();

        if (!UmlDiagramStyle.SilhouetteMode)
        {
            g.FillRectangle(fillBrush, r);
        }
        g.DrawRectangle(pen, r.X, r.Y, r.Width, r.Height);

        // Header row separator (30% down)
        var headerH = r.Height * 0.30f;
        var headerY = r.Top + headerH;
        g.DrawLine(pen, r.Left, headerY, r.Right, headerY);

        // Fill header darker if not silhouette
        if (!UmlDiagramStyle.SilhouetteMode)
        {
            using var headerBrush = new SolidBrush(Color.FromArgb(40, stroke));
            g.FillRectangle(headerBrush, r.Left + 0.5f, r.Top + 0.5f, r.Width - 1f, headerH - 0.5f);
        }

        // 2 data row dividers
        var rowH = (r.Height - headerH) / 3f;
        for (var i = 1; i <= 2; i++)
        {
            var rowY = headerY + rowH * i;
            g.DrawLine(pen, r.Left, rowY, r.Right, rowY);
        }

        // 1 column divider
        var colX = r.Left + r.Width * 0.45f;
        g.DrawLine(pen, colX, headerY, colX, r.Bottom);
    }

    private static RectangleF Shrink(RectangleF r, float dx, float dy) =>
        new(r.X + dx, r.Y + dy, r.Width - dx * 2f, r.Height - dy * 2f);

    public static void DrawTrace(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawDependency(g, area, fill, stroke);

    public static void DrawApplyDependency(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawDependency(g, area, fill, stroke);

    private static void DrawLabeledFragment(Graphics g, RectangleF area, Color stroke, string label)
    {
        UmlCombinedFragmentRenderer.DrawPreview(g, area, stroke);
        if (UmlDiagramStyle.SilhouetteMode) return;
        using var font = new Font("Segoe UI", 7f, FontStyle.Bold);
        using var brush = new SolidBrush(stroke);
        g.DrawString(label, font, brush, area.Left + 6f, area.Top + 2f);
    }

    public static void DrawSeqFragment(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawLabeledFragment(g, area, stroke, "seq");
    public static void DrawStrictFragment(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawLabeledFragment(g, area, stroke, "strict");
    public static void DrawNegFragment(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawLabeledFragment(g, area, stroke, "neg");
    public static void DrawCriticalFragment(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawLabeledFragment(g, area, stroke, "critical");
    public static void DrawIgnoreFragment(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawLabeledFragment(g, area, stroke, "ignore");
    public static void DrawConsiderFragment(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawLabeledFragment(g, area, stroke, "consider");
    public static void DrawAssertFragment(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawLabeledFragment(g, area, stroke, "assert");

    public static void DrawStateInvariant(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var bounds = FitBox(area, 1f);
        using var path = new System.Drawing.Drawing2D.GraphicsPath();
        if (bounds.Width <= bounds.Height)
        {
            path.AddEllipse(bounds);
        }
        else
        {
            var r = bounds.Height / 2f;
            path.AddArc(bounds.Right - bounds.Height, bounds.Top, bounds.Height, bounds.Height, -90f, 180f);
            path.AddLine(bounds.Right - r, bounds.Bottom, bounds.Left + r, bounds.Bottom);
            path.AddArc(bounds.Left, bounds.Top, bounds.Height, bounds.Height, 90f, 180f);
            path.CloseFigure();
        }
        if (!UmlDiagramStyle.SilhouetteMode)
        {
            using var fillBrush = new SolidBrush(fill);
            g.FillPath(fillBrush, path);
        }
        using var pen = new Pen(stroke, 1.4f);
        g.DrawPath(pen, path);
    }

    public static void DrawContinuation(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawStateInvariant(g, area, fill, stroke);

    public static void DrawCompositeState(Graphics g, RectangleF area, Color fill, Color stroke) =>
        UmlStateNotation.DrawCompositePreview(g, area, stroke);

    public static void DrawOrthogonalRegion(Graphics g, RectangleF area, Color fill, Color stroke) =>
        UmlStateNotation.DrawOrthogonalPreview(g, area, stroke);

    public static void DrawEntryPoint(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawGhostFilledCircle(g, FitSquare(area), stroke);

    public static void DrawExitPoint(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawEntryPoint(g, area, fill, stroke);

    public static void DrawTerminateState(Graphics g, RectangleF area, Color fill, Color stroke) =>
        UmlCircleNodeGeometry.DrawFlowFinalPreview(g, area, stroke);

    public static void DrawSubmachineState(Graphics g, RectangleF area, Color fill, Color stroke) =>
        UmlStateNotation.DrawSubmachinePreview(g, area, stroke);

    public static void DrawActivityContainer(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawAction(g, area, fill, stroke);

    public static void DrawDataStore(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawObjectNode(g, area, fill, stroke);

    public static void DrawInputPin(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        // Input pin: arrow pointing INTO a small box  →□
        var boxSize = Math.Min(area.Width * 0.28f, area.Height * 0.55f);
        var cy = area.Top + area.Height / 2f;
        var boxRight = area.Left + area.Width * 0.68f;
        var boxLeft = boxRight - boxSize;
        var boxTop = cy - boxSize / 2f;
        using var pen = CreatePreviewBorderPen(1.6f);
        using var brush = CreatePreviewFillBrush();
        g.FillRectangle(brush, boxLeft, boxTop, boxSize, boxSize);
        g.DrawRectangle(pen, boxLeft, boxTop, boxSize, boxSize);
        g.DrawLine(pen, area.Left + 4f, cy, boxLeft, cy);
        DrawOpenArrow(g, pen, new PointF(area.Left + 4f, cy), new PointF(boxLeft, cy));
    }

    public static void DrawOutputPin(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        // Output pin: small box with arrow pointing OUT  □→
        var boxSize = Math.Min(area.Width * 0.28f, area.Height * 0.55f);
        var cy = area.Top + area.Height / 2f;
        var boxLeft = area.Left + area.Width * 0.32f;
        var boxRight = boxLeft + boxSize;
        var boxTop = cy - boxSize / 2f;
        using var pen = CreatePreviewBorderPen(1.6f);
        using var brush = CreatePreviewFillBrush();
        g.FillRectangle(brush, boxLeft, boxTop, boxSize, boxSize);
        g.DrawRectangle(pen, boxLeft, boxTop, boxSize, boxSize);
        g.DrawLine(pen, boxRight, cy, area.Right - 4f, cy);
        DrawOpenArrow(g, pen, new PointF(boxRight, cy), new PointF(area.Right - 4f, cy));
    }

    public static void DrawExceptionHandler(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        using var pen = new Pen(stroke, 1.4f);
        var y = area.Top + area.Height / 2f;
        g.DrawLine(pen, area.Left, y, area.Left + area.Width * 0.25f, y - 6f);
        g.DrawLine(pen, area.Left + area.Width * 0.25f, y - 6f, area.Left + area.Width * 0.5f, y + 6f);
        g.DrawLine(pen, area.Left + area.Width * 0.5f, y + 6f, area.Right, y);
    }

    public static void DrawProfilePackage(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawPackage(g, area, fill, stroke);

    public static void DrawMetaclass(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawClass(g, area, fill, stroke);

    public static void DrawTimingLifeline(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        using var pen = new Pen(stroke, 1.4f);
        g.DrawLine(pen, area.Left, area.Top + 12f, area.Right, area.Top + 12f);
        g.DrawLine(pen, area.Left, area.Top + 12f, area.Left, area.Bottom);
        g.DrawLine(pen, area.Right, area.Top + 12f, area.Right, area.Bottom);
    }

    public static void DrawTimingState(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        using var pen = new Pen(stroke, 1.4f);
        g.DrawRectangle(pen, area.X, area.Y, area.Width, area.Height);
    }

    public static void DrawInteractionUse(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawAction(g, area, fill, stroke);
}
