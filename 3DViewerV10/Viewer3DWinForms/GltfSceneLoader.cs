using System.IO;
using System.Numerics;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Media.Media3D;
using SharpGLTF.Schema2;
using SharpGLTF.Runtime;
using GltfMaterial = SharpGLTF.Schema2.Material;

namespace Viewer3DWinForms;

internal static class GltfSceneLoader
{
    public static Model3DGroup Load(string path, int emissiveLift = 60, IList<System.Windows.Media.SolidColorBrush>? emissiveBrushesOut = null)
    {
        if (!File.Exists(path))
        {
            throw new FileNotFoundException("모델 파일을 찾을 수 없습니다.", path);
        }

        var opts = new RuntimeOptions { IsolateMemory = true };
        var model = ModelRoot.Load(path);
        var scene = model.DefaultScene ?? model.LogicalScenes.FirstOrDefault()
            ?? throw new InvalidOperationException("씬이 없는 glTF입니다.");

        var decoders = MeshDecoder.Decode(model.LogicalMeshes, opts);
        var template = SceneTemplate.Create(scene, opts);
        var instance = template.CreateInstance();

        var root = new Model3DGroup();
        for (var i = 0; i < instance.Count; i++)
        {
            var drawable = instance.GetDrawableInstance(i);
            if (!drawable.Transform.Visible)
            {
                continue;
            }

            var meshIndex = drawable.Template.LogicalMeshIndex;
            if (meshIndex < 0 || meshIndex >= decoders.Length)
            {
                continue;
            }

            var meshDecoder = decoders[meshIndex];
            foreach (IMeshPrimitiveDecoder<GltfMaterial> prim in meshDecoder.Primitives)
            {
                var baseColorChannel = TryGetBaseColorChannel(prim.Material);
                var geometry = BuildMeshGeometry(prim, drawable.Transform, baseColorChannel);
                if (geometry.Positions is null || geometry.Positions.Count == 0)
                {
                    continue;
                }

                var wpfMaterial = CreateWpfMaterial(baseColorChannel, emissiveLift, emissiveBrushesOut);
                root.Children.Add(new GeometryModel3D
                {
                    Geometry = geometry,
                    Material = wpfMaterial,
                    BackMaterial = wpfMaterial,
                    Transform = Transform3D.Identity
                });
            }
        }

        if (root.Children.Count == 0)
        {
            throw new InvalidOperationException("표시할 메시 프리미티브가 없습니다.");
        }

        return root;
    }

    private static MaterialChannel? TryGetBaseColorChannel(GltfMaterial? material)
    {
        if (material is null)
        {
            return null;
        }

        foreach (var ch in material.Channels)
        {
            if (ch.Key == "BaseColor")
            {
                return ch;
            }
        }

        return null;
    }

    private static MeshGeometry3D BuildMeshGeometry(
        IMeshPrimitiveDecoder<GltfMaterial> prim,
        SharpGLTF.Transforms.IGeometryTransform transform,
        MaterialChannel? baseColorChannel)
    {
        var texCoordSet = 0;
        if (baseColorChannel is { } bc)
        {
            texCoordSet = bc.TextureCoordinate;
            if (bc.TextureTransform?.TextureCoordinateOverride is int ov && ov >= 0)
            {
                texCoordSet = ov;
            }
        }

        if (prim.TexCoordsCount > 0 && (texCoordSet < 0 || texCoordSet >= prim.TexCoordsCount))
        {
            texCoordSet = 0;
        }

        var positions = new Point3DCollection();
        var normals = new Vector3DCollection();
        var uvs = new PointCollection();
        var indices = new Int32Collection();
        var index = 0;

        foreach (var (a, b, c) in prim.TriangleIndices)
        {
            foreach (var vtx in new[] { a, b, c })
            {
                var p = MeshDecoder.GetPosition(prim, vtx, transform);
                positions.Add(new Point3D(p.X, p.Y, p.Z));

                var n = MeshDecoder.GetNormal(prim, vtx, transform);
                normals.Add(new Vector3D(n.X, n.Y, n.Z));

                if (prim.TexCoordsCount > 0)
                {
                    var uv = MeshDecoder.GetTextureCoord(prim, vtx, texCoordSet, transform);
                    var uvGltf = ApplyBaseColorTextureUvTransform(
                        new System.Numerics.Vector2(uv.X, uv.Y),
                        baseColorChannel);
                    // glTF UV origin is upper-left, same as WPF — no Y-flip needed.
                    uvs.Add(new System.Windows.Point(uvGltf.X, uvGltf.Y));
                }

                indices.Add(index++);
            }
        }

        var mesh = new MeshGeometry3D
        {
            Positions = positions,
            TriangleIndices = indices,
            Normals = normals
        };

        if (uvs.Count == positions.Count)
        {
            mesh.TextureCoordinates = uvs;
        }

        return mesh;
    }

