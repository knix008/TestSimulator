using System.Globalization;
using System.IO;
using System.Reflection;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Formats.Bmp;
using SixLabors.ImageSharp.Formats.Gif;
using ISRectangle = SixLabors.ImageSharp.Rectangle;

namespace ImageViewerV30;

public partial class ImageEditorForm : Form
{
    private Image<Rgba32>? _original;
    private Image<Rgba32>? _committed;
    private readonly Stack<Image<Rgba32>> _undoStack = new();
    private readonly Stack<Image<Rgba32>> _redoStack = new();

    private readonly System.Windows.Forms.Timer _previewTimer;
    private double _zoom = 1.0;
    private Bitmap? _ownedPreviewBitmap;
    private bool _eyedropperActive;
    private System.Drawing.Color _bgColor = System.Drawing.Color.White;
    private string _sourcePath = string.Empty;

    private bool _lockRatioChanging;
    private int _originalWidth, _originalHeight;
    private bool _hasUnsavedChanges;
    private RembgBackgroundRemover? _rembgRemover;

    /// <summary>이미지가 디스크에 저장되었을 때 발생합니다(경로).</summary>
    public event EventHandler<string>? FileSaved;

    public ImageEditorForm(string imagePath)
    {
        InitializeComponent();
        ApplyWindowIcon();
        _previewTimer = new System.Windows.Forms.Timer { Interval = 180 };
        _previewTimer.Tick += (_, _) => { _previewTimer.Stop(); ApplyAdjustmentPreview(); };

        WireEvents();
        // 마우스 휠로 확대/축소 지원
        picPreview.MouseWheel += PicPreview_MouseWheel;
        pnlScroll.MouseWheel += PicPreview_MouseWheel;
        pnlScroll.Resize += (_, _) => FitImageToViewportOnResize();
        // 미리보기 영역이 포커스 받을 수 있도록
        picPreview.Focus();
        LoadSourceImage(imagePath);
        ApplyModernTheme();
        UpdateAiModelStatus();
        Shown += ImageEditorForm_Shown;
    }

    private async void ImageEditorForm_Shown(object? sender, EventArgs e)
    {
        Shown -= ImageEditorForm_Shown;
        // 생성 직후에는 스크롤 영역 크기가 0에 가까울 수 있어, 레이아웃 완료 후 맞춤
        BeginInvoke(FitImageToViewport);

        if (RembgBackgroundRemover.IsModelInstalled(GetSelectedRembgModel()))
            return;

        await AutoDownloadRembgModelAsync(showSuccessMessage: false);
    }

    private bool _pendingInitialFit = true;

    private void FitImageToViewport()
    {
        if (_ownedPreviewBitmap is null)
            return;

        int vw = pnlScroll.ClientSize.Width;
        int vh = pnlScroll.ClientSize.Height;
        if (vw < 32 || vh < 32)
            return;

        _pendingInitialFit = false;
        ZoomToFit();
    }

    private void FitImageToViewportOnResize()
    {
        if (_pendingInitialFit)
            FitImageToViewport();
    }

    private RembgModelInfo GetSelectedRembgModel() =>
        cmbRembgModel.SelectedItem as RembgModelInfo ?? RembgModelInfo.U2Net;

    private void OnRembgModelChanged()
    {
        _rembgRemover?.InvalidateSession();
        _rembgRemover = null;
        UpdateAiModelStatus();
    }

