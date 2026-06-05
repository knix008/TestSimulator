namespace MyDiagramWinV10.Rendering;

public static class Diagram3DRenderer
{
    private const float MinDistance = 220f;
    private const float MaxDistance = 2200f;

    public static void Draw(
        Graphics graphics,
        Rectangle bounds,
        Diagram3DScene scene,
        float yaw,
        float pitch,
        float distance)
    {
        graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        graphics.Clear(scene.BackgroundColor);

        var center = new PointF(bounds.Width / 2f, bounds.Height / 2f);
        var cameraDistance = Math.Clamp(distance, MinDistance, MaxDistance);
        var focalLength = Math.Min(bounds.Width, bounds.Height) * 1.35f;

        var projectedTriangles = scene.Triangles
            .Select(triangle => ProjectTriangle(triangle, yaw, pitch, cameraDistance, focalLength, center))
            .Where(t => t.Depth > -focalLength * 0.8f)
            .OrderBy(t => t.Depth)
            .ToList();

        using var gridPen = new Pen(Color.FromArgb(40, 255, 255, 255), 1f);
        DrawGroundGrid(graphics, bounds, yaw, pitch, cameraDistance, focalLength, center, gridPen);

        foreach (var triangle in projectedTriangles)
        {
            using var brush = new SolidBrush(triangle.FillColor);
            graphics.FillPolygon(brush, triangle.Points);
            using var pen = new Pen(triangle.BorderColor, 1f);
            graphics.DrawPolygon(pen, triangle.Points);
        }

        var projectedLines = scene.Lines
            .Select(line => ProjectLine(line, yaw, pitch, cameraDistance, focalLength, center))
            .Where(l => l is not null)
            .Cast<ProjectedLine>()
            .OrderBy(l => l.Depth)
            .ToList();

        foreach (var line in projectedLines)
        {
            using var pen = new Pen(line.Color, line.Width);
            graphics.DrawLine(pen, line.Start, line.End);
        }

        if (scene.Triangles.Count == 0 && scene.Lines.Count == 0)
        {
            using var font = new Font("맑은 고딕", 11f);
            using var brush = new SolidBrush(Color.Gray);
            var text = "표시할 도형이 없습니다.";
            var size = graphics.MeasureString(text, font);
            graphics.DrawString(text, font, brush,
                center.X - size.Width / 2,
                center.Y - size.Height / 2);
        }
    }

    public static float ClampDistance(float distance)
        => Math.Clamp(distance, MinDistance, MaxDistance);

    private static void DrawGroundGrid(
        Graphics graphics,
        Rectangle bounds,
        float yaw,
        float pitch,
        float distance,
        float focalLength,
        PointF center,
        Pen pen)
    {
        const int grid = 80;
        const int extent = 6;
        for (int i = -extent; i <= extent; i++)
        {
            DrawProjectedLine(graphics, new Vec3(-extent * grid, 0, i * grid), new Vec3(extent * grid, 0, i * grid),
                yaw, pitch, distance, focalLength, center, pen);
            DrawProjectedLine(graphics, new Vec3(i * grid, 0, -extent * grid), new Vec3(i * grid, 0, extent * grid),
                yaw, pitch, distance, focalLength, center, pen);
        }
    }

    private static void DrawProjectedLine(
        Graphics graphics,
        Vec3 start,
        Vec3 end,
        float yaw,
        float pitch,
        float distance,
        float focalLength,
        PointF center,
        Pen pen)
    {
        var projected = ProjectLine(new Diagram3DLine { Start = start, End = end, Color = pen.Color, Width = 1f },
            yaw, pitch, distance, focalLength, center);
        if (projected is null)
            return;

        graphics.DrawLine(pen, projected.Start, projected.End);
    }

    private static ProjectedTriangle ProjectTriangle(
        Diagram3DTriangle triangle,
        float yaw,
        float pitch,
        float distance,
        float focalLength,
        PointF center)
    {
        var a = Project(triangle.A, yaw, pitch, distance, focalLength, center);
        var b = Project(triangle.B, yaw, pitch, distance, focalLength, center);
        var c = Project(triangle.C, yaw, pitch, distance, focalLength, center);
        var depth = (a.Z + b.Z + c.Z) / 3f;

        return new ProjectedTriangle(
            [a.Point, b.Point, c.Point],
            triangle.FillColor,
            triangle.BorderColor,
            depth);
    }

    private static ProjectedLine? ProjectLine(
        Diagram3DLine line,
        float yaw,
        float pitch,
        float distance,
        float focalLength,
        PointF center)
    {
        var start = Project(line.Start, yaw, pitch, distance, focalLength, center);
        var end = Project(line.End, yaw, pitch, distance, focalLength, center);
        if (start.Z < -focalLength * 0.8f && end.Z < -focalLength * 0.8f)
            return null;

        return new ProjectedLine(start.Point, end.Point, line.Color, line.Width, (start.Z + end.Z) / 2f);
    }

    private static ProjectedPoint Project(Vec3 point, float yaw, float pitch, float distance, float focalLength, PointF center)
    {
        var rotated = Rotate(point, yaw, pitch);
        float depth = rotated.Z + distance;
        if (Math.Abs(depth) < 1f)
            depth = 1f;

        float scale = focalLength / depth;
        return new ProjectedPoint(
            new PointF(center.X + rotated.X * scale, center.Y - rotated.Y * scale),
            depth);
    }

    private static Vec3 Rotate(Vec3 point, float yaw, float pitch)
    {
        float cosY = (float)Math.Cos(yaw);
        float sinY = (float)Math.Sin(yaw);
        float x1 = point.X * cosY - point.Z * sinY;
        float z1 = point.X * sinY + point.Z * cosY;

        float cosX = (float)Math.Cos(pitch);
        float sinX = (float)Math.Sin(pitch);
        float y2 = point.Y * cosX - z1 * sinX;
        float z2 = point.Y * sinX + z1 * cosX;

        return new Vec3(x1, y2, z2);
    }

    private sealed record ProjectedPoint(PointF Point, float Z);

    private sealed record ProjectedTriangle(PointF[] Points, Color FillColor, Color BorderColor, float Depth);

    private sealed record ProjectedLine(PointF Start, PointF End, Color Color, float Width, float Depth);
}
