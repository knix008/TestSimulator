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

    public MainForm()
    {
        InitializeComponent();
        toolStripButtonInfo.Image = SystemIcons.Information.ToBitmap();
        panelScroll.ZoomWheel = OnImageMouseWheelZoom;
        pictureBoxImage.ZoomWheel = OnImageMouseWheelZoom;
    }

    private void OnImageMouseWheelZoom(MouseEventArgs e)
    {
        if (_nativeBitmap is null)
            return;

        var step = e.Delta > 0 ? 1.1 : 1.0 / 1.1;
        ApplyZoomStep(step);
    }

    private void OpenToolStripMenuItem_Click(object? sender, EventArgs e)
    {
        if (openFileDialogDicom.ShowDialog(this) != DialogResult.OK)
            return;

        LoadAnyFile(openFileDialogDicom.FileName);
    }

    private void ExitToolStripMenuItem_Click(object? sender, EventArgs e) => Close();

    private void AboutToolStripMenuItem_Click(object? sender, EventArgs e) => ShowProgramInfoDialog();

    private void ToolStripButtonInfo_Click(object? sender, EventArgs e) => ShowProgramInfoDialog();

    private void ShowProgramInfoDialog()
    {
        using var dlg = new ProgramInfoForm();
        dlg.ShowDialog(this);
    }

    private void PanelScroll_Resize(object? sender, EventArgs e)
    {
        if (_nativeBitmap is null)
            return;

        _fitZoomFactor = ComputeFitZoomFactor();
        ApplyZoomLayout(resetScrollPosition: false);
    }

    private void ApplyZoomStep(double multiplier)
    {
        if (_nativeBitmap is null)
            return;

        var oldZoom = _zoomFactor;
        var oldDisplayWidth = Math.Max(1, (int)Math.Round(_nativeBitmap.Width * oldZoom));
        var oldDisplayHeight = Math.Max(1, (int)Math.Round(_nativeBitmap.Height * oldZoom));
        var viewportWidth = Math.Max(1, panelScroll.ClientSize.Width);
        var viewportHeight = Math.Max(1, panelScroll.ClientSize.Height);
        var oldScroll = panelScroll.AutoScrollPosition;
        var oldScrollX = Math.Max(0, -oldScroll.X);
        var oldScrollY = Math.Max(0, -oldScroll.Y);
        var oldImageLeft = Math.Max(0, (viewportWidth - oldDisplayWidth) / 2);
        var oldImageTop = Math.Max(0, (viewportHeight - oldDisplayHeight) / 2);

        var hasScroll = oldDisplayWidth > viewportWidth || oldDisplayHeight > viewportHeight;
        double anchorViewportX;
        double anchorViewportY;
        if (hasScroll)
        {
            // When scrollbars are active, zoom around the viewport center.
            anchorViewportX = viewportWidth / 2.0;
            anchorViewportY = viewportHeight / 2.0;
        }
        else
        {
            var mouseInPanel = panelScroll.PointToClient(Control.MousePosition);
            anchorViewportX = mouseInPanel.X >= 0 && mouseInPanel.X < viewportWidth
                ? mouseInPanel.X
                : viewportWidth / 2.0;
            anchorViewportY = mouseInPanel.Y >= 0 && mouseInPanel.Y < viewportHeight
                ? mouseInPanel.Y
                : viewportHeight / 2.0;
        }

        var anchorImageX = oldScrollX + anchorViewportX - oldImageLeft;
        var anchorImageY = oldScrollY + anchorViewportY - oldImageTop;
        anchorImageX = Math.Clamp(anchorImageX, 0.0, oldDisplayWidth);
        anchorImageY = Math.Clamp(anchorImageY, 0.0, oldDisplayHeight);

        var oldAnchorRatioX = oldDisplayWidth > 0 ? anchorImageX / oldDisplayWidth : 0.5;
        var oldAnchorRatioY = oldDisplayHeight > 0 ? anchorImageY / oldDisplayHeight : 0.5;

        // Zoom limits are relative to initial fit zoom, not absolute image scale.
        // This avoids small images snapping down when fit zoom is already > 1.0.
        var minZoom = _fitZoomFactor * 0.1;
        var maxZoom = _fitZoomFactor * 20.0;
        var newZoom = _zoomFactor * multiplier;
        newZoom = Math.Clamp(newZoom, minZoom, maxZoom);
        _zoomFactor = newZoom;
        ApplyZoomLayout(resetScrollPosition: false);

        var newDisplayWidth = Math.Max(1, (int)Math.Round(_nativeBitmap.Width * _zoomFactor));
        var newDisplayHeight = Math.Max(1, (int)Math.Round(_nativeBitmap.Height * _zoomFactor));
        var newImageLeft = Math.Max(0, (viewportWidth - newDisplayWidth) / 2);
        var newImageTop = Math.Max(0, (viewportHeight - newDisplayHeight) / 2);
        var targetAnchorImageX = oldAnchorRatioX * newDisplayWidth;
        var targetAnchorImageY = oldAnchorRatioY * newDisplayHeight;
        var targetScrollX = (int)Math.Round(newImageLeft + targetAnchorImageX - anchorViewportX);
        var targetScrollY = (int)Math.Round(newImageTop + targetAnchorImageY - anchorViewportY);
        var maxScrollX = Math.Max(0, newDisplayWidth - viewportWidth);
        var maxScrollY = Math.Max(0, newDisplayHeight - viewportHeight);
        targetScrollX = Math.Clamp(targetScrollX, 0, maxScrollX);
        targetScrollY = Math.Clamp(targetScrollY, 0, maxScrollY);
        panelScroll.AutoScrollPosition = new Point(targetScrollX, targetScrollY);
    }

    private void ZoomFit()
    {
        if (_nativeBitmap is null)
            return;

        _fitZoomFactor = ComputeFitZoomFactor();
        _zoomFactor = _fitZoomFactor;
        ApplyZoomLayout(resetScrollPosition: true);
    }

    private void ZoomActual()
    {
        if (_nativeBitmap is null)
            return;

        _fitZoomFactor = ComputeFitZoomFactor();
        _zoomFactor = 1.0;
        ApplyZoomLayout(resetScrollPosition: true);
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

            using var loaded = Image.FromFile(path);
            ReplaceNativeBitmap(new Bitmap(loaded));

            trackBarFrames.Visible = false;
            toolStripStatusLabelFile.Text = path;
            toolStripStatusLabelPatient.Text = Path.GetFileName(path);
            toolStripStatusLabelDetails.Text =
                $"{_nativeBitmap!.Width}×{_nativeBitmap.Height}  {Path.GetExtension(path).TrimStart('.').ToUpperInvariant()}";
            toolStripStatusLabelFrame.Text = string.Empty;

            _fitZoomFactor = ComputeFitZoomFactor();
            _zoomFactor = _fitZoomFactor;
            ApplyZoomLayout(resetScrollPosition: true);
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

            _dicomImage = new DicomImage(path, 0);
            _numberOfFrames = Math.Max(1, _dicomImage.NumberOfFrames);

            trackBarFrames.Maximum = Math.Max(0, _numberOfFrames - 1);
            trackBarFrames.Value = 0;
            trackBarFrames.Visible = _numberOfFrames > 1;

            toolStripStatusLabelFile.Text = path;
            toolStripStatusLabelPatient.Text = FormatPatientLine(ds);
            toolStripStatusLabelDetails.Text = FormatStudyLine(ds, _numberOfFrames);

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
        pictureBoxImage.Image?.Dispose();
        pictureBoxImage.Image = null;
        pictureBoxImage.Size = new Size(1, 1);
        _nativeBitmap?.Dispose();
        _nativeBitmap = null;
        panelScroll.AutoScrollMinSize = Size.Empty;
        panelScroll.AutoScrollPosition = new Point(0, 0);
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

        _fitZoomFactor = ComputeFitZoomFactor();
        _zoomFactor = _fitZoomFactor;
        ApplyZoomLayout(resetScrollPosition: true);
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

    private void ApplyZoomLayout(bool resetScrollPosition)
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

        panelScroll.SuspendLayout();
        try
        {
            if (resetScrollPosition)
                panelScroll.AutoScrollPosition = new Point(0, 0);

            var needsScroll = dispW > cw || dispH > ch;
            panelScroll.AutoScrollMinSize = needsScroll ? new Size(dispW, dispH) : new Size(cw, ch);
            pictureBoxImage.Size = new Size(dispW, dispH);
            pictureBoxImage.Location = new Point(
                Math.Max(0, (cw - dispW) / 2),
                Math.Max(0, (ch - dispH) / 2));

            var scaled = CreateScaledBitmap(_nativeBitmap, dispW, dispH);
            var old = pictureBoxImage.Image;
            pictureBoxImage.Image = scaled;
            old?.Dispose();
        }
        finally
        {
            panelScroll.ResumeLayout();
        }

        UpdateZoomLabel();
    }

    private static Bitmap CreateScaledBitmap(Bitmap source, int dstW, int dstH)
    {
        if (source.Width == dstW && source.Height == dstH)
            return (Bitmap)source.Clone();

        var bmp = new Bitmap(dstW, dstH, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp))
        {
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.SmoothingMode = SmoothingMode.HighQuality;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.CompositingQuality = CompositingQuality.HighQuality;
            g.DrawImage(source, new Rectangle(0, 0, dstW, dstH));
        }

        return bmp;
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

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        pictureBoxImage.Image?.Dispose();
        _nativeBitmap?.Dispose();
        base.OnFormClosed(e);
    }
}
