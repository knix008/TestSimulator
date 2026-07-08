using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using FellowOakDicom;
using FellowOakDicom.Imaging;

namespace DCMViewer;

public partial class MainForm : Form
{
    private DicomImage? _dicomImage;
    private int _numberOfFrames;
    private Bitmap? _nativeBitmap;
    private double _zoomFactor = 1.0;
    private double _fitZoomFactor = 1.0;
    private Point _imageLocation;
    private string? _currentFilePath;
    private DicomDataset? _currentDataset;

    private const double ZoomWheelStepFactor = 1.08;
    private const int ZoomPreviewQualityDelayMs = 120;

    private readonly System.Windows.Forms.Timer _zoomPreviewQualityTimer;

    private readonly (ToolStripItem Item, ImageFormat Format, string Extension, string Filter)[] _exportTargets;
    private readonly (ToolStripItem Item, ImageFormat Format, string Extension, string Label)[] _batchConvertTargets;
    private string? _startupFilePath;
    private string? _treeRootDirectory;
    private TreeNode? _folderContextNode;

    private const string TreePlaceholderTag = "__placeholder__";

    private readonly ShellFileIconProvider _shellFileIconProvider = new();

    public MainForm()
    {
        InitializeComponent();
        _zoomPreviewQualityTimer = new System.Windows.Forms.Timer { Interval = ZoomPreviewQualityDelayMs };
        _zoomPreviewQualityTimer.Tick += ZoomPreviewQualityTimer_Tick;
        if (FileAssociationHelper.LoadAppIcon() is { } appIcon)
            Icon = appIcon;
        using (var infoIcon = SystemIcons.Information.ToBitmap())
            toolStripButtonInfo.Image = ResizeBitmap(infoIcon, 20);
        panelScroll.ZoomWheel = OnImageMouseWheelZoom;
        panelScroll.CanPan = () => _nativeBitmap is not null && ExceedsViewport(GetDisplaySize(), panelScroll.ClientSize);
        panelScroll.GetImageLocation = () => _imageLocation;
        panelScroll.SetImageLocation = SetImageLocationClamped;
        panelScroll.AttachPanTarget(pictureBoxImage);
        pictureBoxImage.ZoomWheel = OnImageMouseWheelZoom;

        _exportTargets =
        [
            (toolStripButtonSavePng, ImageFormat.Png, "png", "PNG 이미지 (*.png)|*.png"),
            (toolStripButtonSaveJpeg, ImageFormat.Jpeg, "jpg", "JPEG 이미지 (*.jpg;*.jpeg)|*.jpg;*.jpeg"),
            (toolStripButtonSaveBmp, ImageFormat.Bmp, "bmp", "BMP 이미지 (*.bmp)|*.bmp"),
            (toolStripButtonSaveTiff, ImageFormat.Tiff, "tiff", "TIFF 이미지 (*.tif;*.tiff)|*.tif;*.tiff"),
            (toolStripButtonSaveGif, ImageFormat.Gif, "gif", "GIF 이미지 (*.gif)|*.gif"),
            (ctxMenuExportPng, ImageFormat.Png, "png", "PNG 이미지 (*.png)|*.png"),
            (ctxMenuExportJpeg, ImageFormat.Jpeg, "jpg", "JPEG 이미지 (*.jpg;*.jpeg)|*.jpg;*.jpeg"),
            (ctxMenuExportBmp, ImageFormat.Bmp, "bmp", "BMP 이미지 (*.bmp)|*.bmp"),
            (ctxMenuExportTiff, ImageFormat.Tiff, "tiff", "TIFF 이미지 (*.tif;*.tiff)|*.tif;*.tiff"),
            (ctxMenuExportGif, ImageFormat.Gif, "gif", "GIF 이미지 (*.gif)|*.gif"),
        ];

        _batchConvertTargets =
        [
            (batchConvertPngToolStripMenuItem, ImageFormat.Png, "png", "PNG"),
            (batchConvertJpegToolStripMenuItem, ImageFormat.Jpeg, "jpg", "JPEG"),
            (batchConvertBmpToolStripMenuItem, ImageFormat.Bmp, "bmp", "BMP"),
            (batchConvertTiffToolStripMenuItem, ImageFormat.Tiff, "tiff", "TIFF"),
            (batchConvertGifToolStripMenuItem, ImageFormat.Gif, "gif", "GIF"),
        ];

        ConfigureExportToolbarIcons();
        ConfigureBatchConvertToolbarIcons();
        ConfigureMenuIcons();
        UpdateExportButtonsState();

        openFileDialogDicom.InitialDirectory = UserSettingsHelper.GetWorkingDirectory();

        treeViewFolder.ImageList = _shellFileIconProvider.ImageList;

        splitContainerLeft.Panel1.ContextMenuStrip = contextMenuFolder;
        splitContainerLeft.Panel1.MouseDown += FolderPanel_MouseDown;
        labelFolderTitle.ContextMenuStrip = contextMenuFolder;
        labelFolderTitle.MouseDown += FolderPanel_MouseDown;
    }

    private void ConfigureMenuIcons()
    {
        menuStripMain.ImageScalingSize = new Size(MenuIcons.Size, MenuIcons.Size);
        contextMenuImage.ImageScalingSize = new Size(MenuIcons.Size, MenuIcons.Size);

        MenuIcons.Apply(fileToolStripMenuItem, MenuIcons.File);
        MenuIcons.Apply(openToolStripMenuItem, MenuIcons.Open);
        MenuIcons.Apply(selectFolderToolStripMenuItem, MenuIcons.BatchConvert);
        MenuIcons.Apply(batchConvertToolStripMenuItem, MenuIcons.BatchConvert);
        MenuIcons.Apply(batchConvertPngToolStripMenuItem, ExportFormatIcons.MenuPng);
        MenuIcons.Apply(batchConvertJpegToolStripMenuItem, ExportFormatIcons.MenuJpeg);
        MenuIcons.Apply(batchConvertBmpToolStripMenuItem, ExportFormatIcons.MenuBmp);
        MenuIcons.Apply(batchConvertTiffToolStripMenuItem, ExportFormatIcons.MenuTiff);
        MenuIcons.Apply(batchConvertGifToolStripMenuItem, ExportFormatIcons.MenuGif);
        MenuIcons.Apply(registerDcmDefaultToolStripMenuItem, MenuIcons.RegisterDefault);
        MenuIcons.Apply(unregisterDcmAssociationToolStripMenuItem, MenuIcons.Exit);
        MenuIcons.Apply(exitToolStripMenuItem, MenuIcons.Exit);
        MenuIcons.Apply(helpToolStripMenuItem, MenuIcons.Help);
        MenuIcons.Apply(aboutToolStripMenuItem, MenuIcons.Info);

        MenuIcons.Apply(ctxMenuOpen, MenuIcons.Open);
        MenuIcons.Apply(ctxMenuZoomFit, MenuIcons.ZoomFit);
        MenuIcons.Apply(ctxMenuZoomActual, MenuIcons.ZoomActual);
        MenuIcons.Apply(ctxMenuExport, MenuIcons.Export);
        MenuIcons.Apply(ctxMenuExportPng, ExportFormatIcons.MenuPng);
        MenuIcons.Apply(ctxMenuExportJpeg, ExportFormatIcons.MenuJpeg);
        MenuIcons.Apply(ctxMenuExportBmp, ExportFormatIcons.MenuBmp);
        MenuIcons.Apply(ctxMenuExportTiff, ExportFormatIcons.MenuTiff);
        MenuIcons.Apply(ctxMenuExportGif, ExportFormatIcons.MenuGif);

        contextMenuFolder.ImageScalingSize = new Size(MenuIcons.Size, MenuIcons.Size);
        MenuIcons.Apply(ctxFolderOpen, MenuIcons.Open);
        MenuIcons.Apply(ctxFolderSelectFolder, MenuIcons.BatchConvert);
        MenuIcons.Apply(ctxFolderRefresh, MenuIcons.Refresh);
    }

