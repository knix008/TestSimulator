using MyDiagramWinV10.Export;
using MyDiagramWinV10.Models;

namespace MyDiagramWinV10.Rendering;

public static class Diagram3DBuilder
{
    public static Diagram3DScene Build(DiagramProject project)
    {
        var scene = new Diagram3DScene
        {
            BackgroundColor = Color.FromArgb(project.CanvasBackColorArgb)
        };

        if (project.Shapes.Count == 0)
            return scene;

        var bounds = DiagramExporter.CalculateBounds(project);
        var centerX = bounds.Left + bounds.Width / 2f;
        var centerZ = bounds.Top + bounds.Height / 2f;

        foreach (var shape in project.Shapes)
            BuildShape(scene, shape, centerX, centerZ);

        foreach (var connector in project.Connectors)
            BuildConnector(scene, project, connector, centerX, centerZ);

        return scene;
    }

    private static void BuildShape(Diagram3DScene scene, DiagramShape shape, float centerX, float centerZ)
    {
        var polygon = DiagramRenderer.GetShapePolygonVertices(shape);
        if (polygon.Length < 3)
            return;

        var depth = Math.Clamp(Math.Min(shape.Width, shape.Height) * 0.35f, 14f, 56f);
        var fill = Color.FromArgb(shape.FillColorArgb);
        var border = Color.FromArgb(shape.BorderColorArgb);
        var basePoints = polygon
            .Select(p => ToWorld(p.X, p.Y, 0f, centerX, centerZ))
            .ToArray();
        var topPoints = polygon
            .Select(p => ToWorld(p.X, p.Y, depth, centerX, centerZ))
            .ToArray();

        // Rotate each solid independently (local yaw around vertical axis).
        if (Math.Abs(shape.RotYawDeg) > 0.0001f)
        {
            float yawRad = shape.RotYawDeg * (float)Math.PI / 180f;
            var pivot = ToWorld(shape.X + shape.Width / 2f, shape.Y + shape.Height / 2f, 0f, centerX, centerZ);
            for (int i = 0; i < basePoints.Length; i++)
            {
                basePoints[i] = RotateAroundYAxis(basePoints[i], pivot, yawRad);
                topPoints[i] = RotateAroundYAxis(topPoints[i], pivot, yawRad);
            }
        }

        AddPolygonFace(scene, basePoints, Darken(fill, 0.82f), border);
        AddPolygonFace(scene, topPoints.Reverse().ToArray(), Lighten(fill, 1.08f), border);

        for (int i = 0; i < basePoints.Length; i++)
        {
            int next = (i + 1) % basePoints.Length;
            AddQuadFace(scene,
                basePoints[i], basePoints[next], topPoints[next], topPoints[i],
                fill, border);
        }
    }

    private static void BuildConnector(
        Diagram3DScene scene,
        DiagramProject project,
        DiagramConnector connector,
        float centerX,
        float centerZ)
    {
        var source = project.Shapes.FirstOrDefault(s => s.Id == connector.SourceShapeId);
        var target = project.Shapes.FirstOrDefault(s => s.Id == connector.TargetShapeId);
        if (source is null || target is null)
            return;

        var sourceDepth = GetShapeDepth(source);
        var targetDepth = GetShapeDepth(target);
        var start2D = DiagramRenderer.GetConnectionPoint(source, target);
        var end2D = DiagramRenderer.GetConnectionPoint(target, source);
        var points2D = DiagramRenderer.BuildConnectorPoints(connector.Kind, start2D, end2D);

        var points3D = points2D
            .Select((p, index) =>
            {
                float height = index == 0 ? sourceDepth * 0.55f
                    : index == points2D.Length - 1 ? targetDepth * 0.55f
                    : (sourceDepth + targetDepth) * 0.275f;
                return ToWorld(p.X, p.Y, height, centerX, centerZ);
            })
            .ToArray();

        var color = Color.FromArgb(connector.LineColorArgb);
        for (int i = 1; i < points3D.Length; i++)
        {
            scene.Lines.Add(new Diagram3DLine
            {
                Start = points3D[i - 1],
                End = points3D[i],
                Color = color,
                Width = connector.LineWidth
            });
        }
    }

    private static float GetShapeDepth(DiagramShape shape)
        => Math.Clamp(Math.Min(shape.Width, shape.Height) * 0.35f, 14f, 56f);

    private static Vec3 ToWorld(float diagramX, float diagramY, float height, float centerX, float centerZ)
        => new(
            diagramX - centerX,
            height,
            -(diagramY - centerZ));

    private static void AddPolygonFace(Diagram3DScene scene, IReadOnlyList<Vec3> points, Color fill, Color border)
    {
        if (points.Count < 3)
            return;

        for (int i = 1; i < points.Count - 1; i++)
        {
            scene.Triangles.Add(new Diagram3DTriangle
            {
                A = points[0],
                B = points[i],
                C = points[i + 1],
                FillColor = fill,
                BorderColor = border
            });
        }
    }

    private static void AddQuadFace(
        Diagram3DScene scene,
        Vec3 a, Vec3 b, Vec3 c, Vec3 d,
        Color fill, Color border)
    {
        scene.Triangles.Add(new Diagram3DTriangle { A = a, B = b, C = c, FillColor = fill, BorderColor = border });
        scene.Triangles.Add(new Diagram3DTriangle { A = a, B = c, C = d, FillColor = fill, BorderColor = border });
    }

    private static Color Lighten(Color color, float factor)
    {
        return Color.FromArgb(
            color.A,
            Math.Clamp((int)(color.R * factor), 0, 255),
            Math.Clamp((int)(color.G * factor), 0, 255),
            Math.Clamp((int)(color.B * factor), 0, 255));
    }

    private static Color Darken(Color color, float factor) => Lighten(color, factor);

    private static Vec3 RotateAroundYAxis(Vec3 p, Vec3 pivot, float yawRad)
    {
        float cos = (float)Math.Cos(yawRad);
        float sin = (float)Math.Sin(yawRad);

        float x = p.X - pivot.X;
        float z = p.Z - pivot.Z;

        float x2 = x * cos - z * sin;
        float z2 = x * sin + z * cos;

        return new Vec3(x2 + pivot.X, p.Y, z2 + pivot.Z);
    }
}
