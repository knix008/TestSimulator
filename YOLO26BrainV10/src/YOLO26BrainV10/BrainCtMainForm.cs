using System.Diagnostics;
using System.Globalization;
using System.Drawing.Imaging;
using YOLO26BrainV10.Dialogs;
using YOLO26BrainV10.Inference;
using YOLO26BrainV10.Services;

namespace YOLO26BrainV10
{

public partial class BrainCtMainForm : Form
{
    private const int PreviewLeft = 12;
    private const int PreviewGap = 8;
    private const int PreviewTop = 262;
    private const int PreviewTitleY = 214;
    private const int ZoomBadgeWidth = 74;
    private const int ZoomButtonWidth = 76;
    private const int ListTopGap = 10;
    private const int OuterPadding = 12;

    private bool _syncingConfidenceUi;
    private Panel? _inputScrollPanel;
    private Panel? _outputScrollPanel;
    private float _inputZoom = 1f;
    private float _outputZoom = 1f;
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
        EnsureZoomPanels();
        WireFormEvents();
        SetupDetectionListViewColumns();
        SetSaveCommandsEnabled(false);
        ApplyRecommendedInferenceDefaults();
        ApplyResponsiveLayout();
    }

    private void WireFormEvents()
    {
        menuSaveImage.ShortcutKeys = Keys.Control | Keys.S;
        menuSaveCsv.ShortcutKeys = Keys.Control | Keys.Shift | Keys.S;
        menuSaveImage.Click += MenuSaveImage_Click;
        menuSaveCsv.Click += MenuSaveCsv_Click;
        menuExit.Click += MenuExit_Click;
        menuDownloadSample.Click += MenuDownloadSample_Click;
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
        Resize += (_, _) => ApplyResponsiveLayout();
        ClientSizeChanged += (_, _) => ApplyResponsiveLayout();
    }

    private void EnsureZoomPanels()
    {
        _inputScrollPanel = CreateImageScrollPanel();
        _outputScrollPanel = CreateImageScrollPanel();

        Controls.Add(_inputScrollPanel);
        Controls.Add(_outputScrollPanel);
        _inputScrollPanel.BringToFront();
        _outputScrollPanel.BringToFront();

        _inputScrollPanel.Controls.Add(picInput);
        _outputScrollPanel.Controls.Add(picOutput);
        picInput.Anchor = AnchorStyles.Top | AnchorStyles.Left;
        picOutput.Anchor = AnchorStyles.Top | AnchorStyles.Left;
        picInput.BorderStyle = BorderStyle.None;
        picOutput.BorderStyle = BorderStyle.None;
        picInput.MouseWheel += (_, e) => ChangeZoom(isInput: true, e.Delta > 0);
        picOutput.MouseWheel += (_, e) => ChangeZoom(isInput: false, e.Delta > 0);
        picInput.MouseEnter += (_, _) => _inputScrollPanel.Focus();
        picOutput.MouseEnter += (_, _) => _outputScrollPanel.Focus();

        picInput.Location = Point.Empty;
        picOutput.Location = Point.Empty;
    }

    private Panel CreateImageScrollPanel()
    {
        var p = new Panel
        {
            AutoScroll = true,
            BorderStyle = BorderStyle.Fixed3D,
            BackColor = Color.FromArgb(32, 32, 36),
            TabStop = true,
        };
        p.MouseWheel += ImagePanel_MouseWheel;
        p.MouseEnter += (_, _) => p.Focus();
        return p;
    }

