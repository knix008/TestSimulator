using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Text.Json;
using System.Drawing.Drawing2D;
using System.Threading;
using LibVLCSharp.Shared;

namespace ImageViewerV10;

public partial class MainForm : Form
{
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

    private string? _currentFolder;
    private readonly Dictionary<string, ListViewItem> _fileItemByPath = new(StringComparer.OrdinalIgnoreCase);
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
        buttonVideoPlay.Click += (_, _) => _mediaPlayer?.Play();
        buttonVideoPause.Click += (_, _) => _mediaPlayer?.Pause();
        buttonVideoStop.Click += (_, _) => _mediaPlayer?.Stop();
        panelImageScrollHost.MouseEnter += (_, _) => panelImageScrollHost.Focus();
        FormClosing += MainForm_FormClosing;
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
            Tag = folderPath
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

        ShowFolderThumbnails(folderPath);
    }

    private static string FormatFileSize(long bytes)
    {
        if (bytes < 1024)
        {
            return $"{bytes} B";
        }

        double value = bytes;
        string[] units = { "KB", "MB", "GB", "TB" };
        int u = 0;
        while (value >= 1024 && u < units.Length - 1)
        {
            value /= 1024;
            u++;
        }

        return $"{value:0.##} {units[u]}";
    }

    private void ListViewFiles_SelectedIndexChanged(object? sender, EventArgs e)
    {
        if (listViewFiles.SelectedItems.Count == 0)
        {
            ShowPlaceholder();
            return;
        }

        string? path = listViewFiles.SelectedItems[0].Tag as string;
        if (string.IsNullOrEmpty(path) || !File.Exists(path))
        {
            ShowPlaceholder();
            return;
        }

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
        labelPreviewPlaceholder.Visible = true;
        labelPreviewPlaceholder.Text = "폴더와 파일을 선택하면 여기에 표시됩니다.";
        panelGalleryHost.Visible = false;
        panelImageHost.Visible = false;
        panelVideoHost.Visible = false;
        ReleaseVideoMedia();
    }

    private void ShowUnsupported(string path)
    {
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
        ReleaseVideoMedia();
        labelPreviewPlaceholder.Visible = false;
        panelGalleryHost.Visible = false;
        panelVideoHost.Visible = false;
        panelImageHost.Visible = true;

        try
        {
            ClearImagePreview();
            _ownedPreviewImage = Image.FromFile(path);
            _zoomFactor = 1.0;
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
        picturePreview.Location = new Point(0, 0);

        int gcd = GreatestCommonDivisor(_ownedPreviewImage.Width, _ownedPreviewImage.Height);
        int arW = _ownedPreviewImage.Width / gcd;
        int arH = _ownedPreviewImage.Height / gcd;
        labelImageZoomInfo.Text = $"{_zoomFactor * 100:0.#}% · {arW}:{arH} · {_ownedPreviewImage.Width}×{_ownedPreviewImage.Height}";
        labelImageZoomInfo.BringToFront();
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

    private void ShowFolderThumbnails(string folderPath)
    {
        ReleaseVideoMedia();
        ClearImagePreview();

        DisposeThumbnailControls();
        flowThumbnails.SuspendLayout();
        try
        {
            IEnumerable<string> files = Directory
                .EnumerateFiles(folderPath)
                .Where(path => PreviewableExtensions.Contains(Path.GetExtension(path)))
                .OrderBy(path => path, StringComparer.OrdinalIgnoreCase);

            foreach (string file in files)
            {
                flowThumbnails.Controls.Add(CreateThumbnailCard(file));
            }
        }
        catch (Exception ex)
        {
            labelPreviewPlaceholder.Visible = true;
            labelPreviewPlaceholder.Text = $"썸네일 목록을 읽을 수 없습니다.\n{ex.Message}";
        }

        flowThumbnails.ResumeLayout();

        labelPreviewPlaceholder.Visible = flowThumbnails.Controls.Count == 0;
        if (labelPreviewPlaceholder.Visible)
        {
            labelPreviewPlaceholder.Text = "이 폴더에 미리보기 가능한 파일이 없습니다.";
        }

        panelGalleryHost.Visible = !labelPreviewPlaceholder.Visible;
        panelImageHost.Visible = false;
        panelVideoHost.Visible = false;
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

    private Control CreateThumbnailCard(string filePath)
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

        var thumb = new PictureBox
        {
            Dock = DockStyle.Top,
            Height = 126,
            BackColor = Color.Black,
            SizeMode = PictureBoxSizeMode.Zoom,
            Tag = filePath
        };

        thumb.Image = BuildThumbnail(filePath, 142, 126);

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