    private void ConfigureExportToolbarIcons()
    {
        toolStripExport.LayoutStyle = ToolStripLayoutStyle.HorizontalStackWithOverflow;
        toolStripExport.Padding = new Padding(6, 2, 6, 2);
        toolStripExport.ImageScalingSize = new Size(ExportFormatIcons.ToolbarIconSize, ExportFormatIcons.ToolbarIconSize);

        toolStripLabelExport.Font = new Font("Segoe UI", 10F, FontStyle.Regular);
        toolStripLabelExport.Padding = new Padding(0, 2, 4, 0);
        toolStripLabelExport.Margin = new Padding(0, 1, 0, 1);

        ConfigureExportButton(toolStripButtonSavePng, ExportFormatIcons.Png, "PNG 이미지로 저장");
        ConfigureExportButton(toolStripButtonSaveJpeg, ExportFormatIcons.Jpeg, "JPEG 이미지로 저장");
        ConfigureExportButton(toolStripButtonSaveBmp, ExportFormatIcons.Bmp, "BMP 이미지로 저장");
        ConfigureExportButton(toolStripButtonSaveTiff, ExportFormatIcons.Tiff, "TIFF 이미지로 저장");
        ConfigureExportButton(toolStripButtonSaveGif, ExportFormatIcons.Gif, "GIF 이미지로 저장");
    }

    private void ConfigureBatchConvertToolbarIcons()
    {
        ConfigureExportButton(
            toolStripButtonBatchConvert,
            MenuIcons.BatchConvert,
            "폴더의 DCM 파일을 선택한 형식으로 일괄 변환");
    }

    private static void ConfigureExportButton(ToolStripButton button, Image icon, string toolTip)
    {
        button.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        button.Image = icon;
        button.ImageTransparentColor = Color.Magenta;
        button.ImageScaling = ToolStripItemImageScaling.SizeToFit;
        button.Font = new Font("Segoe UI", 10F, FontStyle.Regular);
        button.Padding = new Padding(4, 2, 4, 2);
        button.Margin = new Padding(0, 1, 0, 1);
        button.AutoSize = true;
        button.TextImageRelation = TextImageRelation.ImageBeforeText;
        button.ImageAlign = ContentAlignment.MiddleCenter;
        button.TextAlign = ContentAlignment.MiddleCenter;
        button.ToolTipText = toolTip;
    }

    private void OnImageMouseWheelZoom(MouseEventArgs e)
    {
        if (_nativeBitmap is null)
            return;

        var steps = e.Delta / 120.0;
        if (Math.Abs(steps) < double.Epsilon)
            return;

        pictureBoxImage.InterpolationMode = InterpolationMode.Bilinear;
        var multiplier = Math.Pow(ZoomWheelStepFactor, steps);
        ApplyZoomStep(multiplier);

        _zoomPreviewQualityTimer.Stop();
        _zoomPreviewQualityTimer.Start();
    }

    private void ZoomPreviewQualityTimer_Tick(object? sender, EventArgs e)
    {
        _zoomPreviewQualityTimer.Stop();
        if (_nativeBitmap is null)
            return;

        pictureBoxImage.InterpolationMode = InterpolationMode.HighQualityBicubic;
        pictureBoxImage.Invalidate();
    }

