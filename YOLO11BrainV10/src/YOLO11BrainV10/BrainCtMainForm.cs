using System.Diagnostics;
using System.Globalization;
using System.Drawing.Imaging;
using System.ComponentModel;
using YOLO11BrainV10.Dialogs;
using YOLO11BrainV10.Inference;
using YOLO11BrainV10.Services;

namespace YOLO11BrainV10
{

public partial class BrainCtMainForm : Form
{
    private BrainYolo11Session? _session;
    private string? _modelPath;
    private string? _lastSessionKey;
    private IReadOnlyList<BrainDetection>? _lastDetections;
    private string? _lastInputImagePath;
    private bool _loadingConfidencePrefs;
    private bool _syncingConfidenceUi;

    public BrainCtMainForm()
    {
        InitializeComponent();
        if (IsDesignTime())
            return;
        WireFormEvents();
        ApplySavedConfidenceFromPreferences();
        SetupDetectionListViewColumns();
        SetSaveCommandsEnabled(false);
    }

    private static bool IsDesignTime() => LicenseManager.UsageMode == LicenseUsageMode.Designtime;

    /// <summary>확대된 클라이언트 영역에 맞춰 미리보기·목록·경로 라벨 너비를 조정합니다.</summary>
    private void AdjustResponsiveLayout()
    {
        if (!IsHandleCreated || IsDisposed || Disposing || WindowState == FormWindowState.Minimized)
            return;
        if (viewerInput is null || viewerOutput is null || listDetections is null || txtLabels is null || lblStatus is null || lblPreviewOutTitle is null || lblSlicePath is null)
            return;
        if (viewerInput.IsDisposed || viewerOutput.IsDisposed || listDetections.IsDisposed)
            return;

        const int margin = 12;
        const int previewTop = 236;
        const int gapBetweenViewers = 12;
        const int listHeight = 168;
        var w = ClientSize.Width;
        var h = ClientSize.Height;
        if (w < MinimumSize.Width || h < MinimumSize.Height)
            return;

        var listTop = h - margin - listHeight;
        var previewHeight = Math.Max(80, listTop - margin - previewTop);
        var innerW = w - 2 * margin;
        var half = Math.Max(120, (innerW - gapBetweenViewers) / 2);

        try
        {
            SuspendLayout();
            txtLabels.Width = Math.Max(200, innerW);
            lblStatus.Width = innerW;
            listDetections.SetBounds(margin, listTop, innerW, listHeight);
            viewerInput.SetBounds(margin, previewTop, half, previewHeight);
            viewerOutput.SetBounds(margin + half + gapBetweenViewers, previewTop, half, previewHeight);
            lblPreviewOutTitle.Left = margin + half + gapBetweenViewers;
            if (w > 580)
                lblSlicePath.Width = Math.Max(80, w - 559 - margin);
        }
        finally
        {
            ResumeLayout(performLayout: true);
        }
    }

    private void WireFormEvents()
    {
        menuSaveImage.ShortcutKeys = Keys.Control | Keys.S;
        menuSaveCsv.ShortcutKeys = Keys.Control | Keys.Shift | Keys.S;
        menuSaveImage.Click += MenuSaveImage_Click;
        menuSaveCsv.Click += MenuSaveCsv_Click;
        menuSaveInputSlice.Click += MenuSaveInputSlice_Click;
        menuSaveModelCopy.Click += MenuSaveModelCopy_Click;
        menuFile.DropDownOpening += MenuFile_DropDownOpening;
        menuExit.Click += MenuExit_Click;
        menuDownloadSample.Click += MenuDownloadSample_Click;
        menuConvertPt.Click += MenuConvertPt_Click;
        menuOpenSampleFolder.Click += MenuOpenSampleFolder_Click;
        menuSetSampleFolder.Click += MenuSetSampleFolder_Click;
        menuOpenModelsFolder.Click += MenuOpenModelsFolder_Click;
        menuRecommendedDefaults.Click += MenuRecommendedDefaults_Click;
        Load += (_, _) => AdjustResponsiveLayout();
        Resize += (_, _) => AdjustResponsiveLayout();
        btnModel.Click += BtnModel_Click;
        btnImage.Click += BtnImage_Click;
        btnAnalyze.Click += BtnAnalyze_Click;
        btnSave.Click += BtnSave_Click;
        btnSaveCsv.Click += BtnSaveCsv_Click;
        listDetections.SelectedIndexChanged += ListDetections_SelectedIndexChanged;
        numConf.ValueChanged += ConfidenceUi_ValueChanged;
        trackConf.ValueChanged += TrackConf_ValueChanged;
    }

