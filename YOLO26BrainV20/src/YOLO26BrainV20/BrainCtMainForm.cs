using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.Drawing.Imaging;
using YOLO26BrainV20.Dialogs;
using YOLO26BrainV20.Inference;
using YOLO26BrainV20.Services;

namespace YOLO26BrainV20
{

public partial class BrainCtMainForm : Form
{

    private bool _syncingConfidenceUi;
    private Panel? _inputScrollPanel;
    private Panel? _outputScrollPanel;
    private float _inputZoom = 1f;
    private float _outputZoom = 1f;
    private bool _inputPanDragging;
    private bool _outputPanDragging;
    private Point _inputPanLastClient;
    private Point _outputPanLastClient;
    private Control? _inputPanCaptureHost;
    private Control? _outputPanCaptureHost;
    private const float MinZoom = 0.2f;
    private const float MaxZoom = 8.0f;
    private const float ZoomStep = 1.2f;

    private BrainYolo26Session? _session;
    private string? _modelPath;
    private string? _lastSessionKey;
    private IReadOnlyList<BrainDetection>? _lastDetections;
    private string? _lastInputImagePath;

    public BrainCtMainForm()
    {
        InitializeComponent();
        // Skip runtime layout and I/O so Visual Studio WinForms designer can load this form.
        if (LicenseManager.UsageMode == LicenseUsageMode.Designtime)
            return;

        WireResponsiveLayoutFromDesigner();
        InitializeZoomPanels();
        WireFormEvents();
        SetupDetectionListViewColumns();
        SetSaveCommandsEnabled(false);
        ApplyRecommendedInferenceDefaults();
        TryApplyDefaultSegmentationModel();
        UpdateOverlayLayout();
        LayoutAdaptiveControls();
        UpdateZoomText(isInput: true);
        UpdateZoomText(isInput: false);
    }

    private void WireFormEvents()
    {
        menuSaveImage.ShortcutKeys = Keys.Control | Keys.S;
        menuSaveCsv.ShortcutKeys = Keys.Control | Keys.Shift | Keys.S;
        menuSaveImage.Click += MenuSaveImage_Click;
        menuSaveCsv.Click += MenuSaveCsv_Click;
        menuExit.Click += MenuExit_Click;
        menuConvertPt.Click += MenuConvertPt_Click;
        menuOpenSampleFolder.Click += MenuOpenSampleFolder_Click;
        menuRecommendedDefaults.Click += MenuRecommendedDefaults_Click;
        btnModel.Click += BtnModel_Click;
        btnImage.Click += BtnImage_Click;
        btnAnalyze.Click += BtnAnalyze_Click;
        btnSave.Click += BtnSave_Click;
        btnSaveCsv.Click += BtnSaveCsv_Click;
        btnResetInputZoom.Click += (_, _) => ResetZoom(isInput: true);
        btnResetOutputZoom.Click += (_, _) => ResetZoom(isInput: false);
        listDetections.SelectedIndexChanged += ListDetections_SelectedIndexChanged;
        numConf.ValueChanged += ConfidenceUi_ValueChanged;
        trackConf.ValueChanged += TrackConf_ValueChanged;
        Resize += (_, _) =>
        {
            LayoutAdaptiveControls();
            UpdateOverlayLayout();
        };
        ClientSizeChanged += (_, _) =>
        {
            LayoutAdaptiveControls();
            UpdateOverlayLayout();
        };
        Shown += (_, _) => LayoutAdaptiveControls();
    }

    /// <summary>
    /// Layout lives in InitializeComponent (Designer). Here we only attach runtime handlers that need app code.
    /// </summary>
    private void WireResponsiveLayoutFromDesigner()
    {
        comboExecutionProvider.SelectedIndexChanged += (_, _) => InvalidateSession();
        menuStripMain.BringToFront();
    }