    private void ApplyResponsiveLayout()
    {
        var availableWidth = ClientSize.Width - (OuterPadding * 2);
        var splitWidth = Math.Max(180, (availableWidth - PreviewGap) / 2);
        var rightX = PreviewLeft + splitWidth + PreviewGap;
        var bottomY = ClientSize.Height - OuterPadding;

        lblPreviewInTitle.Location = new Point(PreviewLeft, PreviewTitleY);
        lblPreviewOutTitle.Location = new Point(rightX, PreviewTitleY);
        lblInputZoomValue.Location = new Point(PreviewLeft + splitWidth - ZoomButtonWidth - ZoomBadgeWidth - 6, PreviewTitleY - 1);
        lblOutputZoomValue.Location = new Point(rightX + (availableWidth - splitWidth - PreviewGap) - ZoomButtonWidth - ZoomBadgeWidth - 6, PreviewTitleY - 1);
        btnResetInputZoom.Location = new Point(PreviewLeft + splitWidth - ZoomButtonWidth, PreviewTitleY - 2);
        btnResetOutputZoom.Location = new Point(rightX + (availableWidth - splitWidth - PreviewGap) - ZoomButtonWidth, PreviewTitleY - 2);

        var listHeight = Math.Max(96, listDetections.Height);
        var listTop = Math.Max(PreviewTop + 140, bottomY - listHeight);
        listDetections.Location = new Point(PreviewLeft, listTop);
        listDetections.Size = new Size(availableWidth, bottomY - listTop);

        var previewBottom = listTop - ListTopGap;
        var previewHeight = Math.Max(120, previewBottom - PreviewTop);
        if (_inputScrollPanel != null)
        {
            _inputScrollPanel.Location = new Point(PreviewLeft, PreviewTop);
            _inputScrollPanel.Size = new Size(splitWidth, previewHeight);
        }

        if (_outputScrollPanel != null)
        {
            _outputScrollPanel.Location = new Point(rightX, PreviewTop);
            _outputScrollPanel.Size = new Size(availableWidth - splitWidth - PreviewGap, previewHeight);
        }

        UpdateZoomLayout(picInput, _inputScrollPanel, _inputZoom);
        UpdateZoomLayout(picOutput, _outputScrollPanel, _outputZoom);
    }

    private void ImagePanel_MouseWheel(object? sender, MouseEventArgs e)
    {
        if (sender is not Panel panel)
            return;

        if (panel == _inputScrollPanel)
            ChangeZoom(isInput: true, e.Delta > 0);
        else if (panel == _outputScrollPanel)
            ChangeZoom(isInput: false, e.Delta > 0);
    }

    private void ChangeZoom(bool isInput, bool zoomIn)
    {
        if (isInput)
        {
            _inputZoom = Math.Clamp(_inputZoom * (zoomIn ? ZoomStep : 1f / ZoomStep), MinZoom, MaxZoom);
            UpdateZoomLayout(picInput, _inputScrollPanel, _inputZoom);
            UpdateZoomText(isInput: true);
        }
        else
        {
            _outputZoom = Math.Clamp(_outputZoom * (zoomIn ? ZoomStep : 1f / ZoomStep), MinZoom, MaxZoom);
            UpdateZoomLayout(picOutput, _outputScrollPanel, _outputZoom);
            UpdateZoomText(isInput: false);
        }
    }

    private static void UpdateZoomLayout(PictureBox pic, Panel? panel, float zoom)
    {
        if (panel == null || pic.Image == null)
            return;

        var imgW = pic.Image.Width;
        var imgH = pic.Image.Height;
        if (imgW <= 0 || imgH <= 0)
            return;

        var cw = Math.Max(1, panel.ClientSize.Width);
        var ch = Math.Max(1, panel.ClientSize.Height);
        var fit = Math.Min((float)cw / imgW, (float)ch / imgH);
        var scale = fit * zoom;
        var drawW = Math.Max(1, (int)Math.Round(imgW * scale));
        var drawH = Math.Max(1, (int)Math.Round(imgH * scale));

        pic.SizeMode = PictureBoxSizeMode.StretchImage;
        pic.Size = new Size(drawW, drawH);

        if (zoom <= 1.0001f)
        {
            panel.AutoScroll = false;
            panel.AutoScrollMinSize = Size.Empty;
            var x = Math.Max(0, (cw - drawW) / 2);
            var y = Math.Max(0, (ch - drawH) / 2);
            pic.Location = new Point(x, y);
        }
        else
        {
            panel.AutoScroll = true;
            panel.AutoScrollMinSize = new Size(drawW, drawH);
            pic.Location = Point.Empty;
        }
    }

    private void ResetZoom(bool isInput)
    {
        if (isInput)
        {
            _inputZoom = 1f;
            UpdateZoomLayout(picInput, _inputScrollPanel, _inputZoom);
            UpdateZoomText(isInput: true);
        }
        else
        {
            _outputZoom = 1f;
            UpdateZoomLayout(picOutput, _outputScrollPanel, _outputZoom);
            UpdateZoomText(isInput: false);
        }
    }

