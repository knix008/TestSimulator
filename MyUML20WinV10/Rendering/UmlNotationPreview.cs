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
        var headR = area.Width * 0.12f;
        var headY = area.Top + headR + 2;
        using var pen = new Pen(stroke, 1.8f);
        g.DrawEllipse(pen, cx - headR, headY - headR, headR * 2, headR * 2);
        g.DrawLine(pen, cx, headY + headR, cx, area.Bottom - 8);
        g.DrawLine(pen, cx, headY + headR * 1.8f, area.Left + 4, area.Top + area.Height * 0.55f);
        g.DrawLine(pen, cx, headY + headR * 1.8f, area.Right - 4, area.Top + area.Height * 0.55f);
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
}
