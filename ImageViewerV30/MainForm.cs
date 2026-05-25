using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text.Json;
using System.Drawing.Drawing2D;
using System.Threading;
using System.Threading.Tasks;
using LibVLCSharp.Shared;
using SixLabors.ImageSharp.Formats.Jpeg;

namespace ImageViewerV30;

public partial class MainForm : Form
{
    private const string TreeIconFolderClosed = "folder-closed";
    private const string TreeIconFolderOpen = "folder-open";
    private const string FileIconVideo = "file-video";
    private const string FileIconImage = "file-image";
    private const string FileIconPng = "file-png";
    private const string FileIconJpg = "file-jpg";
    private const string FileIconGif = "file-gif";
    private const string FileIconBmp = "file-bmp";
    private const string FileIconTiff = "file-tiff";
    private const string FileIconIco = "file-ico";
    private const string FileIconWebp = "file-webp";

    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".ico", ".webp", ".heif", ".heic", ".hif"
    };

    private static readonly HashSet<string> VideoExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".webm", ".m4v", ".mpeg", ".mpg", ".ts", ".m2ts", ".flv"
    };

    private static readonly HashSet<string> PreviewableExtensions = new(ImageExtensions, StringComparer.OrdinalIgnoreCase);
    private const string DummyTreeNodeText = "...";
    private readonly string _appStateFilePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "ImageViewerV10",
        "appstate.json");
    private readonly string _iconFolderPath = Path.Combine(AppContext.BaseDirectory, "assets", "icons");
    private const bool UseRealVideoFrameThumbnails = false;

    private string? _currentFolder;
    private string? _currentPreviewPath;
    private string? _clipboardPath;
    private bool _clipboardIsCut;
    private bool _suppressImageDisplay;
    private readonly Dictionary<string, ListViewItem> _fileItemByPath = new(StringComparer.OrdinalIgnoreCase);
    private CancellationTokenSource? _thumbnailLoadCts;
    private readonly System.Windows.Forms.Timer _videoProgressTimer = new() { Interval = 250 };
    private readonly System.Windows.Forms.Timer _videoOverlayTimer = new() { Interval = 550 };
    private LibVLC? _libVlc;
    private MediaPlayer? _mediaPlayer;
    private Media? _loadedVideoMedia;
    private Image? _ownedPreviewImage;
    private double _zoomFactor = 1.0;
    private bool _isUserSeekingVideo;
    private bool _isImagePanning;
    private Point _imagePanStartMouse;
    private Point _imagePanStartScroll;

    public MainForm()
    {
        InitializeComponent();
        ApplyWindowIcon();
        WireEvents();

        if (IsDesignMode())
        {
            return;
        }

        foreach (string ext in VideoExtensions)
        {
            PreviewableExtensions.Add(ext);
        }

        Core.Initialize();
        _libVlc = new LibVLC();
        _mediaPlayer = new MediaPlayer(_libVlc);
        videoView.MediaPlayer = _mediaPlayer;
        _videoProgressTimer.Tick += (_, _) => UpdateVideoProgressUi();
        _videoProgressTimer.Start();
        _videoOverlayTimer.Tick += (_, _) =>
        {
            _videoOverlayTimer.Stop();
            labelVideoOverlayIcon.Visible = false;
        };
        InitializeIconLists();
        LoadInitialFolder();
    }

    private void ApplyWindowIcon()
    {
        try
        {
            string[] candidates =
            {
                Path.Combine(AppContext.BaseDirectory, "daemon_hammer.ico"),
                Path.Combine(Application.StartupPath, "daemon_hammer.ico"),
                Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location) ?? string.Empty, "daemon_hammer.ico"),
            };

            string? iconPath = candidates.FirstOrDefault(File.Exists);
            if (!string.IsNullOrWhiteSpace(iconPath))
            {
                Icon = new Icon(iconPath);
                return;
            }
            // ico 파일이 없으면 EXE에 임베드된 아이콘 사용
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application;
        }
        catch
        {
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application; }
            catch { }
        }
    }

    private static bool IsDesignMode()
    {
        return LicenseManager.UsageMode == LicenseUsageMode.Designtime;
    }

    private void WireEvents()
    {
        buttonPickFolder.Click += ButtonPickFolder_Click;
        listViewFiles.SelectedIndexChanged += ListViewFiles_SelectedIndexChanged;
        listViewFiles.MouseDown += (_, e) => { if (e.Button == MouseButtons.Right) _suppressImageDisplay = true; };
        listViewFiles.MouseUp += ListViewFiles_MouseUp;
        treeFolders.BeforeExpand += TreeFolders_BeforeExpand;
        treeFolders.AfterSelect += TreeFolders_AfterSelect;
        treeFolders.NodeMouseClick += TreeFolders_NodeMouseClick;
        treeFolders.MouseUp += TreeFolders_MouseUp;
        panelImageScrollHost.MouseWheel += PanelImageScrollHost_MouseWheel;
        picturePreview.MouseWheel += PanelImageScrollHost_MouseWheel;
        panelImageScrollHost.Resize += (_, _) => UpdateImageViewportLayout();
        panelImageScrollHost.MouseDown += ImagePan_MouseDown;
        panelImageScrollHost.MouseMove += ImagePan_MouseMove;
        panelImageScrollHost.MouseUp += ImagePan_MouseUp;
        picturePreview.MouseDown += ImagePan_MouseDown;
        picturePreview.MouseMove += ImagePan_MouseMove;
        picturePreview.MouseUp += ImagePan_MouseUp;
        picturePreview.MouseUp += ImageView_MouseUp;
        panelImageScrollHost.MouseUp += ImageView_MouseUp;
        buttonRotateCCW.Click += (_, _) => RotateCurrentImage(RotateFlipType.Rotate270FlipNone);
        buttonRotateCW.Click += (_, _) => RotateCurrentImage(RotateFlipType.Rotate90FlipNone);
        buttonFlipHorizontal.Click += (_, _) => RotateCurrentImage(RotateFlipType.RotateNoneFlipX);
        buttonEditImage.Click += (_, _) => OpenImageEditor();
        buttonVideoPlay.Click += (_, _) => PlayVideo();
        buttonVideoPause.Click += (_, _) => PauseVideo();
        buttonVideoStop.Click += (_, _) => StopVideo();
        videoSeekBar.SeekRequested += VideoSeekBar_SeekRequested;
        videoSeekBar.SeekingStateChanged += seeking => _isUserSeekingVideo = seeking;
        panelImageScrollHost.MouseEnter += (_, _) => panelImageScrollHost.Focus();
        FormClosing += MainForm_FormClosing;
    }

    private void InitializeIconLists()
    {
        imageListTree.Images.Clear();
        imageListFiles.Images.Clear();

        imageListTree.Images.Add(TreeIconFolderClosed, LoadIconFromPng("folder-closed.png", () => CreateFolderIcon(false)));
        imageListTree.Images.Add(TreeIconFolderOpen, LoadIconFromPng("folder-open.png", () => CreateFolderIcon(true)));

        imageListFiles.Images.Add(FileIconImage, LoadIconFromPng("file-image.png", () => CreateFileTypeIcon("IMG", Color.FromArgb(42, 157, 143))));
        imageListFiles.Images.Add(FileIconVideo, LoadIconFromPng("file-video.png", () => CreateFileTypeIcon("VID", Color.FromArgb(231, 111, 81))));
        imageListFiles.Images.Add(FileIconPng, LoadIconFromPng("file-png.png", () => CreateFileTypeIcon("PNG", Color.FromArgb(76, 201, 240))));
        imageListFiles.Images.Add(FileIconJpg, LoadIconFromPng("file-jpg.png", () => CreateFileTypeIcon("JPG", Color.FromArgb(67, 170, 139))));
        imageListFiles.Images.Add(FileIconGif, LoadIconFromPng("file-gif.png", () => CreateFileTypeIcon("GIF", Color.FromArgb(131, 56, 236))));
        imageListFiles.Images.Add(FileIconBmp, LoadIconFromPng("file-bmp.png", () => CreateFileTypeIcon("BMP", Color.FromArgb(87, 117, 144))));
        imageListFiles.Images.Add(FileIconTiff, LoadIconFromPng("file-tiff.png", () => CreateFileTypeIcon("TIF", Color.FromArgb(249, 132, 74))));
        imageListFiles.Images.Add(FileIconIco, LoadIconFromPng("file-ico.png", () => CreateFileTypeIcon("ICO", Color.FromArgb(56, 163, 165))));
        imageListFiles.Images.Add(FileIconWebp, LoadIconFromPng("file-webp.png", () => CreateFileTypeIcon("WBP", Color.FromArgb(144, 190, 109))));
    }

    private Image LoadIconFromPng(string fileName, Func<Image> fallbackFactory)
    {
        try
        {
            string path = Path.Combine(_iconFolderPath, fileName);
            if (File.Exists(path))
            {
                using Image image = Image.FromFile(path);
                return new Bitmap(image);
            }
        }
        catch
        {
        }

        return fallbackFactory();
    }

    private static Bitmap CreateFolderIcon(bool open)
    {
        var bmp = new Bitmap(16, 16);
        using Graphics g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;

        using var topBrush = new SolidBrush(Color.FromArgb(252, 191, 73));
        using var bodyBrush = new SolidBrush(open ? Color.FromArgb(246, 174, 45) : Color.FromArgb(240, 162, 2));
        using var borderPen = new Pen(Color.FromArgb(179, 98, 0), 1f);

        g.FillRectangle(topBrush, 2, 3, 6, 3);
        g.FillRectangle(bodyBrush, 1, 5, 14, 9);
        g.DrawRectangle(borderPen, 1, 5, 14, 9);
        return bmp;
    }

    private static Bitmap CreateFileTypeIcon(string label, Color accentColor)
    {
        var bmp = new Bitmap(16, 16);
        using Graphics g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;

        using var pageBrush = new SolidBrush(Color.FromArgb(245, 245, 245));
        using var foldBrush = new SolidBrush(Color.FromArgb(210, 210, 210));
        using var accentBrush = new SolidBrush(accentColor);
        using var textBrush = new SolidBrush(Color.White);
        using var borderPen = new Pen(Color.FromArgb(170, 170, 170), 1f);
        using var font = new Font("Segoe UI", 5.2f, FontStyle.Bold, GraphicsUnit.Pixel);

        g.FillRectangle(pageBrush, 2, 1, 11, 14);
        g.FillPolygon(foldBrush, new[]
        {
            new Point(13, 1),
            new Point(13, 5),
            new Point(9, 5)
        });
        g.DrawRectangle(borderPen, 2, 1, 11, 14);
        g.FillRectangle(accentBrush, 2, 9, 11, 6);
        g.DrawString(label, font, textBrush, new RectangleF(2, 9.2f, 11, 6), new StringFormat
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center
        });

        return bmp;
    }

    private sealed class AppState
    {
        public string? LastFolder { get; set; }
    }

    private void MainForm_FormClosing(object? sender, FormClosingEventArgs e)
    {
        if (IsDesignMode())
        {
            return;
        }

        CancelThumbnailLoading();
        ClearImagePreview();
        DisposeThumbnailControls();
        ReleaseVideoMedia();
        _videoProgressTimer.Stop();
        _videoProgressTimer.Dispose();
        _videoOverlayTimer.Stop();
        _videoOverlayTimer.Dispose();
        _mediaPlayer?.Dispose();
        _mediaPlayer = null;
        _libVlc?.Dispose();
        _libVlc = null;
    }

    private void ButtonPickFolder_Click(object? sender, EventArgs e)
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = "미리보기할 폴더를 선택하세요.",
            UseDescriptionForTitle = true,
            SelectedPath = Directory.Exists(_currentFolder) ? _currentFolder : GetDefaultFolder()
        };

        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        _currentFolder = dialog.SelectedPath;
        LoadFolderTree(_currentFolder);
        SaveAppState(_currentFolder);
    }

    private void LoadInitialFolder()
    {
        string defaultFolder = GetSavedLastFolder() ?? GetDefaultFolder();
        LoadFolderTree(defaultFolder);
    }

    private string GetDefaultFolder()
    {
        string path = Environment.GetFolderPath(Environment.SpecialFolder.MyPictures);
        if (!Directory.Exists(path))
        {
            path = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
        }

        return path;
    }

    private string? GetSavedLastFolder()
    {
        try
        {
            if (!File.Exists(_appStateFilePath))
            {
                return null;
            }

            string json = File.ReadAllText(_appStateFilePath);
            AppState? state = JsonSerializer.Deserialize<AppState>(json);
            if (!string.IsNullOrWhiteSpace(state?.LastFolder) && Directory.Exists(state.LastFolder))
            {
                return state.LastFolder;
            }
        }
        catch
        {
        }

        return null;
    }

    private void SaveAppState(string folderPath)
    {
        try
        {
            string? dir = Path.GetDirectoryName(_appStateFilePath);
            if (!string.IsNullOrWhiteSpace(dir))
            {
                Directory.CreateDirectory(dir);
            }

            var state = new AppState { LastFolder = folderPath };
            string json = JsonSerializer.Serialize(state);
            File.WriteAllText(_appStateFilePath, json);
        }
        catch
        {
        }
    }

    private void LoadFolderTree(string rootFolder)
    {
        if (!Directory.Exists(rootFolder))
        {
            MessageBox.Show(this, "기본 폴더를 찾을 수 없습니다.", "폴더 없음", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        treeFolders.BeginUpdate();
        treeFolders.Nodes.Clear();
        TreeNode root = CreateFolderNode(rootFolder);
        root.Expand();
        treeFolders.Nodes.Add(root);
        treeFolders.SelectedNode = root;
        treeFolders.EndUpdate();

        _currentFolder = rootFolder;
        textFolderPath.Text = rootFolder;
        SaveAppState(rootFolder);
    }

    private TreeNode CreateFolderNode(string folderPath)
    {
        var node = new TreeNode(Path.GetFileName(folderPath))
        {
            Tag = folderPath,
            ImageKey = TreeIconFolderClosed,
            SelectedImageKey = TreeIconFolderOpen
        };

        if (string.IsNullOrWhiteSpace(node.Text))
        {
            node.Text = folderPath;
        }

        if (HasSubDirectory(folderPath))
        {
            node.Nodes.Add(DummyTreeNodeText);
        }

        return node;
    }

    private static bool HasSubDirectory(string folderPath)
    {
        try
        {
            return Directory.EnumerateDirectories(folderPath).Any();
        }
        catch
        {
            return false;
        }
    }

    private void TreeFolders_BeforeExpand(object? sender, TreeViewCancelEventArgs e)
    {
        if (e.Node is null)
        {
            return;
        }

        PopulateChildFolders(e.Node);
    }

    private void PopulateChildFolders(TreeNode node)
    {
        if (node.Nodes.Count != 1 || node.Nodes[0].Text != DummyTreeNodeText)
        {
            return;
        }

        ForceRefreshChildFolders(node);
    }

    private void ForceRefreshChildFolders(TreeNode node)
    {
        string folderPath = node.Tag as string ?? string.Empty;
        if (string.IsNullOrWhiteSpace(folderPath))
            return;

        node.Nodes.Clear();
        try
        {
            foreach (string child in Directory.EnumerateDirectories(folderPath).OrderBy(p => p, StringComparer.OrdinalIgnoreCase))
            {
                node.Nodes.Add(CreateFolderNode(child));
            }
        }
        catch
        {
        }
    }

    private void TreeFolders_AfterSelect(object? sender, TreeViewEventArgs e)
    {
        if (e.Node is null || e.Node.Tag is not string folderPath || !Directory.Exists(folderPath))
        {
            return;
        }

        textFolderPath.Text = folderPath;
        _currentFolder = folderPath;
        SaveAppState(folderPath);
        LoadFileList(folderPath);
    }

    private void TreeFolders_NodeMouseClick(object? sender, TreeNodeMouseClickEventArgs e)
    {
        // AfterSelect는 이미 선택된 노드를 다시 클릭해도 발생하지 않는다.
        // 이미지/비디오 보기 중 같은 폴더 노드를 클릭하면 갤러리로 전환이 안 되는 문제를 여기서 처리한다.
        if (e.Node == treeFolders.SelectedNode &&
            e.Node.Tag is string folderPath &&
            Directory.Exists(folderPath))
        {
            LoadFileList(folderPath);
        }
    }

    private void LoadFileList(string folderPath)
    {
        listViewFiles.BeginUpdate();
        listViewFiles.Items.Clear();
        _fileItemByPath.Clear();

        try
        {
            foreach (string path in Directory.EnumerateFiles(folderPath).OrderBy(p => p, StringComparer.OrdinalIgnoreCase))
            {
                if (!PreviewableExtensions.Contains(Path.GetExtension(path)))
                {
                    continue;
                }

                string name = Path.GetFileName(path);
                var info = new FileInfo(path);
                string sizeText = FormatFileSize(info.Length);
                string modified = info.LastWriteTime.ToString("yyyy-MM-dd HH:mm", CultureInfo.CurrentCulture);
                var item = new ListViewItem(new[] { name, sizeText, modified }) { Tag = path };
                item.ImageKey = GetFileIconKey(path);
                listViewFiles.Items.Add(item);
                _fileItemByPath[path] = item;
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "폴더를 읽을 수 없습니다", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        finally
        {
            listViewFiles.EndUpdate();
        }

        UpdateDirectoryStatus(folderPath);
        statusLabelFile.Text = "파일을 선택하면 정보가 표시됩니다.";
        ShowFolderThumbnails(folderPath);
    }

    private static string FormatFileSize(long bytes)
    {
        double value = bytes;
        string[] units = { "B", "KB", "MB", "GB", "TB" };
        int u = 0;
        while (value >= 1024d && u < units.Length - 1)
        {
            value /= 1024;
            u++;
        }

        return $"{value:0.##} {units[u]}";
    }

    private void UpdateDirectoryStatus(string folderPath)
    {
        try
        {
            int subDirCount = Directory.EnumerateDirectories(folderPath).Count();
            int previewableFileCount = Directory
                .EnumerateFiles(folderPath)
                .Count(path => PreviewableExtensions.Contains(Path.GetExtension(path)));

            statusLabelDirectory.Text =
                $"디렉토리: {folderPath} | 하위 폴더: {subDirCount}개 | 미리보기 파일: {previewableFileCount}개";
        }
        catch
        {
            statusLabelDirectory.Text = $"디렉토리: {folderPath}";
        }
    }

    private void UpdateFileStatus(string filePath)
    {
        try
        {
            FileInfo info = new(filePath);
            string ext = Path.GetExtension(filePath);
            if (string.IsNullOrWhiteSpace(ext))
            {
                ext = "(확장자 없음)";
            }

            statusLabelFile.Text =
                $"파일: {info.Name} | 크기: {FormatFileSize(info.Length)} | 수정: {info.LastWriteTime:yyyy-MM-dd HH:mm} | 형식: {ext}";
        }
        catch
        {
            statusLabelFile.Text = $"파일: {Path.GetFileName(filePath)}";
        }
    }

    private void ListViewFiles_SelectedIndexChanged(object? sender, EventArgs e)
    {
        if (listViewFiles.SelectedItems.Count == 0)
        {
            statusLabelFile.Text = "파일을 선택하면 정보가 표시됩니다.";
            if (!_suppressImageDisplay) ShowPlaceholder();
            return;
        }

        string? path = listViewFiles.SelectedItems[0].Tag as string;
        if (string.IsNullOrEmpty(path) || !File.Exists(path))
        {
            statusLabelFile.Text = "파일 경로를 확인할 수 없습니다.";
            ShowPlaceholder();
            return;
        }

        UpdateFileStatus(path);

        // 우클릭 선택 시: 상태바/선택 표시만 하고 미리보기는 억제
        if (_suppressImageDisplay) return;

        string ext = Path.GetExtension(path);
        if (ImageExtensions.Contains(ext))
        {
            ShowImage(path);
            return;
        }

        if (VideoExtensions.Contains(ext))
        {
            ShowVideo(path);
            return;
        }

        ShowPlaceholder();
    }

    private void ShowPlaceholder()
    {
        CancelThumbnailLoading();
        ResetVideoProgressUi();
        labelPreviewPlaceholder.Visible = true;
        labelPreviewPlaceholder.Text = "폴더와 파일을 선택하면 여기에 표시됩니다.";
        panelGalleryHost.Visible = false;
        panelImageHost.Visible = false;
        panelVideoHost.Visible = false;
        panelImageToolbar.Visible = false;
        ReleaseVideoMedia();
    }

    private void ShowUnsupported(string path)
    {
        CancelThumbnailLoading();
        ResetVideoProgressUi();
        labelPreviewPlaceholder.Visible = true;
        labelPreviewPlaceholder.Text = $"이 형식은 미리보기를 지원하지 않습니다.\n{Path.GetFileName(path)}";
        panelGalleryHost.Visible = false;
        panelImageHost.Visible = false;
        panelVideoHost.Visible = false;
        panelImageToolbar.Visible = false;
        ReleaseVideoMedia();
        ClearImagePreview();
    }

    private void ShowImage(string path)
    {
        CancelThumbnailLoading();
        ResetVideoProgressUi();
        ReleaseVideoMedia();
        labelPreviewPlaceholder.Visible = false;
        panelGalleryHost.Visible = false;
        panelVideoHost.Visible = false;
        panelImageHost.Visible = true;
        panelImageToolbar.Visible = true;

        try
        {
            ClearImagePreview();
            _ownedPreviewImage = LoadImageWithHeifSupport(path);
            _currentPreviewPath = path;
            _zoomFactor = CalculateFitZoomFactor(_ownedPreviewImage.Size);
            picturePreview.Image = _ownedPreviewImage;
            ApplyImageZoom();
        }
        catch
        {
            // 표시 실패 시 파일 아이콘을 이미지 대신 표시
            ClearImagePreview();
            _currentPreviewPath = path;
            ShowFileIconPreview(path);
        }
    }

    private void ApplyImageZoom()
    {
        if (_ownedPreviewImage is null)
        {
            labelImageZoomInfo.Text = "—";
            panelImageScrollHost.AutoScrollMinSize = Size.Empty;
            return;
        }

        int w = Math.Max(1, (int)Math.Round(_ownedPreviewImage.Width * _zoomFactor));
        int h = Math.Max(1, (int)Math.Round(_ownedPreviewImage.Height * _zoomFactor));
        picturePreview.Size = new Size(w, h);
        panelImageScrollHost.AutoScrollMinSize = picturePreview.Size;
        UpdateImageViewportLayout();

        int gcd = GreatestCommonDivisor(_ownedPreviewImage.Width, _ownedPreviewImage.Height);
        int arW = _ownedPreviewImage.Width / gcd;
        int arH = _ownedPreviewImage.Height / gcd;
        labelImageZoomInfo.Text = $"{_zoomFactor * 100:0.#}% · {arW}:{arH} · {_ownedPreviewImage.Width}×{_ownedPreviewImage.Height}";
        labelImageZoomInfo.BringToFront();
    }

    private double CalculateFitZoomFactor(Size imageSize)
    {
        int viewportWidth = Math.Max(1, panelImageScrollHost.ClientSize.Width);
        int viewportHeight = Math.Max(1, panelImageScrollHost.ClientSize.Height);

        double scaleX = (double)viewportWidth / Math.Max(1, imageSize.Width);
        double scaleY = (double)viewportHeight / Math.Max(1, imageSize.Height);
        double fit = Math.Min(scaleX, scaleY);

        return Math.Clamp(fit, 0.05, 16.0);
    }

    private void UpdateImageViewportLayout()
    {
        if (_ownedPreviewImage is null)
        {
            return;
        }

        int viewportWidth = panelImageScrollHost.ClientSize.Width;
        int viewportHeight = panelImageScrollHost.ClientSize.Height;
        bool needsHScroll = picturePreview.Width > viewportWidth;
        bool needsVScroll = picturePreview.Height > viewportHeight;

        int x = needsHScroll ? 0 : Math.Max(0, (viewportWidth - picturePreview.Width) / 2);
        int y = needsVScroll ? 0 : Math.Max(0, (viewportHeight - picturePreview.Height) / 2);
        picturePreview.Location = new Point(x, y);

        // Scroll axis keeps content larger than viewport; non-scroll axis can stay centered.
        int minW = needsHScroll ? picturePreview.Width + 2 : Math.Max(picturePreview.Width, viewportWidth - 1);
        int minH = needsVScroll ? picturePreview.Height + 2 : Math.Max(picturePreview.Height, viewportHeight - 1);
        panelImageScrollHost.AutoScrollMinSize = new Size(minW, minH);

        if (!needsHScroll && !needsVScroll)
        {
            panelImageScrollHost.AutoScrollPosition = Point.Empty;
        }

        panelImageScrollHost.PerformLayout();
    }

    private void ImagePan_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left || _ownedPreviewImage is null || !panelImageHost.Visible)
        {
            return;
        }

        if (panelImageScrollHost.HorizontalScroll.Visible || panelImageScrollHost.VerticalScroll.Visible)
        {
            _isImagePanning = true;
            _imagePanStartMouse = Cursor.Position;
            _imagePanStartScroll = new Point(-panelImageScrollHost.AutoScrollPosition.X, -panelImageScrollHost.AutoScrollPosition.Y);
            panelImageScrollHost.Cursor = Cursors.SizeAll;
            picturePreview.Cursor = Cursors.SizeAll;
        }
    }

    private void ImagePan_MouseMove(object? sender, MouseEventArgs e)
    {
        if (!_isImagePanning)
        {
            return;
        }

        Point now = Cursor.Position;
        int dx = now.X - _imagePanStartMouse.X;
        int dy = now.Y - _imagePanStartMouse.Y;
        int targetX = Math.Max(0, _imagePanStartScroll.X - dx);
        int targetY = Math.Max(0, _imagePanStartScroll.Y - dy);
        panelImageScrollHost.AutoScrollPosition = new Point(targetX, targetY);
    }

    private void ImagePan_MouseUp(object? sender, MouseEventArgs e)
    {
        if (!_isImagePanning)
        {
            return;
        }

        _isImagePanning = false;
        panelImageScrollHost.Cursor = Cursors.Default;
        picturePreview.Cursor = Cursors.Default;
    }

    private static int GreatestCommonDivisor(int a, int b)
    {
        a = Math.Abs(a);
        b = Math.Abs(b);
        while (b != 0)
        {
            int t = b;
            b = a % b;
            a = t;
        }

        return a == 0 ? 1 : a;
    }

    private void PanelImageScrollHost_MouseWheel(object? sender, MouseEventArgs e)
    {
        if (!panelImageHost.Visible || _ownedPreviewImage is null)
        {
            return;
        }

        double step = e.Delta > 0 ? 1.1 : 1.0 / 1.1;
        double next = _zoomFactor * step;
        next = Math.Clamp(next, 0.05, 16.0);
        if (Math.Abs(next - _zoomFactor) < 0.0001)
        {
            return;
        }

        _zoomFactor = next;
        ApplyImageZoom();
    }

    private void ShowVideo(string path)
    {
        CancelThumbnailLoading();
        ClearImagePreview();
        labelPreviewPlaceholder.Visible = false;
        panelGalleryHost.Visible = false;
        panelImageHost.Visible = false;
        panelVideoHost.Visible = true;
        panelImageToolbar.Visible = false;

        if (_mediaPlayer is null || _libVlc is null)
        {
            MessageBox.Show(this, "동영상 엔진을 초기화할 수 없습니다.", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            ShowPlaceholder();
            return;
        }

        try
        {
            ReleaseVideoMedia();
            ResetVideoProgressUi();
            _loadedVideoMedia = new Media(_libVlc, path, FromType.FromPath);
            _mediaPlayer.Media = _loadedVideoMedia;
            PlayVideo();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "동영상을 열 수 없습니다", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            ShowPlaceholder();
        }
    }

    private void ReleaseVideoMedia()
    {
        if (_mediaPlayer is not null)
        {
            _mediaPlayer.Stop();
            _mediaPlayer.Media = null;
        }

        _loadedVideoMedia?.Dispose();
        _loadedVideoMedia = null;
    }

    private void UpdateVideoProgressUi()
    {
        if (_mediaPlayer is null || !panelVideoHost.Visible)
        {
            return;
        }

        long lengthMs = _mediaPlayer.Length;
        long timeMs = _mediaPlayer.Time;

        if (lengthMs <= 0)
        {
            labelVideoTime.Text = $"{FormatMediaTime(timeMs)} / --:--";
            labelVideoPercent.Text = "0.0 %";
            if (!_isUserSeekingVideo)
            {
                videoSeekBar.Progress = 0d;
            }
            return;
        }

        double progress = Math.Clamp((double)timeMs / lengthMs, 0d, 1d);
        if (!_isUserSeekingVideo)
        {
            videoSeekBar.Progress = progress;
        }

        labelVideoTime.Text = $"{FormatMediaTime(timeMs)} / {FormatMediaTime(lengthMs)}";
        labelVideoPercent.Text = $"{progress * 100:0.0} %";
    }

    private void ResetVideoProgressUi()
    {
        _isUserSeekingVideo = false;
        videoSeekBar.Progress = 0d;
        labelVideoTime.Text = "00:00 / 00:00";
        labelVideoPercent.Text = "0.0 %";
        labelVideoOverlayIcon.Visible = false;
    }

    private void PlayVideo()
    {
        _mediaPlayer?.Play();
        ShowVideoOverlayIcon("\uE102");
    }

    private void PauseVideo()
    {
        _mediaPlayer?.Pause();
        ShowVideoOverlayIcon("\uE103");
    }

    private void StopVideo()
    {
        _mediaPlayer?.Stop();
        ResetVideoProgressUi();
        ShowVideoOverlayIcon("\uE15B");
    }

    private void ShowVideoOverlayIcon(string glyph)
    {
        if (!panelVideoHost.Visible)
        {
            return;
        }

        labelVideoOverlayIcon.Text = glyph;
        labelVideoOverlayIcon.Visible = true;
        labelVideoOverlayIcon.BringToFront();
        _videoOverlayTimer.Stop();
        _videoOverlayTimer.Start();
    }

    private void VideoSeekBar_SeekRequested(double progress)
    {
        if (_mediaPlayer is null || _mediaPlayer.Length <= 0)
        {
            return;
        }

        long target = (long)Math.Round(_mediaPlayer.Length * Math.Clamp(progress, 0d, 1d));
        _mediaPlayer.Time = target;
        labelVideoTime.Text = $"{FormatMediaTime(target)} / {FormatMediaTime(_mediaPlayer.Length)}";
        labelVideoPercent.Text = $"{progress * 100:0.0} %";
    }

    private static string FormatMediaTime(long milliseconds)
    {
        if (milliseconds < 0)
        {
            milliseconds = 0;
        }

        TimeSpan t = TimeSpan.FromMilliseconds(milliseconds);
        if (t.TotalHours >= 1)
        {
            return $"{(int)t.TotalHours:00}:{t.Minutes:00}:{t.Seconds:00}";
        }

        return $"{t.Minutes:00}:{t.Seconds:00}";
    }

    private void ClearImagePreview()
    {
        picturePreview.Image = null;
        panelImageScrollHost.AutoScrollMinSize = Size.Empty;
        _ownedPreviewImage?.Dispose();
        _ownedPreviewImage = null;
    }

    private static bool IsHeifFile(string filePath)
    {
        string ext = Path.GetExtension(filePath).ToLowerInvariant();
        return ext is ".heif" or ".heic" or ".hif";
    }

    // HIF/HEIF 파일을 JPG로 변환하여 저장하고 JPG 경로를 반환합니다.
    // 이미 변환된 파일이 있으면 재변환하지 않습니다.
    // Windows WIC(BitmapDecoder)를 사용하므로 HEIF Image Extensions 코덱이 필요합니다.
    private static string ConvertHeifToJpg(string filePath)
    {
        string jpgPath = Path.ChangeExtension(filePath, ".jpg");
        if (File.Exists(jpgPath))
            return jpgPath;

        var decoder = System.Windows.Media.Imaging.BitmapDecoder.Create(
            new Uri(filePath, UriKind.Absolute),
            System.Windows.Media.Imaging.BitmapCreateOptions.None,
            System.Windows.Media.Imaging.BitmapCacheOption.OnLoad);

        var frame = decoder.Frames[0];
        var encoder = new System.Windows.Media.Imaging.JpegBitmapEncoder { QualityLevel = 95 };
        encoder.Frames.Add(System.Windows.Media.Imaging.BitmapFrame.Create(frame));

        using var fs = new FileStream(jpgPath, FileMode.Create, FileAccess.Write);
        encoder.Save(fs);
        return jpgPath;
    }

    // HEIF/HIF를 디스크 저장 없이 메모리에서 디코딩 (WIC 사용)
    private static System.Drawing.Image? TryLoadHeifInMemory(string filePath)
    {
        var decoder = System.Windows.Media.Imaging.BitmapDecoder.Create(
            new Uri(filePath, UriKind.Absolute),
            System.Windows.Media.Imaging.BitmapCreateOptions.None,
            System.Windows.Media.Imaging.BitmapCacheOption.OnLoad);
        var frame = decoder.Frames[0];
        var pngEncoder = new System.Windows.Media.Imaging.PngBitmapEncoder();
        pngEncoder.Frames.Add(System.Windows.Media.Imaging.BitmapFrame.Create(frame));
        using var ms = new MemoryStream();
        pngEncoder.Save(ms);
        ms.Position = 0;
        using var tmp = new System.Drawing.Bitmap(ms);
        // MemoryStream이 닫혀도 살아있는 독립적인 복사본 반환
        var result = new System.Drawing.Bitmap(tmp.Width, tmp.Height, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using var g = System.Drawing.Graphics.FromImage(result);
        g.DrawImage(tmp, 0, 0);
        return result;
    }

    private static System.Drawing.Image LoadImageWithHeifSupport(string filePath)
    {
        if (!IsHeifFile(filePath))
            return System.Drawing.Image.FromFile(filePath);
        return TryLoadHeifInMemory(filePath) ?? throw new InvalidOperationException("HEIF 파일을 로드할 수 없습니다.");
    }

    private static System.Drawing.Image LoadImageWithHeifSupportForThumbnail(string filePath)
    {
        if (!IsHeifFile(filePath))
            return System.Drawing.Image.FromFile(filePath);
        return TryLoadHeifInMemory(filePath) ?? throw new InvalidOperationException("HEIF 파일을 로드할 수 없습니다.");
    }

    private static void MoveHeifToSubdirectory(string filePath)
    {
        string dir = Path.GetDirectoryName(filePath)!;
        string subDir = Path.Combine(dir, "hif");
        Directory.CreateDirectory(subDir);
        string dest = Path.Combine(subDir, Path.GetFileName(filePath));
        if (File.Exists(dest))
            File.Delete(dest);
        File.Move(filePath, dest);
    }

    // ── 파일 아이콘 플레이스홀더 ────────────────────────────────────────
    private void ShowFileIconPreview(string filePath)
    {
        try
        {
            using var shellIcon = Icon.ExtractAssociatedIcon(filePath);
            if (shellIcon is not null)
            {
                var bmp = new System.Drawing.Bitmap(256, 256);
                using var g = System.Drawing.Graphics.FromImage(bmp);
                g.Clear(Color.FromArgb(28, 28, 34));
                g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                g.DrawIcon(shellIcon, new Rectangle(80, 60, 96, 96));
                _ownedPreviewImage = bmp;
                picturePreview.Image = _ownedPreviewImage;
                _zoomFactor = CalculateFitZoomFactor(_ownedPreviewImage.Size);
                ApplyImageZoom();
                return;
            }
        }
        catch { }
        ShowPlaceholder();
    }

    // ── 컨텍스트 메뉴 이벤트 ──────────────────────────────────────────────
    private void ListViewFiles_MouseUp(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Right) return;
        var item = listViewFiles.GetItemAt(e.X, e.Y);
        string? path = item?.Tag as string;
        ShowFileContextMenu(path, listViewFiles, listViewFiles.PointToScreen(e.Location));
        _suppressImageDisplay = false;
    }

    private void TreeFolders_MouseUp(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Right) return;
        var node = treeFolders.GetNodeAt(e.X, e.Y);
        if (node is null || node.Tag is not string folderPath) return;
        treeFolders.SelectedNode = node;   // 우클릭한 노드 선택 표시
        ShowFolderContextMenu(folderPath, treeFolders, treeFolders.PointToScreen(e.Location));
    }

    private void ImageView_MouseUp(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Right || _isImagePanning) return;
        var ctrl = sender as Control ?? picturePreview;
        ShowFileContextMenu(_currentPreviewPath, ctrl, ctrl.PointToScreen(e.Location));
    }

    // ── 컨텍스트 메뉴 빌더 ───────────────────────────────────────────────
    private void ShowFileContextMenu(string? filePath, Control anchor, Point screenPt)
    {
        var menu = new ContextMenuStrip();
        bool hasFile = filePath is not null && File.Exists(filePath);
        bool isImage = hasFile && ImageExtensions.Contains(Path.GetExtension(filePath!));

        if (isImage)
        {
            var convertMenu = new ToolStripMenuItem("이미지 변환");
            string currentExt = Path.GetExtension(filePath!).ToLowerInvariant();
            foreach (var (label, ext) in new (string Label, string Ext)[]
            {
                ("JPEG (.jpg)", ".jpg"), ("PNG (.png)", ".png"),
                ("BMP (.bmp)", ".bmp"), ("TIFF (.tif)", ".tif"),
                ("WebP (.webp)", ".webp"), ("GIF (.gif)", ".gif")
            })
            {
                string capturedExt = ext;
                var sub = new ToolStripMenuItem(label) { Enabled = currentExt != ext };
                sub.Click += (_, _) => ConvertImageFile(filePath!, capturedExt);
                convertMenu.DropDownItems.Add(sub);
            }
            menu.Items.Add(convertMenu);
            menu.Items.Add(new ToolStripSeparator());
        }

        if (hasFile)
        {
            menu.Items.Add(new ToolStripMenuItem("복사", null, (_, _) => SetClipboard(filePath!, cut: false)));
            menu.Items.Add(new ToolStripMenuItem("잘라내기", null, (_, _) => SetClipboard(filePath!, cut: true)));
        }

        var pasteItem = new ToolStripMenuItem("붙여넣기", null, (_, _) =>
            PasteFile(hasFile ? Path.GetDirectoryName(filePath!)! : _currentFolder ?? string.Empty));
        pasteItem.Enabled = _clipboardPath is not null && File.Exists(_clipboardPath);
        menu.Items.Add(pasteItem);

        if (hasFile)
        {
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(new ToolStripMenuItem("삭제", null, (_, _) => DeleteFile(filePath!)));
        }

        if (menu.Items.Count > 0) menu.Show(screenPt);
    }

    private void ShowFolderContextMenu(string folderPath, Control anchor, Point screenPt)
    {
        var menu = new ContextMenuStrip();

        menu.Items.Add(new ToolStripMenuItem("복사", null, (_, _) => SetClipboard(folderPath, cut: false)));
        menu.Items.Add(new ToolStripMenuItem("잘라내기", null, (_, _) => SetClipboard(folderPath, cut: true)));

        bool hasClip = _clipboardPath is not null &&
                       (File.Exists(_clipboardPath) || Directory.Exists(_clipboardPath));
        var pasteItem = new ToolStripMenuItem("붙여넣기", null, (_, _) => PasteToFolder(folderPath));
        pasteItem.Enabled = hasClip;
        menu.Items.Add(pasteItem);

        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("삭제", null, (_, _) => DeleteFolder(folderPath)));

        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("탐색기에서 열기", null,
            (_, _) => System.Diagnostics.Process.Start("explorer.exe", folderPath)));

        menu.Show(screenPt);
    }

    // ── 파일 작업 ────────────────────────────────────────────────────────
    private void SetClipboard(string filePath, bool cut)
    {
        _clipboardPath = filePath;
        _clipboardIsCut = cut;
        // Windows 클립보드에도 등록 (탐색기와 공유)
        var files = new System.Collections.Specialized.StringCollection();
        files.Add(filePath);
        var data = new DataObject();
        data.SetFileDropList(files);
        if (cut)
        {
            using var dropEffect = new MemoryStream(new byte[] { 2, 0, 0, 0 });
            data.SetData("Preferred DropEffect", dropEffect);
        }
        Clipboard.SetDataObject(data, true);
    }

    private void PasteFile(string targetFolder)
    {
        if (string.IsNullOrEmpty(targetFolder) || !Directory.Exists(targetFolder)) return;
        string? src = _clipboardPath;
        bool cut = _clipboardIsCut;

        // Windows 클립보드 우선 사용
        if (src is null && Clipboard.ContainsFileDropList())
        {
            var list = Clipboard.GetFileDropList();
            if (list.Count > 0) src = list[0];
            var dropData = Clipboard.GetData("Preferred DropEffect") as MemoryStream;
            cut = dropData?.ToArray() is byte[] b && b.Length >= 1 && b[0] == 2;
        }

        if (src is null || !File.Exists(src)) return;

        try
        {
            string dest = Path.Combine(targetFolder, Path.GetFileName(src));
            if (File.Exists(dest))
            {
                string nameNoExt = Path.GetFileNameWithoutExtension(src);
                string ext = Path.GetExtension(src);
                int i = 1;
                do { dest = Path.Combine(targetFolder, $"{nameNoExt}_복사{i++}{ext}"); }
                while (File.Exists(dest));
            }
            if (cut) { File.Move(src, dest); _clipboardPath = null; }
            else File.Copy(src, dest);
            if (_currentFolder is not null) LoadFileList(_currentFolder);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "붙여넣기 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void PasteToFolder(string targetFolder)
    {
        if (string.IsNullOrEmpty(targetFolder) || !Directory.Exists(targetFolder)) return;
        string? src = _clipboardPath;
        bool cut = _clipboardIsCut;

        if (src is null && Clipboard.ContainsFileDropList())
        {
            var list = Clipboard.GetFileDropList();
            if (list.Count > 0) src = list[0];
            var dropData = Clipboard.GetData("Preferred DropEffect") as MemoryStream;
            cut = dropData?.ToArray() is byte[] b && b.Length >= 1 && b[0] == 2;
        }
        if (src is null) return;

        try
        {
            string name = Path.GetFileName(src.TrimEnd(Path.DirectorySeparatorChar));
            string dest = Path.Combine(targetFolder, name);

            if (File.Exists(src))
            {
                if (File.Exists(dest))
                {
                    int i = 1;
                    string nameNoExt = Path.GetFileNameWithoutExtension(src);
                    string ext = Path.GetExtension(src);
                    do { dest = Path.Combine(targetFolder, $"{nameNoExt}_복사{i++}{ext}"); }
                    while (File.Exists(dest));
                }
                if (cut) { File.Move(src, dest); _clipboardPath = null; }
                else File.Copy(src, dest);
            }
            else if (Directory.Exists(src))
            {
                if (cut) { Directory.Move(src, dest); _clipboardPath = null; }
                else CopyDirectoryRecursive(src, dest);
            }

            if (_currentFolder is not null) LoadFileList(_currentFolder);
            if (treeFolders.SelectedNode is TreeNode node) ForceRefreshChildFolders(node);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "붙여넣기 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static void CopyDirectoryRecursive(string src, string dest)
    {
        Directory.CreateDirectory(dest);
        foreach (string file in Directory.GetFiles(src))
            File.Copy(file, Path.Combine(dest, Path.GetFileName(file)), overwrite: true);
        foreach (string dir in Directory.GetDirectories(src))
            CopyDirectoryRecursive(dir, Path.Combine(dest, Path.GetFileName(dir)));
    }

    private void DeleteFolder(string folderPath)
    {
        string name = Path.GetFileName(folderPath.TrimEnd(Path.DirectorySeparatorChar));
        bool isEmpty = !Directory.EnumerateFileSystemEntries(folderPath).Any();
        string msg = isEmpty
            ? $"'{name}' 폴더를 삭제하시겠습니까?"
            : $"'{name}' 폴더와 내부의 모든 파일을 삭제하시겠습니까?";

        if (MessageBox.Show(this, msg, "폴더 삭제 확인",
            MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        try
        {
            Directory.Delete(folderPath, recursive: true);
            // 트리에서 부모 노드 새로고침
            if (treeFolders.SelectedNode?.Parent is TreeNode parent)
                ForceRefreshChildFolders(parent);
            else
                LoadFolderTree(_currentFolder ?? string.Empty);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "삭제 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void DeleteFile(string filePath)
    {
        string name = Path.GetFileName(filePath);
        if (MessageBox.Show(this, $"'{name}' 파일을 삭제하시겠습니까?", "삭제 확인",
            MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        try
        {
            if (_currentPreviewPath == filePath) { ClearImagePreview(); _currentPreviewPath = null; ShowPlaceholder(); }
            File.Delete(filePath);
            if (_currentFolder is not null) LoadFileList(_currentFolder);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "삭제 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void ConvertImageFile(string sourcePath, string targetExt)
    {
        try
        {
            string dir = Path.GetDirectoryName(sourcePath)!;
            string name = Path.GetFileNameWithoutExtension(sourcePath);
            string destPath = Path.Combine(dir, name + targetExt);
            if (File.Exists(destPath))
            {
                int i = 1;
                do { destPath = Path.Combine(dir, $"{name}_{i++}{targetExt}"); } while (File.Exists(destPath));
            }

            System.Drawing.Image src = IsHeifFile(sourcePath)
                ? (TryLoadHeifInMemory(sourcePath) ?? throw new InvalidOperationException("HEIF 로드 실패"))
                : System.Drawing.Image.FromFile(sourcePath);

            using (src)
            {
                if (targetExt == ".webp")
                {
                    using var ms = new MemoryStream();
                    src.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
                    ms.Position = 0;
                    using var isImg = SixLabors.ImageSharp.Image.Load(ms);
                    using var outFs = new FileStream(destPath, FileMode.Create);
                    isImg.Save(outFs, new SixLabors.ImageSharp.Formats.Webp.WebpEncoder());
                }
                else
                {
                    var fmt = targetExt switch
                    {
                        ".jpg" or ".jpeg" => System.Drawing.Imaging.ImageFormat.Jpeg,
                        ".png"  => System.Drawing.Imaging.ImageFormat.Png,
                        ".bmp"  => System.Drawing.Imaging.ImageFormat.Bmp,
                        ".tif" or ".tiff" => System.Drawing.Imaging.ImageFormat.Tiff,
                        ".gif"  => System.Drawing.Imaging.ImageFormat.Gif,
                        _ => throw new NotSupportedException(targetExt)
                    };
                    if (targetExt is ".jpg" or ".jpeg")
                    {
                        var codec = System.Drawing.Imaging.ImageCodecInfo.GetImageEncoders()
                            .First(c => c.FormatID == System.Drawing.Imaging.ImageFormat.Jpeg.Guid);
                        var ep = new System.Drawing.Imaging.EncoderParameters(1);
                        ep.Param[0] = new System.Drawing.Imaging.EncoderParameter(
                            System.Drawing.Imaging.Encoder.Quality, 95L);
                        src.Save(destPath, codec, ep);
                    }
                    else src.Save(destPath, fmt);
                }
            }

            if (_currentFolder is not null) LoadFileList(_currentFolder);
            statusLabelFile.Text = $"변환 완료: {Path.GetFileName(destPath)}";
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "변환 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void OpenImageEditor()
    {
        string? path = _currentPreviewPath;
        if (path is null || !File.Exists(path) || !ImageExtensions.Contains(Path.GetExtension(path)))
            return;

        string savedPath = path;
        try
        {
            ClearImagePreview();
            this.Hide();
            using var editor = new ImageEditorForm(path);
            editor.ShowDialog();
        }
        catch (Exception ex)
        {
            string details = ex.ToString();
            string logPath = Path.Combine(Path.GetTempPath(), "ImageViewerV30_error.txt");
            try { File.WriteAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}]\n{details}"); } catch { }
            try { Clipboard.SetText(details); } catch { }
            MessageBox.Show(this, $"{ex.Message}\n\n오류 세부 정보가 클립보드에 복사되었습니다.\n로그: {logPath}", "편집기 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            this.Show();
            if (File.Exists(savedPath))
                ShowImage(savedPath);
        }
    }

    private void RotateCurrentImage(RotateFlipType rotation)
    {
        if (_currentPreviewPath is null || !File.Exists(_currentPreviewPath))
            return;

        try
        {
            // Image.FromFile은 dispose 전까지 파일을 잠근다.
            // _ownedPreviewImage가 동일 파일을 잠그고 있으므로 먼저 해제
            string path = _currentPreviewPath;
            ClearImagePreview();

            var jpegEncoder = System.Drawing.Imaging.ImageCodecInfo.GetImageEncoders()
                .First(c => c.FormatID == System.Drawing.Imaging.ImageFormat.Jpeg.Guid);
            var encoderParams = new System.Drawing.Imaging.EncoderParameters(1);
            encoderParams.Param[0] = new System.Drawing.Imaging.EncoderParameter(
                System.Drawing.Imaging.Encoder.Quality, 95L);

            string tmp = path + ".tmp";

            using (var img = System.Drawing.Image.FromFile(path))
            {
                img.RotateFlip(rotation);
                img.Save(tmp, jpegEncoder, encoderParams);
            }

            File.Delete(path);
            File.Move(tmp, path);

            ShowImage(path);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "회전 실패", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private static string GetFileIconKey(string filePath)
    {
        string ext = Path.GetExtension(filePath).ToLowerInvariant();
        return ext switch
        {
            ".png" => FileIconPng,
            ".jpg" or ".jpeg" => FileIconJpg,
            ".gif" => FileIconGif,
            ".bmp" => FileIconBmp,
            ".tif" or ".tiff" => FileIconTiff,
            ".ico" => FileIconIco,
            ".webp" => FileIconWebp,
            ".heif" or ".heic" or ".hif" => FileIconJpg, // HEIF는 JPG로 변환되므로 JPG 아이콘 사용
            _ => VideoExtensions.Contains(ext) ? FileIconVideo : FileIconImage
        };
    }

    private void ShowFolderThumbnails(string folderPath)
    {
        ReleaseVideoMedia();
        ClearImagePreview();
        CancelThumbnailLoading();

        DisposeThumbnailControls();
        try
        {
            List<string> files = Directory
                .EnumerateFiles(folderPath)
                .Where(path => PreviewableExtensions.Contains(Path.GetExtension(path)))
                .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
                .ToList();

            labelPreviewPlaceholder.Visible = files.Count == 0;
            if (labelPreviewPlaceholder.Visible)
            {
                labelPreviewPlaceholder.Text = "이 폴더에 미리보기 가능한 파일이 없습니다.";
                panelGalleryHost.Visible = false;
                panelImageHost.Visible = false;
                panelVideoHost.Visible = false;
                panelImageToolbar.Visible = false;
                return;
            }

            panelGalleryHost.Visible = true;
            panelImageHost.Visible = false;
            panelVideoHost.Visible = false;
            panelImageToolbar.Visible = false;

            _thumbnailLoadCts = new CancellationTokenSource();
            _ = LoadThumbnailsAsync(files, _thumbnailLoadCts.Token);
        }
        catch (Exception ex)
        {
            labelPreviewPlaceholder.Visible = true;
            labelPreviewPlaceholder.Text = $"썸네일 목록을 읽을 수 없습니다.\n{ex.Message}";
            panelGalleryHost.Visible = false;
        }
    }

    private async Task LoadThumbnailsAsync(IReadOnlyList<string> files, CancellationToken token)
    {
        int loaded = 0;
        int total = files.Count;
        statusLabelFile.Text = $"썸네일 로딩 중... 0/{total}";

        foreach (string file in files)
        {
            if (token.IsCancellationRequested)
            {
                return;
            }

            var card = CreateThumbnailCardSkeleton(file, out PictureBox thumbnailBox);
            flowThumbnails.Controls.Add(card);

            Image thumbImage;
            try
            {
                thumbImage = await Task.Run(() => BuildThumbnail(file, 142, 126), token);
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch
            {
                thumbImage = BuildVideoPlaceholderThumb(142, 126);
            }

            if (token.IsCancellationRequested || thumbnailBox.IsDisposed)
            {
                thumbImage.Dispose();
                return;
            }

            thumbnailBox.Image = thumbImage;

            loaded++;
            if (loaded % 8 == 0 || loaded == total)
            {
                statusLabelFile.Text = $"썸네일 로딩 중... {loaded}/{total}";
                await Task.Yield();
            }
        }

        statusLabelFile.Text = $"썸네일 로딩 완료: {total}개";
    }

    private void CancelThumbnailLoading()
    {
        _thumbnailLoadCts?.Cancel();
        _thumbnailLoadCts?.Dispose();
        _thumbnailLoadCts = null;
    }

    private void DisposeThumbnailControls()
    {
        foreach (Control control in flowThumbnails.Controls)
        {
            if (control is Panel card)
            {
                foreach (Control inner in card.Controls)
                {
                    if (inner is PictureBox pb)
                    {
                        pb.Image?.Dispose();
                        pb.Image = null;
                    }
                }
            }
        }

        flowThumbnails.Controls.Clear();
    }

    private Control CreateThumbnailCardSkeleton(string filePath, out PictureBox thumb)
    {
        var card = new Panel
        {
            Width = 156,
            Height = 176,
            BackColor = Color.FromArgb(28, 28, 34),
            Margin = new Padding(8),
            Padding = new Padding(6),
            Cursor = Cursors.Hand,
            Tag = filePath
        };

        thumb = new PictureBox
        {
            Dock = DockStyle.Top,
            Height = 126,
            BackColor = Color.Black,
            SizeMode = PictureBoxSizeMode.Zoom,
            Tag = filePath
        };

        var name = new Label
        {
            Dock = DockStyle.Fill,
            ForeColor = Color.Gainsboro,
            TextAlign = ContentAlignment.TopLeft,
            Text = Path.GetFileName(filePath),
            AutoEllipsis = true,
            Padding = new Padding(1, 6, 1, 0),
            Tag = filePath
        };

        MouseEventHandler leftClickOnly = (s, e) => { if (e.Button == MouseButtons.Left) Thumbnail_Click(s, e); };
        card.MouseClick += leftClickOnly;
        thumb.MouseClick += leftClickOnly;
        name.MouseClick += leftClickOnly;
        MouseEventHandler thumbRightClick = (s, e) =>
        {
            if (e.Button != MouseButtons.Right) return;
            // 파일 목록에서 해당 항목 선택 표시 (이미지/갤러리 뷰 변경 억제)
            _suppressImageDisplay = true;
            if (_fileItemByPath.TryGetValue(filePath, out var lvItem))
            {
                // MultiSelect=false이므로 Selected=true만으로 이전 항목 자동 해제됨
                // Clear()를 쓰면 count=0 SelectedIndexChanged가 ShowPlaceholder를 호출하므로 사용 안 함
                lvItem.Selected = true;
                lvItem.Focused = true;
                lvItem.EnsureVisible();
            }
            _suppressImageDisplay = false;
            var ctrl = (Control)(s ?? card);
            ShowFileContextMenu(filePath, ctrl, ctrl.PointToScreen(e.Location));
        };
        card.MouseUp += thumbRightClick;
        thumb.MouseUp += thumbRightClick;
        name.MouseUp += thumbRightClick;
        card.Controls.Add(name);
        card.Controls.Add(thumb);
        return card;
    }

    private void Thumbnail_Click(object? sender, EventArgs e)
    {
        if (sender is not Control control || control.Tag is not string filePath)
        {
            return;
        }

        if (_fileItemByPath.TryGetValue(filePath, out ListViewItem? item))
        {
            listViewFiles.SelectedItems.Clear();
            item.Selected = true;
            item.Focused = true;
            item.EnsureVisible();
        }
    }

    private Image BuildThumbnail(string filePath, int targetWidth, int targetHeight)
    {
        string ext = Path.GetExtension(filePath);
        if (ImageExtensions.Contains(ext))
        {
            try
            {
                using Image src = LoadImageWithHeifSupportForThumbnail(filePath);
                return ResizeToFit(src, targetWidth, targetHeight);
            }
            catch
            {
            }
        }

        if (UseRealVideoFrameThumbnails &&
            VideoExtensions.Contains(ext) &&
            TryBuildVideoFirstFrameThumbnail(filePath, targetWidth, targetHeight, out Image? videoThumb))
        {
            return videoThumb!;
        }

        return BuildVideoPlaceholderThumb(targetWidth, targetHeight);
    }

    private bool TryBuildVideoFirstFrameThumbnail(string filePath, int targetWidth, int targetHeight, out Image? image)
    {
        image = null;
        if (_libVlc is null)
        {
            return false;
        }

        string tempFile = Path.Combine(Path.GetTempPath(), $"ImageViewerV10_{Guid.NewGuid():N}.png");

        try
        {
            using var media = new Media(_libVlc, filePath, FromType.FromPath);
            using var player = new MediaPlayer(_libVlc);

            bool playStarted = false;
            using var startedEvent = new ManualResetEventSlim(false);
            player.Playing += (_, _) =>
            {
                playStarted = true;
                startedEvent.Set();
            };

            if (!player.Play(media))
            {
                return false;
            }

            startedEvent.Wait(TimeSpan.FromMilliseconds(1200));
            if (!playStarted)
            {
                return false;
            }

            // Give decoder a short warm-up so the first visible frame is available.
            Thread.Sleep(180);

            for (int i = 0; i < 8; i++)
            {
                if (player.TakeSnapshot(0, tempFile, (uint)targetWidth, (uint)targetHeight) && File.Exists(tempFile))
                {
                    using Image src = Image.FromFile(tempFile);
                    image = ResizeToFit(src, targetWidth, targetHeight);
                    return true;
                }

                Thread.Sleep(90);
            }
        }
        catch
        {
            return false;
        }
        finally
        {
            try
            {
                if (File.Exists(tempFile))
                {
                    File.Delete(tempFile);
                }
            }
            catch
            {
            }
        }

        return false;
    }

    private static Image ResizeToFit(Image source, int width, int height)
    {
        var bmp = new Bitmap(Math.Max(1, width), Math.Max(1, height));
        using Graphics g = Graphics.FromImage(bmp);
        g.Clear(Color.FromArgb(15, 15, 18));
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.SmoothingMode = SmoothingMode.AntiAlias;

        float ratio = Math.Min((float)width / source.Width, (float)height / source.Height);
        int w = Math.Max(1, (int)(source.Width * ratio));
        int h = Math.Max(1, (int)(source.Height * ratio));
        int x = (width - w) / 2;
        int y = (height - h) / 2;
        g.DrawImage(source, x, y, w, h);
        return bmp;
    }

    private static Image BuildVideoPlaceholderThumb(int width, int height)
    {
        var bmp = new Bitmap(Math.Max(1, width), Math.Max(1, height));
        using Graphics g = Graphics.FromImage(bmp);
        g.Clear(Color.FromArgb(20, 22, 28));

        using var brush = new SolidBrush(Color.FromArgb(235, 235, 235));
        Point[] triangle =
        {
            new(width / 2 - 18, height / 2 - 24),
            new(width / 2 - 18, height / 2 + 24),
            new(width / 2 + 26, height / 2)
        };
        g.FillPolygon(brush, triangle);
        return bmp;
    }
}