    public void OpenFileOnStartup(string path) => _startupFilePath = path;

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);

        if (_startupFilePath is not null)
        {
            var path = _startupFilePath;
            _startupFilePath = null;
            LoadAnyFile(path);
            return;
        }

        LoadFolderTree(UserSettingsHelper.GetWorkingDirectory());
    }

    private void OpenToolStripMenuItem_Click(object? sender, EventArgs e)
    {
        openFileDialogDicom.InitialDirectory = UserSettingsHelper.GetWorkingDirectory();
        if (openFileDialogDicom.ShowDialog(this) != DialogResult.OK)
            return;

        LoadAnyFile(openFileDialogDicom.FileName);
    }

    private void SelectFolderToolStripMenuItem_Click(object? sender, EventArgs e)
    {
        folderBrowserSelectFolder.SelectedPath = UserSettingsHelper.GetWorkingDirectory();
        if (folderBrowserSelectFolder.ShowDialog(this) != DialogResult.OK)
            return;

        SetWorkingFolder(folderBrowserSelectFolder.SelectedPath);
    }

    private void SetWorkingFolder(string directoryPath)
    {
        UserSettingsHelper.SaveLastDirectory(directoryPath);
        openFileDialogDicom.InitialDirectory = directoryPath;
        _treeRootDirectory = null;
        LoadFolderTree(directoryPath);
    }

    private void ExitToolStripMenuItem_Click(object? sender, EventArgs e) => Close();

    private void RegisterDcmDefaultToolStripMenuItem_Click(object? sender, EventArgs e)
    {
        if (FileAssociationHelper.TrySetAsDefault(out var error))
        {
            MessageBox.Show(
                this,
                ".dcm 파일을 DCMViewer로 열도록 기본 프로그램으로 등록했습니다.",
                "파일 연결",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        if (error is not null && error.Contains("취소", StringComparison.Ordinal))
            return;

        FileAssociationHelper.Register();
        MessageBox.Show(
            this,
            "파일 연결 정보는 등록되었지만 기본 프로그램 설정에 실패했습니다.\n\n"
            + (error ?? "알 수 없는 오류")
            + "\n\nWindows 설정 > 앱 > 기본 앱에서 '.dcm' 항목을 확인해 주세요.",
            "파일 연결",
            MessageBoxButtons.OK,
            MessageBoxIcon.Warning);
    }

    private void UnregisterDcmAssociationToolStripMenuItem_Click(object? sender, EventArgs e)
    {
        if (!FileAssociationHelper.IsRegistered())
        {
            MessageBox.Show(
                this,
                "등록된 .dcm 파일 연결이 없습니다.",
                "파일 연결",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        var result = MessageBox.Show(
            this,
            ".dcm 파일 연결 등록을 해제하시겠습니까?",
            "파일 연결",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question);
        if (result != DialogResult.Yes)
            return;

        FileAssociationHelper.Unregister();
        MessageBox.Show(
            this,
            ".dcm 파일 연결 등록을 해제했습니다.",
            "파일 연결",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
    }

    private void AboutToolStripMenuItem_Click(object? sender, EventArgs e) => ShowProgramInfoDialog();

    private void ToolStripButtonInfo_Click(object? sender, EventArgs e) => ShowProgramInfoDialog();

    private void ShowProgramInfoDialog()
    {
        using var dlg = new ProgramInfoForm();
        dlg.ShowDialog(this);
    }

    private void ContextMenuImage_Opening(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        var hasImage = _nativeBitmap is not null;
        ctxMenuZoomFit.Enabled = hasImage;
        ctxMenuZoomActual.Enabled = hasImage;
        ctxMenuExport.Enabled = CanExportCurrentImage();
    }

    private void CtxMenuZoomFit_Click(object? sender, EventArgs e) => ZoomFit();

    private void CtxMenuZoomActual_Click(object? sender, EventArgs e) => ZoomActual();

    private void PanelScroll_Resize(object? sender, EventArgs e)
    {
        if (_nativeBitmap is null)
            return;

        var viewport = panelScroll.ClientSize;
        var savedLocation = _imageLocation;

        _fitZoomFactor = ComputeFitZoomFactor();
        var display = GetDisplaySize();

        if (!ExceedsViewport(display, viewport))
            ApplyZoomLayout(resetPan: true);
        else
        {
            _imageLocation = ClampImageLocation(
                savedLocation,
                display.Width,
                display.Height,
                Math.Max(1, viewport.Width),
                Math.Max(1, viewport.Height));
            ApplyZoomLayout(resetPan: false);
        }
    }

    private void ApplyZoomStep(double multiplier)
    {
        if (_nativeBitmap is null)
            return;

        var viewport = panelScroll.ClientSize;
        var cw = Math.Max(1, viewport.Width);
        var ch = Math.Max(1, viewport.Height);
        var oldDisplay = GetDisplaySize();
        var oldLoc = _imageLocation;

        var minZoom = _fitZoomFactor * 0.1;
        var maxZoom = _fitZoomFactor * 20.0;
        var newZoom = Math.Clamp(_zoomFactor * multiplier, minZoom, maxZoom);

        var anchorX = cw / 2.0 - oldLoc.X;
        var anchorY = ch / 2.0 - oldLoc.Y;
        anchorX = Math.Clamp(anchorX, 0.0, oldDisplay.Width);
        anchorY = Math.Clamp(anchorY, 0.0, oldDisplay.Height);

        var anchorRatioX = anchorX / oldDisplay.Width;
        var anchorRatioY = anchorY / oldDisplay.Height;

        _zoomFactor = newZoom;
        var newDisplay = GetDisplaySize();

        if (!ExceedsViewport(newDisplay, viewport))
        {
            ApplyZoomLayout(resetPan: true);
            return;
        }

        var newAnchorX = anchorRatioX * newDisplay.Width;
        var newAnchorY = anchorRatioY * newDisplay.Height;
        _imageLocation = ClampImageLocation(
            new Point(
                (int)Math.Round(cw / 2.0 - newAnchorX),
                (int)Math.Round(ch / 2.0 - newAnchorY)),
            newDisplay.Width,
            newDisplay.Height,
            cw,
            ch);

        ApplyZoomLayout(resetPan: false);
    }

    private void ZoomFit()
    {
        if (_nativeBitmap is null)
            return;

        _fitZoomFactor = ComputeFitZoomFactor();
        _zoomFactor = _fitZoomFactor;
        ApplyZoomLayout(resetPan: true);
    }

    private void ZoomActual()
    {
        if (_nativeBitmap is null)
            return;

        _fitZoomFactor = ComputeFitZoomFactor();
        _zoomFactor = 1.0;
        ApplyZoomLayout(resetPan: true);
    }

    private void LoadAnyFile(string path, bool updateFolderTree = true)
    {
        if (string.Equals(path, TreePlaceholderTag, StringComparison.Ordinal))
            return;

        var ext = Path.GetExtension(path).ToLowerInvariant();
        if (IsRasterExtension(ext))
            LoadRasterImage(path, updateFolderTree);
        else
            LoadDicomFile(path, updateFolderTree);
    }

    private static bool IsRasterExtension(string ext) =>
        ext is ".jpg" or ".jpeg" or ".png" or ".gif" or ".webp" or ".bmp" or ".tif" or ".tiff" or ".ico";

    private static Bitmap LoadRasterBitmap(string path)
    {
        if (Path.GetExtension(path).Equals(".ico", StringComparison.OrdinalIgnoreCase))
        {
            using var icon = new Icon(path);
            return new Bitmap(icon.ToBitmap());
        }

        using var loaded = Image.FromFile(path);
        return new Bitmap(loaded);
    }

    private static bool IsSupportedViewerFile(string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        return IsDicomExtension(ext) || IsRasterExtension(ext);
    }

    private static bool TryGetOpenableFilePath(TreeNode? node, out string filePath)
    {
        filePath = string.Empty;
        if (node?.Tag is not string path)
            return false;
        if (string.Equals(path, TreePlaceholderTag, StringComparison.Ordinal))
            return false;
        if (!File.Exists(path) || Directory.Exists(path))
            return false;

        if (!IsSupportedViewerFile(path))
            return false;

        filePath = path;
        return true;
    }

    private void RefreshFolderTree(string filePath)
    {
        var directoryPath = Path.GetDirectoryName(filePath);
        if (string.IsNullOrEmpty(directoryPath))
            return;

        UserSettingsHelper.SaveLastDirectory(directoryPath);
        openFileDialogDicom.InitialDirectory = directoryPath;
        LoadFolderTree(directoryPath, filePath);
    }

    private void LoadFolderTree(string directoryPath, string? selectFilePath = null)
    {
        if (string.IsNullOrEmpty(directoryPath) || !Directory.Exists(directoryPath))
            return;

        if (string.Equals(_treeRootDirectory, directoryPath, StringComparison.OrdinalIgnoreCase))
        {
            if (!string.IsNullOrEmpty(selectFilePath))
                SelectTreeFileNode(selectFilePath);
            return;
        }

        _treeRootDirectory = directoryPath;
        treeViewFolder.BeginUpdate();
        try
        {
            treeViewFolder.Nodes.Clear();
            var rootNode = CreateDirectoryTreeNode(directoryPath);

            if (rootNode.Nodes.Count == 1 && rootNode.Nodes[0].Tag as string == TreePlaceholderTag)
                rootNode.Nodes.Clear();

            treeViewFolder.Nodes.Add(rootNode);

            if (TryGetParentDirectoryPath(directoryPath) is { } parentPath)
                rootNode.Nodes.Add(CreateParentDirectoryTreeNode(parentPath));

            PopulateDirectoryTreeNode(rootNode, directoryPath);
            rootNode.Expand();

            if (!string.IsNullOrEmpty(selectFilePath))
                SelectTreeFileNode(selectFilePath);
        }
        finally
        {
            treeViewFolder.EndUpdate();
        }
    }

    private TreeNode CreateDirectoryTreeNode(string directoryPath)
    {
        var iconIndex = _shellFileIconProvider.GetFolderIconIndex(directoryPath);
        var node = new TreeNode(Path.GetFileName(directoryPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)))
        {
            Tag = directoryPath,
            ToolTipText = directoryPath,
            ImageIndex = iconIndex,
            SelectedImageIndex = iconIndex,
        };

        if (HasSubdirectories(directoryPath))
            node.Nodes.Add(CreatePlaceholderNode());

        return node;
    }

    private TreeNode CreateParentDirectoryTreeNode(string parentDirectoryPath)
    {
        var iconIndex = _shellFileIconProvider.GetFolderIconIndex(parentDirectoryPath);
        return new TreeNode("..")
        {
            Tag = parentDirectoryPath,
            ToolTipText = parentDirectoryPath,
            ImageIndex = iconIndex,
            SelectedImageIndex = iconIndex,
        };
    }

    private static string? TryGetParentDirectoryPath(string directoryPath)
    {
        try
        {
            var trimmed = directoryPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            return Directory.GetParent(trimmed)?.FullName;
        }
        catch
        {
            return null;
        }
    }

    private static TreeNode CreatePlaceholderNode() =>
        new("…") { Tag = TreePlaceholderTag };

    private static bool HasSubdirectories(string directoryPath)
    {
        try
        {
            return Directory.EnumerateDirectories(directoryPath).Any();
        }
        catch
        {
            return false;
        }
    }

    private void PopulateDirectoryTreeNode(TreeNode parentNode, string directoryPath)
    {
        IEnumerable<string> directories;
        IEnumerable<string> files;

        try
        {
            directories = Directory.EnumerateDirectories(directoryPath)
                .OrderBy(path => path, StringComparer.OrdinalIgnoreCase);
            files = Directory.EnumerateFiles(directoryPath)
                .Where(IsSupportedViewerFile)
                .OrderBy(path => path, StringComparer.OrdinalIgnoreCase);
        }
        catch
        {
            return;
        }

        foreach (var directory in directories)
        {
            try
            {
                parentNode.Nodes.Add(CreateDirectoryTreeNode(directory));
            }
            catch
            {
                // Skip inaccessible directories.
            }
        }

        foreach (var file in files)
            parentNode.Nodes.Add(CreateFileTreeNode(file));
    }

    private TreeNode CreateFileTreeNode(string filePath)
    {
        var iconIndex = _shellFileIconProvider.GetFileIconIndex(filePath);
        return new TreeNode(Path.GetFileName(filePath))
        {
            Tag = filePath,
            ToolTipText = filePath,
            ImageIndex = iconIndex,
            SelectedImageIndex = iconIndex,
        };
    }

    private void SelectTreeFileNode(string filePath)
    {
        if (treeViewFolder.Nodes.Count == 0)
            return;

        if (TrySelectTreeFileNode(treeViewFolder.Nodes, filePath) is { } node)
        {
            treeViewFolder.SelectedNode = node;
            node.EnsureVisible();
        }
    }

    private static TreeNode? TrySelectTreeFileNode(TreeNodeCollection nodes, string filePath)
    {
        foreach (TreeNode node in nodes)
        {
            if (node.Tag is string path
                && !Directory.Exists(path)
                && string.Equals(path, filePath, StringComparison.OrdinalIgnoreCase))
                return node;

            if (TrySelectTreeFileNode(node.Nodes, filePath) is { } found)
                return found;
        }

        return null;
    }

    private void TreeViewFolder_BeforeExpand(object? sender, TreeViewCancelEventArgs e)
    {
        if (e.Node?.Tag is not string directoryPath || !Directory.Exists(directoryPath))
            return;

        if (e.Node.Nodes.Count != 1 || e.Node.Nodes[0].Tag as string != TreePlaceholderTag)
            return;

        e.Node.Nodes.Clear();
        PopulateDirectoryTreeNode(e.Node, directoryPath);
    }

    private void FolderPanel_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Right)
            _folderContextNode = null;
    }

    private void TreeViewFolder_NodeMouseClick(object? sender, TreeNodeMouseClickEventArgs e)
    {
        if (e.Button != MouseButtons.Right)
            return;

        _folderContextNode = e.Node;
        if (e.Node is not null)
            treeViewFolder.SelectedNode = e.Node;
    }

    private void TreeViewFolder_AfterSelect(object? sender, TreeViewEventArgs e)
    {
        if (!TryGetOpenableFilePath(e.Node, out var path))
            return;

        if (string.Equals(path, _currentFilePath, StringComparison.OrdinalIgnoreCase))
            return;

        LoadAnyFile(path, updateFolderTree: false);
    }

    private void TreeViewFolder_NodeMouseDoubleClick(object? sender, TreeNodeMouseClickEventArgs e)
    {
        if (e.Node?.Tag is not string nodePath)
            return;

        if (Directory.Exists(nodePath))
        {
            if (string.Equals(nodePath, _treeRootDirectory, StringComparison.OrdinalIgnoreCase))
            {
                if (TryGetParentDirectoryPath(nodePath) is { } parentPath)
                    SetWorkingFolder(parentPath);
                return;
            }

            SetWorkingFolder(nodePath);
            return;
        }

        if (!TryGetOpenableFilePath(e.Node, out var filePath))
            return;

        if (string.Equals(filePath, _currentFilePath, StringComparison.OrdinalIgnoreCase))
            return;

        LoadAnyFile(filePath, updateFolderTree: false);
    }

    private void ContextMenuFolder_Opening(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        var path = GetFolderContextPath();
        ctxFolderOpen.Enabled = IsFileTreeNode(_folderContextNode ?? treeViewFolder.SelectedNode);
        ctxFolderCopy.Enabled = path is not null;
        ctxFolderDelete.Enabled = path is not null;
        ctxFolderPaste.Enabled = FileOperationHelper.CanPasteFromClipboard() && GetPasteTargetDirectory() is not null;
    }

    private string? GetFolderContextPath()
    {
        var node = _folderContextNode ?? treeViewFolder.SelectedNode;
        if (node?.Tag is not string path || path == TreePlaceholderTag)
            return null;

        return File.Exists(path) || Directory.Exists(path) ? path : null;
    }

    private string? GetPasteTargetDirectory()
    {
        if (_folderContextNode?.Tag is string path)
        {
            if (Directory.Exists(path))
                return path;

            if (File.Exists(path))
                return Path.GetDirectoryName(path);
        }

        if (!string.IsNullOrEmpty(_treeRootDirectory) && Directory.Exists(_treeRootDirectory))
            return _treeRootDirectory;

        var workingDirectory = UserSettingsHelper.GetWorkingDirectory();
        return Directory.Exists(workingDirectory) ? workingDirectory : null;
    }

    private void RefreshFolderTreeAfterChange(string directoryPath, string? selectFilePath = null)
    {
        _treeRootDirectory = null;
        LoadFolderTree(directoryPath, selectFilePath);
    }

    private void TreeViewFolder_KeyDown(object? sender, KeyEventArgs e)
    {
        if (e.Control && e.KeyCode == Keys.C)
        {
            CtxFolderCopy_Click(sender, e);
            e.Handled = true;
            return;
        }

        if (e.Control && e.KeyCode == Keys.V)
        {
            CtxFolderPaste_Click(sender, e);
            e.Handled = true;
            return;
        }

        if (e.KeyCode == Keys.Delete)
        {
            CtxFolderDelete_Click(sender, e);
            e.Handled = true;
        }
    }

    private void CtxFolderCopy_Click(object? sender, EventArgs e)
    {
        var path = GetFolderContextPath();
        if (path is null)
            return;

        try
        {
            FileOperationHelper.CopyPathsToClipboard([path]);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                this,
                $"클립보드 복사에 실패했습니다.{Environment.NewLine}{Environment.NewLine}{ex.Message}",
                "복사",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }

    private void CtxFolderPaste_Click(object? sender, EventArgs e)
    {
        var targetDirectory = GetPasteTargetDirectory();
        if (targetDirectory is null || !FileOperationHelper.CanPasteFromClipboard())
            return;

        var overwrite = false;
        if (HasPasteConflict(targetDirectory))
        {
            var result = MessageBox.Show(
                this,
                "붙여넣을 위치에 같은 이름의 파일 또는 폴더가 있습니다. 덮어쓰시겠습니까?",
                "붙여넣기",
                MessageBoxButtons.YesNoCancel,
                MessageBoxIcon.Question);
            if (result == DialogResult.Cancel)
                return;

            overwrite = result == DialogResult.Yes;
        }

        try
        {
            var pasted = FileOperationHelper.PasteFromClipboard(targetDirectory, overwrite);
            if (pasted.Count == 0)
            {
                MessageBox.Show(
                    this,
                    "붙여넣기에 실패했습니다.",
                    "붙여넣기",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            RefreshFolderTreeAfterChange(targetDirectory);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                this,
                $"붙여넣기에 실패했습니다.{Environment.NewLine}{Environment.NewLine}{ex.Message}",
                "붙여넣기",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private static bool HasPasteConflict(string targetDirectory)
    {
        if (!Clipboard.ContainsFileDropList())
            return false;

        var files = Clipboard.GetFileDropList();
        for (var i = 0; i < files.Count; i++)
        {
            var sourcePath = files[i];
            if (string.IsNullOrWhiteSpace(sourcePath))
                continue;

            var destinationName = Path.GetFileName(sourcePath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
            var destinationPath = Path.Combine(targetDirectory, destinationName);
            if (File.Exists(destinationPath) || Directory.Exists(destinationPath))
                return true;
        }

        return false;
    }

    private void CtxFolderDelete_Click(object? sender, EventArgs e)
    {
        var path = GetFolderContextPath();
        if (path is null)
            return;

        var isDirectory = Directory.Exists(path);
        var itemName = Path.GetFileName(path.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
        var itemKind = isDirectory ? "폴더" : "파일";
        var result = MessageBox.Show(
            this,
            $"{itemKind} '{itemName}'을(를) 휴지통으로 이동하시겠습니까?",
            "삭제",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Warning);
        if (result != DialogResult.Yes)
            return;

        var parentDirectory = isDirectory
            ? Path.GetDirectoryName(path.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar))
            : Path.GetDirectoryName(path);

        try
        {
            if (!FileOperationHelper.SendToRecycleBin(this, path))
            {
                MessageBox.Show(
                    this,
                    "삭제에 실패했습니다.",
                    "삭제",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return;
            }

            if (!string.IsNullOrEmpty(_currentFilePath)
                && string.Equals(_currentFilePath, path, StringComparison.OrdinalIgnoreCase))
                ClearImageState();

            if (!string.IsNullOrEmpty(parentDirectory) && Directory.Exists(parentDirectory))
                RefreshFolderTreeAfterChange(parentDirectory);
            else
                CtxFolderRefresh_Click(sender, e);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                this,
                $"삭제에 실패했습니다.{Environment.NewLine}{Environment.NewLine}{ex.Message}",
                "삭제",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private static bool IsFileTreeNode(TreeNode? node) =>
        TryGetOpenableFilePath(node, out _);

    private void CtxFolderOpen_Click(object? sender, EventArgs e)
    {
        var node = _folderContextNode ?? treeViewFolder.SelectedNode;
        if (!TryGetOpenableFilePath(node, out var path))
            return;

        if (string.Equals(path, _currentFilePath, StringComparison.OrdinalIgnoreCase))
            return;

        LoadAnyFile(path);
    }

    private void CtxFolderRefresh_Click(object? sender, EventArgs e)
    {
        var directoryPath = UserSettingsHelper.GetWorkingDirectory();
        if (string.IsNullOrEmpty(directoryPath) || !Directory.Exists(directoryPath))
            return;

        var selectedFile = nodeSelectedFilePath();
        _treeRootDirectory = null;
        LoadFolderTree(directoryPath, selectedFile);
    }

    private string? nodeSelectedFilePath()
    {
        var node = treeViewFolder.SelectedNode ?? _folderContextNode;
        if (node?.Tag is string path && !Directory.Exists(path))
            return path;

        return _currentFilePath;
    }

    private void LoadRasterImage(string path, bool updateFolderTree = true)
    {
        try
        {
            ClearDicomState();
            _currentFilePath = path;
            _currentDataset = null;

            ReplaceNativeBitmap(LoadRasterBitmap(path));

            trackBarFrames.Visible = false;
            toolStripStatusLabelFile.Text = path;
            toolStripStatusLabelPatient.Text = Path.GetFileName(path);
            toolStripStatusLabelDetails.Text =
                $"{_nativeBitmap!.Width}×{_nativeBitmap.Height}  {Path.GetExtension(path).TrimStart('.').ToUpperInvariant()}";
            toolStripStatusLabelFrame.Text = string.Empty;

            RefreshInfoPanel();
            UpdateExportButtonsState();

            _fitZoomFactor = ComputeFitZoomFactor();
            _zoomFactor = _fitZoomFactor;
            ApplyZoomLayout(resetPan: true);

            if (updateFolderTree)
                RefreshFolderTree(path);
        }
        catch (Exception ex)
        {
            ShowLoadError(ex, path);
        }
    }

    private void LoadDicomFile(string path, bool updateFolderTree = true)
    {
        try
        {
            var file = DicomFile.Open(path);
            var ds = file.Dataset;
            _currentFilePath = path;
            _currentDataset = ds;

            _dicomImage = new DicomImage(path, 0);
            _numberOfFrames = Math.Max(1, _dicomImage.NumberOfFrames);

            trackBarFrames.Maximum = Math.Max(0, _numberOfFrames - 1);
            trackBarFrames.Value = 0;
            trackBarFrames.Visible = _numberOfFrames > 1;

            toolStripStatusLabelFile.Text = path;
            toolStripStatusLabelPatient.Text = FormatPatientLine(ds);
            toolStripStatusLabelDetails.Text = FormatStudyLine(ds, _numberOfFrames);

            RefreshInfoPanel();
            UpdateExportButtonsState();

            RenderCurrentFrame();

            if (updateFolderTree)
                RefreshFolderTree(path);
        }
        catch (Exception ex)
        {
            ShowLoadError(ex, path);
        }
    }

    private void ShowLoadError(Exception ex, string? filePath = null)
    {
        toolStripStatusLabelFile.Text = "열기 실패";
        toolStripStatusLabelPatient.Text = ex.Message;
        toolStripStatusLabelDetails.Text = string.Empty;
        toolStripStatusLabelFrame.Text = string.Empty;
        ClearImageState();

        var context = string.IsNullOrEmpty(filePath)
            ? null
            : $"파일: {filePath}";
        ErrorDetailForm.Show(this, "파일 오류", "파일을 열 수 없습니다.", ex, context);
    }

    private void ClearDicomState()
    {
        _dicomImage = null;
        _numberOfFrames = 0;
        trackBarFrames.Visible = false;
        trackBarFrames.Value = 0;
    }

    private void ClearImageState()
    {
        ClearDicomState();
        _currentFilePath = null;
        _currentDataset = null;
        _zoomPreviewQualityTimer.Stop();
        pictureBoxImage.Image = null;
        pictureBoxImage.Size = new Size(1, 1);
        _nativeBitmap?.Dispose();
        _nativeBitmap = null;
        _imageLocation = Point.Empty;
        pictureBoxImage.Location = Point.Empty;
        RefreshInfoPanel();
        UpdateExportButtonsState();
        UpdateZoomLabel();
    }

    private void ReplaceNativeBitmap(Bitmap bmp)
    {
        _nativeBitmap?.Dispose();
        _nativeBitmap = bmp;
    }

    private void RenderCurrentFrame()
    {
        if (_dicomImage is null)
            return;

        var frame = Math.Clamp(trackBarFrames.Value, 0, _numberOfFrames - 1);
        Bitmap native;
        using (var rendered = _dicomImage.RenderImage(frame))
            native = rendered.AsClonedBitmap();

        ReplaceNativeBitmap(native);

        toolStripStatusLabelFrame.Text =
            _numberOfFrames > 1 ? $"프레임 {frame + 1} / {_numberOfFrames}" : string.Empty;

        RefreshInfoPanel();

        _fitZoomFactor = ComputeFitZoomFactor();
        _zoomFactor = _fitZoomFactor;
        ApplyZoomLayout(resetPan: true);
    }

    private void TrackBarFrames_Scroll(object? sender, EventArgs e) => RenderCurrentFrame();

    private double ComputeFitZoomFactor()
    {
        if (_nativeBitmap is null)
            return 1.0;

        var cw = Math.Max(1, panelScroll.ClientSize.Width);
        var ch = Math.Max(1, panelScroll.ClientSize.Height);
        var w = _nativeBitmap.Width;
        var h = _nativeBitmap.Height;
        if (w < 1 || h < 1)
            return 1.0;

        return Math.Min(cw / (double)w, ch / (double)h);
    }

    private void ApplyZoomLayout(bool resetPan)
    {
        if (_nativeBitmap is null)
        {
            UpdateZoomLabel();
            return;
        }

        var natW = _nativeBitmap.Width;
        var natH = _nativeBitmap.Height;
        if (natW < 1 || natH < 1)
            return;

        var dispW = Math.Max(1, (int)Math.Round(natW * _zoomFactor));
        var dispH = Math.Max(1, (int)Math.Round(natH * _zoomFactor));

        var cw = Math.Max(1, panelScroll.ClientSize.Width);
        var ch = Math.Max(1, panelScroll.ClientSize.Height);

        if (resetPan || !ExceedsViewport(new Size(dispW, dispH), new Size(cw, ch)))
            _imageLocation = CenterImageLocation(dispW, dispH, cw, ch);
        else
            _imageLocation = ClampImageLocation(_imageLocation, dispW, dispH, cw, ch);

        panelScroll.SuspendLayout();
        try
        {
            pictureBoxImage.Size = new Size(dispW, dispH);
            pictureBoxImage.Location = _imageLocation;

            if (!ReferenceEquals(pictureBoxImage.Image, _nativeBitmap))
                pictureBoxImage.Image = _nativeBitmap;

            pictureBoxImage.Invalidate();
        }
        finally
        {
            panelScroll.ResumeLayout();
        }

        panelScroll.RefreshPanCursor();
        UpdateZoomLabel();
    }

    private Size GetDisplaySize()
    {
        if (_nativeBitmap is null)
            return Size.Empty;

        return new Size(
            Math.Max(1, (int)Math.Round(_nativeBitmap.Width * _zoomFactor)),
            Math.Max(1, (int)Math.Round(_nativeBitmap.Height * _zoomFactor)));
    }

    private void SetImageLocationClamped(Point location)
    {
        if (_nativeBitmap is null)
            return;

        var viewport = panelScroll.ClientSize;
        var cw = Math.Max(1, viewport.Width);
        var ch = Math.Max(1, viewport.Height);
        var display = GetDisplaySize();

        _imageLocation = ClampImageLocation(location, display.Width, display.Height, cw, ch);
        pictureBoxImage.Location = _imageLocation;
    }

    private static bool ExceedsViewport(Size display, Size viewport) =>
        display.Width > viewport.Width || display.Height > viewport.Height;

    private static Point CenterImageLocation(int dispW, int dispH, int viewportW, int viewportH) =>
        new((viewportW - dispW) / 2, (viewportH - dispH) / 2);

    private static Point ClampImageLocation(Point location, int dispW, int dispH, int viewportW, int viewportH)
    {
        var x = dispW <= viewportW
            ? (viewportW - dispW) / 2
            : Math.Clamp(location.X, viewportW - dispW, 0);

        var y = dispH <= viewportH
            ? (viewportH - dispH) / 2
            : Math.Clamp(location.Y, viewportH - dispH, 0);

        return new Point(x, y);
    }

    private void UpdateZoomLabel()
    {
        if (_nativeBitmap is null)
        {
            labelZoomPercent.Visible = false;
            labelZoomPercent.Text = string.Empty;
            return;
        }

        var zoomIsDifferentFromFit = Math.Abs(_zoomFactor - _fitZoomFactor) > 1e-9;
        if (!zoomIsDifferentFromFit)
        {
            labelZoomPercent.Visible = false;
            labelZoomPercent.Text = string.Empty;
            return;
        }

        var relativeToFit = (_zoomFactor / _fitZoomFactor) * 100.0;
        labelZoomPercent.Text = $"{relativeToFit:F0}%";
        labelZoomPercent.Visible = true;
        labelZoomPercent.BringToFront();
    }

    private static string FormatPatientLine(DicomDataset ds)
    {
        var name = ds.GetSingleValueOrDefault(DicomTag.PatientName, string.Empty);
        var id = ds.GetSingleValueOrDefault(DicomTag.PatientID, string.Empty);
        if (string.IsNullOrEmpty(name) && string.IsNullOrEmpty(id))
            return "(환자 정보 없음)";
        if (string.IsNullOrEmpty(id))
            return name;
        if (string.IsNullOrEmpty(name))
            return $"ID: {id}";
        return $"{name}  (ID: {id})";
    }

    private static string FormatStudyLine(DicomDataset ds, int frames)
    {
        var modality = ds.GetSingleValueOrDefault(DicomTag.Modality, "?");
        var desc = ds.GetSingleValueOrDefault(DicomTag.StudyDescription, string.Empty);
        var rows = ds.GetSingleValueOrDefault(DicomTag.Rows, (ushort)0);
        var cols = ds.GetSingleValueOrDefault(DicomTag.Columns, (ushort)0);
        var size = rows > 0 && cols > 0 ? $"{cols}×{rows}" : "?×?";
        var bits = ds.GetSingleValueOrDefault(DicomTag.BitsAllocated, (ushort)0);
        var bitsPart = bits > 0 ? $", {bits} bit" : string.Empty;
        var framePart = frames > 1 ? $", {frames} frames" : string.Empty;
        var descPart = string.IsNullOrWhiteSpace(desc) ? string.Empty : $" — {desc}";
        return $"{modality}  {size}{bitsPart}{framePart}{descPart}";
    }

    private void ExportButton_Click(object? sender, EventArgs e)
    {
        if (sender is not ToolStripItem item)
            return;

        foreach (var target in _exportTargets)
        {
            if (target.Item != item)
                continue;

            ExportCurrentImage(target.Format, target.Extension, target.Filter);
            return;
        }
    }

    private void BatchConvertToolbarButton_Click(object? sender, EventArgs e)
    {
        using var formatDialog = new BatchConvertFormatForm();
        if (formatDialog.ShowDialog(this) != DialogResult.OK)
            return;

        StartBatchConvert(
            formatDialog.SelectedFormat,
            formatDialog.SelectedExtension,
            formatDialog.SelectedLabel);
    }

    private void BatchConvertButton_Click(object? sender, EventArgs e)
    {
        if (sender is not ToolStripItem item)
            return;

        foreach (var target in _batchConvertTargets)
        {
            if (target.Item != item)
                continue;

            StartBatchConvert(target.Format, target.Extension, target.Label);
            return;
        }
    }

    private void StartBatchConvert(ImageFormat format, string extension, string formatLabel)
    {
        folderBrowserBatchSource.SelectedPath = GetInitialBatchFolderPath();
        if (folderBrowserBatchSource.ShowDialog(this) != DialogResult.OK)
            return;

        var sourceDir = folderBrowserBatchSource.SelectedPath;
        var outputDir = CreateBatchOutputDirectory(sourceDir, extension);
        RunBatchConvert(sourceDir, outputDir, format, extension, formatLabel);
    }

    private static string CreateBatchOutputDirectory(string sourceDir, string extension)
    {
        var baseName = $"converted_{extension}";
        var outputDir = Path.Combine(sourceDir, baseName);
        if (!Directory.Exists(outputDir))
            return outputDir;

        for (var index = 2; ; index++)
        {
            var candidate = Path.Combine(sourceDir, $"{baseName}_{index}");
            if (!Directory.Exists(candidate))
                return candidate;
        }
    }

    private string GetInitialBatchFolderPath()
    {
        if (!string.IsNullOrEmpty(_currentFilePath))
        {
            var dir = Path.GetDirectoryName(_currentFilePath);
            if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir))
                return dir;
        }

        return UserSettingsHelper.GetWorkingDirectory();
    }

    private void RunBatchConvert(
        string sourceDir,
        string outputDir,
        ImageFormat format,
        string extension,
        string formatLabel)
    {
        var dcmFiles = Directory.EnumerateFiles(sourceDir)
            .Where(f => IsDicomExtension(Path.GetExtension(f)))
            .OrderBy(f => f, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (dcmFiles.Count == 0)
        {
            MessageBox.Show(
                this,
                "선택한 폴더에서 DCM 파일을 찾지 못했습니다.",
                "일괄 변환",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        Directory.CreateDirectory(outputDir);

        var successCount = 0;
        var failCount = 0;
        var failures = new List<string>();
        var previousCursor = Cursor;

        Cursor = Cursors.WaitCursor;
        try
        {
            for (var i = 0; i < dcmFiles.Count; i++)
            {
                var file = dcmFiles[i];
                toolStripStatusLabelFile.Text =
                    $"일괄 변환 중 ({i + 1}/{dcmFiles.Count}): {Path.GetFileName(file)}";
                toolStripStatusLabelPatient.Text = formatLabel;
                toolStripStatusLabelDetails.Text = sourceDir;
                toolStripStatusLabelFrame.Text = string.Empty;
                statusStripMain.Refresh();

                try
                {
                    ConvertDicomFileToImages(file, outputDir, format, extension);
                    successCount++;
                }
                catch (Exception ex)
                {
                    failCount++;
                    failures.Add(ErrorDetailForm.FormatBatchFailure(file, ex));
                }
            }
        }
        finally
        {
            Cursor = previousCursor;
            toolStripStatusLabelFile.Text = outputDir;
            toolStripStatusLabelPatient.Text = $"일괄 변환 완료 — 성공 {successCount}, 실패 {failCount}";
            toolStripStatusLabelDetails.Text = formatLabel;
            toolStripStatusLabelFrame.Text = string.Empty;
        }

        ShowBatchConvertResult(successCount, failCount, outputDir, formatLabel, failures);
    }

    private static void ConvertDicomFileToImages(
        string dicomPath,
        string outputDir,
        ImageFormat format,
        string extension)
    {
        var dicomImage = new DicomImage(dicomPath, 0);
        var frames = Math.Max(1, dicomImage.NumberOfFrames);
        var baseName = Path.GetFileNameWithoutExtension(dicomPath);

        for (var frame = 0; frame < frames; frame++)
        {
            using var rendered = dicomImage.RenderImage(frame);
            using var bitmap = rendered.AsClonedBitmap();
            var fileName = frames > 1
                ? $"{baseName}_frame{frame + 1:D2}.{extension}"
                : $"{baseName}.{extension}";
            bitmap.Save(Path.Combine(outputDir, fileName), format);
        }
    }

    private static bool IsDicomExtension(string ext) =>
        ext.Equals(".dcm", StringComparison.OrdinalIgnoreCase)
        || ext.Equals(".dicm", StringComparison.OrdinalIgnoreCase);

    private void ShowBatchConvertResult(
        int successCount,
        int failCount,
        string outputDir,
        string formatLabel,
        IReadOnlyList<string> failures)
    {
        if (failCount == 0)
        {
            MessageBox.Show(
                this,
                $"변환 형식: {formatLabel}{Environment.NewLine}"
                + $"성공: {successCount}개{Environment.NewLine}{Environment.NewLine}"
                + $"저장 위치:{Environment.NewLine}{outputDir}",
                "일괄 변환",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        var summary =
            $"변환 중 오류가 발생했습니다.{Environment.NewLine}"
            + $"변환 형식: {formatLabel}{Environment.NewLine}"
            + $"성공: {successCount}개{Environment.NewLine}"
            + $"실패: {failCount}개{Environment.NewLine}"
            + $"저장 위치:{Environment.NewLine}{outputDir}";

        var details = string.Join($"{Environment.NewLine}{Environment.NewLine}", failures);
        ErrorDetailForm.Show(this, "일괄 변환", summary, details);
    }

    private void ExportCurrentImage(ImageFormat format, string extension, string filter)
    {
        if (_nativeBitmap is null)
        {
            MessageBox.Show(this, "저장할 이미지가 없습니다.", "이미지 저장", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        saveFileDialogImage.Filter = filter;
        saveFileDialogImage.DefaultExt = extension;
        saveFileDialogImage.FileName = BuildDefaultExportFileName(extension);

        if (saveFileDialogImage.ShowDialog(this) != DialogResult.OK)
            return;

        try
        {
            var savedPath = Path.GetFullPath(saveFileDialogImage.FileName);
            _nativeBitmap.Save(savedPath, format);

            toolStripStatusLabelFile.Text = savedPath;
            MessageBox.Show(
                this,
                $"이미지를 저장했습니다.{Environment.NewLine}{Environment.NewLine}{savedPath}",
                "이미지 저장",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            var context = $"저장 경로: {saveFileDialogImage.FileName}";
            ErrorDetailForm.Show(this, "이미지 저장", "이미지 저장에 실패했습니다.", ex, context);
        }
    }

    private string BuildDefaultExportFileName(string extension)
    {
        var baseName = string.IsNullOrEmpty(_currentFilePath)
            ? "image"
            : Path.GetFileNameWithoutExtension(_currentFilePath);

        if (_numberOfFrames > 1)
            baseName += $"_frame{trackBarFrames.Value + 1:D2}";

        return $"{baseName}.{extension}";
    }

    private static bool IsIcoFilePath(string? path) =>
        !string.IsNullOrEmpty(path)
        && Path.GetExtension(path).Equals(".ico", StringComparison.OrdinalIgnoreCase);

    private bool CanExportCurrentImage() =>
        _nativeBitmap is not null && !IsIcoFilePath(_currentFilePath);

    private void UpdateExportButtonsState()
    {
        var enabled = CanExportCurrentImage();
        toolStripButtonSavePng.Enabled = enabled;
        toolStripButtonSaveJpeg.Enabled = enabled;
        toolStripButtonSaveBmp.Enabled = enabled;
        toolStripButtonSaveTiff.Enabled = enabled;
        toolStripButtonSaveGif.Enabled = enabled;
    }

    private void RefreshInfoPanel()
    {
        if (_currentDataset is not null)
        {
            textBoxDicomInfo.Text = FormatDicomInfoText(_currentDataset, _numberOfFrames, trackBarFrames.Value);
            return;
        }

        if (_nativeBitmap is not null && !string.IsNullOrEmpty(_currentFilePath))
        {
            textBoxDicomInfo.Text = FormatRasterInfoText(_currentFilePath, _nativeBitmap);
            return;
        }

        textBoxDicomInfo.Text = "파일을 열면 DICOM 정보가 표시됩니다.";
    }

    private static string FormatDicomInfoText(DicomDataset ds, int frames, int currentFrame)
    {
        var lines = new List<string>
        {
            InfoLine("환자명", ds.GetSingleValueOrDefault(DicomTag.PatientName, string.Empty)),
            InfoLine("환자 ID", ds.GetSingleValueOrDefault(DicomTag.PatientID, string.Empty)),
            InfoLine("생년월일", ds.GetSingleValueOrDefault(DicomTag.PatientBirthDate, string.Empty)),
            InfoLine("성별", ds.GetSingleValueOrDefault(DicomTag.PatientSex, string.Empty)),
            InfoLine("Modality", ds.GetSingleValueOrDefault(DicomTag.Modality, string.Empty)),
            InfoLine("검사 설명", ds.GetSingleValueOrDefault(DicomTag.StudyDescription, string.Empty)),
            InfoLine("시리즈 설명", ds.GetSingleValueOrDefault(DicomTag.SeriesDescription, string.Empty)),
            InfoLine("Study Date", ds.GetSingleValueOrDefault(DicomTag.StudyDate, string.Empty)),
            InfoLine("Series Date", ds.GetSingleValueOrDefault(DicomTag.SeriesDate, string.Empty)),
            InfoLine("Institution", ds.GetSingleValueOrDefault(DicomTag.InstitutionName, string.Empty)),
            InfoLine("Manufacturer", ds.GetSingleValueOrDefault(DicomTag.Manufacturer, string.Empty)),
            InfoLine("크기", FormatImageSize(ds)),
            InfoLine("Bits Allocated", ds.GetSingleValueOrDefault(DicomTag.BitsAllocated, (ushort)0).ToString()),
            InfoLine("프레임", frames > 1 ? $"{currentFrame + 1} / {frames}" : "1"),
        };

        return string.Join(Environment.NewLine, lines.Where(line => !string.IsNullOrEmpty(line)));
    }

    private static string FormatRasterInfoText(string path, Bitmap bitmap)
    {
        var lines = new List<string>
        {
            InfoLine("파일", Path.GetFileName(path)),
            InfoLine("형식", Path.GetExtension(path).TrimStart('.').ToUpperInvariant()),
            InfoLine("크기", $"{bitmap.Width}×{bitmap.Height}"),
        };

        return string.Join(Environment.NewLine, lines);
    }

    private static string FormatImageSize(DicomDataset ds)
    {
        var rows = ds.GetSingleValueOrDefault(DicomTag.Rows, (ushort)0);
        var cols = ds.GetSingleValueOrDefault(DicomTag.Columns, (ushort)0);
        return rows > 0 && cols > 0 ? $"{cols}×{rows}" : string.Empty;
    }

    private static string InfoLine(string label, string value)
    {
        return string.IsNullOrWhiteSpace(value) ? string.Empty : $"{label}: {value.Trim()}";
    }

    private static Bitmap ResizeBitmap(Image source, int size)
    {
        var bmp = new Bitmap(size, size);
        using var g = Graphics.FromImage(bmp);
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.DrawImage(source, 0, 0, size, size);
        return bmp;
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        _zoomPreviewQualityTimer.Stop();
        _zoomPreviewQualityTimer.Dispose();
        pictureBoxImage.Image = null;
        _nativeBitmap?.Dispose();
        _shellFileIconProvider.Dispose();
        base.OnFormClosed(e);
    }
}