    private void UpdateZoomText(bool isInput)
    {
        if (isInput)
            lblInputZoomValue.Text = $"{Math.Round(_inputZoom * 100):0}%";
        else
            lblOutputZoomValue.Text = $"{Math.Round(_outputZoom * 100):0}%";
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
            $"· 클래스: {BrainCtInferenceDefaults.RecommendedClassLabelsComma} (brain-tumor.yaml 순서)\n\n" +
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
        listDetections.Columns.Add("유형", 160);
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
        using var dlg = new OpenFileDialog
        {
            Title = "YOLO26 ONNX 모델 선택 (검출 또는 세그)",
            Filter = "ONNX|*.onnx|모든 파일|*.*",
            CheckFileExists = true,
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
        using var dlg = new OpenFileDialog
        {
            Title = "뇌 CT 이미지 선택",
            Filter = "이미지|*.png;*.jpg;*.jpeg;*.bmp|모든 파일|*.*",
            CheckFileExists = true,
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
            listDetections.Items.Clear();
            SetSaveCommandsEnabled(false);
            _lastDetections = null;
            _lastInputImagePath = null;
            lblSlicePath.Text = "불러온 이미지가 없습니다.";

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
            return false;
        }
    }

    private async void MenuDownloadSample_Click(object? sender, EventArgs e)
    {
        var explain =
            "Ultralytics 뇌 종양 데이터셋 샘플 슬라이스(CT/MRI 스타일) 이미지 한 장을 받습니다.\n" +
            "ONNX 모델은 포함되지 않습니다. YOLO26n-seg를 뇌 CT(또는 세그 라벨이 있는 데이터)로 학습한 뒤 ONNX로보내 주세요.\n" +
            "클래스란에는 brain-tumor.yaml 순서대로 negative,positive 가 채워집니다.\n" +
            "저장 위치: 로컬 앱 데이터 폴더의 samples입니다.\n\n" +
            "계속할까요?";
        if (MessageBox.Show(this, explain, "뇌 CT 샘플 이미지 다운로드", MessageBoxButtons.YesNo, MessageBoxIcon.Question) !=
            DialogResult.Yes)
            return;

        menuTools.Enabled = false;
        UseWaitCursor = true;
        var progress = new Progress<string>(s => lblStatus.Text = s);
        try
        {
            var result = await SampleAssetsDownloader.DownloadBrainCtSampleAsync(progress, CancellationToken.None)
                .ConfigureAwait(true);

            txtLabels.Text = result.SuggestedLabelsComma;

            if (!TryLoadInputImageFromPath(result.ImagePath, out var imgErr))
            {
                MessageBox.Show(this,
                    "샘플 이미지를 열지 못했습니다.\n" + imgErr,
                    "이미지", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }

            lblStatus.Text =
                $"다운로드 완료 · 샘플: {Path.GetFileName(result.ImagePath)} · 클래스: {result.SuggestedLabelsComma}";
            MessageBox.Show(this,
                $"다운로드가 끝났습니다.\n\n이미지:\n{result.ImagePath}\n\n" +
                "ONNX는 메뉴의 PyTorch→ONNX 변환 또는 Python 스크립트로보낸 brain CT 세그 모델을 선택하세요.",
                "완료",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "다운로드 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
            lblStatus.Text = "다운로드 오류";
        }
        finally
        {
            UseWaitCursor = false;
            menuTools.Enabled = true;
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
            FileName = "brain.onnx",
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
                    "변환이 완료되었습니다. 이 ONNX를 지금 모델로 불러올까요?\n\n(클래스 이름은 학습 데이터 순서에 맞게 직접 입력하세요.)",
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
        if (labels.Count == 0)
        {
            labels = BrainCtInferenceDefaults.RecommendedClassLabelsComma
                .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                .ToList();
        }

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
        SetInferenceProgressUi(true, "추론 중 — ONNX 세션 준비 및 검출 실행…");

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
                $"{_session!.ExecutionProviderSummary} · 모델 {modelName} · conf {conf:0.##} · labels [{labelsSummary}] · 인스턴스 {dets.Count}건";

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
        progressInference.Visible = active;
        progressInference.Style = ProgressBarStyle.Marquee;
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
            ? "brain_ct_detect"
            : Path.GetFileNameWithoutExtension(_lastInputImagePath) + "_yolo";

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
            MessageBox.Show(this, "저장할 인스턴스 목록이 없습니다. 먼저 추론을 실행하세요.", "저장",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var dlg = new SaveFileDialog
        {
            Title = "인스턴스 목록 CSV 저장",
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
        return raw.Where(s => s.Length > 0).ToList();
    }

    private void InvalidateSession()
    {
        _session?.Dispose();
        _session = null;
        _lastSessionKey = null;
    }

    private void EnsureSession(IReadOnlyList<string> labels)
    {
        var key = _modelPath + "\0" + string.Join(",", labels);
        if (_session != null && _lastSessionKey == key)
            return;

        InvalidateSession();
        _session = new BrainYolo26Session(_modelPath!, labels);
        _lastSessionKey = key;
    }
}

}
