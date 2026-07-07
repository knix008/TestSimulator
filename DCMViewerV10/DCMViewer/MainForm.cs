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

    private const double ZoomWheelStepFactor = 1.2;
    private const int ZoomPreviewQualityDelayMs = 120;

    private readonly System.Windows.Forms.Timer _zoomPreviewQualityTimer;

    private readonly (ToolStripItem Item, ImageFormat Format, string Extension, string Filter)[] _exportTargets;
    private string? _startupFilePath;

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

        ConfigureExportToolbarIcons();
        ConfigureMenuIcons();
        SetExportButtonsEnabled(false);
    }

    private void ConfigureMenuIcons()
    {
        menuStripMain.ImageScalingSize = new Size(MenuIcons.Size, MenuIcons.Size);
        contextMenuImage.ImageScalingSize = new Size(MenuIcons.Size, MenuIcons.Size);

        MenuIcons.Apply(fileToolStripMenuItem, MenuIcons.File);
        MenuIcons.Apply(openToolStripMenuItem, MenuIcons.Open);
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
    }

    private void ConfigureExportToolbarIcons()
    {
        toolStripExport.ImageScalingSize = new Size(ExportFormatIcons.ToolbarIconSize, ExportFormatIcons.ToolbarIconSize);

        ConfigureExportButton(toolStripButtonSavePng, ExportFormatIcons.Png, "PNG 이미지로 저장");
        ConfigureExportButton(toolStripButtonSaveJpeg, ExportFormatIcons.Jpeg, "JPEG 이미지로 저장");
        ConfigureExportButton(toolStripButtonSaveBmp, ExportFormatIcons.Bmp, "BMP 이미지로 저장");
        ConfigureExportButton(toolStripButtonSaveTiff, ExportFormatIcons.Tiff, "TIFF 이미지로 저장");
        ConfigureExportButton(toolStripButtonSaveGif, ExportFormatIcons.Gif, "GIF 이미지로 저장");
    }

    private static void ConfigureExportButton(ToolStripButton button, Image icon, string toolTip)
    {
        button.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        button.Image = icon;
        button.ImageTransparentColor = Color.Magenta;
        button.ImageScaling = ToolStripItemImageScaling.SizeToFit;
        button.Font = new Font("Segoe UI", 10F, FontStyle.Regular);
        button.Padding = new Padding(6, 2, 6, 2);
        button.AutoSize = true;
        button.TextImageRelation = TextImageRelation.ImageBeforeText;
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

        if (_startupFilePath is null)
            return;

        var path = _startupFilePath;
        _startupFilePath = null;
        LoadAnyFile(path);
    }

    private void OpenToolStripMenuItem_Click(object? sender, EventArgs e)
    {
        if (openFileDialogDicom.ShowDialog(this) != DialogResult.OK)
            return;

        LoadAnyFile(openFileDialogDicom.FileName);
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
        ctxMenuExport.Enabled = hasImage;
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

    private void LoadAnyFile(string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        if (IsRasterExtension(ext))
            LoadRasterImage(path);
        else
            LoadDicomFile(path);
    }

    private static bool IsRasterExtension(string ext) =>
        ext is ".jpg" or ".jpeg" or ".png" or ".gif" or ".webp" or ".bmp" or ".tif" or ".tiff" or ".ico";

    private void LoadRasterImage(string path)
    {
        try
        {
            ClearDicomState();
            _currentFilePath = path;
            _currentDataset = null;

            using var loaded = Image.FromFile(path);
            ReplaceNativeBitmap(new Bitmap(loaded));

            trackBarFrames.Visible = false;
            toolStripStatusLabelFile.Text = path;
            toolStripStatusLabelPatient.Text = Path.GetFileName(path);
            toolStripStatusLabelDetails.Text =
                $"{_nativeBitmap!.Width}×{_nativeBitmap.Height}  {Path.GetExtension(path).TrimStart('.').ToUpperInvariant()}";
            toolStripStatusLabelFrame.Text = string.Empty;

            RefreshInfoPanel();
            SetExportButtonsEnabled(true);

            _fitZoomFactor = ComputeFitZoomFactor();
            _zoomFactor = _fitZoomFactor;
            ApplyZoomLayout(resetPan: true);
        }
        catch (Exception ex)
        {
            ShowLoadError(ex);
        }
    }

    private void LoadDicomFile(string path)
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
            SetExportButtonsEnabled(true);

            RenderCurrentFrame();
        }
        catch (Exception ex)
        {
            ShowLoadError(ex);
        }
    }

    private void ShowLoadError(Exception ex)
    {
        toolStripStatusLabelFile.Text = "열기 실패";
        toolStripStatusLabelPatient.Text = ex.Message;
        toolStripStatusLabelDetails.Text = string.Empty;
        toolStripStatusLabelFrame.Text = string.Empty;
        ClearImageState();
        MessageBox.Show(this, ex.Message, "파일 오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
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
        SetExportButtonsEnabled(false);
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
        if (!ExceedsViewport(new Size(dispW, dispH), new Size(viewportW, viewportH)))
            return CenterImageLocation(dispW, dispH, viewportW, viewportH);

        return new Point(
            Math.Clamp(location.X, viewportW - dispW, 0),
            Math.Clamp(location.Y, viewportH - dispH, 0));
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
            MessageBox.Show(
                this,
                $"이미지 저장에 실패했습니다.{Environment.NewLine}{Environment.NewLine}{ex.Message}",
                "이미지 저장",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
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

    private void SetExportButtonsEnabled(bool enabled)
    {
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
        base.OnFormClosed(e);
    }
}
