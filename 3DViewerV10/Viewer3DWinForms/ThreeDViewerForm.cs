using System.Globalization;
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

    private readonly HashSet<string> _gltfExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".glb", ".gltf"
    };

    private readonly HashSet<string> _assimpExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".fbx", ".dae", ".ply"
    };

    private readonly HelixViewport3D _viewport;
    private readonly ModelVisual3D _modelRoot;
    private FileSystemWatcher? _fileListWatcher;
    private string? _rootDirectory;
    private string? _currentListDirectory;
    private string? _lastLoadedModelPath;
    private double _basePerspectiveDistance = 1.0;
    private double _baseOrthographicWidth = 1.0;
    private readonly AmbientLight _ambientLight = new(System.Windows.Media.Color.FromRgb(110, 110, 110));
    private readonly SunLight _sunLight;
    private readonly DirectionalLight _mainDirectional;
    private readonly PointLight _mainPoint;
    private readonly DirectionalLight _fillDirectional;
    private readonly PointLight _fillPoint;
    private readonly ModelVisual3D _ambientVisual;
    private readonly ModelVisual3D _mainDirHost;
    private readonly ModelVisual3D _mainPointHost;
    private readonly ModelVisual3D _fillDirHost;
    private readonly ModelVisual3D _fillPointHost;
    /// <summary>보조 방향광 기본 색(RGB). 슬라이더로 스케일합니다.</summary>
    private const byte FillLightBaseR = 205;
    private const byte FillLightBaseG = 210;
    private const byte FillLightBaseB = 230;
    private readonly List<System.Windows.Media.SolidColorBrush> _emissiveBrushes = new();

    public ThreeDViewerForm()
    {
        InitializeComponent();
        InitializeIcons();

        _viewport = new HelixViewport3D
        {
            ShowCoordinateSystem = true,
            ShowFrameRate = false,
            // Trackball: 마우스로 모든 방향(극 포함) 자유 회전 — Turntable의 짐벌락 방지
            CameraRotationMode = CameraRotationMode.Trackball,
            RotateGesture = new MouseGesture(MouseAction.LeftClick),
            PanGesture = new MouseGesture(MouseAction.RightClick),
            ZoomGesture = new MouseGesture(MouseAction.MiddleClick)
        };

        TextureBrushQuality.ApplyToViewport(_viewport);

        // 태양광: 낮은 내장 앰비언트 + 밝기로 방향성 유지(스펙큘러 대비).
        _sunLight = new SunLight
        {
            Ambient = 0.26,
            Brightness = 1.14,
            Altitude = 52,
            Azimuth = 38
        };

        _mainDirectional = new DirectionalLight { Color = Colors.White };
        _mainPoint = new PointLight
        {
            Color = Colors.White,
            Range = 2000,
            Position = new Point3D(1200, 900, 600)
        };

        // 보조광: 방향광 기본 방향은 기존과 동일(밝기 슬라이더로 색 스케일).
        _fillDirectional = new DirectionalLight
        {
            Direction = new Vector3D(-0.62, -0.28, 0.73),
            Color = Colors.White
        };
        _fillPoint = new PointLight
        {
            Color = Colors.White,
            Range = 2000,
            Position = new Point3D(-600, 400, -400)
        };

        _ambientVisual = new ModelVisual3D { Content = _ambientLight };
        _mainDirHost = new ModelVisual3D { Content = _mainDirectional };
        _mainPointHost = new ModelVisual3D { Content = _mainPoint };
        _fillDirHost = new ModelVisual3D { Content = _fillDirectional };
        _fillPointHost = new ModelVisual3D { Content = _fillPoint };

        _modelRoot = new ModelVisual3D();
        _viewport.CameraChanged += Viewport_CameraChanged;

        InitializeAdvancedLightingUi();

        viewerHost.Child = _viewport;
        viewerHost.BackColor = System.Drawing.Color.Black;
        panelZoomInfo.BringToFront();
        panelLighting.BringToFront();
        UpdateZoomRatioLabel();
        FormClosed += ThreeDViewerForm_FormClosed;
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
        treeDirectories.SelectedNode = rootNode;
        UpdateFileList(rootPath);

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
        _currentListDirectory = directoryPath;
        ConfigureFileListWatcher(directoryPath);
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
            ShowExceptionDialog("파일 목록 오류", ex);
        }
        finally
        {
            listFiles.EndUpdate();
        }
    }

    private void ConfigureFileListWatcher(string directoryPath)
    {
        if (!Directory.Exists(directoryPath))
        {
            return;
        }

        if (_fileListWatcher is not null
            && string.Equals(_fileListWatcher.Path, directoryPath, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        DisposeFileListWatcher();

        _fileListWatcher = new FileSystemWatcher(directoryPath)
        {
            IncludeSubdirectories = false,
            NotifyFilter = NotifyFilters.FileName | NotifyFilters.Size | NotifyFilters.LastWrite | NotifyFilters.CreationTime
        };

        _fileListWatcher.Created += FileListWatcher_Changed;
        _fileListWatcher.Deleted += FileListWatcher_Changed;
        _fileListWatcher.Changed += FileListWatcher_Changed;
        _fileListWatcher.Renamed += FileListWatcher_Renamed;
        _fileListWatcher.EnableRaisingEvents = true;
    }

    private void FileListWatcher_Changed(object sender, FileSystemEventArgs e)
    {
        RefreshFileListFromWatcher(e.FullPath);
    }

    private void FileListWatcher_Renamed(object sender, RenamedEventArgs e)
    {
        if (ShouldRefreshFileList(e.OldFullPath) || ShouldRefreshFileList(e.FullPath))
        {
            RefreshFileListFromWatcher(e.FullPath);
        }
    }

    private void RefreshFileListFromWatcher(string changedPath)
    {
        if (!ShouldRefreshFileList(changedPath) || string.IsNullOrWhiteSpace(_currentListDirectory))
        {
            return;
        }

        if (!IsHandleCreated || IsDisposed)
        {
            return;
        }

        BeginInvoke(new Action(() =>
        {
            if (!string.IsNullOrWhiteSpace(_currentListDirectory))
            {
                UpdateFileList(_currentListDirectory);
            }
        }));
    }

    private bool ShouldRefreshFileList(string filePath)
    {
        var extension = Path.GetExtension(filePath);
        return _supportedExtensions.Contains(extension);
    }

    private void DisposeFileListWatcher()
    {
        if (_fileListWatcher is null)
        {
            return;
        }

        _fileListWatcher.EnableRaisingEvents = false;
        _fileListWatcher.Created -= FileListWatcher_Changed;
        _fileListWatcher.Deleted -= FileListWatcher_Changed;
        _fileListWatcher.Changed -= FileListWatcher_Changed;
        _fileListWatcher.Renamed -= FileListWatcher_Renamed;
        _fileListWatcher.Dispose();
        _fileListWatcher = null;
    }

    private void ThreeDViewerForm_FormClosed(object? sender, FormClosedEventArgs e)
    {
        DisposeFileListWatcher();
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
            _emissiveBrushes.Clear();
            var extension = Path.GetExtension(modelPath);
            Model3D model;

            if (_gltfExtensions.Contains(extension))
            {
                model = GltfSceneLoader.Load(modelPath, trackEmissive.Value, _emissiveBrushes);
            }
            else if (_assimpExtensions.Contains(extension))
            {
                model = LoadWithAssimp(modelPath);
            }
            else
            {
                var importer = new ModelImporter();
                model = importer.Load(modelPath) ?? throw new InvalidOperationException("Helix 로더가 모델을 반환하지 않았습니다.");
            }

            _modelRoot.Content = model;
            _lastLoadedModelPath = modelPath;
            _viewport.ZoomExtents();
            CaptureZoomBaseline();
            UpdateZoomRatioLabel();
            SetStatus($"로드 완료: {Path.GetFileName(modelPath)}");
        }
        catch (Exception ex)
        {
            _modelRoot.Content = null;
            _lastLoadedModelPath = null;
            SetStatus($"모델 로드 실패: {ex.Message}");
            ShowExceptionDialog("모델 로드 오류", ex);
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

    private void ShowExceptionDialog(string title, Exception ex)
    {
        ViewerErrorReporter.Show(this, title, ex);
    }

    private void fileListContextMenu_Opening(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        var hasFile = listFiles.SelectedItems.Count > 0
            && listFiles.SelectedItems[0].Tag is string path
            && File.Exists(path);
        menuRenameFile.Enabled = hasFile;
        menuDeleteFile.Enabled = hasFile;
    }

    private void menuRenameFile_Click(object? sender, EventArgs e)
    {
        TryRenameSelectedFile();
    }

    private void menuDeleteFile_Click(object? sender, EventArgs e)
    {
        TryDeleteSelectedFile();
    }

    private void listFiles_KeyDown(object? sender, System.Windows.Forms.KeyEventArgs e)
    {
        if (e.KeyCode != Keys.Delete)
        {
            return;
        }

        e.Handled = true;
        e.SuppressKeyPress = true;
        TryDeleteSelectedFile();
    }

    private void TryRenameSelectedFile()
    {
        if (_currentListDirectory is null
            || listFiles.SelectedItems.Count == 0
            || listFiles.SelectedItems[0].Tag is not string oldPath
            || !File.Exists(oldPath))
        {
            return;
        }

        var oldName = Path.GetFileName(oldPath);
        if (!TryPromptNewFileName(this, oldName, out var newName))
        {
            return;
        }

        var safeName = Path.GetFileName(newName.Trim());
        if (string.IsNullOrWhiteSpace(safeName))
        {
            MessageBox.Show(this, "파일 이름이 비어 있습니다.", "이름 바꾸기", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        if (safeName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
        {
            MessageBox.Show(this, "파일 이름에 사용할 수 없는 문자가 포함되어 있습니다.", "이름 바꾸기", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var root = Path.GetFullPath(_currentListDirectory.TrimEnd(Path.DirectorySeparatorChar));
        var newPath = Path.GetFullPath(Path.Combine(root, safeName));
        if (!newPath.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
        {
            MessageBox.Show(this, "현재 폴더 밖으로 이름을 바꿀 수 없습니다.", "이름 바꾸기", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        if (string.Equals(oldPath, newPath, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        if (File.Exists(newPath))
        {
            MessageBox.Show(this, "같은 이름의 파일이 이미 있습니다.", "이름 바꾸기", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        try
        {
            ClearViewerIfShowing(oldPath);
            File.Move(oldPath, newPath);
            UpdateFileList(_currentListDirectory);
            SelectListItemByPath(newPath);
            SetStatus($"이름 변경: {Path.GetFileName(newPath)}");
        }
        catch (Exception ex)
        {
            ViewerErrorReporter.Show(this, "이름 바꾸기", ex);
        }
    }

    private void TryDeleteSelectedFile()
    {
        if (_currentListDirectory is null
            || listFiles.SelectedItems.Count == 0
            || listFiles.SelectedItems[0].Tag is not string path
            || !File.Exists(path))
        {
            return;
        }

        var name = Path.GetFileName(path);
        var result = MessageBox.Show(
            this,
            $"다음 파일을 삭제할까요?\n\n{name}\n\n휴지통이 아니라 완전히 삭제됩니다.",
            "파일 삭제",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Warning,
            MessageBoxDefaultButton.Button2);

        if (result != DialogResult.Yes)
        {
            return;
        }

        try
        {
            ClearViewerIfShowing(path);
            File.Delete(path);
            UpdateFileList(_currentListDirectory);
            SetStatus($"삭제됨: {name}");
        }
        catch (Exception ex)
        {
            ViewerErrorReporter.Show(this, "파일 삭제", ex);
        }
    }

    private void ClearViewerIfShowing(string fullPath)
    {
        if (_lastLoadedModelPath is not null
            && string.Equals(_lastLoadedModelPath, fullPath, StringComparison.OrdinalIgnoreCase))
        {
            _modelRoot.Content = null;
            _lastLoadedModelPath = null;
        }
    }

    private void SelectListItemByPath(string fullPath)
    {
        foreach (ListViewItem item in listFiles.Items)
        {
            if (item.Tag is string p && string.Equals(p, fullPath, StringComparison.OrdinalIgnoreCase))
            {
                item.Selected = true;
                item.Focused = true;
                break;
            }
        }
    }

    private static bool TryPromptNewFileName(IWin32Window owner, string currentFileName, out string newName)
    {
        using var form = new Form
        {
            Text = "이름 바꾸기",
            ClientSize = new System.Drawing.Size(420, 110),
            FormBorderStyle = FormBorderStyle.FixedDialog,
            StartPosition = FormStartPosition.CenterParent,
            MaximizeBox = false,
            MinimizeBox = false,
            ShowInTaskbar = false,
            ShowIcon = false
        };

        var textBox = new TextBox
        {
            Text = currentFileName,
            Location = new System.Drawing.Point(12, 36),
            Width = 396
        };
        var label = new Label
        {
            Text = "새 파일 이름:",
            Location = new System.Drawing.Point(12, 10),
            AutoSize = true
        };
        var ok = new Button
        {
            Text = "확인",
            DialogResult = DialogResult.OK,
            Location = new System.Drawing.Point(228, 70),
            Width = 88
        };
        var cancel = new Button
        {
            Text = "취소",
            DialogResult = DialogResult.Cancel,
            Location = new System.Drawing.Point(320, 70),
            Width = 88
        };

        form.Controls.Add(label);
        form.Controls.Add(textBox);
        form.Controls.Add(ok);
        form.Controls.Add(cancel);
        form.AcceptButton = ok;
        form.CancelButton = cancel;

        if (form.ShowDialog(owner) != DialogResult.OK)
        {
            newName = string.Empty;
            return false;
        }

        newName = textBox.Text;
        return true;
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

            var geometryModel = CreateGeometryModel(scene, mesh, scene.Materials[mesh.MaterialIndex], worldTransform, modelDirectory);
            output.Children.Add(geometryModel);
        }

        foreach (var child in node.Children)
        {
            AppendNode(scene, child, worldTransform, output, modelDirectory);
        }
    }

    private static GeometryModel3D CreateGeometryModel(Ai.Scene scene, Ai.Mesh mesh, Ai.Material? assimpMaterial, Matrix3D transform, string modelDirectory)
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
        PopulateTextureCoordinates(geometry, mesh, assimpMaterial);
        var material = CreateWpfMaterial(scene, assimpMaterial, modelDirectory);

        return new GeometryModel3D
        {
            Geometry = geometry,
            Material = material,
            BackMaterial = material,
            Transform = new MatrixTransform3D(transform)
        };
    }

    private static System.Windows.Media.Media3D.Material CreateWpfMaterial(Ai.Scene scene, Ai.Material? assimpMaterial, string modelDirectory)
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

        var textureBrush = TryCreatePrimaryColorTextureBrush(assimpMaterial, modelDirectory, scene);
        var group = new MaterialGroup();
        group.Children.Add(new DiffuseMaterial(textureBrush ?? new SolidColorBrush(diffuseColor)));

        // 텍스처가 있어도 Diffuse만 두면 완전 무광처럼 보이므로 항상 스펙큘러를 넣습니다.
        var specPower = textureBrush is not null ? Math.Min(shininess, 88.0) : shininess;
        group.Children.Add(new SpecularMaterial(new SolidColorBrush(specularColor), specPower));

        return group;
    }

    private static void PopulateTextureCoordinates(MeshGeometry3D geometry, Ai.Mesh mesh, Ai.Material? material)
    {
        var positionCount = geometry.Positions?.Count ?? 0;
        if (positionCount == 0)
        {
            return;
        }

        var uvChannel = ResolvePrimaryUvChannel(mesh, material);
        if (uvChannel < 0 || !mesh.HasTextureCoords(uvChannel))
        {
            return;
        }

        var uvs = mesh.TextureCoordinateChannels[uvChannel];
        if (uvs is null || uvs.Count == 0)
        {
            return;
        }

        var texturePoints = new PointCollection(positionCount);
        for (var i = 0; i < positionCount; i++)
        {
            if (i < uvs.Count)
            {
                var uv = uvs[i];
                texturePoints.Add(new System.Windows.Point(uv.X, 1.0 - uv.Y));
            }
            else
            {
                texturePoints.Add(new System.Windows.Point(0.5, 0.5));
            }
        }

        geometry.TextureCoordinates = texturePoints;
    }

    private static int ResolvePrimaryUvChannel(Ai.Mesh mesh, Ai.Material? material)
    {
        if (material is not null)
        {
            var slots = material.GetAllMaterialTextures();
            if (slots is { Length: > 0 })
            {
                foreach (var slot in slots.OrderBy(s => BaseColorTexturePriority(s.TextureType)))
                {
                    if (IsNonColorTextureType(slot.TextureType))
                    {
                        continue;
                    }

                    if (string.IsNullOrWhiteSpace(slot.FilePath))
                    {
                        continue;
                    }

                    var channel = slot.UVIndex;
                    if (mesh.HasTextureCoords(channel))
                    {
                        return channel;
                    }
                }
            }
        }

        if (mesh.HasTextureCoords(0))
        {
            return 0;
        }

        if (mesh.HasTextureCoords(1))
        {
            return 1;
        }

        return -1;
    }

    private static bool IsNonColorTextureType(Ai.TextureType textureType)
    {
        return textureType is Ai.TextureType.None
            or Ai.TextureType.Normals
            or Ai.TextureType.Height
            or Ai.TextureType.Opacity
            or Ai.TextureType.Displacement
            or Ai.TextureType.Shininess;
    }

    private static int BaseColorTexturePriority(Ai.TextureType textureType)
    {
        return textureType switch
        {
            Ai.TextureType.Diffuse => 0,
            Ai.TextureType.Unknown => 1,
            Ai.TextureType.Ambient => 2,
            Ai.TextureType.Specular => 3,
            Ai.TextureType.Lightmap => 4,
            Ai.TextureType.Emissive => 5,
            Ai.TextureType.Reflection => 6,
            _ => 50
        };
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

    private static System.Windows.Media.Brush? TryCreatePrimaryColorTextureBrush(Ai.Material? assimpMaterial, string modelDirectory, Ai.Scene scene)
    {
        if (assimpMaterial is null)
        {
            return null;
        }

        var allSlots = assimpMaterial.GetAllMaterialTextures();
        if (allSlots is { Length: > 0 })
        {
            foreach (var slot in allSlots.OrderBy(s => BaseColorTexturePriority(s.TextureType)))
            {
                if (IsNonColorTextureType(slot.TextureType))
                {
                    continue;
                }

                if (string.IsNullOrWhiteSpace(slot.FilePath))
                {
                    continue;
                }

                var brush = TryCreateBrushFromTextureSlot(slot, scene, modelDirectory);
                if (brush is not null)
                {
                    return brush;
                }
            }
        }

        var textureTypes = new[]
        {
            Ai.TextureType.Diffuse,
            Ai.TextureType.Unknown,
            Ai.TextureType.Ambient,
            Ai.TextureType.Emissive,
            Ai.TextureType.Lightmap
        };

        foreach (var textureType in textureTypes)
        {
            var count = assimpMaterial.GetMaterialTextureCount(textureType);
            for (var index = 0; index < count; index++)
            {
                if (!assimpMaterial.GetMaterialTexture(textureType, index, out var slot))
                {
                    continue;
                }

                var brush = TryCreateBrushFromTextureSlot(slot, scene, modelDirectory);
                if (brush is not null)
                {
                    return brush;
                }
            }
        }

        return null;
    }

    private static System.Windows.Media.Brush? TryCreateBrushFromTextureSlot(Ai.TextureSlot slot, Ai.Scene scene, string modelDirectory)
    {
        var path = slot.FilePath;
        if (string.IsNullOrWhiteSpace(path))
        {
            return null;
        }

        path = NormalizeMaterialTexturePath(path);

        if (path.StartsWith("*", StringComparison.Ordinal))
        {
            var suffix = path.AsSpan(1).Trim();
            if (!int.TryParse(suffix, NumberStyles.Integer, CultureInfo.InvariantCulture, out var embeddedIndex))
            {
                return null;
            }

            return TryCreateBrushFromEmbeddedIndex(scene, embeddedIndex);
        }

        var resolved = TryResolveTexturePath(path, modelDirectory);
        return resolved is null ? null : CreateFrozenImageBrush(resolved);
    }

    private static System.Windows.Media.Brush? TryCreateBrushFromEmbeddedIndex(Ai.Scene scene, int embeddedIndex)
    {
        if (!scene.HasTextures || scene.TextureCount == 0)
        {
            return null;
        }

        var brush = TryCreateBrushFromEmbeddedAt(scene, embeddedIndex);
        if (brush is not null)
        {
            return brush;
        }

        if (embeddedIndex > 0)
        {
            brush = TryCreateBrushFromEmbeddedAt(scene, embeddedIndex - 1);
            if (brush is not null)
            {
                return brush;
            }
        }

        if (embeddedIndex >= 0 && embeddedIndex + 1 < scene.TextureCount)
        {
            brush = TryCreateBrushFromEmbeddedAt(scene, embeddedIndex + 1);
            if (brush is not null)
            {
                return brush;
            }
        }

        return null;
    }

    private static System.Windows.Media.Brush? TryCreateBrushFromEmbeddedAt(Ai.Scene scene, int index)
    {
        if (index < 0 || index >= scene.TextureCount)
        {
            return null;
        }

        return TryCreateBrushFromEmbedded(scene.Textures[index]);
    }

    private static System.Windows.Media.Brush? TryCreateBrushFromEmbedded(Ai.EmbeddedTexture? texture)
    {
        if (texture is null)
        {
            return null;
        }

        try
        {
            if (texture.HasCompressedData && texture.CompressedData is { Length: > 0 } bytes)
            {
                var brush = TryCreateBrushFromImageBytes(bytes);
                if (brush is not null)
                {
                    return brush;
                }

                using var stream = new MemoryStream(bytes, writable: false);
                var image = new BitmapImage();
                image.BeginInit();
                image.StreamSource = stream;
                image.CacheOption = BitmapCacheOption.OnLoad;
                image.CreateOptions = BitmapCreateOptions.IgnoreColorProfile;
                image.EndInit();
                image.Freeze();

                var fallbackBrush = new ImageBrush(image)
                {
                    Stretch = Stretch.Fill,
                    TileMode = TileMode.Tile
                };
                TextureBrushQuality.ApplyToBrush(fallbackBrush);
                fallbackBrush.Freeze();
                return fallbackBrush;
            }

            if (texture.HasNonCompressedData
                && texture.Width > 0
                && texture.Height > 0
                && texture.NonCompressedData is { Length: > 0 } raw
                && raw.Length >= texture.Width * texture.Height * 4)
            {
                var width = texture.Width;
                var height = texture.Height;
                var stride = width * 4;
                var wb = new WriteableBitmap(width, height, 96, 96, PixelFormats.Bgra32, null);
                wb.WritePixels(new System.Windows.Int32Rect(0, 0, width, height), raw, stride, 0);
                wb.Freeze();

                var brush = new ImageBrush(wb)
                {
                    Stretch = Stretch.Fill,
                    TileMode = TileMode.Tile
                };
                TextureBrushQuality.ApplyToBrush(brush);
                brush.Freeze();
                return brush;
            }
        }
        catch
        {
            return null;
        }

        return null;
    }

    private static ImageBrush? TryCreateBrushFromImageBytes(byte[] bytes)
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
                TileMode = TileMode.Tile
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

    private static string NormalizeMaterialTexturePath(string path)
    {
        var trimmed = path.Trim().Trim('"', '\'');
        if (trimmed.StartsWith("file://", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                var uri = new Uri(trimmed);
                return uri.LocalPath.Replace('/', Path.DirectorySeparatorChar);
            }
            catch (UriFormatException)
            {
                // Fall through to manual strip
                var withoutScheme = trimmed["file://".Length..];
                if (withoutScheme.StartsWith("//", StringComparison.Ordinal))
                {
                    withoutScheme = withoutScheme[2..];
                }

                return Uri.UnescapeDataString(withoutScheme).Replace('/', Path.DirectorySeparatorChar);
            }
        }

        if (trimmed.Contains('%', StringComparison.Ordinal))
        {
            try
            {
                trimmed = Uri.UnescapeDataString(trimmed);
            }
            catch (UriFormatException)
            {
                // keep trimmed
            }
        }

        return trimmed.Replace('/', Path.DirectorySeparatorChar);
    }

    private static string? TryResolveTexturePath(string? rawPath, string modelDirectory)
    {
        if (string.IsNullOrWhiteSpace(rawPath) || rawPath.StartsWith("*", StringComparison.Ordinal))
        {
            return null;
        }

        var normalized = NormalizeMaterialTexturePath(rawPath);
        var candidates = new List<string>();
        CollectExternalTextureCandidates(normalized, modelDirectory, candidates);

        foreach (var candidate in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }

    private static void CollectExternalTextureCandidates(string normalized, string modelDirectory, List<string> candidates)
    {
        void Add(string? p)
        {
            if (string.IsNullOrWhiteSpace(p))
            {
                return;
            }

            try
            {
                candidates.Add(Path.GetFullPath(p));
            }
            catch (Exception)
            {
                candidates.Add(p);
            }
        }

        if (Path.IsPathRooted(normalized))
        {
            Add(normalized);
            return;
        }

        var trimmedRelative = normalized.TrimStart('.', Path.DirectorySeparatorChar);
        var fileNameOnly = Path.GetFileName(normalized);

        if (!string.IsNullOrWhiteSpace(modelDirectory))
        {
            var root = Path.GetFullPath(modelDirectory.TrimEnd(Path.DirectorySeparatorChar));
            Add(Path.Combine(root, trimmedRelative));
            Add(Path.Combine(root, fileNameOnly));
            Add(Path.Combine(root, "textures", trimmedRelative));
            Add(Path.Combine(root, "Textures", trimmedRelative));
            Add(Path.Combine(root, "textures", fileNameOnly));
            Add(Path.Combine(root, "Textures", fileNameOnly));

            var parent = Directory.GetParent(root)?.FullName;
            if (!string.IsNullOrWhiteSpace(parent))
            {
                Add(Path.Combine(parent, fileNameOnly));
                Add(Path.Combine(parent, "textures", fileNameOnly));
                Add(Path.Combine(parent, "Textures", fileNameOnly));
            }
        }
    }

    private static ImageBrush CreateFrozenImageBrush(string imagePath)
    {
        var image = new BitmapImage();
        image.BeginInit();
        image.CacheOption = BitmapCacheOption.OnLoad;
        image.CreateOptions = BitmapCreateOptions.IgnoreColorProfile;
        image.UriSource = new Uri(imagePath, UriKind.Absolute);
        image.EndInit();
        image.Freeze();

        var brush = new ImageBrush(image)
        {
            Stretch = Stretch.Fill,
            TileMode = TileMode.Tile
        };
        TextureBrushQuality.ApplyToBrush(brush);
        brush.Freeze();
        return brush;
    }



    private void trackAmbient_ValueChanged(object? sender, EventArgs e)
    {
        var v = (byte)trackAmbient.Value;
        _ambientLight.Color = System.Windows.Media.Color.FromRgb(v, v, v);
        lblAmbientVal.Text = v.ToString();
    }

    private void trackEmissive_ValueChanged(object? sender, EventArgs e)
    {
        var v = (byte)Math.Clamp(trackEmissive.Value, 0, 255);
        lblEmissiveVal.Text = trackEmissive.Value.ToString();
        var newColor = System.Windows.Media.Color.FromRgb(v, v, v);
        foreach (var brush in _emissiveBrushes)
            brush.Color = newColor;
    }

    private sealed class ViewerAppState
    {
        public string? LastDirectory { get; set; }
    }
}
