using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Text.Json;
using System.Drawing.Drawing2D;
using System.Threading;
using System.Threading.Tasks;
using LibVLCSharp.Shared;

namespace ImageViewerV10;

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
        ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".ico", ".webp"
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

    private string? _currentFolder;
    private readonly Dictionary<string, ListViewItem> _fileItemByPath = new(StringComparer.OrdinalIgnoreCase);
    private CancellationTokenSource? _thumbnailLoadCts;
    private LibVLC? _libVlc;
    private MediaPlayer? _mediaPlayer;
    private Media? _loadedVideoMedia;
    private Image? _ownedPreviewImage;
    private double _zoomFactor = 1.0;

    public MainForm()
    {
        InitializeComponent();
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
        InitializeIconLists();
        LoadInitialFolder();
    }

    private static bool IsDesignMode()
    {
        return LicenseManager.UsageMode == LicenseUsageMode.Designtime;
    }

    private void WireEvents()
    {
        buttonPickFolder.Click += ButtonPickFolder_Click;
        listViewFiles.SelectedIndexChanged += ListViewFiles_SelectedIndexChanged;
        treeFolders.BeforeExpand += TreeFolders_BeforeExpand;
        treeFolders.AfterSelect += TreeFolders_AfterSelect;
        panelImageScrollHost.MouseWheel += PanelImageScrollHost_MouseWheel;
        picturePreview.MouseWheel += PanelImageScrollHost_MouseWheel;
        panelImageScrollHost.Resize += (_, _) => UpdateImageViewportLayout();
        buttonVideoPlay.Click += (_, _) => _mediaPlayer?.Play();
        buttonVideoPause.Click += (_, _) => _mediaPlayer?.Pause();
        buttonVideoStop.Click += (_, _) => _mediaPlayer?.Stop();
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

        node.Nodes.Clear();
        string folderPath = node.Tag as string ?? string.Empty;
        if (string.IsNullOrWhiteSpace(folderPath))
        {
            return;
        }

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
            ShowPlaceholder();
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
        labelPreviewPlaceholder.Visible = true;
        labelPreviewPlaceholder.Text = "폴더와 파일을 선택하면 여기에 표시됩니다.";
        panelGalleryHost.Visible = false;
        panelImageHost.Visible = false;
        panelVideoHost.Visible = false;
        ReleaseVideoMedia();
    }

    private void ShowUnsupported(string path)
    {
        CancelThumbnailLoading();
        labelPreviewPlaceholder.Visible = true;
        labelPreviewPlaceholder.Text = $"이 형식은 미리보기를 지원하지 않습니다.\n{Path.GetFileName(path)}";
        panelGalleryHost.Visible = false;
        panelImageHost.Visible = false;
        panelVideoHost.Visible = false;
        ReleaseVideoMedia();
        ClearImagePreview();
    }

    private void ShowImage(string path)
    {
        CancelThumbnailLoading();
        ReleaseVideoMedia();
        labelPreviewPlaceholder.Visible = false;
        panelGalleryHost.Visible = false;
        panelVideoHost.Visible = false;
        panelImageHost.Visible = true;

        try
        {
            ClearImagePreview();
            _ownedPreviewImage = Image.FromFile(path);
            _zoomFactor = CalculateFitZoomFactor(_ownedPreviewImage.Size);
            picturePreview.Image = _ownedPreviewImage;
            ApplyImageZoom();
        }
        catch (Exception ex)
        {
            ClearImagePreview();
            MessageBox.Show(this, ex.Message, "이미지를 열 수 없습니다", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            ShowPlaceholder();
        }
    }

    private void ApplyImageZoom()
    {
        if (_ownedPreviewImage is null)
        {
            labelImageZoomInfo.Text = "—";
            return;
        }

        int w = Math.Max(1, (int)Math.Round(_ownedPreviewImage.Width * _zoomFactor));
        int h = Math.Max(1, (int)Math.Round(_ownedPreviewImage.Height * _zoomFactor));
        picturePreview.Size = new Size(w, h);
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
        int x = Math.Max(0, (viewportWidth - picturePreview.Width) / 2);
        int y = Math.Max(0, (viewportHeight - picturePreview.Height) / 2);
        picturePreview.Location = new Point(x, y);
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

        if (_mediaPlayer is null || _libVlc is null)
        {
            MessageBox.Show(this, "동영상 엔진을 초기화할 수 없습니다.", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            ShowPlaceholder();
            return;
        }

        try
        {
            ReleaseVideoMedia();
            _loadedVideoMedia = new Media(_libVlc, path, FromType.FromPath);
            _mediaPlayer.Media = _loadedVideoMedia;
            _mediaPlayer.Play();
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

    private void ClearImagePreview()
    {
        picturePreview.Image = null;
        _ownedPreviewImage?.Dispose();
        _ownedPreviewImage = null;
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
                return;
            }

            panelGalleryHost.Visible = true;
            panelImageHost.Visible = false;
            panelVideoHost.Visible = false;

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

        card.Click += Thumbnail_Click;
        thumb.Click += Thumbnail_Click;
        name.Click += Thumbnail_Click;
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
                using Image src = Image.FromFile(filePath);
                return ResizeToFit(src, targetWidth, targetHeight);
            }
            catch
            {
            }
        }

        if (VideoExtensions.Contains(ext) && TryBuildVideoFirstFrameThumbnail(filePath, targetWidth, targetHeight, out Image? videoThumb))
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