    /// <summary>선택한 rembg ONNX 모델이 없으면 자동 다운로드합니다.</summary>
    private async Task AutoDownloadRembgModelAsync(bool showSuccessMessage)
    {
        var model = GetSelectedRembgModel();
        var progress = CreateBgProgress();
        SetBgRemovalUiBusy(true);
        ReportBgProgress(0, $"{model.DisplayName} 모델 확인 중...");
        try
        {
            await RembgBackgroundRemover.EnsureModelInstalledAsync(model, progress);
            UpdateAiModelStatus();
            UpdateStatus($"{model.DisplayName} 준비됨");
            if (showSuccessMessage)
            {
                MessageBox.Show(this, $"{model.DisplayName}({model.FileName})이 준비되었습니다.", "완료",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }
        catch (Exception ex)
        {
            lblAiModelStatus.Text = $"모델 다운로드 실패: {ex.Message}";
            MessageBox.Show(this,
                $"{model.DisplayName}을(를) 다운로드하지 못했습니다.\n\n{ex.Message}",
                "다운로드 실패", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        finally
        {
            HideBgProgress();
            SetBgRemovalUiBusy(false);
        }
    }

    // ── 이미지 로드 ───────────────────────────────────────────────────────
    private void LoadSourceImage(string path)
    {
        try
        {
            _sourcePath = path;
            _original?.Dispose();

            if (IsHeifPath(path))
            {
                _original = LoadHeifAsImageSharp(path);
            }
            else
            {
                _original = SixLabors.ImageSharp.Image.Load<Rgba32>(path);
            }

            _committed?.Dispose();
            _committed = _original.Clone();
            _originalWidth = _committed.Width;
            _originalHeight = _committed.Height;

            numResizeW.Value = Math.Min(_committed.Width, 16000);
            numResizeH.Value = Math.Min(_committed.Height, 16000);
            numCropW.Value = Math.Min(_committed.Width, 16000);
            numCropH.Value = Math.Min(_committed.Height, 16000);

            RefreshPreview(_committed);
            ZoomToFit();
            UpdateStatus();
        }
        catch (Exception ex)
        {
            LogError(ex);
            MessageBox.Show(this, $"{ex.Message}\n\n오류 세부 정보가 클립보드에 복사되었습니다.", "이미지 로드 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    private static Image<Rgba32> LoadHeifAsImageSharp(string path)
    {
        var decoder = System.Windows.Media.Imaging.BitmapDecoder.Create(
            new Uri(path, UriKind.Absolute),
            System.Windows.Media.Imaging.BitmapCreateOptions.None,
            System.Windows.Media.Imaging.BitmapCacheOption.OnLoad);
        var frame = decoder.Frames[0];
        var enc = new System.Windows.Media.Imaging.PngBitmapEncoder();
        enc.Frames.Add(System.Windows.Media.Imaging.BitmapFrame.Create(frame));
        using var ms = new MemoryStream();
        enc.Save(ms);
        ms.Position = 0;
        return SixLabors.ImageSharp.Image.Load<Rgba32>(ms);
    }

    // ── 이벤트 연결 ──────────────────────────────────────────────────────
    private void WireEvents()
    {
        toolBtnSave.Click += (_, _) => SaveImage(_sourcePath);
        toolBtnSaveAs.Click += (_, _) => SaveImageAs();
        toolBtnUndo.Click += (_, _) => Undo();
        toolBtnRedo.Click += (_, _) => Redo();
        toolBtnResetAll.Click += (_, _) => ResetAll();

        // 색상 조정 슬라이더 (실시간 미리보기)
        trkBrightness.ValueChanged += SliderChanged;
        trkContrast.ValueChanged += SliderChanged;
        trkSaturation.ValueChanged += SliderChanged;
        trkHue.ValueChanged += SliderChanged;
        trkGamma.ValueChanged += SliderChanged;
        trkTemperature.ValueChanged += SliderChanged;

        trkBrightness.ValueChanged += (_, _) => lblBrightnessVal.Text = trkBrightness.Value.ToString();
        trkContrast.ValueChanged += (_, _) => lblContrastVal.Text = trkContrast.Value.ToString();
        trkSaturation.ValueChanged += (_, _) => lblSaturationVal.Text = trkSaturation.Value.ToString();
        trkHue.ValueChanged += (_, _) => lblHueVal.Text = trkHue.Value.ToString();
        trkGamma.ValueChanged += (_, _) => lblGammaVal.Text = $"{trkGamma.Value / 100.0:0.0}";
        trkTemperature.ValueChanged += (_, _) => lblTemperatureVal.Text = trkTemperature.Value.ToString();

        btnApplyAdjust.Click += (_, _) => CommitAdjustments();
        btnResetAdjust.Click += (_, _) => ResetAdjustmentSliders();

        WireInstantFxButtons();
        WireParamFxButtons();
        chkShowColorBg.CheckedChanged += (_, _) => pnlColorBg.Visible = chkShowColorBg.Checked;

        trkParamEffect.ValueChanged += (_, _) => lblParamEffectVal.Text = trkParamEffect.Value.ToString();
        UpdateParamSliderRange(0);

        // 변환
        numResizeW.ValueChanged += NumResizeW_ValueChanged;
        numResizeH.ValueChanged += NumResizeH_ValueChanged;
        btnApplyResize.Click += (_, _) => ApplyResize();
        btnRotate90CW.Click += (_, _) => ApplyEffect(x => x.Rotate(90), "90° 시계방향");
        btnRotate90CCW.Click += (_, _) => ApplyEffect(x => x.Rotate(-90), "90° 반시계방향");
        btnRotate180.Click += (_, _) => ApplyEffect(x => x.Rotate(180), "180° 회전");
        btnApplyRotate.Click += (_, _) => ApplyCustomRotate();
        btnFlipH.Click += (_, _) => ApplyEffect(x => x.Flip(FlipMode.Horizontal), "좌우 뒤집기");
        btnFlipV.Click += (_, _) => ApplyEffect(x => x.Flip(FlipMode.Vertical), "상하 뒤집기");
        btnApplyCrop.Click += (_, _) => ApplyCrop();

        // 배경 제거
        trkTolerance.ValueChanged += (_, _) => lblToleranceVal.Text = trkTolerance.Value.ToString();
        btnPickBgColor.Click += (_, _) => PickBackgroundColor();
        pnlBgColorPreview.Click += (_, _) => PickBackgroundColor();
        btnEyedropper.Click += (_, _) => ToggleEyedropper();
        btnColorRemoveBg.Click += async (_, _) => await RemoveBackgroundAsync();
        cmbRembgModel.SelectedIndexChanged += (_, _) => OnRembgModelChanged();
        btnAiRemoveBg.Click += async (_, _) => await RemoveBackgroundWithAiAsync();

        // 줌
        btnZoomIn.Click += (_, _) => SetZoom(_zoom * 1.1);
        btnZoomOut.Click += (_, _) => SetZoom(_zoom / 1.1);
        btnZoomFit.Click += (_, _) => ZoomToFit();
        btnZoom1to1.Click += (_, _) => SetZoom(1.0);

        picPreview.MouseClick += PicPreview_MouseClick;
        pnlScroll.Resize += (_, _) => UpdatePreviewViewportLayout();
        pnlPreviewArea.Resize += (_, _) => UpdatePreviewViewportLayout();

        // 컨트롤 겹침 방지: 미리보기 영역을 항상 맨 앞으로
        pnlPreviewArea.BringToFront();

        Shown += (_, _) => UpdatePreviewViewportLayout();
        FormClosing += ImageEditorForm_FormClosing;
        FormClosed += (_, _) => DisposeAll();
    }

    private void SliderChanged(object? sender, EventArgs e)
    {
        _previewTimer.Stop();
        _previewTimer.Start();
    }

    private void WireInstantFxButtons()
    {
        var actions = new Action[]
        {
            () => ApplyEffect(x => x.Grayscale(), "흑백"),
            () => ApplyEffect(x => x.Sepia(), "세피아"),
            () => ApplyEffect(x => x.Invert(), "색 반전"),
            () => ApplyEffect(x => x.Vignette(), "비네트"),
            () => ApplyEffect(x => x.DetectEdges(), "엣지"),
            () => ApplyEffect(x => x.Polaroid(), "폴라로이드"),
            () => ApplyEffect(x => x.Glow(), "글로우"),
            () => ApplyEffect(x => x.BlackWhite(), "고대비"),
            () => ApplyPosterizeEffect(),
            () => ApplyEmbossEffect(),
            () => ApplySolarizeEffect()
        };
        var buttons = GetGridButtonsInOrder(tblInstantFx);
        for (int i = 0; i < buttons.Count && i < actions.Length; i++)
        {
            var act = actions[i];
            buttons[i].Click += (_, _) => act();
        }
    }

    private void WireParamFxButtons()
    {
        foreach (var btn in GetGridButtonsInOrder(tblParamFx))
        {
            if (btn.Tag is not int effectIndex) continue;
            btn.Click += (_, _) =>
            {
                UpdateParamSliderRange(effectIndex);
                ApplyParameterizedEffect(effectIndex);
            };
        }
    }

    private static List<Button> GetGridButtonsInOrder(TableLayoutPanel grid)
    {
        var list = new List<Button>();
        for (int r = 0; r < grid.RowCount; r++)
        for (int c = 0; c < grid.ColumnCount; c++)
        {
            if (grid.GetControlFromPosition(c, r) is Button btn)
                list.Add(btn);
        }
        return list;
    }

    private void UpdateParamSliderRange(int idx)
    {
        (int min, int max, int def) = idx switch
        {
            0 => (1, 20, 3),
            1 => (1, 20, 3),
            2 => (2, 50, 8),
            3 => (1, 20, 10),
            4 => (1, 30, 5),
            5 => (2, 20, 6),
            6 => (1, 100, 20),
            7 => (1, 100, 20),
            _ => (1, 30, 8)
        };
        trkParamEffect.Minimum = min;
        trkParamEffect.Maximum = max;
        trkParamEffect.Value = def;
        lblParamEffectVal.Text = def.ToString();
    }

    // ── 색상 조정 ─────────────────────────────────────────────────────────
    private void ApplyAdjustmentPreview()
    {
        if (_committed is null) return;
        bool allNeutral = IsAllAdjustmentsNeutral();
        if (allNeutral)
        {
            RefreshPreview(_committed);
            RefreshStatusBar();
            return;
        }

        Cursor = Cursors.WaitCursor;
        try
        {
            var preview = _committed.Clone();
            ApplyCurrentAdjustmentsTo(preview);
            RefreshPreview(preview);
            preview.Dispose();
        }
        finally
        {
            Cursor = Cursors.Default;
            RefreshStatusBar();
        }
    }

    private bool IsAllAdjustmentsNeutral() =>
        trkBrightness.Value == 0 && trkContrast.Value == 0 &&
        trkSaturation.Value == 0 && trkHue.Value == 0 &&
        trkGamma.Value == 100 && trkTemperature.Value == 0;

    private void ApplyCurrentAdjustmentsTo(Image<Rgba32> image)
    {
        float brightness = 1f + trkBrightness.Value / 100f;
        float contrast   = 1f + trkContrast.Value / 100f;
        float saturation = 1f + trkSaturation.Value / 100f;
        float hue        = trkHue.Value;
        float gamma      = trkGamma.Value / 100f;
        int   temperature = trkTemperature.Value;

        image.Mutate(x =>
        {
            if (trkBrightness.Value != 0) x.Brightness(brightness);
            if (trkContrast.Value != 0)   x.Contrast(contrast);
            if (trkSaturation.Value != 0) x.Saturate(saturation);
            if (trkHue.Value != 0)        x.Hue(hue);
        });

        if (trkGamma.Value != 100) ApplyGamma(image, gamma);
        if (temperature != 0)     ApplyTemperature(image, temperature);
    }

    private void CommitAdjustments()
    {
        if (_committed is null || IsAllAdjustmentsNeutral()) return;

        PushUndo();
        ApplyCurrentAdjustmentsTo(_committed!);
        ResetAdjustmentSliders();
        RefreshPreview(_committed!);
        UpdateStatus();
    }

    private void ResetAdjustmentSliders()
    {
        trkBrightness.Value = 0; trkContrast.Value = 0;
        trkSaturation.Value = 0; trkHue.Value = 0;
        trkGamma.Value = 100;   trkTemperature.Value = 0;
    }

    // ── 효과 적용 ─────────────────────────────────────────────────────────
    private void ApplyEffect(Action<IImageProcessingContext> fx, string opName)
    {
        if (_committed is null) return;
        Cursor = Cursors.WaitCursor;
        try
        {
            PushUndo();
            _committed.Mutate(fx);
            RefreshPreview(_committed);
            UpdateStatus(opName + " 적용됨");
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "효과 실패", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        finally { Cursor = Cursors.Default; }
    }

    private void ApplyParameterizedEffect(int effectIndex)
    {
        if (_committed is null) return;
        int v = trkParamEffect.Value;
        string name;
        Action<IImageProcessingContext> fx;

        switch (effectIndex)
        {
            case 0:
                name = $"가우시안 흐림(σ={v})";
                fx = x => x.GaussianBlur(v);
                break;
            case 1:
                name = $"선명하게(σ={v})";
                fx = x => x.GaussianSharpen(v);
                break;
            case 2:
                name = $"픽셀화({v}px)";
                fx = x => x.Pixelate(v);
                break;
            case 3:
                name = $"유화 효과({v})";
                int brushSize = Math.Max(1, v);
                fx = x => x.OilPaint(10, brushSize);
                break;
            case 4:
                name = $"박스 블러({v})";
                fx = x => x.BoxBlur(v);
                break;
            case 5:
                name = $"소프트 블러({v})";
                fx = x => x.GaussianBlur(v / 2f);
                break;
            case 6:
                name = $"밝게({v}%)";
                float lighten = 1f + v / 100f;
                fx = x => x.Brightness(lighten);
                break;
            case 7:
                name = $"어둡게({v}%)";
                float darken = Math.Max(0.05f, 1f - v / 100f);
                fx = x => x.Brightness(darken);
                break;
            default:
                name = $"강한 흐림({v})";
                fx = x => x.GaussianBlur(v * 2);
                break;
        }

        ApplyEffect(fx, name);
    }

    private void ApplyPosterizeEffect()
    {
        if (_committed is null) return;
        Cursor = Cursors.WaitCursor;
        try
        {
            PushUndo();
            ApplyPosterize(_committed, 4);
            RefreshPreview(_committed);
            UpdateStatus("포스터 효과 적용됨");
        }
        finally { Cursor = Cursors.Default; }
    }

    private void ApplyEmbossEffect()
    {
        if (_committed is null) return;
        Cursor = Cursors.WaitCursor;
        try
        {
            PushUndo();
            ApplyEmboss(_committed);
            RefreshPreview(_committed);
            UpdateStatus("엠보스 효과 적용됨");
        }
        finally { Cursor = Cursors.Default; }
    }

    private void ApplySolarizeEffect()
    {
        if (_committed is null) return;
        Cursor = Cursors.WaitCursor;
        try
        {
            PushUndo();
            ApplySolarize(_committed, 128);
            RefreshPreview(_committed);
            UpdateStatus("솔라라이즈 효과 적용됨");
        }
        finally { Cursor = Cursors.Default; }
    }

    private static void ApplyPosterize(Image<Rgba32> image, int levels)
    {
        int step = Math.Max(1, 256 / levels);
        image.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (int x = 0; x < row.Length; x++)
                {
                    ref var p = ref row[x];
                    p = new Rgba32(
                        (byte)(p.R / step * step),
                        (byte)(p.G / step * step),
                        (byte)(p.B / step * step),
                        p.A);
                }
            }
        });
    }

    private static void ApplyEmboss(Image<Rgba32> image)
    {
        int w = image.Width, h = image.Height;
        var copy = image.Clone();
        image.ProcessPixelRows(copy, (dest, src) =>
        {
            for (int y = 1; y < dest.Height - 1; y++)
            {
                var dRow = dest.GetRowSpan(y);
                for (int x = 1; x < dRow.Length - 1; x++)
                {
                    var c = src.GetRowSpan(y)[x];
                    var l = src.GetRowSpan(y)[x - 1];
                    var t = src.GetRowSpan(y - 1)[x];
                    int gray = Math.Clamp((c.R - l.R) + 128, 0, 255);
                    int grayG = Math.Clamp((c.G - t.G) + 128, 0, 255);
                    int g = (gray + grayG) / 2;
                    dRow[x] = new Rgba32((byte)g, (byte)g, (byte)g, c.A);
                }
            }
        });
        copy.Dispose();
    }

    private static void ApplySolarize(Image<Rgba32> image, int threshold)
    {
        image.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (int x = 0; x < row.Length; x++)
                {
                    ref var p = ref row[x];
                    p = new Rgba32(
                        (byte)(p.R > threshold ? 255 - p.R : p.R),
                        (byte)(p.G > threshold ? 255 - p.G : p.G),
                        (byte)(p.B > threshold ? 255 - p.B : p.B),
                        p.A);
                }
            }
        });
    }

    // ── 변환 ─────────────────────────────────────────────────────────────
    private void NumResizeW_ValueChanged(object? sender, EventArgs e)
    {
        if (!chkLockRatio.Checked || _lockRatioChanging || _originalWidth == 0) return;
        _lockRatioChanging = true;
        int h = (int)Math.Round((double)numResizeW.Value * _originalHeight / _originalWidth);
        numResizeH.Value = Math.Max(1, Math.Min(h, 16000));
        _lockRatioChanging = false;
    }

    private void NumResizeH_ValueChanged(object? sender, EventArgs e)
    {
        if (!chkLockRatio.Checked || _lockRatioChanging || _originalHeight == 0) return;
        _lockRatioChanging = true;
        int w = (int)Math.Round((double)numResizeH.Value * _originalWidth / _originalHeight);
        numResizeW.Value = Math.Max(1, Math.Min(w, 16000));
        _lockRatioChanging = false;
    }

    private void ApplyResize()
    {
        if (_committed is null) return;
        int w = (int)numResizeW.Value;
        int h = (int)numResizeH.Value;
        ApplyEffect(x => x.Resize(w, h), $"크기 조정 {w}×{h}");
    }

    private void ApplyCustomRotate()
    {
        if (_committed is null) return;
        float angle = (float)numRotateAngle.Value;
        if (angle == 0) return;
        ApplyEffect(x => x.Rotate(angle), $"회전 {angle}°");
    }

    private void ApplyCrop()
    {
        if (_committed is null) return;
        int cx = (int)numCropX.Value;
        int cy = (int)numCropY.Value;
        int cw = (int)numCropW.Value;
        int ch = (int)numCropH.Value;

        if (cx + cw > _committed.Width || cy + ch > _committed.Height)
        {
            MessageBox.Show(this, "자르기 범위가 이미지 크기를 벗어납니다.", "범위 오류",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var rect = new ISRectangle(cx, cy, cw, ch);
        ApplyEffect(x => x.Crop(rect), $"자르기 {cw}×{ch}");
    }

    // ── 배경 제거 ─────────────────────────────────────────────────────────
    private void PickBackgroundColor()
    {
        using var dlg = new ColorDialog { Color = _bgColor, FullOpen = true };
        if (dlg.ShowDialog(this) == DialogResult.OK)
        {
            _bgColor = dlg.Color;
            pnlBgColorPreview.BackColor = _bgColor;
        }
    }

    private void ToggleEyedropper()
    {
        _eyedropperActive = !_eyedropperActive;
        btnEyedropper.BackColor = _eyedropperActive
            ? UiTheme.Accent
            : UiTheme.BtnSecondary;
        picPreview.Cursor = _eyedropperActive ? Cursors.Cross : Cursors.Default;
        SetStatusMessage(_eyedropperActive
            ? "이미지에서 배경으로 제거할 색상을 클릭하세요."
            : "준비");
    }

    private void PicPreview_MouseClick(object? sender, MouseEventArgs e)
    {
        if (!_eyedropperActive || picPreview.Image is null) return;

        // 줌을 고려한 실제 이미지 좌표 계산
        int imgX = (int)(e.X / _zoom);
        int imgY = (int)(e.Y / _zoom);

        if (_committed is null || imgX < 0 || imgY < 0 ||
            imgX >= _committed.Width || imgY >= _committed.Height) return;

        var pixel = _committed[imgX, imgY];
        _bgColor = System.Drawing.Color.FromArgb(pixel.R, pixel.G, pixel.B);
        pnlBgColorPreview.BackColor = _bgColor;
        ToggleEyedropper();
    }

    private IProgress<(int percent, string message)> CreateBgProgress() =>
        new Progress<(int percent, string message)>(p => ReportBgProgress(p.percent, p.message));

    private void ReportBgProgress(int percent, string message)
    {
        int value = Math.Clamp(percent, 0, 100);
        progressBg.Visible = true;
        lblBgProgress.Visible = true;
        progressBg.Style = ProgressBarStyle.Continuous;
        progressBg.Value = value;
        lblBgProgress.Text = $"{value}% — {message}";
        SetStatusMessage(message);
    }

    private void HideBgProgress()
    {
        progressBg.Visible = false;
        lblBgProgress.Visible = false;
        progressBg.Value = 0;
        lblBgProgress.Text = string.Empty;
        SetStatusMessage("준비");
        RefreshStatusBar();
    }

    private void SetBgRemovalUiBusy(bool busy)
    {
        btnAiRemoveBg.Enabled = !busy;
        btnColorRemoveBg.Enabled = !busy;
        Cursor = busy ? Cursors.WaitCursor : Cursors.Default;
    }

    private async Task RemoveBackgroundAsync()
    {
        if (_committed is null) return;
        int tolerance = trkTolerance.Value;
        bool floodFill = rbFloodFill.Checked;
        var target = new Rgba32(_bgColor.R, _bgColor.G, _bgColor.B, 255);
        var progress = CreateBgProgress();

        SetBgRemovalUiBusy(true);
        ReportBgProgress(0, floodFill ? "플러드 필 배경 제거 준비 중..." : "색상 기반 배경 제거 준비 중...");
        try
        {
            PushUndo();
            var image = _committed;
            await Task.Run(() =>
            {
                if (floodFill)
                    ApplyFloodFillRemoval(image, target, tolerance, progress);
                else
                    ApplyColorReplacement(image, target, tolerance, progress);
            });

            RefreshPreview(_committed);
            UpdateStatus("배경 제거 완료");
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "배경 제거 실패", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        finally
        {
            HideBgProgress();
            SetBgRemovalUiBusy(false);
        }
    }

    private static void ApplyColorReplacement(Image<Rgba32> image, Rgba32 target, int tolerance,
        IProgress<(int percent, string message)>? progress = null)
    {
        int tSq = tolerance * tolerance * 3;
        int height = image.Height;
        image.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (int x = 0; x < row.Length; x++)
                {
                    ref var p = ref row[x];
                    if (ColorDistanceSq(p, target) <= tSq)
                        p = new Rgba32(0, 0, 0, 0);
                }

                if (y % 32 == 0 || y == height - 1)
                {
                    int pct = (y + 1) * 100 / Math.Max(1, height);
                    progress?.Report((pct, "색상 기반 배경 제거 중..."));
                }
            }
        });
        progress?.Report((100, "색상 기반 배경 제거 완료"));
    }

    private static void ApplyFloodFillRemoval(Image<Rgba32> image, Rgba32 target, int tolerance,
        IProgress<(int percent, string message)>? progress = null)
    {
        int w = image.Width, h = image.Height;
        int tSq = tolerance * tolerance * 3;
        var visited = new bool[w, h];
        var queue = new Queue<(int x, int y)>();

        progress?.Report((5, "가장자리 색상 분석 중..."));
        for (int x = 0; x < w; x++) { Enqueue(x, 0); Enqueue(x, h - 1); }
        for (int y = 1; y < h - 1; y++) { Enqueue(0, y); Enqueue(w - 1, y); }

        void Enqueue(int px, int py)
        {
            if (visited[px, py]) return;
            if (ColorDistanceSq(image[px, py], target) <= tSq)
            { visited[px, py] = true; queue.Enqueue((px, py)); }
        }

        int[] dx = { 0, 0, 1, -1 };
        int[] dy = { 1, -1, 0, 0 };
        int totalPixels = w * h;
        int expanded = 0;

        progress?.Report((10, "배경 영역 확장 중..."));
        while (queue.Count > 0)
        {
            var (cx, cy) = queue.Dequeue();
            expanded++;
            for (int d = 0; d < 4; d++)
            {
                int nx = cx + dx[d], ny = cy + dy[d];
                if (nx < 0 || ny < 0 || nx >= w || ny >= h || visited[nx, ny]) continue;
                if (ColorDistanceSq(image[nx, ny], target) <= tSq)
                { visited[nx, ny] = true; queue.Enqueue((nx, ny)); }
            }

            if (expanded % 5000 == 0)
            {
                int pct = 10 + (int)(60.0 * expanded / totalPixels);
                progress?.Report((Math.Min(pct, 70), "배경 영역 확장 중..."));
            }
        }

        progress?.Report((75, "투명 처리 적용 중..."));
        image.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (int x = 0; x < row.Length; x++)
                    if (visited[x, y]) row[x] = new Rgba32(0, 0, 0, 0);

                if (y % 32 == 0 || y == h - 1)
                {
                    int pct = 75 + (y + 1) * 24 / Math.Max(1, h);
                    progress?.Report((pct, "투명 처리 적용 중..."));
                }
            }
        });
        progress?.Report((100, "플러드 필 배경 제거 완료"));
    }

    private static int ColorDistanceSq(Rgba32 a, Rgba32 b)
    {
        int dr = a.R - b.R, dg = a.G - b.G, db = a.B - b.B;
        return dr * dr + dg * dg + db * db;
    }

    // ── 수동 픽셀 연산 ────────────────────────────────────────────────────
    private static void ApplyGamma(Image<Rgba32> image, float gamma)
    {
        if (Math.Abs(gamma - 1f) < 0.001f) return;
        float invGamma = 1f / gamma;
        var lut = new byte[256];
        for (int i = 0; i < 256; i++)
            lut[i] = (byte)Math.Clamp((int)(Math.Pow(i / 255.0, invGamma) * 255), 0, 255);

        image.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (int x = 0; x < row.Length; x++)
                {
                    ref var p = ref row[x];
                    p = new Rgba32(lut[p.R], lut[p.G], lut[p.B], p.A);
                }
            }
        });
    }

    private static void ApplyTemperature(Image<Rgba32> image, int temperature)
    {
        int adj = (int)(temperature * 1.28f);
        image.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (int x = 0; x < row.Length; x++)
                {
                    ref var p = ref row[x];
                    p = new Rgba32(
                        (byte)Math.Clamp(p.R + adj, 0, 255),
                        p.G,
                        (byte)Math.Clamp(p.B - adj, 0, 255),
                        p.A);
                }
            }
        });
    }

    // ── 실행 취소 / 다시 실행 ────────────────────────────────────────────
    private void ImageEditorForm_FormClosing(object? sender, FormClosingEventArgs e)
    {
        if (!_hasUnsavedChanges) return;

        var result = MessageBox.Show(this,
            "저장되지 않은 변경 사항이 있습니다.\n저장하시겠습니까?",
            "저장 확인",
            MessageBoxButtons.YesNoCancel,
            MessageBoxIcon.Question);

        if (result == DialogResult.Cancel)
        {
            e.Cancel = true;
            return;
        }

        if (result == DialogResult.Yes)
        {
            if (!ConfirmReplaceExisting(_sourcePath))
            {
                e.Cancel = true;
                return;
            }

            if (HasPendingAdjustments()) CommitAdjustments();
            try
            {
                ExportToPath(_committed!, _sourcePath);
                _hasUnsavedChanges = false;
                NotifyFileSaved(_sourcePath);
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, ex.Message, "저장 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
                e.Cancel = true;
            }
        }
    }

    private void PushUndo()
    {
        if (_committed is null) return;
        _hasUnsavedChanges = true;
        _undoStack.Push(_committed.Clone());
        if (_undoStack.Count > 20)
        {
            var arr = _undoStack.ToArray();  // arr[0]=top/newest, arr[Count-1]=oldest
            _undoStack.Clear();
            for (int i = 19; i >= 0; i--) _undoStack.Push(arr[i]);  // arr[0] ends up at top
            for (int i = 20; i < arr.Length; i++) arr[i].Dispose();
        }
        foreach (var img in _redoStack) img.Dispose();
        _redoStack.Clear();
        toolBtnUndo.Enabled = true;
        toolBtnRedo.Enabled = false;
        RefreshStatusBar();
    }

    private void Undo()
    {
        if (_undoStack.Count == 0 || _committed is null) return;
        _redoStack.Push(_committed.Clone());
        _committed.Dispose();
        _committed = _undoStack.Pop();
        ResetAdjustmentSliders();
        RefreshPreview(_committed);
        UpdateStatus("실행 취소됨");
        toolBtnUndo.Enabled = _undoStack.Count > 0;
        toolBtnRedo.Enabled = true;
    }

    private void Redo()
    {
        if (_redoStack.Count == 0 || _committed is null) return;
        _undoStack.Push(_committed.Clone());
        _committed.Dispose();
        _committed = _redoStack.Pop();
        ResetAdjustmentSliders();
        RefreshPreview(_committed);
        UpdateStatus("다시 실행됨");
        toolBtnUndo.Enabled = true;
        toolBtnRedo.Enabled = _redoStack.Count > 0;
    }

    private void ResetAll()
    {
        if (_original is null) return;
        if (MessageBox.Show(this, "모든 변경을 취소하고 원본으로 돌아가시겠습니까?",
            "원본으로 초기화", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;

        PushUndo();
        _committed?.Dispose();
        _committed = _original.Clone();
        ResetAdjustmentSliders();
        RefreshPreview(_committed);
        UpdateStatus("원본으로 초기화됨");
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

            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application;
        }
        catch
        {
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application; }
            catch { }
        }
    }

    private bool ConfirmReplaceExisting(string path)
    {
        if (!File.Exists(path))
            return true;

        return MessageBox.Show(this,
            $"「{Path.GetFileName(path)}」\n\n기존 파일을 대체(덮어쓰기)하시겠습니까?",
            "저장 확인",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question) == DialogResult.Yes;
    }

    private void NotifyFileSaved(string path) => FileSaved?.Invoke(this, path);

    // ── 저장 ─────────────────────────────────────────────────────────────
    private void SaveImage(string path)
    {
        if (_committed is null) return;
        if (string.IsNullOrWhiteSpace(path))
        {
            SaveImageAs();
            return;
        }

        if (!ConfirmReplaceExisting(path))
            return;

        if (HasPendingAdjustments() &&
            MessageBox.Show(this, "적용되지 않은 색상 조정이 있습니다. 현재 미리보기 상태로 저장하시겠습니까?",
                "미적용 조정", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
        {
            CommitAdjustments();
        }

        Cursor = Cursors.WaitCursor;
        try
        {
            ExportToPath(_committed, path);
            _hasUnsavedChanges = false;
            UpdateStatus($"저장됨: {Path.GetFileName(path)}");
            NotifyFileSaved(path);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "저장 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally { Cursor = Cursors.Default; }
    }

    private void SaveImageAs()
    {
        if (_committed is null) return;
        using var dlg = new SaveFileDialog
        {
            Title = "다른 이름으로 저장",
            Filter = "PNG 이미지|*.png|JPEG 이미지|*.jpg|WebP 이미지|*.webp|BMP 이미지|*.bmp|GIF 이미지|*.gif",
            DefaultExt = "png",
            FileName = System.IO.Path.GetFileNameWithoutExtension(_sourcePath) + "_편집"
        };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;

        if (File.Exists(dlg.FileName) && !ConfirmReplaceExisting(dlg.FileName))
            return;

        if (HasPendingAdjustments()) CommitAdjustments();

        Cursor = Cursors.WaitCursor;
        try
        {
            ExportToPath(_committed!, dlg.FileName);
            _hasUnsavedChanges = false;
            _sourcePath = dlg.FileName;
            Text = $"이미지 편집기 — {Path.GetFileName(_sourcePath)}";
            UpdateStatus($"저장됨: {Path.GetFileName(dlg.FileName)}");
            NotifyFileSaved(dlg.FileName);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "저장 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally { Cursor = Cursors.Default; }
    }

    private static void ExportToPath(Image<Rgba32> image, string path)
    {
        string ext = System.IO.Path.GetExtension(path).ToLowerInvariant();
        using var fs = new FileStream(path, FileMode.Create, FileAccess.Write);
        switch (ext)
        {
            case ".jpg" or ".jpeg":
                image.Save(fs, new JpegEncoder { Quality = 95 });
                break;
            case ".webp":
                image.Save(fs, new WebpEncoder());
                break;
            case ".bmp":
                image.Save(fs, new BmpEncoder());
                break;
            case ".gif":
                image.Save(fs, new GifEncoder());
                break;
            default:
                image.Save(fs, new PngEncoder());
                break;
        }
    }

    private bool HasPendingAdjustments() => !IsAllAdjustmentsNeutral();

    // ── 미리보기 / 줌 ────────────────────────────────────────────────────
    /// <summary>편집 이미지를 1:1 비트맵으로 갱신합니다. 줌은 <see cref="ApplyPreviewZoom"/>으로만 처리합니다.</summary>
    private void RefreshPreview(Image<Rgba32> source)
    {
        var old = _ownedPreviewBitmap;
        _ownedPreviewBitmap = ImageSharpToBitmap(source);
        picPreview.Image = _ownedPreviewBitmap;
        old?.Dispose();
        ApplyPreviewZoom();
    }

    /// <summary>메인 창과 동일하게 PictureBox 크기만 조절해 GDI+ 스트레치로 표시합니다.</summary>
    private void ApplyPreviewZoom()
    {
        if (_ownedPreviewBitmap is null)
        {
            pnlScroll.AutoScrollMinSize = System.Drawing.Size.Empty;
            return;
        }

        int w = Math.Max(1, (int)Math.Round(_ownedPreviewBitmap.Width * _zoom));
        int h = Math.Max(1, (int)Math.Round(_ownedPreviewBitmap.Height * _zoom));
        picPreview.Size = new System.Drawing.Size(w, h);
        lblZoomPct.Text = $"{_zoom * 100:0.#}%";
        UpdatePreviewViewportLayout();
        RefreshStatusBar();
    }

    private void SetZoom(double zoom)
    {
        zoom = Math.Clamp(zoom, 0.05, 16.0);
        if (Math.Abs(zoom - _zoom) < 0.0001)
            return;

        _zoom = zoom;
        ApplyPreviewZoom();
    }

    private double CalculateFitZoomFactor()
    {
        if (_ownedPreviewBitmap is null)
            return 1.0;

        int viewportWidth = Math.Max(1, pnlScroll.ClientSize.Width);
        int viewportHeight = Math.Max(1, pnlScroll.ClientSize.Height);
        double scaleX = (double)viewportWidth / Math.Max(1, _ownedPreviewBitmap.Width);
        double scaleY = (double)viewportHeight / Math.Max(1, _ownedPreviewBitmap.Height);
        return Math.Clamp(Math.Min(scaleX, scaleY), 0.05, 16.0);
    }

    // 마우스 휠로 확대/축소 (메인 창과 동일한 배율·방식)
    private void PicPreview_MouseWheel(object? sender, MouseEventArgs e)
    {
        if (_ownedPreviewBitmap is null)
            return;

        double step = e.Delta > 0 ? 1.1 : 1.0 / 1.1;
        SetZoom(_zoom * step);
    }

    /// <summary>이미지가 뷰포트보다 작을 때 미리보기를 가운데 정렬합니다.</summary>
    private void UpdatePreviewViewportLayout()
    {
        if (picPreview.Image is null) return;

        int viewportWidth = Math.Max(1, pnlScroll.ClientSize.Width);
        int viewportHeight = Math.Max(1, pnlScroll.ClientSize.Height);
        bool needsHScroll = picPreview.Width > viewportWidth;
        bool needsVScroll = picPreview.Height > viewportHeight;

        int x = needsHScroll ? 0 : Math.Max(0, (viewportWidth - picPreview.Width) / 2);
        int y = needsVScroll ? 0 : Math.Max(0, (viewportHeight - picPreview.Height) / 2);
        picPreview.Location = new System.Drawing.Point(x, y);

        int minW = needsHScroll ? picPreview.Width + 2 : Math.Max(picPreview.Width, viewportWidth - 1);
        int minH = needsVScroll ? picPreview.Height + 2 : Math.Max(picPreview.Height, viewportHeight - 1);
        pnlScroll.AutoScrollMinSize = new System.Drawing.Size(minW, minH);

        if (!needsHScroll && !needsVScroll)
            pnlScroll.AutoScrollPosition = System.Drawing.Point.Empty;

        pnlScroll.PerformLayout();
    }

    private void UpdateAiModelStatus()
    {
        var model = GetSelectedRembgModel();
        lblAiModelStatus.Text = RembgBackgroundRemover.IsModelInstalled(model)
            ? $"{model.DisplayName} 준비됨"
            : $"{model.DisplayName} 없음 — 배경 제거 시 다운로드";
    }

    private Task EnsureRembgModelAsync(IProgress<(int percent, string message)> progress) =>
        RembgBackgroundRemover.EnsureModelInstalledAsync(GetSelectedRembgModel(), progress);

    private async Task RemoveBackgroundWithAiAsync()
    {
        if (_committed is null) return;

        var progress = CreateBgProgress();
        SetBgRemovalUiBusy(true);
        ReportBgProgress(0, "AI 배경 제거 준비 중...");
        try
        {
            await EnsureRembgModelAsync(progress);

            _rembgRemover ??= new RembgBackgroundRemover();
            _rembgRemover.Model = GetSelectedRembgModel();

            var result = await Task.Run(async () =>
            {
                using var processed = await _rembgRemover!.RemoveBackgroundAsync(_committed!, progress);
                return processed.Clone();
            });

            PushUndo();
            _committed.Dispose();
            _committed = result;
            RefreshPreview(_committed);
            UpdateAiModelStatus();
            UpdateStatus("rembg 배경 제거 완료");
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "AI 배경 제거 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            HideBgProgress();
            SetBgRemovalUiBusy(false);
        }
    }

    private void ZoomToFit() => SetZoom(CalculateFitZoomFactor());

    private static Bitmap ImageSharpToBitmap(Image<Rgba32> image)
    {
        using var ms = new MemoryStream();
        image.SaveAsPng(ms);
        ms.Position = 0;
        using var tmp = new Bitmap(ms);
        return new Bitmap(tmp);  // stream-independent copy
    }

    // ── 상태 / 테마 / 유틸 ───────────────────────────────────────────────
    private void RefreshStatusBar()
    {
        UpdateStatusPathAndFile();
        UpdateStatusImage();
        UpdateStatusView();
    }

    private void UpdateStatusPathAndFile()
    {
        if (string.IsNullOrWhiteSpace(_sourcePath))
        {
            statusLblPath.Text = "파일 정보 없음";
            statusLblFile.Text = "";
            return;
        }

        statusLblPath.Text = _sourcePath;

        if (!File.Exists(_sourcePath))
        {
            statusLblFile.Text = $"{Path.GetFileName(_sourcePath)} | (디스크에 없음)";
            return;
        }

        try
        {
            var info = new FileInfo(_sourcePath);
            string ext = Path.GetExtension(_sourcePath);
            if (string.IsNullOrWhiteSpace(ext))
                ext = "(확장자 없음)";

            statusLblFile.Text =
                $"{info.Name} | {FormatFileSize(info.Length)} | 수정 {info.LastWriteTime.ToString("yyyy-MM-dd HH:mm", CultureInfo.CurrentCulture)} | {ext}";
        }
        catch
        {
            statusLblFile.Text = Path.GetFileName(_sourcePath);
        }
    }

    private void UpdateStatusImage()
    {
        if (_committed is null)
        {
            statusLblImage.Text = "";
            return;
        }

        var parts = new List<string>();
        if (_original is not null &&
            (_original.Width != _committed.Width || _original.Height != _committed.Height))
        {
            parts.Add($"원본 {_original.Width}×{_original.Height}");
            parts.Add($"편집 {_committed.Width}×{_committed.Height}");
        }
        else
        {
            parts.Add($"{_committed.Width}×{_committed.Height}");
        }

        parts.Add("RGBA 8bpp");

        if (_hasUnsavedChanges)
            parts.Add("● 미저장");

        if (_undoStack.Count > 0)
            parts.Add($"되돌리기 {_undoStack.Count}");

        if (_redoStack.Count > 0)
            parts.Add($"다시 {_redoStack.Count}");

        statusLblImage.Text = string.Join(" | ", parts);
    }

    private void UpdateStatusView()
    {
        if (_committed is null)
        {
            statusLblZoom.Text = "";
            return;
        }

        int dw = _ownedPreviewBitmap is not null
            ? Math.Max(1, (int)Math.Round(_ownedPreviewBitmap.Width * _zoom))
            : _committed.Width;
        int dh = _ownedPreviewBitmap is not null
            ? Math.Max(1, (int)Math.Round(_ownedPreviewBitmap.Height * _zoom))
            : _committed.Height;

        string pending = HasPendingAdjustments() ? " | 조정 미적용" : "";
        statusLblZoom.Text = $"줌 {_zoom * 100:0.#}% | 표시 {dw}×{dh}{pending}";
    }

    private void SetStatusMessage(string message) => statusLblMessage.Text = message;

    private void UpdateStatus(string? message = null)
    {
        RefreshStatusBar();
        if (message is not null)
            SetStatusMessage(message);
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

    private void ApplyModernTheme()
    {
        UiTheme.ApplyToForm(this);
        UiTheme.StyleSplitContainer(splitMain);

        pnlPreviewArea.BackColor = UiTheme.BgPreview;
        pnlScroll.BackColor = UiTheme.BgPreview;
        picPreview.BackColor = UiTheme.BgPreview;
        pnlZoomBar.BackColor = UiTheme.BgToolbar;
        pnlAdjustContent.BackColor = UiTheme.BgSurface;
        pnlEffectsContent.BackColor = UiTheme.BgSurface;
        pnlTransformContent.BackColor = UiTheme.BgSurface;
        pnlBgContent.BackColor = UiTheme.BgSurface;
        UiTheme.StyleTabControl(tabTools);
        foreach (TabPage tab in tabTools.TabPages)
        {
            tab.BackColor = UiTheme.BgSurface;
            tab.ForeColor = UiTheme.TextPrimary;
        }

        UiTheme.StyleToolStrip(toolStrip);
        UiTheme.StyleStatusStrip(statusStrip);
        UiTheme.StyleProgressBar(progressBg);
        UiTheme.StyleLabel(lblAiModelStatus, secondary: true);
        tblInstantFx.BackColor = UiTheme.BgSurface;
        tblParamFx.BackColor = UiTheme.BgSurface;

        UiTheme.StyleButtonsInTree(this);
        UiTheme.StyleInputsInTree(this);
        StylePanelLabels(pnlAdjustContent);
        StyleSectionLabelsInTree(this);
        lblZoomPct.ForeColor = UiTheme.TextSecondary;
    }

    private static void StyleSectionLabelsInTree(Control root)
    {
        foreach (Control c in root.Controls)
        {
            if (c is Label lbl && lbl.Name.StartsWith("sec_", StringComparison.Ordinal))
                UiTheme.StyleSectionLabel(lbl);
            StyleSectionLabelsInTree(c);
        }
    }

    private static void StylePanelLabels(Control panel)
    {
        foreach (Control c in panel.Controls)
        {
            if (c is not Label lbl) continue;
            if (lbl.Name.StartsWith("sec_", StringComparison.Ordinal))
                UiTheme.StyleSectionLabel(lbl);
            else if (lbl.Name.EndsWith("Val", StringComparison.Ordinal))
                UiTheme.StyleLabel(lbl);
            else
                UiTheme.StyleLabel(lbl, secondary: true);
        }
    }

    private static void LogError(Exception ex)
    {
        string details = ex.ToString();
        string logPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "ImageViewerV30_error.txt");
        try { System.IO.File.WriteAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}]\n{details}"); } catch { }
        try { Clipboard.SetText(details); } catch { }
    }

    private static bool IsHeifPath(string path)
    {
        string ext = System.IO.Path.GetExtension(path).ToLowerInvariant();
        return ext is ".heif" or ".heic" or ".hif";
    }

    private void DisposeAll()
    {
        _previewTimer.Dispose();
        _rembgRemover?.Dispose();
        _rembgRemover = null;
        _original?.Dispose(); _original = null;
        _committed?.Dispose(); _committed = null;
        foreach (var img in _undoStack) img.Dispose();
        foreach (var img in _redoStack) img.Dispose();
        _undoStack.Clear(); _redoStack.Clear();
        picPreview.Image = null;
        _ownedPreviewBitmap?.Dispose();
        _ownedPreviewBitmap = null;
    }
}