    /// <summary>창 크기에 맞춰 가변 폭·미리보기 50:50·우측 버튼 정렬을 갱신합니다(디자이너 Y·좌측 열은 유지).</summary>
    private void LayoutAdaptiveControls()
    {
        if (LicenseManager.UsageMode == LicenseUsageMode.Designtime)
            return;
        if (WindowState == FormWindowState.Minimized || !IsHandleCreated)
            return;
        try
        {
            const int m = 12;
            const int gap = 8;
            var cw = ClientSize.Width;
            var ch = ClientSize.Height;
            if (cw < 1 || ch < 1)
                return;

            // Path labels: stretch with client width (Anchor L+R also works; SetBounds keeps left column width)
            var pathW = Math.Max(80, cw - m - lblOnnxPath.Left);
            lblOnnxPath.Width = pathW;
            lblSlicePath.Width = pathW;

            if (txtLabels.Visible)
                txtLabels.Width = Math.Max(80, cw - 2 * m);

            // Confidence row: right-align buttons + numeric, track fills space to their left
            var yRow = trackConf.Top;
            var btnH = btnAnalyze.Height;
            var yBtn = yRow + Math.Max(0, (trackConf.Height - btnH) / 2) - 2;
            var right = cw - m;
            right -= btnAnalyze.Width;
            btnAnalyze.SetBounds(right, yBtn, btnAnalyze.Width, btnH);
            right -= gap;
            right -= btnSave.Width;
            btnSave.SetBounds(right, yBtn, btnSave.Width, btnH);
            right -= gap;
            right -= btnSaveCsv.Width;
            btnSaveCsv.SetBounds(right, yBtn, btnSaveCsv.Width, btnH);
            right -= gap;
            right -= numConf.Width;
            numConf.SetBounds(right, yRow + 6, numConf.Width, numConf.Height);

            var trackLeft = trackConf.Left;
            var trackW = Math.Max(80, numConf.Left - gap - trackLeft);
            trackConf.SetBounds(trackLeft, yRow, trackW, trackConf.Height);

            lblConf.Left = comboExecutionProvider.Right + 12;

            // Progress & status stretch with width
            progressInference.SetBounds(m, progressInference.Top, cw - 2 * m, progressInference.Height);
            lblStatus.SetBounds(m, lblStatus.Top, cw - 2 * m, lblStatus.Height);

            // Preview panes: 50/50 between margins, height up to list
            var top = panelInputViewport.Top;
            var listTop = listDetections.Top;
            var h = Math.Max(80, listTop - m - top);
            var innerW = Math.Max(gap + 200, cw - 2 * m);
            var half = (innerW - gap) / 2;
            panelInputViewport.SetBounds(m, top, half, h);
            panelOutputViewport.SetBounds(m + half + gap, top, innerW - half - gap, h);

            // Preview header row follows pane edges
            var hdrY = lblPreviewInTitle.Top;
            lblPreviewInTitle.Left = panelInputViewport.Left;
            lblPreviewInTitle.Top = hdrY;
            lblZoomInput.Left = lblPreviewInTitle.Right + gap;
            lblZoomInput.Top = hdrY;
            btnResetInputZoom.Left = panelInputViewport.Right - btnResetInputZoom.Width;
            btnResetInputZoom.Top = hdrY - 2;

            lblPreviewOutTitle.Left = panelOutputViewport.Left;
            lblPreviewOutTitle.Top = hdrY;
            lblZoomOutput.Left = lblPreviewOutTitle.Right + gap;
            lblZoomOutput.Top = hdrY;
            btnResetOutputZoom.Left = panelOutputViewport.Right - btnResetOutputZoom.Width;
            btnResetOutputZoom.Top = hdrY - 2;
        }
        catch
        {
            // layout not ready
        }
    }

    private void InitializeZoomPanels()
    {
        _inputScrollPanel = panelInputViewport;
        _outputScrollPanel = panelOutputViewport;
        picInput.MouseWheel += (s, e) => ChangeZoom(isInput: true, e.Delta > 0, (Control)s!, e);
        picOutput.MouseWheel += (s, e) => ChangeZoom(isInput: false, e.Delta > 0, (Control)s!, e);
        panelInputViewport.MouseWheel += (s, e) => ChangeZoom(isInput: true, e.Delta > 0, (Control)s!, e);
        panelOutputViewport.MouseWheel += (s, e) => ChangeZoom(isInput: false, e.Delta > 0, (Control)s!, e);
        picInput.MouseEnter += (_, _) => _inputScrollPanel.Focus();
        picOutput.MouseEnter += (_, _) => _outputScrollPanel.Focus();

        void wirePan(Control c)
        {
            c.MouseDown += Viewport_MouseDown;
            c.MouseMove += Viewport_MouseMove;
            c.MouseUp += Viewport_MouseUp;
        }

        wirePan(panelInputViewport);
        wirePan(panelOutputViewport);
        wirePan(picInput);
        wirePan(picOutput);

        picInput.Location = Point.Empty;
        picOutput.Location = Point.Empty;
    }

    private void UpdateOverlayLayout()
    {
        menuStripMain.BringToFront();
        UpdateZoomLayoutForSide(isInput: true);
        UpdateZoomLayoutForSide(isInput: false);
    }

    private void ChangeZoom(bool isInput, bool zoomIn, Control wheelSender, MouseEventArgs e)
    {
        var focal = ToPanelClientPoint(wheelSender, e);
        ChangeZoom(isInput, zoomIn, focal);
    }

