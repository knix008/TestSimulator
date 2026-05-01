using System.IO;
using System.Text.Json;
using Ai = Assimp;
using System.Runtime.InteropServices;
using System.Windows.Media;
using System.Windows.Media.Media3D;
using System.Windows.Input;
using System.Windows.Media.Imaging;
using HelixToolkit.Wpf;

namespace Viewer3DWinForms;

public partial class ThreeDViewerForm : Form
{
    private const string FolderIconKey = "__folder__";
    private const string DefaultFileIconKey = "__file__";
    private static readonly string AppStateFilePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Viewer3DWinForms",
        "viewer-state.json");

    private readonly HashSet<string> _supportedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".obj", ".stl", ".3ds", ".lwo", ".off",
        ".fbx", ".dae", ".ply", ".glb", ".gltf"
    };

    private readonly HashSet<string> _assimpExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".fbx", ".dae", ".ply", ".glb", ".gltf"
    };

    private readonly HelixViewport3D _viewport;
    private readonly ModelVisual3D _modelRoot;
    private string? _rootDirectory;
    private double _basePerspectiveDistance = 1.0;
    private double _baseOrthographicWidth = 1.0;

    public ThreeDViewerForm()
    {
        InitializeComponent();
        InitializeIcons();

        _viewport = new HelixViewport3D
        {
            ShowCoordinateSystem = true,
            ShowFrameRate = false,
            // Explicitly map interactions: left drag rotate, wheel zoom.
            RotateGesture = new MouseGesture(MouseAction.LeftClick),
            PanGesture = new MouseGesture(MouseAction.RightClick),
            ZoomGesture = new MouseGesture(MouseAction.MiddleClick)
        };

        _viewport.Children.Add(new SunLight());
        _modelRoot = new ModelVisual3D();
        _viewport.Children.Add(_modelRoot);
        _viewport.CameraChanged += Viewport_CameraChanged;

        viewerHost.Child = _viewport;
        viewerHost.BackColor = System.Drawing.Color.Black;
        panelZoomInfo.BringToFront();
        UpdateZoomRatioLabel();
    }

    private void ViewerForm_Load(object? sender, EventArgs e)
    {
        RestoreLastDirectory();
        if (string.IsNullOrWhiteSpace(_rootDirectory))
        {
            SetStatus("좌측에서 폴더를 선택하면 3D 파일 목록이 표시됩니다.");
        }
    }

    private void btnSelectFolder_Click(object? sender, EventArgs e)
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = "3D 파일이 있는 루트 폴더를 선택하세요."
        };

        if (dialog.ShowDialog(this) != DialogResult.OK || string.IsNullOrWhiteSpace(dialog.SelectedPath))
        {
            return;
        }

        _rootDirectory = dialog.SelectedPath;
        lblCurrentFolder.Text = _rootDirectory;
        BuildDirectoryTree(_rootDirectory);
        SaveLastDirectory(_rootDirectory);
        SetStatus("루트 폴더를 불러왔습니다.");
    }

    private void BuildDirectoryTree(string rootPath)
    {
        treeDirectories.BeginUpdate();
        treeDirectories.Nodes.Clear();

        var rootNode = CreateDirectoryNode(rootPath);
        if (string.IsNullOrWhiteSpace(rootNode.Text))
        {
            rootNode.Text = rootPath;
        }

        AddDirectoryPlaceholders(rootNode, rootPath);
        treeDirectories.Nodes.Add(rootNode);
        rootNode.Expand();

        treeDirectories.EndUpdate();
    }

    private void AddDirectoryPlaceholders(TreeNode parentNode, string directoryPath)
    {
        try
        {
            foreach (var directory in Directory.GetDirectories(directoryPath))
            {
                var childNode = CreateDirectoryNode(directory);

                // Lazy-load children for large trees.
                if (Directory.GetDirectories(directory).Length > 0)
                {
                    childNode.Nodes.Add(new TreeNode("...") { ImageKey = FolderIconKey, SelectedImageKey = FolderIconKey });
                }

                parentNode.Nodes.Add(childNode);
            }
        }
        catch
        {
            // Ignore directories without access permission.
        }
    }

    private void treeDirectories_BeforeExpand(object? sender, TreeViewCancelEventArgs e)
    {
        if (e.Node is null)
        {
            return;
        }

        if (e.Node.Tag is not string path)
        {
            return;
        }

        if (e.Node.Nodes.Count == 1 && e.Node.Nodes[0].Text == "...")
        {
            e.Node.Nodes.Clear();
            AddDirectoryPlaceholders(e.Node, path);
        }
    }

    private void treeDirectories_AfterSelect(object? sender, TreeViewEventArgs e)
    {
        if (e.Node is null)
        {
            return;
        }

        if (e.Node.Tag is not string path)
        {
            return;
        }

        UpdateFileList(path);
    }

    private void UpdateFileList(string directoryPath)
    {
        listFiles.BeginUpdate();
        listFiles.Items.Clear();

        try
        {
            var files = Directory.GetFiles(directoryPath)
                .Where(file => _supportedExtensions.Contains(Path.GetExtension(file)))
                .OrderBy(file => Path.GetFileName(file), StringComparer.OrdinalIgnoreCase)
                .ToArray();

            foreach (var file in files)
            {
                var extension = Path.GetExtension(file);
                var iconKey = GetIconKey(extension);
                var item = new ListViewItem(Path.GetFileName(file))
                {
                    Tag = file,
                    ImageKey = iconKey
                };
                listFiles.Items.Add(item);
            }

            SetStatus($"지원 파일 {files.Length}개를 찾았습니다.");
        }
        catch (Exception ex)
        {
            SetStatus($"파일 목록을 불러오지 못했습니다: {ex.Message}");
        }
        finally
        {
            listFiles.EndUpdate();
        }
    }

    private void listFiles_SelectedIndexChanged(object? sender, EventArgs e)
    {
        if (listFiles.SelectedItems.Count == 0)
        {
            return;
        }

        if (listFiles.SelectedItems[0].Tag is not string selectedFile || !File.Exists(selectedFile))
        {
            return;
        }

        LoadModel(selectedFile);
    }

    private void LoadModel(string modelPath)
    {
        try
        {
            Cursor = System.Windows.Forms.Cursors.WaitCursor;
            var extension = Path.GetExtension(modelPath);
            Model3D model;

            if (_assimpExtensions.Contains(extension))
            {
                model = LoadWithAssimp(modelPath);
            }
            else
            {
                var importer = new ModelImporter();
                model = importer.Load(modelPath) ?? throw new InvalidOperationException("Helix 로더가 모델을 반환하지 않았습니다.");
            }

            _modelRoot.Content = model;
            _viewport.ZoomExtents();
            CaptureZoomBaseline();
            UpdateZoomRatioLabel();
            SetStatus($"로드 완료: {Path.GetFileName(modelPath)}");
        }
        catch (Exception ex)
        {
            _modelRoot.Content = null;
            SetStatus($"모델 로드 실패: {ex.Message}");
        }
        finally
        {
            Cursor = System.Windows.Forms.Cursors.Default;
        }
    }

    private void SetStatus(string message)
    {
        lblStatus.Text = message;
    }

    private void Viewport_CameraChanged(object? sender, System.Windows.RoutedEventArgs e)
    {
        UpdateZoomRatioLabel();
    }

    private void CaptureZoomBaseline()
    {
        if (_viewport.Camera is PerspectiveCamera perspectiveCamera)
        {
            _basePerspectiveDistance = Math.Max(0.0001, perspectiveCamera.LookDirection.Length);
        }
        else if (_viewport.Camera is OrthographicCamera orthographicCamera)
        {
            _baseOrthographicWidth = Math.Max(0.0001, orthographicCamera.Width);
        }
    }

    private void UpdateZoomRatioLabel()
    {
        var ratio = 100.0;

        if (_viewport.Camera is PerspectiveCamera perspectiveCamera)
        {
            var currentDistance = Math.Max(0.0001, perspectiveCamera.LookDirection.Length);
            ratio = (_basePerspectiveDistance / currentDistance) * 100.0;
        }
        else if (_viewport.Camera is OrthographicCamera orthographicCamera)
        {
            var currentWidth = Math.Max(0.0001, orthographicCamera.Width);
            ratio = (_baseOrthographicWidth / currentWidth) * 100.0;
        }

        var percent = Math.Clamp((int)Math.Round(ratio), 1, 9999);
        lblZoomRatio.Text = $"Zoom: {percent}%";
    }

    private static Model3DGroup LoadWithAssimp(string modelPath)
    {
        using var context = new Ai.AssimpContext();
        var scene = context.ImportFile(
            modelPath,
            Ai.PostProcessSteps.Triangulate |
            Ai.PostProcessSteps.JoinIdenticalVertices |
            Ai.PostProcessSteps.GenerateSmoothNormals |
            Ai.PostProcessSteps.SortByPrimitiveType |
            Ai.PostProcessSteps.ImproveCacheLocality)
            ?? throw new InvalidOperationException("모델을 읽을 수 없습니다.");

        if (scene.RootNode is null || scene.MeshCount == 0)
        {
            throw new InvalidOperationException("모델 메시를 찾을 수 없습니다.");
        }

        var modelDirectory = Path.GetDirectoryName(modelPath) ?? string.Empty;
        var root = new Model3DGroup();
        AppendNode(scene, scene.RootNode, Matrix3D.Identity, root, modelDirectory);
        return root;
    }

    private static void AppendNode(Ai.Scene scene, Ai.Node node, Matrix3D parentTransform, Model3DGroup output, string modelDirectory)
    {
        var worldTransform = parentTransform;
        worldTransform.Append(ToMatrix3D(node.Transform));

        foreach (var meshIndex in node.MeshIndices)
        {
            var mesh = scene.Meshes[meshIndex];
            if ((mesh.PrimitiveType & Ai.PrimitiveType.Triangle) == 0)
            {
                continue;
            }

            var geometryModel = CreateGeometryModel(mesh, scene.Materials[mesh.MaterialIndex], worldTransform, modelDirectory);
            output.Children.Add(geometryModel);
        }

        foreach (var child in node.Children)
        {
            AppendNode(scene, child, worldTransform, output, modelDirectory);
        }
    }

    private static GeometryModel3D CreateGeometryModel(Ai.Mesh mesh, Ai.Material? assimpMaterial, Matrix3D transform, string modelDirectory)
    {
        var geometry = new MeshGeometry3D();
        geometry.Positions = new Point3DCollection(mesh.Vertices.Select(v => new Point3D(v.X, v.Y, v.Z)));

        if (mesh.HasNormals)
        {
            geometry.Normals = new Vector3DCollection(mesh.Normals.Select(n => new System.Windows.Media.Media3D.Vector3D(n.X, n.Y, n.Z)));
        }

        var triangleIndices = new Int32Collection();
        foreach (var face in mesh.Faces)
        {
            if (face.IndexCount != 3)
            {
                continue;
            }

            triangleIndices.Add(face.Indices[0]);
            triangleIndices.Add(face.Indices[1]);
            triangleIndices.Add(face.Indices[2]);
        }

        geometry.TriangleIndices = triangleIndices;
        var material = CreateWpfMaterial(assimpMaterial, modelDirectory);

        return new GeometryModel3D
        {
            Geometry = geometry,
            Material = material,
            BackMaterial = material,
            Transform = new MatrixTransform3D(transform)
        };
    }

    private static System.Windows.Media.Media3D.Material CreateWpfMaterial(Ai.Material? assimpMaterial, string modelDirectory)
    {
        var diffuseColor = Colors.LightGray;
        var specularColor = Colors.White;
        var shininess = 32.0;

        if (assimpMaterial is not null)
        {
            if (assimpMaterial.HasColorDiffuse)
            {
                diffuseColor = System.Windows.Media.Color.FromScRgb(1.0f, assimpMaterial.ColorDiffuse.R, assimpMaterial.ColorDiffuse.G, assimpMaterial.ColorDiffuse.B);
            }

            if (assimpMaterial.HasColorSpecular)
            {
                specularColor = System.Windows.Media.Color.FromScRgb(1.0f, assimpMaterial.ColorSpecular.R, assimpMaterial.ColorSpecular.G, assimpMaterial.ColorSpecular.B);
            }

            if (assimpMaterial.HasShininess)
            {
                shininess = Math.Clamp(assimpMaterial.Shininess, 1.0f, 128.0f);
            }
        }

        // Prefer texture when available; fallback to diffuse color.
        var textureBrush = TryCreateDiffuseTextureBrush(assimpMaterial, modelDirectory);
        var group = new MaterialGroup();
        group.Children.Add(new DiffuseMaterial(textureBrush ?? new SolidColorBrush(diffuseColor)));
        group.Children.Add(new SpecularMaterial(new SolidColorBrush(specularColor), shininess));
        return group;
    }

    private static Matrix3D ToMatrix3D(Ai.Matrix4x4 matrix)
    {
        return new Matrix3D(
            matrix.A1, matrix.B1, matrix.C1, matrix.D1,
            matrix.A2, matrix.B2, matrix.C2, matrix.D2,
            matrix.A3, matrix.B3, matrix.C3, matrix.D3,
            matrix.A4, matrix.B4, matrix.C4, matrix.D4);
    }

    private void InitializeIcons()
    {
        treeImageList.ColorDepth = ColorDepth.Depth32Bit;
        treeImageList.ImageSize = new Size(16, 16);
        fileImageList.ColorDepth = ColorDepth.Depth32Bit;
        fileImageList.ImageSize = new Size(16, 16);

        var folderIcon = GetSmallShellIcon(FolderIconKey, isFolder: true) ?? SystemIcons.WinLogo.ToBitmap();
        treeImageList.Images.Add(FolderIconKey, folderIcon);
        fileImageList.Images.Add(FolderIconKey, folderIcon);
        fileImageList.Images.Add(DefaultFileIconKey, GetSmallShellIcon(".txt", isFolder: false) ?? SystemIcons.Application.ToBitmap());

        foreach (var extension in _supportedExtensions.OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
        {
            var iconKey = GetIconKey(extension);
            fileImageList.Images.Add(iconKey, GetSmallShellIcon(extension, isFolder: false) ?? SystemIcons.Application.ToBitmap());
        }
    }

    private TreeNode CreateDirectoryNode(string directoryPath)
    {
        var dirInfo = new DirectoryInfo(directoryPath);
        return new TreeNode(dirInfo.Name)
        {
            Tag = directoryPath,
            ImageKey = FolderIconKey,
            SelectedImageKey = FolderIconKey
        };
    }

    private static string GetIconKey(string extension)
    {
        if (string.IsNullOrWhiteSpace(extension))
        {
            return DefaultFileIconKey;
        }

        return extension.TrimStart('.').ToLowerInvariant();
    }

    private static Bitmap? GetSmallShellIcon(string extensionOrPath, bool isFolder)
    {
        var flags = ShgfiIcon | ShgfiSmallIcon | ShgfiUseFileAttributes;
        var attributes = isFolder ? FileAttributeDirectory : FileAttributeNormal;
        var query = isFolder ? "folder" : $"*{extensionOrPath}";
        var fileInfo = new SHFILEINFO();

        var result = SHGetFileInfo(query, attributes, ref fileInfo, (uint)Marshal.SizeOf(fileInfo), flags);
        if (result == IntPtr.Zero || fileInfo.hIcon == IntPtr.Zero)
        {
            return null;
        }

        try
        {
            using var icon = Icon.FromHandle(fileInfo.hIcon);
            return icon.ToBitmap();
        }
        finally
        {
            DestroyIcon(fileInfo.hIcon);
        }
    }

    private const uint FileAttributeDirectory = 0x10;
    private const uint FileAttributeNormal = 0x80;
    private const uint ShgfiIcon = 0x100;
    private const uint ShgfiSmallIcon = 0x1;
    private const uint ShgfiUseFileAttributes = 0x10;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct SHFILEINFO
    {
        public IntPtr hIcon;
        public int iIcon;
        public uint dwAttributes;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szDisplayName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
        public string szTypeName;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Auto)]
    private static extern IntPtr SHGetFileInfo(
        string pszPath,
        uint dwFileAttributes,
        ref SHFILEINFO psfi,
        uint cbFileInfo,
        uint uFlags);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool DestroyIcon(IntPtr hIcon);

    private void RestoreLastDirectory()
    {
        try
        {
            if (!File.Exists(AppStateFilePath))
            {
                return;
            }

            var json = File.ReadAllText(AppStateFilePath);
            var state = JsonSerializer.Deserialize<ViewerAppState>(json);
            if (state is null || string.IsNullOrWhiteSpace(state.LastDirectory))
            {
                return;
            }

            if (!Directory.Exists(state.LastDirectory))
            {
                SetStatus("이전 디렉토리를 찾을 수 없어 초기 상태로 시작합니다.");
                return;
            }

            _rootDirectory = state.LastDirectory;
            lblCurrentFolder.Text = _rootDirectory;
            BuildDirectoryTree(_rootDirectory);
            SetStatus($"이전 디렉토리를 복원했습니다: {_rootDirectory}");
        }
        catch
        {
            // Ignore malformed state files and continue with defaults.
        }
    }

    private static void SaveLastDirectory(string directoryPath)
    {
        try
        {
            var directory = Path.GetDirectoryName(AppStateFilePath);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var state = new ViewerAppState { LastDirectory = directoryPath };
            var json = JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(AppStateFilePath, json);
        }
        catch
        {
            // Persistence failure should not block viewer behavior.
        }
    }

    private static System.Windows.Media.Brush? TryCreateDiffuseTextureBrush(Ai.Material? assimpMaterial, string modelDirectory)
    {
        if (assimpMaterial is null || !assimpMaterial.HasTextureDiffuse)
        {
            return null;
        }

        var texturePath = assimpMaterial.TextureDiffuse.FilePath;
        if (string.IsNullOrWhiteSpace(texturePath))
        {
            return null;
        }

        var normalizedPath = texturePath.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar);
        var candidate = Path.IsPathRooted(normalizedPath)
            ? normalizedPath
            : Path.Combine(modelDirectory, normalizedPath.TrimStart('.', Path.DirectorySeparatorChar));

        if (!File.Exists(candidate))
        {
            return null;
        }

        var image = new BitmapImage();
        image.BeginInit();
        image.CacheOption = BitmapCacheOption.OnLoad;
        image.UriSource = new Uri(candidate, UriKind.Absolute);
        image.EndInit();
        image.Freeze();

        var brush = new ImageBrush(image)
        {
            Stretch = Stretch.Fill
        };
        brush.Freeze();
        return brush;
    }

    private sealed class ViewerAppState
    {
        public string? LastDirectory { get; set; }
    }
}