    private void ApplySavedConfidenceFromPreferences()
    {
        _loadingConfidencePrefs = true;
        try
        {
            var prefs = UserPreferences.Load();
            var conf = prefs.SegmentationMinConfidence is >= 0.01 and <= 1.0
                ? prefs.SegmentationMinConfidence.Value
                : BrainCtInferenceDefaults.RecommendedMinConfidence;
            var v = (decimal)Math.Round(conf, 2, MidpointRounding.AwayFromZero);
            v = Math.Clamp(v, numConf.Minimum, numConf.Maximum);
            numConf.Value = v;
            SyncTrackBarFromNumeric();
        }
        finally
        {
            _loadingConfidencePrefs = false;
        }
    }

    private void MenuRecommendedDefaults_Click(object? sender, EventArgs e)
    {
        var explain =
            "다음 권장값을 적용합니다.\n\n" +
            $"· 신뢰 수준(최소): {BrainCtInferenceDefaults.RecommendedMinConfidence:0.##} (YOLO predict 기본)\n" +
            $"· 클래스: {BrainCtInferenceDefaults.RecommendedClassLabelsComma} (brain-tumor.yaml 순서)\n\n" +
            "설정은 저장되어 다음 실행에도 유지됩니다. 계속할까요?";
        if (MessageBox.Show(this, explain, "추천 기본값", MessageBoxButtons.YesNo, MessageBoxIcon.Question) !=
            DialogResult.Yes)
            return;

        _loadingConfidencePrefs = true;
        try
        {
            txtLabels.Text = BrainCtInferenceDefaults.RecommendedClassLabelsComma;
            var dec = (decimal)BrainCtInferenceDefaults.RecommendedMinConfidence;
            dec = Math.Round(dec, 2, MidpointRounding.AwayFromZero);
            dec = Math.Clamp(dec, numConf.Minimum, numConf.Maximum);
            numConf.Value = dec;
            SyncTrackBarFromNumeric();
        }
        finally
        {
            _loadingConfidencePrefs = false;
        }

        var prefs = UserPreferences.Load();
        prefs.SegmentationMinConfidence = BrainCtInferenceDefaults.RecommendedMinConfidence;
        prefs.Save();
        InvalidateSession();
        lblStatus.Text =
            $"추천 기본값 적용됨 · 신뢰 {BrainCtInferenceDefaults.RecommendedMinConfidence:0.##} · 클래스 {BrainCtInferenceDefaults.RecommendedClassLabelsComma}";
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
        PersistConfidencePreference();
    }

    private void TrackConf_ValueChanged(object? sender, EventArgs e)
    {
        if (_syncingConfidenceUi)
            return;
        SyncNumericFromTrackBar();
        PersistConfidencePreference();
    }

    private void PersistConfidencePreference()
    {
        if (_loadingConfidencePrefs)
            return;
        var prefs = UserPreferences.Load();
        prefs.SegmentationMinConfidence = (double)numConf.Value;
        prefs.Save();
    }

    private void SetupDetectionListViewColumns()
    {
        listDetections.Columns.Clear();
        listDetections.Columns.Add("#", 44);
        listDetections.Columns.Add("유형", 160);
        listDetections.Columns.Add("마스크", 56);
        listDetections.Columns.Add("신뢰도", 88);
        listDetections.Columns.Add("Left", 72);
        listDetections.Columns.Add("Top", 72);
        listDetections.Columns.Add("Width", 72);
        listDetections.Columns.Add("Height", 72);
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        viewerInput.Image = null;
        viewerOutput.Image = null;
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
            Title = "YOLO11 세그/검출 ONNX 모델 선택",
            Filter = "ONNX|*.onnx|모든 파일|*.*",
            CheckFileExists = true,
            InitialDirectory = AppDataPaths.GetModelsDirectory(),
        };
        if (dlg.ShowDialog(this) != DialogResult.OK)
            return;