    private static System.Windows.Media.Media3D.Material CreateWpfMaterial(MaterialChannel? baseColorChannel, int emissiveLift, IList<System.Windows.Media.SolidColorBrush>? emissiveBrushesOut)
    {
        var diffuseColor = Colors.LightGray;
        var specularColor = Colors.White;
        ImageBrush? textureBrush = null;

        if (baseColorChannel is { } baseChannel)
        {
            var gltfImage = baseChannel.Texture?.PrimaryImage;
            if (gltfImage is not null)
            {
                var memImage = gltfImage.Content;
                if (!memImage.IsEmpty)
                {
                    var bytes = memImage.Content.ToArray();
                    textureBrush = TryCreateBrushFromImageBytes(bytes, baseChannel.TextureSampler);
                }
            }

            var rgba = baseChannel.Color;
            if (rgba != Vector4.Zero)
            {
                diffuseColor = System.Windows.Media.Color.FromScRgb(rgba.W, rgba.X, rgba.Y, rgba.Z);
            }
        }

        var group = new MaterialGroup();
        System.Windows.Media.Brush diffuseBrush = textureBrush is not null
            ? textureBrush
            : new SolidColorBrush(diffuseColor);
        group.Children.Add(new DiffuseMaterial(diffuseBrush));
        if (textureBrush is not null)
        {
            var v = (byte)Math.Clamp(emissiveLift, 0, 255);
            var lift = new SolidColorBrush(System.Windows.Media.Color.FromRgb(v, v, v));
            emissiveBrushesOut?.Add(lift);
            group.Children.Add(new EmissiveMaterial(lift));
        }
        else
        {
            group.Children.Add(new SpecularMaterial(new SolidColorBrush(specularColor), 32.0));
        }

        return group;
    }

    private static ImageBrush? TryCreateBrushFromImageBytes(byte[] bytes, TextureSampler? sampler)
    {
        if (bytes.Length < 8)
        {
            return null;
        }

        try
        {
            using var stream = new MemoryStream(bytes, writable: false);
            var decoder = BitmapDecoder.Create(
                stream,
                BitmapCreateOptions.IgnoreColorProfile,
                BitmapCacheOption.OnLoad);
            var frame = decoder.Frames[0];
            frame.Freeze();

            var brush = new ImageBrush(frame)
            {
                Stretch = Stretch.Fill,
                TileMode = ResolveImageBrushTileMode(sampler),
                Viewport = new Rect(0, 0, 1, 1),
                ViewportUnits = BrushMappingMode.RelativeToBoundingBox
            };
            TextureBrushQuality.ApplyToBrush(brush);
            brush.Freeze();
            return brush;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// glTF 샘플러 WRAP을 WPF <see cref="ImageBrush"/> 타일 모드에 대략 맞춥니다.
    /// REPEAT 계열은 타일이 필요하고, CLAMP는 None에 가깝게 두는 편이 UV 경계 아티팩트를 줄입니다.
    /// </summary>
    private static TileMode ResolveImageBrushTileMode(TextureSampler? sampler)
    {
        if (sampler is null)
        {
            return TileMode.Tile;
        }

        var repeatS = sampler.WrapS == TextureWrapMode.REPEAT || sampler.WrapS == TextureWrapMode.MIRRORED_REPEAT;
        var repeatT = sampler.WrapT == TextureWrapMode.REPEAT || sampler.WrapT == TextureWrapMode.MIRRORED_REPEAT;
        var mirrorS = sampler.WrapS == TextureWrapMode.MIRRORED_REPEAT;
        var mirrorT = sampler.WrapT == TextureWrapMode.MIRRORED_REPEAT;

        if (mirrorS && mirrorT)
        {
            return TileMode.FlipXY;
        }

        if (mirrorS && repeatT)
        {
            return TileMode.FlipX;
        }

        if (repeatS && mirrorT)
        {
            return TileMode.FlipY;
        }

        if (repeatS && repeatT)
        {
            return TileMode.Tile;
        }

        if (repeatS ^ repeatT)
        {
            return TileMode.Tile;
        }

        return TileMode.None;
    }

    /// <summary>
    /// glTF KHR_texture_transform: Khronos GLSL 예제와 같이 스케일 → 회전 → 이동(<c>T*R*S</c>를 벡터에 적용) 순서입니다.
    /// </summary>
    private static System.Numerics.Vector2 ApplyBaseColorTextureUvTransform(
        System.Numerics.Vector2 uv,
        MaterialChannel? baseColorChannel)
    {
        if (baseColorChannel?.TextureTransform is not { } tt || IsDefaultTextureTransform(tt))
        {
            return uv;
        }

        var scale = tt.Scale;
        var sx = uv.X * scale.X;
        var sy = uv.Y * scale.Y;

        var rot = tt.Rotation;
        var c = MathF.Cos(rot);
        var sn = MathF.Sin(rot);
        var rx = (c * sx) + (sn * sy);
        var ry = (-sn * sx) + (c * sy);

        var o = tt.Offset;
        return new System.Numerics.Vector2(rx + o.X, ry + o.Y);
    }

    private static bool IsDefaultTextureTransform(TextureTransform transform)
    {
        if (transform.TextureCoordinateOverride is not null)
        {
            return false;
        }

        var o = transform.Offset;
        if (Math.Abs(o.X) > 1e-6f || Math.Abs(o.Y) > 1e-6f)
        {
            return false;
        }

        var s = transform.Scale;
        if (Math.Abs(s.X - 1f) > 1e-5f || Math.Abs(s.Y - 1f) > 1e-5f)
        {
            return false;
        }

        return Math.Abs(transform.Rotation) <= 1e-6f;
    }
}