    /// <param name="focalInPanel">패널 클라이언트 좌표 기준, 휠 줌 기준점(보통 마우스 위치).</param>
    private void ChangeZoom(bool isInput, bool zoomIn, Point focalInPanel)
    {
        var pic = isInput ? picInput : picOutput;
        var panel = isInput ? _inputScrollPanel : _outputScrollPanel;
        if (pic.Image == null || panel == null)
            return;

        var imgW = pic.Image.Width;
        var imgH = pic.Image.Height;
        if (imgW <= 0 || imgH <= 0)
            return;

        var (cw, ch) = GetViewportSize(panel);
        var fit = Math.Min((float)cw / imgW, (float)ch / imgH);
        ref var zoomRef = ref isInput ? ref _inputZoom : ref _outputZoom;
        var zOld = zoomRef;
        var scaleOld = fit * zOld;
        var drawWold = Math.Max(1, (int)Math.Round(imgW * scaleOld));
        var drawHold = Math.Max(1, (int)Math.Round(imgH * scaleOld));

        float docX;
        float docY;
        if (panel.AutoScroll)
        {
            var sx = Math.Max(0, -panel.AutoScrollPosition.X);
            var sy = Math.Max(0, -panel.AutoScrollPosition.Y);
            docX = focalInPanel.X + sx;
            docY = focalInPanel.Y + sy;
        }
        else
        {
            docX = focalInPanel.X - pic.Left;
            docY = focalInPanel.Y - pic.Top;
        }

        var nx = drawWold > 0 ? docX / drawWold : 0.5f;
        var ny = drawHold > 0 ? docY / drawHold : 0.5f;
        nx = Math.Clamp(nx, 0f, 1f);
        ny = Math.Clamp(ny, 0f, 1f);

        zoomRef = Math.Clamp(zoomRef * (zoomIn ? ZoomStep : 1f / ZoomStep), MinZoom, MaxZoom);

        UpdateZoomLayoutForSide(isInput);

        var drawWn = pic.Width;
        var drawHn = pic.Height;
        var overflowsNow = drawWn > cw || drawHn > ch;
        if (overflowsNow && panel.AutoScroll)
        {
            var sxNew = (int)Math.Round(nx * drawWn - focalInPanel.X);
            var syNew = (int)Math.Round(ny * drawHn - focalInPanel.Y);
            SetPanelScroll(panel, pic.Width, pic.Height, sxNew, syNew);
        }

        UpdateZoomText(isInput);
    }

    private void UpdateZoomLayoutForSide(bool isInput)
    {
        PictureBox pic = isInput ? picInput : picOutput;
        Panel? panel = isInput ? _inputScrollPanel : _outputScrollPanel;
        float zoom = isInput ? _inputZoom : _outputZoom;

        if (panel == null || pic.Image == null)
            return;

        var imgW = pic.Image.Width;
        var imgH = pic.Image.Height;
        if (imgW <= 0 || imgH <= 0)
            return;

        var (cw, ch) = GetViewportSize(panel);
        var fit = Math.Min((float)cw / imgW, (float)ch / imgH);
        var scale = fit * zoom;
        var drawW = Math.Max(1, (int)Math.Round(imgW * scale));
        var drawH = Math.Max(1, (int)Math.Round(imgH * scale));

        pic.SizeMode = PictureBoxSizeMode.StretchImage;
        pic.Size = new Size(drawW, drawH);

        var overflows = drawW > cw || drawH > ch;
        var priorScrollX = Math.Max(0, -panel.AutoScrollPosition.X);
        var priorScrollY = Math.Max(0, -panel.AutoScrollPosition.Y);

        if (!overflows)
        {
            panel.AutoScroll = false;
            panel.AutoScrollMinSize = Size.Empty;
            var cx = Math.Max(0, (cw - drawW) / 2);
            var cy = Math.Max(0, (ch - drawH) / 2);
            pic.Location = new Point(cx, cy);
        }
        else
        {
            panel.AutoScroll = true;
            panel.AutoScrollMinSize = new Size(drawW, drawH);
            pic.Location = Point.Empty;
            SetPanelScroll(panel, drawW, drawH, priorScrollX, priorScrollY);
        }
    }

    private static (int Width, int Height) GetViewportSize(Panel panel)
    {
        return (Math.Max(1, panel.ClientSize.Width), Math.Max(1, panel.ClientSize.Height));
    }

    private static void SetPanelScroll(Panel panel, int contentW, int contentH, int scrollX, int scrollY)
    {
        var (cw, ch) = GetViewportSize(panel);
        var maxX = Math.Max(0, contentW - cw);
        var maxY = Math.Max(0, contentH - ch);
        var sx = Math.Clamp(scrollX, 0, maxX);
        var sy = Math.Clamp(scrollY, 0, maxY);
        try
        {
            panel.AutoScrollPosition = new Point(-sx, -sy);
        }
        catch
        {
            // ignore scroll assignment race on layout transitions
        }
    }

    private Panel? ViewportHostFromSender(object? sender) =>
        sender switch
        {
            Panel p when ReferenceEquals(p, panelInputViewport) => panelInputViewport,
            Panel p when ReferenceEquals(p, panelOutputViewport) => panelOutputViewport,
            PictureBox pb when ReferenceEquals(pb, picInput) => panelInputViewport,
            PictureBox pb when ReferenceEquals(pb, picOutput) => panelOutputViewport,
            _ => null,
        };

    /// <summary>스크롤 오프셋과 무관하게, 패널 뷰포트(표시 영역) 기준 클라이언트 좌표로 변환합니다.</summary>
    private static Point ToPanelClientPoint(object? sender, MouseEventArgs e)
    {
        if (sender is not Control c)
            return Point.Empty;
        if (c is Panel)
            return e.Location;
        var screen = c.PointToScreen(new Point(e.X, e.Y));
        return c.Parent is Panel pv ? pv.PointToClient(screen) : e.Location;
    }

