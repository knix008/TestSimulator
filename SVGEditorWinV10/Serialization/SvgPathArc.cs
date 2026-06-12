using System.Drawing.Drawing2D;

namespace SVGEditorWinV10.Serialization;

internal static class SvgPathArc
{
    public static void AddToPath(
        GraphicsPath path,
        PointF start,
        float radiusX,
        float radiusY,
        float rotationDegrees,
        bool largeArc,
        bool sweep,
        PointF end)
    {
        radiusX = Math.Abs(radiusX);
        radiusY = Math.Abs(radiusY);

        if (radiusX < 0.0001f || radiusY < 0.0001f
            || (Math.Abs(start.X - end.X) < 0.0001f && Math.Abs(start.Y - end.Y) < 0.0001f))
        {
            path.AddLine(start, end);
            return;
        }

        var angle = rotationDegrees * Math.PI / 180.0;
        var cosAngle = Math.Cos(angle);
        var sinAngle = Math.Sin(angle);

        var dx = (start.X - end.X) / 2.0;
        var dy = (start.Y - end.Y) / 2.0;
        var x1 = cosAngle * dx + sinAngle * dy;
        var y1 = -sinAngle * dx + cosAngle * dy;

        var rxSq = radiusX * radiusX;
        var rySq = radiusY * radiusY;
        var x1Sq = x1 * x1;
        var y1Sq = y1 * y1;

        var radiiCheck = x1Sq / rxSq + y1Sq / rySq;
        if (radiiCheck > 1.0)
        {
            var scale = Math.Sqrt(radiiCheck);
            radiusX = (float)(radiusX * scale);
            radiusY = (float)(radiusY * scale);
            rxSq = radiusX * radiusX;
            rySq = radiusY * radiusY;
        }

        var sign = largeArc == sweep ? -1.0 : 1.0;
        var numerator = rxSq * rySq - rxSq * y1Sq - rySq * x1Sq;
        var denominator = rxSq * y1Sq + rySq * x1Sq;
        var coefficient = denominator == 0.0 ? 0.0 : sign * Math.Sqrt(Math.Max(0.0, numerator / denominator));

        var cx1 = coefficient * (radiusX * y1 / radiusY);
        var cy1 = coefficient * -(radiusY * x1 / radiusX);

        var centerX = cosAngle * cx1 - sinAngle * cy1 + (start.X + end.X) / 2.0;
        var centerY = sinAngle * cx1 + cosAngle * cy1 + (start.Y + end.Y) / 2.0;

        var startAngle = AngleBetween(1, 0, (x1 - cx1) / radiusX, (y1 - cy1) / radiusY);
        var endAngle = AngleBetween(
            (x1 - cx1) / radiusX,
            (y1 - cy1) / radiusY,
            (-x1 - cx1) / radiusX,
            (-y1 - cy1) / radiusY);

        if (!sweep && endAngle > 0)
            endAngle -= Math.PI * 2;
        else if (sweep && endAngle < 0)
            endAngle += Math.PI * 2;

        var segments = Math.Max(1, (int)Math.Ceiling(Math.Abs(endAngle) / (Math.PI / 4)));
        var current = start;

        for (var i = 1; i <= segments; i++)
        {
            var t = (float)(i / (double)segments);
            var theta = startAngle + endAngle * t;
            var next = PointOnEllipse(centerX, centerY, radiusX, radiusY, angle, theta);
            var tangent = TangentOnEllipse(centerX, centerY, radiusX, radiusY, angle, theta);
            var previousTangent = TangentOnEllipse(centerX, centerY, radiusX, radiusY, angle, startAngle + endAngle * (i - 1) / segments);
            var controlDistance = Distance(current, next) / 3f;
            var c1 = new PointF(
                current.X + previousTangent.X * controlDistance,
                current.Y + previousTangent.Y * controlDistance);
            var c2 = new PointF(
                next.X - tangent.X * controlDistance,
                next.Y - tangent.Y * controlDistance);
            path.AddBezier(current, c1, c2, next);
            current = next;
        }
    }

    private static double AngleBetween(double ux, double uy, double vx, double vy) =>
        Math.Atan2(ux * vy - uy * vx, ux * vx + uy * vy);

    private static PointF PointOnEllipse(double cx, double cy, float rx, float ry, double angle, double theta)
    {
        var cos = Math.Cos(theta);
        var sin = Math.Sin(theta);
        var x = rx * cos;
        var y = ry * sin;
        return new PointF(
            (float)(cx + Math.Cos(angle) * x - Math.Sin(angle) * y),
            (float)(cy + Math.Sin(angle) * x + Math.Cos(angle) * y));
    }

    private static PointF TangentOnEllipse(double cx, double cy, float rx, float ry, double angle, double theta)
    {
        var dx = -rx * Math.Sin(theta);
        var dy = ry * Math.Cos(theta);
        var length = Math.Sqrt(dx * dx + dy * dy);
        if (length < 0.0001)
            return new PointF(1f, 0f);

        return new PointF(
            (float)(Math.Cos(angle) * dx / length - Math.Sin(angle) * dy / length),
            (float)(Math.Sin(angle) * dx / length + Math.Cos(angle) * dy / length));
    }

    private static float Distance(PointF a, PointF b)
    {
        var dx = a.X - b.X;
        var dy = a.Y - b.Y;
        return MathF.Sqrt(dx * dx + dy * dy);
    }
}
