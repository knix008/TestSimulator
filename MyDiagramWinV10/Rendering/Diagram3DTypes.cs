namespace MyDiagramWinV10.Rendering;

public readonly struct Vec3(float x, float y, float z)
{
    public float X { get; } = x;
    public float Y { get; } = y;
    public float Z { get; } = z;

    public static Vec3 operator +(Vec3 a, Vec3 b) => new(a.X + b.X, a.Y + b.Y, a.Z + b.Z);
    public static Vec3 operator -(Vec3 a, Vec3 b) => new(a.X - b.X, a.Y - b.Y, a.Z - b.Z);
    public static Vec3 operator *(Vec3 v, float s) => new(v.X * s, v.Y * s, v.Z * s);
}

public sealed class Diagram3DTriangle
{
    public required Vec3 A { get; init; }
    public required Vec3 B { get; init; }
    public required Vec3 C { get; init; }
    public required Color FillColor { get; init; }
    public Color BorderColor { get; init; } = Color.Black;
}

public sealed class Diagram3DLine
{
    public required Vec3 Start { get; init; }
    public required Vec3 End { get; init; }
    public required Color Color { get; init; }
    public float Width { get; init; } = 2f;
}

public sealed class Diagram3DScene
{
    public Color BackgroundColor { get; init; } = Color.FromArgb(30, 34, 48);
    public List<Diagram3DTriangle> Triangles { get; } = [];
    public List<Diagram3DLine> Lines { get; } = [];
}