    private void Viewport_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left)
            return;
        var panel = ViewportHostFromSender(sender);
        if (panel == null || !panel.AutoScroll)
            return;
        var pt = ToPanelClientPoint(sender, e);
        // Capture on the control that received the click so drag MouseMove/MouseUp are reliable (Panel-only capture can drop moves on some layouts).
        var captureHost = (sender as Control) ?? panel;
        if (ReferenceEquals(panel, panelInputViewport))
        {
            _inputPanDragging = true;
            _inputPanLastClient = pt;
            _inputPanCaptureHost = captureHost;
            _inputPanCaptureHost.Capture = true;
            panelInputViewport.Cursor = Cursors.SizeAll;
            picInput.Cursor = Cursors.SizeAll;
        }
        else
        {
            _outputPanDragging = true;
            _outputPanLastClient = pt;
            _outputPanCaptureHost = captureHost;
            _outputPanCaptureHost.Capture = true;
            panelOutputViewport.Cursor = Cursors.SizeAll;
            picOutput.Cursor = Cursors.SizeAll;
        }
    }

    private void Viewport_MouseMove(object? sender, MouseEventArgs e)
    {
        var panel = ViewportHostFromSender(sender);
        if (panel == null)
            return;
        var pt = ToPanelClientPoint(sender, e);
        if (ReferenceEquals(panel, panelInputViewport))
        {
            if (!_inputPanDragging)
                return;
            var dx = pt.X - _inputPanLastClient.X;
            var dy = pt.Y - _inputPanLastClient.Y;
            _inputPanLastClient = pt;
            ApplyViewportPan(panel, picInput, dx, dy);
        }
        else
        {
            if (!_outputPanDragging)
                return;
            var dx = pt.X - _outputPanLastClient.X;
            var dy = pt.Y - _outputPanLastClient.Y;
            _outputPanLastClient = pt;
            ApplyViewportPan(panel, picOutput, dx, dy);
        }

        // Do not run full UpdateZoomLayout here — it fights AutoScroll/pan and makes dragging feel stuck.
        menuStripMain.BringToFront();
    }

    private void Viewport_MouseUp(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left)
            return;
        var panel = ViewportHostFromSender(sender);
        if (panel == null)
            return;
        if (ReferenceEquals(panel, panelInputViewport))
        {
            _inputPanDragging = false;
            _inputPanCaptureHost?.Capture = false;
            _inputPanCaptureHost = null;
            panelInputViewport.Cursor = Cursors.Default;
            picInput.Cursor = Cursors.Default;
        }
        else
        {
            _outputPanDragging = false;
            _outputPanCaptureHost?.Capture = false;
            _outputPanCaptureHost = null;
            panelOutputViewport.Cursor = Cursors.Default;
            picOutput.Cursor = Cursors.Default;
        }
    }

    private void ApplyViewportPan(Panel panel, PictureBox pic, int dx, int dy)
    {
        if (pic.Image == null)
            return;
        if (!panel.AutoScroll)
            return;

        var curX = Math.Max(0, -panel.AutoScrollPosition.X);
        var curY = Math.Max(0, -panel.AutoScrollPosition.Y);
        curX -= dx;
        curY -= dy;
        SetPanelScroll(panel, pic.Width, pic.Height, curX, curY);
    }

    private void ResetZoom(bool isInput)
    {
        if (isInput)
        {
            _inputZoom = 1f;
            UpdateZoomLayoutForSide(isInput: true);
            UpdateZoomText(isInput: true);
        }
        else
        {
            _outputZoom = 1f;
            UpdateZoomLayoutForSide(isInput: false);
            UpdateZoomText(isInput: false);
        }
    }

    private void UpdateZoomText(bool isInput)
    {
        var lbl = isInput ? lblZoomInput : lblZoomOutput;
        var pic = isInput ? picInput : picOutput;

        if (pic.Image == null)
        {
            lbl.Visible = false;
            return;
        }

        lbl.Visible = true;
        var z = isInput ? _inputZoom : _outputZoom;
        var pct = Math.Round(z * 100);
        lbl.Text = isInput ? $"입력 {pct:0}%" : $"결과 {pct:0}%";
    }

    private void SyncTrackBarFromNumeric()
    {
        if (_syncingConfidenceUi)
            return;
        _syncingConfidenceUi = true;
        try
        {
            var pct = (int)Math.Clamp((int)Math.Round((double)numConf.Value * 100), trackConf.Minimum, trackConf.Maximum);
            if (trackConf.Value != pct)
                trackConf.Value = pct;
        }
        finally
        {
            _syncingConfidenceUi = false;
        }
    }

    private void SyncNumericFromTrackBar()
    {
        if (_syncingConfidenceUi)
            return;
        _syncingConfidenceUi = true;
        try
        {
            var dec = Math.Round(trackConf.Value / 100m, 2, MidpointRounding.AwayFromZero);
            dec = Math.Clamp(dec, numConf.Minimum, numConf.Maximum);
            if (numConf.Value != dec)
                numConf.Value = dec;
        }
        finally
        {
            _syncingConfidenceUi = false;
        }
    }

    private void ConfidenceUi_ValueChanged(object? sender, EventArgs e)
    {
        if (_syncingConfidenceUi)
            return;
        SyncTrackBarFromNumeric();
    }

    private void TrackConf_ValueChanged(object? sender, EventArgs e)
    {
        if (_syncingConfidenceUi)
            return;
        SyncNumericFromTrackBar();
    }

    private void ApplyRecommendedInferenceDefaults()
    {
        txtLabels.Text = BrainCtInferenceDefaults.RecommendedClassLabelsComma;
        var dec = (decimal)Math.Round(BrainCtInferenceDefaults.RecommendedMinConfidence, 2, MidpointRounding.AwayFromZero);
        dec = Math.Clamp(dec, numConf.Minimum, numConf.Maximum);
        numConf.Value = dec;
        SyncTrackBarFromNumeric();
    }

    private void MenuRecommendedDefaults_Click(object? sender, EventArgs e)
    {
        var explain =
            "다음 권장값을 적용합니다.\n\n" +
            $"· 최소 신뢰도: {BrainCtInferenceDefaults.RecommendedMinConfidence:0.##} (Ultralytics YOLO predict 기본)\n" +
            $"· 단일 클래스 표시: {BrainCtInferenceDefaults.RecommendedClassLabelsComma}\n\n" +
            "계속할까요?";
        if (MessageBox.Show(this, explain, "추천 기본값", MessageBoxButtons.YesNo, MessageBoxIcon.Question) !=
            DialogResult.Yes)
            return;

        ApplyRecommendedInferenceDefaults();
        InvalidateSession();
        lblStatus.Text =
            $"추천 기본값 적용됨 · 신뢰도 {BrainCtInferenceDefaults.RecommendedMinConfidence:0.##} · 클래스 {BrainCtInferenceDefaults.RecommendedClassLabelsComma}";
    }

    private void SetupDetectionListViewColumns()
    {
        listDetections.Columns.Clear();
        listDetections.Columns.Add("#", 44);
        listDetections.Columns.Add("클래스", 160);
        listDetections.Columns.Add("신뢰도", 88);
        listDetections.Columns.Add("Left", 72);
        listDetections.Columns.Add("Top", 72);
        listDetections.Columns.Add("Width", 72);
        listDetections.Columns.Add("Height", 72);
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        picInput.Image?.Dispose();
        picInput.Image = null;
        picOutput.Image?.Dispose();
        picOutput.Image = null;
        _session?.Dispose();
        _session = null;
        base.OnFormClosed(e);
    }

    private void SetSaveCommandsEnabled(bool enabled)
    {
        btnSave.Enabled = enabled;
        btnSaveCsv.Enabled = enabled;
        menuSaveImage.Enabled = enabled;
        menuSaveCsv.Enabled = enabled;
    }

    private void BtnModel_Click(object? sender, EventArgs e)
    {
        var initialDir = TryResolveRepoSubdirectory("models")
            ?? Path.GetDirectoryName(_modelPath)
            ?? Environment.CurrentDirectory;
        using var dlg = new OpenFileDialog
        {
            Title = "출혈 세그멘테이션 ONNX 선택 (YOLO26-seg 등)",
            Filter = "ONNX|*.onnx|모든 파일|*.*",
            CheckFileExists = true,
            InitialDirectory = initialDir,
        };
        if (dlg.ShowDialog(this) != DialogResult.OK)
            return;

        _modelPath = dlg.FileName;
        InvalidateSession();
        lblOnnxPath.Text = dlg.FileName;
        lblStatus.Text = $"모델을 불러왔습니다: {Path.GetFileName(_modelPath)}";
    }

    private void BtnImage_Click(object? sender, EventArgs e)
    {
        var initialDir = TryResolveRepoSubdirectory("samples")
            ?? (string.IsNullOrEmpty(_lastInputImagePath) ? null : Path.GetDirectoryName(_lastInputImagePath))
            ?? Environment.CurrentDirectory;
        using var dlg = new OpenFileDialog
        {
            Title = "뇌 CT 이미지 선택",
            Filter = "이미지|*.png;*.jpg;*.jpeg;*.bmp|모든 파일|*.*",
            CheckFileExists = true,
            InitialDirectory = initialDir,
        };
        if (dlg.ShowDialog(this) != DialogResult.OK)
            return;

        if (!TryLoadInputImageFromPath(dlg.FileName, out var err))
        {
            MessageBox.Show(this, err ?? "알 수 없는 오류", "이미지를 열 수 없습니다", MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }

    private bool TryLoadInputImageFromPath(string path, out string? error)
    {
        error = null;
        try
        {
            picInput.Image?.Dispose();
            picInput.Image = null;
            picOutput.Image?.Dispose();
            picOutput.Image = null;
            UpdateZoomText(isInput: true);
            UpdateZoomText(isInput: false);
            listDetections.Items.Clear();
            SetSaveCommandsEnabled(false);
            _lastDetections = null;
            _lastInputImagePath = null;
            lblSlicePath.Text = "불러온 이미지 없음";

            picInput.Image = new Bitmap(path);
            ResetZoom(isInput: true);
            _lastInputImagePath = path;
            lblSlicePath.Text = path;
            lblStatus.Text = $"이미지를 불러왔습니다: {Path.GetFileName(path)}";
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            UpdateZoomText(isInput: true);
            UpdateZoomText(isInput: false);
            return false;
        }
    }

    private async void MenuConvertPt_Click(object? sender, EventArgs e)
    {
        var script = Path.Combine(AppContext.BaseDirectory, "tools", "export_yolo26_brain_onnx.py");
        if (!File.Exists(script))
        {
            MessageBox.Show(this,
                $"변환 스크립트가 없습니다(빌드 출력의 tools 폴더).\n{script}",
                "PyTorch→ONNX",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        var py = PythonOnnxExportRunner.FindPythonLauncher();
        if (string.IsNullOrEmpty(py))
        {
            MessageBox.Show(this,
                "Python을 찾지 못했습니다. PATH에 py 또는 python을 넣거나, 환경 변수 YOLO26_PYTHON에 python.exe 전체 경로를 지정하세요.\n\n" +
                "또한 pip install ultralytics 및 tools\\requirements-export.txt 내 패키지가 필요합니다.",
                "PyTorch→ONNX",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        using var ofd = new OpenFileDialog
        {
            Title = "PyTorch 가중치 선택",
            Filter = "PyTorch|*.pt;*.pth|모든 파일|*.*",
            CheckFileExists = true,
        };
        if (ofd.ShowDialog(this) != DialogResult.OK)
            return;

        using var sfd = new SaveFileDialog
        {
            Title = "ONNX 저장 위치",
            Filter = "ONNX|*.onnx",
            FileName = "hemorrhage_seg.onnx",
            DefaultExt = "onnx",
            OverwritePrompt = true,
        };
        if (sfd.ShowDialog(this) != DialogResult.OK)
            return;

        using var optDlg = new OnnxExportOptionsForm();
        if (optDlg.ShowDialog(this) != DialogResult.OK)
            return;

        var opset = optDlg.Opset;
        menuTools.Enabled = false;
        UseWaitCursor = true;
        lblStatus.Text = "Python으로 ONNX 변환 중… (시간이 걸릴 수 있음)";
        try
        {
            var (ok, log) = await PythonOnnxExportRunner
                .RunExportAsync(py, script, ofd.FileName, sfd.FileName, opset, CancellationToken.None)
                .ConfigureAwait(true);

            if (!ok)
            {
                MessageBox.Show(this, TruncateForDialog(log, 6000), "변환 실패", MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                lblStatus.Text = "변환 실패";
                return;
            }

            if (!string.IsNullOrWhiteSpace(log))
            {
                MessageBox.Show(this, TruncateForDialog(log, 4000), "변환 로그", MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }

            if (MessageBox.Show(this,
                    "변환이 완료되었습니다. 이 ONNX를 지금 모델로 불러올까요?",
                    "PyTorch→ONNX",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question) == DialogResult.Yes)
            {
                _modelPath = sfd.FileName;
                InvalidateSession();
                lblOnnxPath.Text = sfd.FileName;
            }

            lblStatus.Text = $"ONNX 변환 완료: {Path.GetFileName(sfd.FileName)}";
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "변환 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            lblStatus.Text = "변환 오류";
        }
        finally
        {
            UseWaitCursor = false;
            menuTools.Enabled = true;
        }
    }

    private void MenuOpenSampleFolder_Click(object? sender, EventArgs e)
    {
        var dir = AppDataPaths.GetSampleDownloadDirectory();
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = '"' + dir + '"',
                UseShellExecute = true,
            });
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "폴더를 열 수 없습니다", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private async void BtnAnalyze_Click(object? sender, EventArgs e)
    {
        if (picInput.Image == null)
        {
            MessageBox.Show(this, "뇌 CT 이미지를 먼저 불러오세요.", "입력 없음", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (string.IsNullOrEmpty(_modelPath) || !File.Exists(_modelPath))
        {
            MessageBox.Show(this, "ONNX 모델 파일을 선택하세요.", "모델 없음", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var labels = ParseLabels();

        Bitmap? frame = null;
        try
        {
            frame = new Bitmap(picInput.Image);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "이미지 복사 실패", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        btnAnalyze.Enabled = false;
        btnModel.Enabled = false;
        btnImage.Enabled = false;
        SetInferenceProgressUi(true, "추론 중 — ONNX 세션 준비 및 출혈 세그 실행…");

        try
        {
            EnsureSession(labels);
            var conf = (float)numConf.Value;

            var (annotated, dets) = await Task.Run(() => _session!.Detect(frame, conf)).ConfigureAwait(true);

            picOutput.Image?.Dispose();
            picOutput.Image = annotated;
            ResetZoom(isInput: false);
            _lastDetections = dets;
            SetSaveCommandsEnabled(true);

            var modelName = Path.GetFileName(_modelPath);
            var labelsSummary = string.Join(",", labels);
            lblStatus.Text =
                $"{_session!.ExecutionProviderSummary} · 모델 {modelName} · conf {conf:0.##} · 클래스 {labelsSummary} · 출혈 영역 {dets.Count}건";

            listDetections.BeginUpdate();
            listDetections.Items.Clear();
            for (var i = 0; i < dets.Count; i++)
            {
                var d = dets[i];
                var item = new ListViewItem((i + 1).ToString(CultureInfo.InvariantCulture))
                {
                    Tag = i,
                };
                item.SubItems.Add(d.Label);
                item.SubItems.Add(d.Confidence.ToString("0.###", CultureInfo.InvariantCulture));
                item.SubItems.Add(d.Box.Left.ToString("0.0", CultureInfo.InvariantCulture));
                item.SubItems.Add(d.Box.Top.ToString("0.0", CultureInfo.InvariantCulture));
                item.SubItems.Add(d.Box.Width.ToString("0.0", CultureInfo.InvariantCulture));
                item.SubItems.Add(d.Box.Height.ToString("0.0", CultureInfo.InvariantCulture));
                listDetections.Items.Add(item);
            }

            listDetections.EndUpdate();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "추론 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
            lblStatus.Text = "오류";
        }
        finally
        {
            SetInferenceProgressUi(false);
            frame?.Dispose();
            btnAnalyze.Enabled = true;
            btnModel.Enabled = true;
            btnImage.Enabled = true;
        }
    }

    private void SetInferenceProgressUi(bool active, string? statusText = null)
    {
        progressInference.Visible = true;
        progressInference.Style = active ? ProgressBarStyle.Marquee : ProgressBarStyle.Continuous;
        progressInference.MarqueeAnimationSpeed = active ? 35 : 0;
        numConf.Enabled = !active;
        trackConf.Enabled = !active;
        if (statusText != null)
            lblStatus.Text = statusText;
    }

    private void BtnSave_Click(object? sender, EventArgs e) => TrySaveResultImage();

    private void BtnSaveCsv_Click(object? sender, EventArgs e) => TrySaveDetectionsCsv();

    private void MenuSaveImage_Click(object? sender, EventArgs e) => TrySaveResultImage();

    private void MenuSaveCsv_Click(object? sender, EventArgs e) => TrySaveDetectionsCsv();

    private void MenuExit_Click(object? sender, EventArgs e) => Close();

    private string SuggestedResultBaseName() =>
        string.IsNullOrEmpty(_lastInputImagePath)
            ? "brain_ct_hemorrhage_seg"
            : Path.GetFileNameWithoutExtension(_lastInputImagePath) + "_hemorrhage_seg";

    private void TrySaveResultImage()
    {
        if (picOutput.Image == null)
        {
            MessageBox.Show(this, "저장할 결과 이미지가 없습니다. 먼저 추론을 실행하세요.", "저장",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var dlg = new SaveFileDialog
        {
            Title = "결과 이미지 저장",
            Filter = "PNG|*.png|JPEG|*.jpg;*.jpeg|BMP|*.bmp",
            FileName = SuggestedResultBaseName() + ".png",
            DefaultExt = "png",
            OverwritePrompt = true,
        };
        if (dlg.ShowDialog(this) != DialogResult.OK)
            return;

        try
        {
            using var clone = new Bitmap(picOutput.Image);
            SaveBitmapAs(clone, dlg.FileName);
            lblStatus.Text = $"이미지 저장됨: {Path.GetFileName(dlg.FileName)}";
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "저장 실패", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private static void SaveBitmapAs(Bitmap bmp, string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        if (ext is ".jpg" or ".jpeg")
        {
            var jpgCodec = ImageCodecInfo.GetImageEncoders()
                .First(c => c.FormatID == ImageFormat.Jpeg.Guid);
            using var encParams = new EncoderParameters(1);
            encParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 95L);
            bmp.Save(path, jpgCodec, encParams);
            return;
        }

        if (ext == ".bmp")
        {
            bmp.Save(path, ImageFormat.Bmp);
            return;
        }

        bmp.Save(path, ImageFormat.Png);
    }

    private void TrySaveDetectionsCsv()
    {
        if (_lastDetections == null)
        {
            MessageBox.Show(this, "저장할 출혈 영역 목록이 없습니다. 먼저 세그 추론을 실행하세요.", "저장",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var dlg = new SaveFileDialog
        {
            Title = "출혈 영역 목록 CSV 저장",
            Filter = "CSV|*.csv",
            FileName = SuggestedResultBaseName() + ".csv",
            DefaultExt = "csv",
            OverwritePrompt = true,
        };
        if (dlg.ShowDialog(this) != DialogResult.OK)
            return;

        try
        {
            WriteDetectionsCsv(dlg.FileName, _lastDetections);
            lblStatus.Text = $"CSV 저장됨: {Path.GetFileName(dlg.FileName)} ({_lastDetections.Count}건)";
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "저장 실패", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private static void WriteDetectionsCsv(string path, IReadOnlyList<BrainDetection> dets)
    {
        using var sw = new StreamWriter(path, false, new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
        sw.WriteLine("index,label,confidence,left,top,width,height,right,bottom");
        for (var i = 0; i < dets.Count; i++)
        {
            var d = dets[i];
            var inv = CultureInfo.InvariantCulture;
            sw.WriteLine(string.Join(",",
                (i + 1).ToString(inv),
                EscapeCsv(d.Label),
                d.Confidence.ToString("0.####", inv),
                d.Box.Left.ToString("0.###", inv),
                d.Box.Top.ToString("0.###", inv),
                d.Box.Width.ToString("0.###", inv),
                d.Box.Height.ToString("0.###", inv),
                d.Box.Right.ToString("0.###", inv),
                d.Box.Bottom.ToString("0.###", inv)));
        }
    }

    private static string TruncateForDialog(string text, int maxChars)
    {
        var t = text.TrimEnd();
        if (t.Length <= maxChars)
            return t;
        return t[..maxChars] + Environment.NewLine + "… (이하 생략)";
    }

    private static string EscapeCsv(string s)
    {
        if (s.Contains(',') || s.Contains('"') || s.Contains('\r') || s.Contains('\n'))
            return "\"" + s.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"";
        return s;
    }

    private void ListDetections_SelectedIndexChanged(object? sender, EventArgs e)
    {
        if (listDetections.SelectedItems.Count == 0 || _lastDetections == null)
            return;

        if (listDetections.SelectedItems[0].Tag is not int idx || idx < 0 || idx >= _lastDetections.Count)
            return;

        var d = _lastDetections[idx];
        lblStatus.Text =
            $"선택 #{idx + 1}: {d.Label} (신뢰도 {d.Confidence:0.###}) · " +
            $"박스 픽셀 좌표 Left={d.Box.Left:0}, Top={d.Box.Top:0}, " +
            $"Right={d.Box.Right:0}, Bottom={d.Box.Bottom:0}";
    }

    private List<string> ParseLabels()
    {
        var raw = txtLabels.Text.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        var list = raw.Where(s => s.Length > 0).ToList();
        if (list.Count == 0 && !string.IsNullOrWhiteSpace(BrainCtInferenceDefaults.RecommendedClassLabelsComma))
        {
            return BrainCtInferenceDefaults.RecommendedClassLabelsComma
                .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                .ToList();
        }

        return list;
    }

    private void InvalidateSession()
    {
        _session?.Dispose();
        _session = null;
        _lastSessionKey = null;
    }

    /// <summary>저장소 models 폴더에 기본 세그 ONNX가 있으면 자동 선택.</summary>
    private void TryApplyDefaultSegmentationModel()
    {
        if (!string.IsNullOrEmpty(_modelPath) && File.Exists(_modelPath))
            return;

        var modelsDir = TryResolveRepoSubdirectory("models");
        if (modelsDir == null)
            return;

        foreach (var name in BrainCtInferenceDefaults.DefaultSegmentationOnnxFallbacks)
        {
            var path = Path.Combine(modelsDir, name);
            if (!File.Exists(path))
                continue;
            _modelPath = path;
            lblOnnxPath.Text = path;
            lblStatus.Text = $"기본 세그 모델: {Path.GetFileName(path)}";
            return;
        }
    }

    private static string? TryResolveRepoSubdirectory(string childDirName)
    {
        if (string.IsNullOrWhiteSpace(childDirName))
            return null;

        try
        {
            for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir != null; dir = dir.Parent)
            {
                var candidate = Path.Combine(dir.FullName, childDirName);
                if (Directory.Exists(candidate))
                    return candidate;
            }
        }
        catch (IOException)
        {
            // ignore
        }
        catch (UnauthorizedAccessException)
        {
            // ignore
        }

        return null;
    }

    private OnnxExecutionProviderRequest GetExecutionProviderRequest() =>
        comboExecutionProvider.SelectedIndex switch
        {
            1 => OnnxExecutionProviderRequest.CpuOnly,
            2 => OnnxExecutionProviderRequest.CudaOnly,
            _ => OnnxExecutionProviderRequest.Auto,
        };

    private void EnsureSession(IReadOnlyList<string> labels)
    {
        var ep = GetExecutionProviderRequest();
        var key = _modelPath + "\0" + string.Join(",", labels) + "\0" + (int)ep;
        if (_session != null && _lastSessionKey == key)
            return;

        InvalidateSession();
        _session = new BrainYolo26Session(_modelPath!, labels, ep, cudaDeviceId: 0);
        _lastSessionKey = key;
    }

}

}