        _modelPath = ModelAssetStorage.EnsureCopyInModelsDirectory(dlg.FileName);
        InvalidateSession();
        lblOnnxPath.Text = _modelPath;
        lblStatus.Text = $"모델을 불러왔습니다: {_modelPath}";
    }

    private void BtnImage_Click(object? sender, EventArgs e)
    {
        using var dlg = new OpenFileDialog
        {
            Title = "뇌 CT 슬라이스 선택 (PNG·DICOM 등)",
            Filter = "이미지·DICOM|*.png;*.jpg;*.jpeg;*.bmp;*.tif;*.tiff;*.dcm;*.dic;*.dicom|PNG|*.png|JPEG|*.jpg;*.jpeg|BMP|*.bmp|DICOM|*.dcm;*.dic;*.dicom|모든 파일|*.*",
            CheckFileExists = true,
            InitialDirectory = AppDataPaths.GetCtDataDirectory(),
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
        if (viewerInput is null || viewerOutput is null || listDetections is null || lblSlicePath is null || lblStatus is null)
        {
            error = "화면 컨트롤이 아직 준비되지 않았습니다. 앱을 다시 열어 주세요.";
            return false;
        }
        if (viewerInput.IsDisposed || viewerOutput.IsDisposed || listDetections.IsDisposed)
        {
            error = "화면이 종료 중이라 이미지를 불러올 수 없습니다.";
            return false;
        }
        try
        {
            viewerInput.Image = null;
            viewerOutput.Image = null;
            listDetections.Items.Clear();
            SetSaveCommandsEnabled(false);
            _lastDetections = null;
            _lastInputImagePath = null;
            lblSlicePath.Text = "불러온 이미지가 없습니다.";

            if (!BrainCtSliceLoader.TryLoad(path, out var bmp, out var loadErr))
            {
                error = loadErr ?? "이미지를 불러오지 못했습니다.";
                return false;
            }

            viewerInput.Image = bmp;
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
            "ONNX 모델은 포함되지 않습니다. YOLO11n-seg를 뇌 CT(또는 세그 라벨이 있는 데이터)로 학습한 뒤 ONNX로보내 주세요.\n" +
            "클래스란에는 brain-tumor.yaml 순서대로 negative,positive 가 채워집니다.\n" +
            "기본 저장 위치는 앱 data 폴더의 ct 하위입니다(%LocalAppData%\\YOLO11BrainV10\\data\\ct). 다음 단계에서 다른 폴더를 고를 수 있으며, 도구 메뉴에서 기본 폴더를 바꿀 수 있습니다.\n\n" +
            "계속할까요?";
        if (MessageBox.Show(this, explain, "뇌 CT 샘플 이미지 다운로드", MessageBoxButtons.YesNo, MessageBoxIcon.Question) !=
            DialogResult.Yes)
            return;

        using var fbd = new FolderBrowserDialog
        {
            Description = "CT 샘플 이미지와 ATTRIBUTION.txt를 저장할 data(CT) 폴더를 선택하세요.",
            // Some Windows/.NET 조합에서 true 시 대화상자 오류가 날 수 있어 본문 설명만 사용합니다.
            UseDescriptionForTitle = false,
            ShowNewFolderButton = true,
        };
        try
        {
            var start = AppDataPaths.GetCtDataDirectory();
            if (Directory.Exists(start))
                fbd.SelectedPath = start;
        }
        catch
        {
            // ignore invalid prefs path
        }

        DialogResult folderResult;
        try
        {
            folderResult = fbd.ShowDialog(this);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this,
                "폴더 선택 대화상자를 열 수 없습니다.\n\n" + ex.Message,
                "폴더 선택",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        if (folderResult != DialogResult.OK || string.IsNullOrWhiteSpace(fbd.SelectedPath))
            return;

        var destDir = fbd.SelectedPath;
        var prefs = UserPreferences.Load();
        prefs.SampleAssetsDirectory = destDir;
        prefs.Save();

        menuTools.Enabled = false;
        UseWaitCursor = true;
        var progress = new Progress<string>(s => lblStatus.Text = s);
        try
        {
            var result = await SampleAssetsDownloader.DownloadBrainCtSampleAsync(destDir, progress, CancellationToken.None)
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
            MessageBox.Show(this, TruncateForDialog(FormatExceptionDetail(ex), 5500), "다운로드 실패",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
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
        var script = Path.Combine(AppContext.BaseDirectory, "tools", "export_yolo11_brain_onnx.py");
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
                "Python을 찾지 못했습니다. PATH에 py 또는 python을 넣거나, 환경 변수 YOLO11_PYTHON에 python.exe 전체 경로를 지정하세요.\n\n" +
                "또한 pip install ultralytics 및 tools\\requirements-export.txt 내 패키지가 필요합니다.",
                "PyTorch→ONNX",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        var modelsDir = AppDataPaths.GetModelsDirectory();
        using var ofd = new OpenFileDialog
        {
            Title = "PyTorch 가중치 선택",
            Filter = "PyTorch|*.pt;*.pth|모든 파일|*.*",
            CheckFileExists = true,
            InitialDirectory = modelsDir,
        };
        if (ofd.ShowDialog(this) != DialogResult.OK)
            return;

        var weightsPath = ModelAssetStorage.EnsureCopyInModelsDirectory(ofd.FileName);

        using var sfd = new SaveFileDialog
        {
            Title = "ONNX 저장 위치 (기본: models 폴더)",
            Filter = "ONNX|*.onnx",
            FileName = "brain_seg.onnx",
            InitialDirectory = modelsDir,
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
                .RunExportAsync(py, script, weightsPath, sfd.FileName, opset, CancellationToken.None)
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

            var onnxPath = ModelAssetStorage.EnsureCopyInModelsDirectory(sfd.FileName);

            if (MessageBox.Show(this,
                    "변환이 완료되었습니다. 이 ONNX를 지금 모델로 불러올까요?\n\n(클래스 이름은 학습 데이터 순서에 맞게 직접 입력하세요.)",
                    "PyTorch→ONNX",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question) == DialogResult.Yes)
            {
                _modelPath = onnxPath;
                InvalidateSession();
                lblOnnxPath.Text = onnxPath;
            }

            lblStatus.Text = $"ONNX 변환 완료 · models: {onnxPath}";
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

    private void MenuSetSampleFolder_Click(object? sender, EventArgs e)
    {
        using var fbd = new FolderBrowserDialog
        {
            Description = "다운로드 CT 이미지를 저장할 기본 data 폴더를 선택하세요.",
            UseDescriptionForTitle = false,
            ShowNewFolderButton = true,
        };
        try
        {
            var start = AppDataPaths.GetCtDataDirectory();
            if (Directory.Exists(start))
                fbd.SelectedPath = start;
        }
        catch
        {
            // ignore
        }

        try
        {
            if (fbd.ShowDialog(this) != DialogResult.OK || string.IsNullOrWhiteSpace(fbd.SelectedPath))
                return;
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, "폴더 선택 대화상자를 열 수 없습니다.\n\n" + ex.Message, "폴더 선택",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var prefs = UserPreferences.Load();
        prefs.SampleAssetsDirectory = fbd.SelectedPath;
        prefs.Save();
        lblStatus.Text = $"CT data 기본 폴더: {fbd.SelectedPath}";
        MessageBox.Show(this,
            $"다음부터 CT 샘플 다운로드의 기본 폴더로 사용합니다.\n\n{fbd.SelectedPath}",
            "CT data 기본 폴더",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
    }

    private void MenuFile_DropDownOpening(object? sender, EventArgs e)
    {
        menuSaveInputSlice.Enabled = viewerInput.Image != null;
        menuSaveModelCopy.Enabled = !string.IsNullOrEmpty(_modelPath) && File.Exists(_modelPath);
    }

    private void MenuSaveInputSlice_Click(object? sender, EventArgs e)
    {
        if (viewerInput.Image == null)
        {
            MessageBox.Show(this, "저장할 입력 영상이 없습니다.", "입력 없음", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        try
        {
            if (!string.IsNullOrEmpty(_lastInputImagePath) && File.Exists(_lastInputImagePath))
            {
                var src = _lastInputImagePath;
                var ext = Path.GetExtension(src);
                using var sfd = new SaveFileDialog
                {
                    Title = "입력 영상 저장",
                    FileName = Path.GetFileName(src),
                    Filter = BuildSaveFilterForExtension(ext),
                    OverwritePrompt = true,
                };
                if (sfd.ShowDialog(this) != DialogResult.OK)
                    return;
                File.Copy(src, sfd.FileName, overwrite: true);
                lblStatus.Text = $"입력 영상 저장: {sfd.FileName}";
                return;
            }

            using var sfdBmp = new SaveFileDialog
            {
                Title = "입력 영상 저장 (PNG)",
                Filter = "PNG|*.png|BMP|*.bmp|JPEG|*.jpg;*.jpeg",
                FileName = "ct_slice.png",
                DefaultExt = "png",
                OverwritePrompt = true,
            };
            if (sfdBmp.ShowDialog(this) != DialogResult.OK)
                return;
            using var clone = new Bitmap(viewerInput.Image);
            SaveBitmapAs(clone, sfdBmp.FileName);
            lblStatus.Text = $"입력 영상 저장: {sfdBmp.FileName}";
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "저장 실패", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void MenuSaveModelCopy_Click(object? sender, EventArgs e)
    {
        if (string.IsNullOrEmpty(_modelPath) || !File.Exists(_modelPath))
        {
            MessageBox.Show(this, "선택된 ONNX 모델이 없습니다.", "모델 없음", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        try
        {
            using var sfd = new SaveFileDialog
            {
                Title = "ONNX 모델 복사",
                Filter = "ONNX|*.onnx|모든 파일|*.*",
                FileName = Path.GetFileName(_modelPath),
                InitialDirectory = AppDataPaths.GetModelsDirectory(),
                DefaultExt = "onnx",
                OverwritePrompt = true,
            };
            if (sfd.ShowDialog(this) != DialogResult.OK)
                return;
            if (string.Equals(Path.GetFullPath(_modelPath), Path.GetFullPath(sfd.FileName), StringComparison.OrdinalIgnoreCase))
            {
                MessageBox.Show(this, "원본과 같은 경로입니다.", "복사", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            File.Copy(_modelPath, sfd.FileName, overwrite: true);
            lblStatus.Text = $"ONNX 복사 완료: {sfd.FileName}";
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "복사 실패", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private static string BuildSaveFilterForExtension(string ext)
    {
        ext = ext.ToLowerInvariant();
        return ext switch
        {
            ".png" => "PNG|*.png|모든 파일|*.*",
            ".jpg" or ".jpeg" => "JPEG|*.jpg;*.jpeg|모든 파일|*.*",
            ".bmp" => "BMP|*.bmp|모든 파일|*.*",
            ".tif" or ".tiff" => "TIFF|*.tif;*.tiff|모든 파일|*.*",
            ".dcm" or ".dic" or ".dicom" => "DICOM|*.dcm;*.dic;*.dicom|모든 파일|*.*",
            _ => "모든 파일|*.*",
        };
    }

    private void MenuOpenSampleFolder_Click(object? sender, EventArgs e)
    {
        TryOpenFolderInExplorer(AppDataPaths.GetCtDataDirectory());
    }

    private void MenuOpenModelsFolder_Click(object? sender, EventArgs e)
    {
        TryOpenFolderInExplorer(AppDataPaths.GetModelsDirectory());
    }

    private void TryOpenFolderInExplorer(string dir)
    {
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
        if (viewerInput.Image == null)
        {
            MessageBox.Show(this, "뇌 CT 슬라이스 이미지를 먼저 불러오세요.", "입력 없음", MessageBoxButtons.OK, MessageBoxIcon.Information);
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
            MessageBox.Show(this, "클래스 이름을 쉼표로 하나 이상 입력하세요 (세그 모델 학습 시 data.yaml names 순서와 동일).", "클래스 이름",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        Bitmap? frame = null;
        try
        {
            frame = new Bitmap(viewerInput.Image);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "이미지 복사 실패", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        btnAnalyze.Enabled = false;
        btnModel.Enabled = false;
        btnImage.Enabled = false;
        lblStatus.Text = "추론 중…";

        try
        {
            EnsureSession(labels);
            var conf = (float)numConf.Value;

            var (annotated, dets) = await Task.Run(() => _session!.Detect(frame, conf)).ConfigureAwait(true);

            viewerOutput.SetImageKeepView(annotated);
            _lastDetections = dets;
            SetSaveCommandsEnabled(true);

            var mode = _session!.SupportsInstanceSegmentation ? "인스턴스 세그먼테이션" : "검출(박스)";
            lblStatus.Text = $"{_session.ExecutionProviderSummary} · {mode} · 인스턴스 {dets.Count}건";
            if (dets.Count == 0)
            {
                lblStatus.Text +=
                    " · 결과 없음: 신뢰도 슬라이더를 낮춰 보거나, 뇌 종양 데이터로 학습·보낸 ONNX인지·클래스 순서(data.yaml)가 맞는지 확인하세요.";
            }

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
                item.SubItems.Add(d.HasMask ? "예" : "—");
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
            frame?.Dispose();
            btnAnalyze.Enabled = true;
            btnModel.Enabled = true;
            btnImage.Enabled = true;
        }
    }

    private void BtnSave_Click(object? sender, EventArgs e) => TrySaveResultImage();

    private void BtnSaveCsv_Click(object? sender, EventArgs e) => TrySaveDetectionsCsv();

    private void MenuSaveImage_Click(object? sender, EventArgs e) => TrySaveResultImage();

    private void MenuSaveCsv_Click(object? sender, EventArgs e) => TrySaveDetectionsCsv();

    private void MenuExit_Click(object? sender, EventArgs e) => Close();

    private string SuggestedResultBaseName() =>
        string.IsNullOrEmpty(_lastInputImagePath)
            ? "brain_ct_seg"
            : Path.GetFileNameWithoutExtension(_lastInputImagePath) + "_seg";

    private void TrySaveResultImage()
    {
        if (viewerOutput.Image == null)
        {
            MessageBox.Show(this, "저장할 결과 이미지가 없습니다. 먼저 추론을 실행하세요.", "저장",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var dlg = new SaveFileDialog
        {
            Title = "세그/검출 결과 이미지 저장",
            Filter = "PNG|*.png|JPEG|*.jpg;*.jpeg|BMP|*.bmp",
            FileName = SuggestedResultBaseName() + ".png",
            DefaultExt = "png",
            OverwritePrompt = true,
        };
        if (dlg.ShowDialog(this) != DialogResult.OK)
            return;

        try
        {
            using var clone = new Bitmap(viewerOutput.Image);
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
        sw.WriteLine("index,label,has_mask,confidence,left,top,width,height,right,bottom");
        for (var i = 0; i < dets.Count; i++)
        {
            var d = dets[i];
            var inv = CultureInfo.InvariantCulture;
            sw.WriteLine(string.Join(",",
                (i + 1).ToString(inv),
                EscapeCsv(d.Label),
                d.HasMask ? "1" : "0",
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

    private static string FormatExceptionDetail(Exception ex)
    {
        var lines = new List<string>();
        for (var e = ex; e != null; e = e.InnerException)
            lines.Add(e.Message);
        return string.Join(Environment.NewLine + "→ ", lines);
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
        var maskNote = d.HasMask ? "마스크 오버레이 있음" : "박스만";
        lblStatus.Text =
            $"선택 #{idx + 1}: {d.Label} ({maskNote}, 신뢰도 {d.Confidence:0.###}) · " +
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
        _session = new BrainYolo11Session(_modelPath!, labels);
        _lastSessionKey = key;
    }
}

}
