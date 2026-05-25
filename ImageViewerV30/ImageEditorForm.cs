using System.IO;
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
    private float _zoom = 1f;
    private bool _eyedropperActive;
    private System.Drawing.Color _bgColor = System.Drawing.Color.White;
    private string _sourcePath = string.Empty;

    private bool _lockRatioChanging;
    private int _originalWidth, _originalHeight;
    private bool _hasUnsavedChanges;

    public ImageEditorForm(string imagePath)
    {
        InitializeComponent();
        _previewTimer = new System.Windows.Forms.Timer { Interval = 180 };
        _previewTimer.Tick += (_, _) => { _previewTimer.Stop(); ApplyAdjustmentPreview(); };

        WireEvents();
        LoadSourceImage(imagePath);
        ApplyDarkTheme();
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

            _zoom = 1f;
            RefreshPreview(_committed);
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

        // 효과 버튼
        btnFxGrayscale.Click += (_, _) => ApplyEffect(x => x.Grayscale(), "흑백");
        btnFxSepia.Click += (_, _) => ApplyEffect(x => x.Sepia(), "세피아");
        btnFxInvert.Click += (_, _) => ApplyEffect(x => x.Invert(), "색 반전");
        btnFxVignette.Click += (_, _) => ApplyEffect(x => x.Vignette(), "비네트");
        btnFxEdge.Click += (_, _) => ApplyEffect(x => x.DetectEdges(), "엣지 검출");

        trkParamEffect.ValueChanged += (_, _) => lblParamEffectVal.Text = trkParamEffect.Value.ToString();
        cmbParamEffect.SelectedIndexChanged += CmbParamEffect_SelectedIndexChanged;
        btnApplyParamEffect.Click += (_, _) => ApplyParameterizedEffect();

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
        btnRemoveBg.Click += (_, _) => RemoveBackground();

        // 줌
        btnZoomIn.Click += (_, _) => SetZoom(_zoom * 1.25f);
        btnZoomOut.Click += (_, _) => SetZoom(_zoom / 1.25f);
        btnZoomFit.Click += (_, _) => ZoomToFit();
        btnZoom1to1.Click += (_, _) => SetZoom(1f);

        picPreview.MouseClick += PicPreview_MouseClick;

        FormClosing += ImageEditorForm_FormClosing;
        FormClosed += (_, _) => DisposeAll();
    }

    private void SliderChanged(object? sender, EventArgs e)
    {
        _previewTimer.Stop();
        _previewTimer.Start();
    }

    private void CmbParamEffect_SelectedIndexChanged(object? sender, EventArgs e)
    {
        int idx = cmbParamEffect.SelectedIndex;
        (int min, int max, int def) = idx switch
        {
            0 => (1, 20, 3),   // 가우시안 흐림
            1 => (1, 20, 3),   // 선명하게
            2 => (2, 50, 8),   // 픽셀화
            _ => (1, 20, 10)   // 유화 효과
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
        finally { Cursor = Cursors.Default; }
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

    private void ApplyParameterizedEffect()
    {
        if (_committed is null) return;
        int v = trkParamEffect.Value;
        string name;
        Action<IImageProcessingContext> fx;

        switch (cmbParamEffect.SelectedIndex)
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
            default:
                name = $"유화 효과({v})";
                int brushSize = Math.Max(1, v);
                fx = x => x.OilPaint(10, brushSize);
                break;
        }

        ApplyEffect(fx, name);
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
            ? System.Drawing.Color.FromArgb(0, 122, 204)
            : System.Drawing.Color.FromArgb(55, 55, 65);
        picPreview.Cursor = _eyedropperActive ? Cursors.Cross : Cursors.Default;
        statusLblInfo.Text = _eyedropperActive
            ? "이미지에서 배경으로 제거할 색상을 클릭하세요."
            : "준비";
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

    private void RemoveBackground()
    {
        if (_committed is null) return;
        int tolerance = trkTolerance.Value;
        bool floodFill = rbFloodFill.Checked;
        var target = new Rgba32(_bgColor.R, _bgColor.G, _bgColor.B, 255);

        Cursor = Cursors.WaitCursor;
        try
        {
            PushUndo();
            if (floodFill)
                ApplyFloodFillRemoval(_committed, target, tolerance);
            else
                ApplyColorReplacement(_committed, target, tolerance);

            RefreshPreview(_committed);
            UpdateStatus("배경 제거 완료");
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "배경 제거 실패", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        finally { Cursor = Cursors.Default; }
    }

    private static void ApplyColorReplacement(Image<Rgba32> image, Rgba32 target, int tolerance)
    {
        int tSq = tolerance * tolerance * 3;
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
            }
        });
    }

    private static void ApplyFloodFillRemoval(Image<Rgba32> image, Rgba32 target, int tolerance)
    {
        int w = image.Width, h = image.Height;
        int tSq = tolerance * tolerance * 3;
        var visited = new bool[w, h];
        var queue = new Queue<(int x, int y)>();

        // 이미지 가장자리에서 시작
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

        while (queue.Count > 0)
        {
            var (cx, cy) = queue.Dequeue();
            for (int d = 0; d < 4; d++)
            {
                int nx = cx + dx[d], ny = cy + dy[d];
                if (nx < 0 || ny < 0 || nx >= w || ny >= h || visited[nx, ny]) continue;
                if (ColorDistanceSq(image[nx, ny], target) <= tSq)
                { visited[nx, ny] = true; queue.Enqueue((nx, ny)); }
            }
        }

        image.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (int x = 0; x < row.Length; x++)
                    if (visited[x, y]) row[x] = new Rgba32(0, 0, 0, 0);
            }
        });
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
            if (HasPendingAdjustments()) CommitAdjustments();
            try
            {
                ExportToPath(_committed!, _sourcePath);
                _hasUnsavedChanges = false;
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

    // ── 저장 ─────────────────────────────────────────────────────────────
    private void SaveImage(string path)
    {
        if (_committed is null) return;
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
            UpdateStatus($"저장됨: {System.IO.Path.GetFileName(path)}");
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

        if (HasPendingAdjustments()) CommitAdjustments();

        Cursor = Cursors.WaitCursor;
        try
        {
            ExportToPath(_committed!, dlg.FileName);
            _hasUnsavedChanges = false;
            _sourcePath = dlg.FileName;
            Text = $"이미지 편집기 — {System.IO.Path.GetFileName(_sourcePath)}";
            UpdateStatus($"저장됨: {System.IO.Path.GetFileName(dlg.FileName)}");
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
    private void RefreshPreview(Image<Rgba32> source)
    {
        var bmp = ImageSharpToBitmap(source);

        int dw = Math.Max(1, (int)(source.Width * _zoom));
        int dh = Math.Max(1, (int)(source.Height * _zoom));

        Bitmap scaled;
        if (Math.Abs(_zoom - 1f) < 0.001f)
        {
            scaled = bmp;
        }
        else
        {
            scaled = new Bitmap(dw, dh, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
            using var g = System.Drawing.Graphics.FromImage(scaled);
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            g.DrawImage(bmp, 0, 0, dw, dh);
            bmp.Dispose();
        }

        var old = picPreview.Image;
        picPreview.Image = scaled;
        picPreview.Size = new System.Drawing.Size(dw, dh);
        old?.Dispose();
        lblZoomPct.Text = $"{_zoom * 100:0}%";
    }

    private void SetZoom(float zoom)
    {
        _zoom = Math.Clamp(zoom, 0.05f, 16f);
        if (_committed is not null) RefreshPreview(_committed);
    }

    private void ZoomToFit()
    {
        if (_committed is null) return;
        var scroll = Controls.Find("pnlScroll", true).FirstOrDefault() as Panel;
        if (scroll is null) { SetZoom(1f); return; }
        float zx = (float)scroll.ClientSize.Width / _committed.Width;
        float zy = (float)scroll.ClientSize.Height / _committed.Height;
        SetZoom(Math.Min(zx, zy));
    }

    private static Bitmap ImageSharpToBitmap(Image<Rgba32> image)
    {
        using var ms = new MemoryStream();
        image.SaveAsPng(ms);
        ms.Position = 0;
        using var tmp = new Bitmap(ms);
        return new Bitmap(tmp);  // stream-independent copy
    }

    // ── 상태 / 테마 / 유틸 ───────────────────────────────────────────────
    private void UpdateStatus(string? extra = null)
    {
        if (_committed is null) return;
        string info = $"현재: {_committed.Width}×{_committed.Height}";
        if (_original is not null)
            info = $"원본: {_original.Width}×{_original.Height}  |  {info}";
        if (extra is not null) info += $"  |  {extra}";
        statusLblInfo.Text = info;
    }

    private void ApplyDarkTheme()
    {
        BackColor = System.Drawing.Color.FromArgb(30, 30, 36);
        ForeColor = System.Drawing.Color.WhiteSmoke;

        void DarkenTab(TabPage tab)
        {
            tab.BackColor = System.Drawing.Color.FromArgb(30, 30, 36);
            tab.ForeColor = System.Drawing.Color.WhiteSmoke;
            foreach (Control c in tab.Controls) ApplyThemeToControl(c);
        }

        DarkenTab(tabAdjust);
        DarkenTab(tabEffects);
        DarkenTab(tabTransform);
        DarkenTab(tabBgRemove);
        splitMain.BackColor = System.Drawing.Color.FromArgb(30, 30, 36);
    }

    private static void ApplyThemeToControl(Control c)
    {
        if (c is Panel p) { p.BackColor = System.Drawing.Color.FromArgb(30, 30, 36); }
        foreach (Control child in c.Controls) ApplyThemeToControl(child);
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
        _original?.Dispose(); _original = null;
        _committed?.Dispose(); _committed = null;
        foreach (var img in _undoStack) img.Dispose();
        foreach (var img in _redoStack) img.Dispose();
        _undoStack.Clear(); _redoStack.Clear();
        picPreview.Image?.Dispose();
    }
}
