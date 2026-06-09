using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlNotationPreview
{
    public static void DrawSelect(Graphics g, RectangleF area, Color fill, Color stroke)
    {
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

    public static void DrawClass(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        DrawClassifierBox(g, area, fill, stroke, roundedRight: false, compartments: 3);
    }

    public static void DrawInterface(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        DrawClassifierBox(g, area, fill, stroke, roundedRight: true, compartments: 2);
    }

    public static void DrawEnumeration(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var rect = FitBox(area, 1.15f);
        using var fillBrush = new SolidBrush(fill);
        using var pen = new Pen(stroke, 1.8f);
        g.FillRectangle(fillBrush, rect.X, rect.Y, rect.Width, rect.Height);
        g.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);

        var y1 = rect.Y + rect.Height * 0.34f;
        g.DrawLine(pen, rect.Left, y1, rect.Right, y1);

        using var textPen = new SolidBrush(stroke);
        using var font = new Font("Segoe UI", Math.Max(5f, rect.Height * 0.12f));
        g.DrawString("A", font, textPen, rect.Left + 4, rect.Y + 3);
        g.DrawString("B", font, textPen, rect.Left + 4, y1 + 3);
    }

    public static void DrawAssociation(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var left = new RectangleF(area.Left + 2, area.Top + area.Height * 0.2f, area.Width * 0.34f, area.Height * 0.55f);
        var right = new RectangleF(area.Right - area.Width * 0.36f, area.Top + area.Height * 0.25f, area.Width * 0.34f, area.Height * 0.55f);
        DrawMiniBox(g, left, fill, stroke);
        DrawMiniBox(g, right, fill, stroke);

        using var pen = new Pen(stroke, 1.8f);
        var start = new PointF(left.Right, left.Top + left.Height / 2f);
        var end = new PointF(right.Left, right.Top + right.Height / 2f);
        g.DrawLine(pen, start, end);
    }

    public static void DrawGeneralization(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var parent = new RectangleF(area.Left + area.Width * 0.22f, area.Top + 4, area.Width * 0.56f, area.Height * 0.34f);
        var child = new RectangleF(area.Left + area.Width * 0.22f, area.Bottom - area.Height * 0.36f, area.Width * 0.56f, area.Height * 0.34f);
        DrawMiniBox(g, parent, fill, stroke);
        DrawMiniBox(g, child, fill, stroke);

        using var pen = new Pen(stroke, 1.8f);
        var start = new PointF(parent.Left + parent.Width / 2f, parent.Bottom);
        var end = new PointF(child.Left + child.Width / 2f, child.Top - 8);
        g.DrawLine(pen, start, end);

        var tip = new PointF(child.Left + child.Width / 2f, child.Top);
        var baseY = child.Top - 7;
        g.DrawPolygon(pen, [
            tip,
            new PointF(tip.X - 6, baseY),
            new PointF(tip.X + 6, baseY),
        ]);
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
        var rect = FitBox(area, 1.2f);
        using var pen = new Pen(stroke, 1.8f);
        using var fillBrush = new SolidBrush(fill);
        var tabW = rect.Width * 0.4f;
        g.FillRectangle(fillBrush, rect.X, rect.Y + 10, rect.Width, rect.Height - 10);
        g.DrawRectangle(pen, rect.X, rect.Y + 10, rect.Width, rect.Height - 10);
        g.DrawRectangle(pen, rect.X, rect.Y, tabW, 12);
    }

    public static void DrawActor(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var cx = area.Left + area.Width / 2f;
        var headR = Math.Min(area.Width * 0.13f, 18f);
        var headY = area.Top + headR + 2;
        using var pen = new Pen(stroke, 1.8f);
        // head
        g.DrawEllipse(pen, cx - headR, headY - headR, headR * 2, headR * 2);
        // body
        g.DrawLine(pen, cx, headY + headR, cx, area.Bottom - area.Height * 0.3f);
        // arms
        g.DrawLine(pen, cx, headY + headR * 2f, area.Left + 4, area.Top + area.Height * 0.52f);
        g.DrawLine(pen, cx, headY + headR * 2f, area.Right - 4, area.Top + area.Height * 0.52f);
        // legs
        var hipsY = area.Bottom - area.Height * 0.3f;
        g.DrawLine(pen, cx, hipsY, area.Left + 6, area.Bottom - 2);
        g.DrawLine(pen, cx, hipsY, area.Right - 6, area.Bottom - 2);
    }

    public static void DrawUseCase(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var rect = FitBox(area, 1.6f);
        using var pen = new Pen(stroke, 1.8f);
        using var fillBrush = new SolidBrush(fill);
        g.FillEllipse(fillBrush, rect.X, rect.Y, rect.Width, rect.Height);
        g.DrawEllipse(pen, rect.X, rect.Y, rect.Width, rect.Height);
    }

    public static void DrawNote(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var rect = FitBox(area, 1.1f);
        using var pen = new Pen(stroke, 1.8f);
        using var fillBrush = new SolidBrush(Color.FromArgb(255, 255, 244, 180));
        g.FillRectangle(fillBrush, rect.X, rect.Y, rect.Width, rect.Height);
        g.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);
        g.DrawLine(pen, rect.Right - 8, rect.Top, rect.Right, rect.Top + 8);
        g.DrawLine(pen, rect.Right - 8, rect.Top, rect.Right - 8, rect.Top + 8);
        g.DrawLine(pen, rect.Right - 8, rect.Top + 8, rect.Right, rect.Top + 8);
    }

    public static void DrawState(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawRoundedBox(g, area, fill, stroke, 14f);

    public static void DrawInitialState(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawFilledCircle(g, area, stroke, stroke);

    public static void DrawFinalState(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawFinalCircle(g, area, stroke);

    public static void DrawAction(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawRoundedBox(g, area, fill, stroke, 10f);

    public static void DrawInitialNode(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawFilledCircle(g, area, stroke, stroke);

    public static void DrawActivityFinalNode(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawFinalCircle(g, area, stroke);

    public static void DrawDecision(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawDiamond(g, area, fill, stroke);

    public static void DrawMerge(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawDiamond(g, area, fill, stroke);

    public static void DrawFork(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawSyncBar(g, area, stroke);

    public static void DrawJoin(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawSyncBar(g, area, stroke);

    public static void DrawLifeline(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var header = new RectangleF(area.Left + 2, area.Top + 2, area.Width - 4, Math.Max(18f, area.Height * 0.18f));
        using var fillBrush = new SolidBrush(fill);
        using var pen = new Pen(stroke, 1.5f);
        g.FillRectangle(fillBrush, header.X, header.Y, header.Width, header.Height);
        g.DrawRectangle(pen, header.X, header.Y, header.Width, header.Height);

        var cx = area.Left + area.Width / 2f;
        using var dashPen = new Pen(stroke, 1.2f)
        {
            DashStyle = System.Drawing.Drawing2D.DashStyle.Dash,
        };
        g.DrawLine(dashPen, cx, header.Bottom, cx, area.Bottom - 2);
    }

    public static void DrawActivation(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var rect = FitBox(area, 0.35f);
        using var fillBrush = new SolidBrush(fill);
        using var pen = new Pen(stroke, 1.4f);
        g.FillRectangle(fillBrush, rect.X, rect.Y, rect.Width, rect.Height);
        g.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);
    }

    public static void DrawMessage(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawSyncMessage(g, area, fill, stroke);

    public static void DrawSyncMessage(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawArrowConnector(g, area, stroke, dashed: false, openArrow: false);

    public static void DrawAsyncMessage(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawArrowConnector(g, area, stroke, dashed: false, openArrow: true);

    public static void DrawReturnMessage(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawArrowConnector(g, area, stroke, dashed: true, openArrow: true);

    public static void DrawSelfMessage(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var cx = area.Left + area.Width * 0.28f;
        var top = area.Top + area.Height * 0.42f;
        var right = area.Right - 6;
        var bottom = top + area.Height * 0.28f;
        using var pen = new Pen(stroke, 1.8f);
        g.DrawLine(pen, cx, top, right, top);
        g.DrawLine(pen, right, top, right, bottom);
        g.DrawLine(pen, right, bottom, cx, bottom);
        DrawOpenArrow(g, pen, new PointF(cx, top), new PointF(right, top));
    }

    public static void DrawTransition(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawArrowConnector(g, area, stroke, dashed: false, openArrow: true);

    public static void DrawControlFlow(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawArrowConnector(g, area, stroke, dashed: false, openArrow: true);

    public static void DrawObjectFlow(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawArrowConnector(g, area, stroke, dashed: true, openArrow: true);

    public static void DrawDirectedAssociation(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        DrawAssociation(g, area, fill, stroke);
        using var pen = new Pen(stroke, 1.8f);
        var end = new PointF(area.Right - area.Width * 0.36f, area.Top + area.Height * 0.52f);
        DrawOpenArrow(g, pen, new PointF(end.X - 20, end.Y), end);
    }

    public static void DrawAggregation(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        DrawAssociation(g, area, fill, stroke);
        using var pen = new Pen(stroke, 1.8f);
        var end = new PointF(area.Right - area.Width * 0.36f, area.Top + area.Height * 0.52f);
        g.DrawPolygon(pen, [end, new PointF(end.X - 8, end.Y - 5), new PointF(end.X - 14, end.Y), new PointF(end.X - 8, end.Y + 5)]);
    }

    public static void DrawComposition(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        DrawAssociation(g, area, fill, stroke);
        using var pen = new Pen(stroke, 1.8f);
        using var brush = new SolidBrush(stroke);
        var end = new PointF(area.Right - area.Width * 0.36f, area.Top + area.Height * 0.52f);
        var pts = new[] { end, new PointF(end.X - 8, end.Y - 5), new PointF(end.X - 14, end.Y), new PointF(end.X - 8, end.Y + 5) };
        g.FillPolygon(brush, pts);
        g.DrawPolygon(pen, pts);
    }

    public static void DrawRealization(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        DrawGeneralization(g, area, fill, stroke);
        using var pen = new Pen(stroke, 1.8f) { DashStyle = System.Drawing.Drawing2D.DashStyle.Dash };
        var child = new RectangleF(area.Left + area.Width * 0.22f, area.Bottom - area.Height * 0.36f, area.Width * 0.56f, area.Height * 0.34f);
        var parent = new RectangleF(area.Left + area.Width * 0.22f, area.Top + 4, area.Width * 0.56f, area.Height * 0.34f);
        g.DrawLine(pen, new PointF(parent.Left + parent.Width / 2f, parent.Bottom), new PointF(child.Left + child.Width / 2f, child.Top - 8));
    }

    public static void DrawInclude(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawLabeledEdge(g, area, stroke, "«inc»");

    public static void DrawExtend(Graphics g, RectangleF area, Color fill, Color stroke) =>
        DrawLabeledEdge(g, area, stroke, "«ext»");

    private static void DrawLabeledEdge(Graphics g, RectangleF area, Color stroke, string label)
    {
        var left = new RectangleF(area.Left + 6, area.Top + area.Height * 0.35f, area.Width * 0.28f, area.Height * 0.3f);
        var right = new RectangleF(area.Right - area.Width * 0.34f, area.Top + area.Height * 0.35f, area.Width * 0.28f, area.Height * 0.3f);
        using var pen = new Pen(stroke, 1.5f) { DashStyle = System.Drawing.Drawing2D.DashStyle.Dash };
        g.DrawEllipse(pen, left.X, left.Y, left.Width, left.Height);
        g.DrawEllipse(pen, right.X, right.Y, right.Width, right.Height);
        var start = new PointF(left.Right, left.Top + left.Height / 2f);
        var end = new PointF(right.Left, right.Top + right.Height / 2f);
        g.DrawLine(pen, start, end);
        DrawOpenArrow(g, pen, start, end);
        using var font = new Font("Segoe UI", 6f);
        using var brush = new SolidBrush(stroke);
        g.DrawString(label, font, brush, (start.X + end.X) / 2f - 8, (start.Y + end.Y) / 2f - 10);
    }

    public static void DrawDependency(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var left = new RectangleF(area.Left + 4, area.Top + area.Height * 0.28f, area.Width * 0.34f, area.Height * 0.44f);
        var right = new RectangleF(area.Right - area.Width * 0.38f, area.Top + area.Height * 0.28f, area.Width * 0.34f, area.Height * 0.44f);
        DrawMiniBox(g, left, fill, stroke);
        DrawMiniBox(g, right, fill, stroke);

        using var pen = new Pen(stroke, 1.8f) { DashStyle = System.Drawing.Drawing2D.DashStyle.Dash };
        var start = new PointF(left.Right, left.Top + left.Height / 2f);
        var end = new PointF(right.Left, right.Top + right.Height / 2f);
        g.DrawLine(pen, start, end);
        DrawOpenArrow(g, pen, start, end);
    }

    private static void DrawClassifierBox(Graphics g, RectangleF area, Color fill, Color stroke, bool roundedRight, int compartments)
    {
        var rect = FitBox(area, 1.1f);
        using var fillBrush = new SolidBrush(fill);
        using var pen = new Pen(stroke, 1.8f);

        if (roundedRight)
        {
            using var path = CreateInterfacePath(rect);
            g.FillPath(fillBrush, path);
            g.DrawPath(pen, path);
        }
        else
        {
            g.FillRectangle(fillBrush, rect.X, rect.Y, rect.Width, rect.Height);
            g.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);
        }

        for (var i = 1; i < compartments; i++)
        {
            var y = rect.Y + rect.Height * i / compartments;
            g.DrawLine(pen, rect.Left, y, rect.Right, y);
        }
    }

    private static void DrawMiniBox(Graphics g, RectangleF rect, Color fill, Color stroke)
    {
        using var fillBrush = new SolidBrush(fill);
        using var pen = new Pen(stroke, 1.5f);
        g.FillRectangle(fillBrush, rect.X, rect.Y, rect.Width, rect.Height);
        g.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);
        var y = rect.Y + rect.Height * 0.38f;
        g.DrawLine(pen, rect.Left, y, rect.Right, y);
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
        const float len = 7f;
        const float wing = 3.5f;
        var p1 = new PointF(
            (float)(to.X - len * Math.Cos(angle) + wing * Math.Sin(angle)),
            (float)(to.Y - len * Math.Sin(angle) - wing * Math.Cos(angle)));
        var p2 = new PointF(
            (float)(to.X - len * Math.Cos(angle) - wing * Math.Sin(angle)),
            (float)(to.Y - len * Math.Sin(angle) + wing * Math.Cos(angle)));
        g.DrawLine(pen, to, p1);
        g.DrawLine(pen, to, p2);
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
            case UmlToolMode.CreateNote:
                DrawGhostNote(g, rect, fill, stroke);
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
                DrawGhostDiamond(g, rect, stroke);
                break;
            case UmlToolMode.CreateFork:
            case UmlToolMode.CreateJoin:
                DrawGhostSyncBar(g, rect, stroke);
                break;
            case UmlToolMode.CreateLifeline:
                DrawGhostLifeline(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateActivation:
                DrawGhostActivation(g, rect, fill, stroke);
                break;
            case UmlToolMode.CreateMessage:
            case UmlToolMode.CreateAsyncMessage:
            case UmlToolMode.CreateReturnMessage:
            case UmlToolMode.CreateSelfMessage:
            case UmlToolMode.CreateTransition:
            case UmlToolMode.CreateControlFlow:
            case UmlToolMode.CreateObjectFlow:
                DrawGhostArrow(g, rect, stroke, mode == UmlToolMode.CreateObjectFlow || mode == UmlToolMode.CreateReturnMessage);
                break;
        }
    }

    private static void DrawRoundedBox(Graphics g, RectangleF area, Color fill, Color stroke, float radius)
    {
        var rect = FitBox(area, 1.55f);
        using var fillBrush = new SolidBrush(fill);
        using var pen = new Pen(stroke, 1.8f);
        using var path = CreateRoundedPath(rect, radius);
        g.FillPath(fillBrush, path);
        g.DrawPath(pen, path);
    }

    private static void DrawFilledCircle(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var rect = FitBox(area, 1f);
        using var fillBrush = new SolidBrush(fill);
        using var pen = new Pen(stroke, 1.8f);
        g.FillEllipse(fillBrush, rect.X, rect.Y, rect.Width, rect.Height);
        g.DrawEllipse(pen, rect.X, rect.Y, rect.Width, rect.Height);
    }

    private static void DrawFinalCircle(Graphics g, RectangleF area, Color stroke)
    {
        var rect = FitBox(area, 1f);
        using var pen = new Pen(stroke, 1.8f);
        g.DrawEllipse(pen, rect.X, rect.Y, rect.Width, rect.Height);
        g.FillEllipse(new SolidBrush(stroke), rect.X + rect.Width * 0.25f, rect.Y + rect.Height * 0.25f, rect.Width * 0.5f, rect.Height * 0.5f);
    }

    private static void DrawDiamond(Graphics g, RectangleF area, Color fill, Color stroke)
    {
        var rect = FitBox(area, 1f);
        var cx = rect.Left + rect.Width / 2f;
        var cy = rect.Top + rect.Height / 2f;
        var points = new[]
        {
            new PointF(cx, rect.Top),
            new PointF(rect.Right, cy),
            new PointF(cx, rect.Bottom),
            new PointF(rect.Left, cy),
        };
        using var fillBrush = new SolidBrush(fill);
        using var pen = new Pen(stroke, 1.8f);
        g.FillPolygon(fillBrush, points);
        g.DrawPolygon(pen, points);
    }

    private static void DrawSyncBar(Graphics g, RectangleF area, Color stroke)
    {
        var rect = FitBox(area, 3.5f);
        using var brush = new SolidBrush(stroke);
        g.FillRectangle(brush, rect.X, rect.Y, rect.Width, rect.Height);
    }

    private static void DrawArrowConnector(Graphics g, RectangleF area, Color stroke, bool dashed, bool openArrow)
    {
        var start = new PointF(area.Left + 6, area.Top + area.Height / 2f);
        var end = new PointF(area.Right - 6, area.Top + area.Height / 2f);
        using var pen = new Pen(stroke, 1.8f)
        {
            DashStyle = dashed ? System.Drawing.Drawing2D.DashStyle.Dash : System.Drawing.Drawing2D.DashStyle.Solid,
        };
        g.DrawLine(pen, start, end);
        DrawOpenArrow(g, pen, start, end, openArrow);
    }

    private static void DrawGhostRoundedBox(Graphics g, RectangleF rect, Color fill, Color stroke)
    {
        using var fillBrush = new SolidBrush(fill);
        using var pen = new Pen(stroke, 1.5f);
        using var path = CreateRoundedPath(FitBox(rect, 1.5f), 12f);
        g.FillPath(fillBrush, path);
        g.DrawPath(pen, path);
    }

    private static void DrawGhostFilledCircle(Graphics g, RectangleF rect, Color stroke)
    {
        var fitted = FitBox(rect, 1f);
        using var brush = new SolidBrush(stroke);
        g.FillEllipse(brush, fitted.X, fitted.Y, fitted.Width, fitted.Height);
    }

    private static void DrawGhostFinalCircle(Graphics g, RectangleF rect, Color stroke)
    {
        var fitted = FitBox(rect, 1f);
        using var pen = new Pen(stroke, 1.5f);
        g.DrawEllipse(pen, fitted.X, fitted.Y, fitted.Width, fitted.Height);
        g.FillEllipse(new SolidBrush(stroke), fitted.X + fitted.Width * 0.25f, fitted.Y + fitted.Height * 0.25f, fitted.Width * 0.5f, fitted.Height * 0.5f);
    }

    private static void DrawGhostDiamond(Graphics g, RectangleF rect, Color stroke)
    {
        var fitted = FitBox(rect, 1f);
        var cx = fitted.Left + fitted.Width / 2f;
        var cy = fitted.Top + fitted.Height / 2f;
        using var pen = new Pen(stroke, 1.5f);
        g.DrawPolygon(pen, [
            new PointF(cx, fitted.Top),
            new PointF(fitted.Right, cy),
            new PointF(cx, fitted.Bottom),
            new PointF(fitted.Left, cy),
        ]);
    }

    private static void DrawGhostSyncBar(Graphics g, RectangleF rect, Color stroke)
    {
        var fitted = FitBox(rect, 3.5f);
        using var brush = new SolidBrush(stroke);
        g.FillRectangle(brush, fitted.X, fitted.Y, fitted.Width, fitted.Height);
    }

    private static void DrawGhostLifeline(Graphics g, RectangleF rect, Color fill, Color stroke)
    {
        DrawLifeline(g, rect, fill, stroke);
    }

    private static void DrawGhostActivation(Graphics g, RectangleF rect, Color fill, Color stroke)
    {
        DrawActivation(g, rect, fill, stroke);
    }

    private static void DrawGhostArrow(Graphics g, RectangleF rect, Color stroke, bool dashed)
    {
        DrawArrowConnector(g, rect, stroke, dashed, openArrow: true);
    }

    private static void DrawGhostBox(Graphics g, RectangleF rect, Color fill, Color stroke, bool roundedRight, int compartments)
    {
        using var fillBrush = new SolidBrush(fill);
        using var pen = new Pen(stroke, 1.5f);

        if (roundedRight)
        {
            using var path = CreateInterfacePath(rect);
            g.FillPath(fillBrush, path);
            g.DrawPath(pen, path);
        }
        else
        {
            g.FillRectangle(fillBrush, rect.X, rect.Y, rect.Width, rect.Height);
            g.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);
        }

        for (var i = 1; i < compartments; i++)
        {
            var lineY = rect.Y + rect.Height * i / (float)compartments;
            g.DrawLine(pen, rect.Left, lineY, rect.Right, lineY);
        }
    }

    private static void DrawGhostPackage(Graphics g, RectangleF rect, Color fill, Color stroke)
    {
        const float tabH = 18f;
        var tabW = Math.Min(60f, rect.Width * 0.35f);
        using var fillBrush = new SolidBrush(fill);
        using var pen = new Pen(stroke, 1.5f);
        g.FillRectangle(fillBrush, rect.X, rect.Y + tabH, rect.Width, rect.Height - tabH);
        g.DrawRectangle(pen, rect.X, rect.Y + tabH, rect.Width, rect.Height - tabH);
        g.DrawRectangle(pen, rect.X, rect.Y, tabW, tabH);
    }

    private static void DrawGhostActor(Graphics g, RectangleF rect, Color stroke)
    {
        using var pen = new Pen(stroke, 1.5f);
        var cx = rect.Left + rect.Width / 2f;
        var headR = Math.Min(rect.Width * 0.14f, 20f);
        var headY = rect.Top + headR + 4;
        g.DrawEllipse(pen, cx - headR, headY - headR, headR * 2, headR * 2);
        g.DrawLine(pen, cx, headY + headR, cx, rect.Bottom - 24);
        g.DrawLine(pen, cx, headY + headR * 2.2f, rect.Left + 8, rect.Top + rect.Height * 0.55f);
        g.DrawLine(pen, cx, headY + headR * 2.2f, rect.Right - 8, rect.Top + rect.Height * 0.55f);
        g.DrawLine(pen, cx, rect.Bottom - 24, rect.Left + 10, rect.Bottom - 6);
        g.DrawLine(pen, cx, rect.Bottom - 24, rect.Right - 10, rect.Bottom - 6);
    }

    private static void DrawGhostUseCase(Graphics g, RectangleF rect, Color fill, Color stroke)
    {
        using var fillBrush = new SolidBrush(fill);
        using var pen = new Pen(stroke, 1.5f);
        g.FillEllipse(fillBrush, rect.X, rect.Y, rect.Width, rect.Height);
        g.DrawEllipse(pen, rect.X, rect.Y, rect.Width, rect.Height);
    }

    private static void DrawGhostNote(Graphics g, RectangleF rect, Color fill, Color stroke)
    {
        const float fold = 14f;
        using var fillBrush = new SolidBrush(Color.FromArgb(fill.A, 255, 250, 190));
        using var pen = new Pen(stroke, 1.5f);
        g.FillRectangle(fillBrush, rect.X, rect.Y, rect.Width, rect.Height);
        g.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);
        g.DrawLine(pen, rect.Right - fold, rect.Top, rect.Right, rect.Top + fold);
        g.DrawLine(pen, rect.Right - fold, rect.Top, rect.Right - fold, rect.Top + fold);
        g.DrawLine(pen, rect.Right - fold, rect.Top + fold, rect.Right, rect.Top + fold);
    }

    private static System.Drawing.Drawing2D.GraphicsPath CreateRoundedPath(RectangleF rect, float radius)
    {
        var path = new System.Drawing.Drawing2D.GraphicsPath();
        var d = radius * 2f;
        path.AddArc(rect.Left, rect.Top, d, d, 180, 90);
        path.AddArc(rect.Right - d, rect.Top, d, d, 270, 90);
        path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
        path.AddArc(rect.Left, rect.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static void DrawOpenArrow(Graphics g, Pen pen, PointF from, PointF to, bool open)
    {
        var angle = Math.Atan2(to.Y - from.Y, to.X - from.X);
        const float len = 8f;
        const float wing = 4f;
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

        using var brush = new SolidBrush(pen.Color);
        g.FillPolygon(brush, [to, p1, p2]);
        g.DrawLine(pen, to, p1);
        g.DrawLine(pen, to, p2);
    }
}
