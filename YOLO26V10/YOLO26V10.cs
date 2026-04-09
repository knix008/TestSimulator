using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using OpenCvSharp;
using YOLO26V10.Segmentation;

namespace YOLO26V10
{
    public partial class YOLO26V10 : Form
    {
        private Yolo26SegmentationSession _session;
        private string _loadedModelVariant;
        private string _onnxPath;
        private CancellationTokenSource _videoCts;
        private ManualResetEventSlim _videoPlaybackGate;
        private readonly object _videoGateLock = new object();
        private readonly object _sessionLock = new object();
        private static readonly object OutputIsPlaceholder = new object();
        private string _lastImageSourcePath;
        private bool _suppressModelSelectionChanged;
        private volatile bool _isClosing;

        public YOLO26V10()
        {
            InitializeComponent();
            _suppressModelSelectionChanged = true;
            btnVideoPause.Image = VideoTransportIcons.Pause;
            btnVideoResume.Image = VideoTransportIcons.Play;
            btnStopVideo.Image = VideoTransportIcons.Stop;
            btnVideoPause.AccessibleName = "일시정지";
            btnVideoResume.AccessibleName = "재개";
            btnStopVideo.AccessibleName = "중지";
            comboModel.Items.Clear();
            foreach (var c in Yolo26SegModelChoice.All)
                comboModel.Items.Add(c);
            comboModel.SelectedIndex = 0;
            _suppressModelSelectionChanged = false;
            Load += YOLO26V10_Load;
            Resize += (_, __) => LayoutTopBar();
            progressVideo.Minimum = 0;
            progressVideo.Maximum = 100;
            progressVideo.Value = 0;
            progressVideo.Style = ProgressBarStyle.Continuous;
            btnVideo.Enabled = false;
            btnImage.Enabled = false;
            SetPicture(
                picInput,
                PreviewPlaceholders.Create("원본", "이미지 또는 동영상을 불러오면 이 영역에 표시됩니다."));
            SetOutputPicture(PreviewPlaceholders.Create("결과", "세그멘테이션 결과가 이 영역에 표시됩니다."), true);
            ApplyUiTheme();
        }

        private void ApplyUiTheme()
        {
            Font = UiTheme.UiFont(9f);
            BackColor = UiTheme.Surface;
            ForeColor = UiTheme.TextPrimary;

            UiTheme.StylePrimaryButton(btnPrepareModel);
            UiTheme.StyleSecondaryButton(btnImage);
            UiTheme.StyleSecondaryButton(btnVideo);
            UiTheme.StyleSecondaryButton(btnPlayResult);
            UiTheme.StyleSecondaryButton(btnSaveResultImage);
            UiTheme.StyleTransportButton(btnVideoPause);
            UiTheme.StyleTransportButton(btnVideoResume);
            UiTheme.StyleTransportButton(btnStopVideo);

            lblStatus.BackColor = UiTheme.PanelHeader;
            lblStatus.ForeColor = UiTheme.TextPrimary;
            lblStatus.AutoEllipsis = true;
            lblFilter.ForeColor = UiTheme.TextSecondary;
            lblConf.ForeColor = UiTheme.TextSecondary;
            lblVideoControls.ForeColor = UiTheme.TextSecondary;
            lblVideoProgressTime.ForeColor = UiTheme.TextSecondary;
            lblVideoProgressTime.Font = UiTheme.UiFont(8.25f);

            lblInputCaption.BackColor = UiTheme.PanelHeader;
            lblInputCaption.ForeColor = UiTheme.TextSecondary;
            lblInputCaption.Font = UiTheme.UiFontBold(8.5f);
            lblOutputCaption.BackColor = UiTheme.PanelHeader;
            lblOutputCaption.ForeColor = UiTheme.TextSecondary;
            lblOutputCaption.Font = UiTheme.UiFontBold(8.5f);

            splitMain.BackColor = UiTheme.BorderSubtle;
            splitMain.Panel1.BackColor = UiTheme.Canvas;
            splitMain.Panel2.BackColor = UiTheme.Canvas;

            txtLog.BackColor = UiTheme.LogBack;
            txtLog.ForeColor = UiTheme.TextPrimary;
            try
            {
                txtLog.Font = new Font("Consolas", 9f, FontStyle.Regular, GraphicsUnit.Point);
            }
            catch
            {
                txtLog.Font = UiTheme.UiFont(8.5f);
            }

            comboModel.FlatStyle = FlatStyle.Flat;
            txtClassFilter.BorderStyle = BorderStyle.FixedSingle;
        }

        private void YOLO26V10_Load(object sender, EventArgs e)
        {
            LayoutTopBar();
        }

        private void LayoutTopBar()
        {
            if (!IsHandleCreated)
                return;
            var pad = 12;
            var gap = 8;
            btnPrepareModel.Left = ClientSize.Width - pad - btnPrepareModel.Width;
            comboModel.Width = Math.Max(280, btnPrepareModel.Left - comboModel.Left - gap);
            btnPlayResult.Left = btnPrepareModel.Left - gap - btnPlayResult.Width;
            btnSaveResultImage.Left = btnPlayResult.Left - gap - btnSaveResultImage.Width;
            btnImage.Left = btnSaveResultImage.Left - gap - btnImage.Width;
            btnVideo.Left = btnImage.Left - gap - btnVideo.Width;
        }

        private string SelectedModelVariant =>
            comboModel.SelectedItem is Yolo26SegModelChoice m ? m.Variant : "n";

        private void YOLO26V10_Shown(object sender, EventArgs e)
        {
            Yolo26ModelPreparer.EnsureModelDirectoryExists();
            Log("모델 저장 폴더: " + Yolo26ModelPreparer.ModelDirectory);
            var variant = SelectedModelVariant;
            var onnxPath = Yolo26ModelPreparer.GetOnnxPath(variant);
            if (File.Exists(onnxPath))
            {
                try
                {
                    LoadSessionFromOnnx(variant);
                    Log("시작 시 모델을 불러왔습니다.");
                }
                catch (Exception ex)
                {
                    Log("모델 로드 실패: " + ex.Message);
                    MessageBox.Show(this, ex.Message, "모델 로드", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }

                return;
            }

            using (var dlg = new ModelDownloadDialog(variant))
            {
                if (dlg.ShowDialog(this) != DialogResult.OK)
                {
                    Log("시작 시 모델 다운로드를 건너뛰었습니다. 필요할 때 [모델 준비]를 누르세요.");
                    return;
                }

                variant = dlg.SelectedVariant;
                SelectComboVariant(variant);
                try
                {
                    LoadSessionFromOnnx(variant);
                    Log("모델 준비가 완료되어 세션을 불러왔습니다.");
                }
                catch (Exception ex)
                {
                    Log("모델 로드 실패: " + ex.Message);
                    MessageBox.Show(this, ex.Message, "모델 로드", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            }
        }

        private void SelectComboVariant(string variant)
        {
            _suppressModelSelectionChanged = true;
            for (var i = 0; i < comboModel.Items.Count; i++)
            {
                if (comboModel.Items[i] is Yolo26SegModelChoice ch && ch.Variant == variant)
                {
                    comboModel.SelectedIndex = i;
                    _suppressModelSelectionChanged = false;
                    return;
                }
            }

            _suppressModelSelectionChanged = false;
        }

        private void LoadSessionFromOnnx(string variant)
        {
            var path = Yolo26ModelPreparer.GetOnnxPath(variant);
            if (!File.Exists(path))
                throw new FileNotFoundException("ONNX 파일을 찾을 수 없습니다.", path);
            lock (_sessionLock)
            {
                _session?.Dispose();
                _session = new Yolo26SegmentationSession(path);
            }
            _loadedModelVariant = variant;
            _onnxPath = path;
            SetStatus($"ONNX 로드됨 [{_session.ExecutionProviderSummary}]: {_onnxPath}");
            Log($"실행 공급자: {_session.ExecutionProviderSummary}");
            if (IsHandleCreated)
            {
                btnVideo.Enabled = true;
                btnImage.Enabled = true;
            }
        }

        private async Task PrepareModelAsync(string variant, CancellationToken cancellationToken)
        {
            var progress = new Progress<string>(Log);
            await Yolo26ModelPreparer.EnsureOnnxModelAsync(
                    variant,
                    progress,
                    cancellationToken,
                    forceReexport: false)
                .ConfigureAwait(true);
            LoadSessionFromOnnx(variant);
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            _isClosing = true;
            _videoCts?.Cancel();
            _videoCts?.Dispose();
            ReleaseVideoPlaybackGate();
            lock (_sessionLock)
            {
                _session?.Dispose();
                _session = null;
            }
            base.OnFormClosed(e);
        }

        private void ReleaseVideoPlaybackGate()
        {
            lock (_videoGateLock)
            {
                _videoPlaybackGate?.Dispose();
                _videoPlaybackGate = null;
            }
        }

        private void Log(string line)
        {
            if (txtLog.InvokeRequired)
            {
                BeginInvoke(new Action(() => Log(line)));
                return;
            }

            txtLog.AppendText(line + Environment.NewLine);
        }

        private (Bitmap Rendered, List<SegInstance> Instances) RunSegmentationThreadSafe(
            Yolo26SegmentationSession session,
            Bitmap source,
            float conf,
            HashSet<int> allowed)
        {
            lock (_sessionLock)
            {
                if (_isClosing)
                    throw new OperationCanceledException("애플리케이션 종료 중입니다.");
                if (session == null)
                    throw new InvalidOperationException("세션이 초기화되지 않았습니다.");
                if (!ReferenceEquals(session, _session))
                    throw new OperationCanceledException("세션이 변경되었거나 해제되었습니다.");
                return session.RunSegmentation(source, conf, allowed);
            }
        }

        private void SetStatus(string text)
        {
            if (lblStatus.InvokeRequired)
            {
                BeginInvoke(new Action(() => SetStatus(text)));
                return;
            }

            lblStatus.Text = text;
        }

        private async void btnPrepareModel_Click(object sender, EventArgs e)
        {
            var variant = SelectedModelVariant;
            var onnxPath = Yolo26ModelPreparer.GetOnnxPath(variant);
            if (!File.Exists(onnxPath))
            {
                using (var dlg = new ModelDownloadDialog(variant))
                {
                    if (dlg.ShowDialog(this) != DialogResult.OK)
                    {
                        Log("모델 다운로드를 취소했습니다.");
                        return;
                    }

                    variant = dlg.SelectedVariant;
                    SelectComboVariant(variant);
                    try
                    {
                        LoadSessionFromOnnx(variant);
                        Log("모델 준비가 완료되어 세션을 불러왔습니다.");
                    }
                    catch (Exception ex)
                    {
                        Log("모델 로드 실패: " + ex.Message);
                        MessageBox.Show(this, ex.Message, "모델 로드", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    }
                }

                return;
            }

            btnPrepareModel.Enabled = false;
            comboModel.Enabled = false;
            try
            {
                await PrepareModelAsync(variant, CancellationToken.None).ConfigureAwait(true);
                Log("추론 세션 준비 완료.");
            }
            catch (Exception ex)
            {
                Log("오류: " + ex.Message);
                SetStatus("모델 준비 실패.");
                MessageBox.Show(this, ex.Message, "모델 준비", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            finally
            {
                btnPrepareModel.Enabled = true;
                comboModel.Enabled = true;
            }
        }

        private void comboModel_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (_suppressModelSelectionChanged || !IsHandleCreated)
                return;

            var selectedVariant = SelectedModelVariant;
            if (string.Equals(_loadedModelVariant, selectedVariant, StringComparison.OrdinalIgnoreCase))
                return;

            var selectedOnnx = Yolo26ModelPreparer.GetOnnxPath(selectedVariant);
            if (!File.Exists(selectedOnnx))
            {
                using (var dlg = new ModelDownloadDialog(selectedVariant))
                {
                    if (dlg.ShowDialog(this) != DialogResult.OK)
                    {
                        if (!string.IsNullOrEmpty(_loadedModelVariant))
                            SelectComboVariant(_loadedModelVariant);
                        return;
                    }

                    selectedVariant = dlg.SelectedVariant;
                    SelectComboVariant(selectedVariant);
                }
            }

            try
            {
                LoadSessionFromOnnx(selectedVariant);
                Log($"모델 변경: yolo26{selectedVariant}-seg");
            }
            catch (Exception ex)
            {
                Log("모델 변경 실패: " + ex.Message);
                MessageBox.Show(this, ex.Message, "모델 변경", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                if (!string.IsNullOrEmpty(_loadedModelVariant))
                    SelectComboVariant(_loadedModelVariant);
            }
        }

        private void btnImage_Click(object sender, EventArgs e)
        {
            if (_session == null)
            {
                MessageBox.Show(this, "먼저 '모델 준비'를 실행하세요.", "이미지", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            if (!Coco80.TryParseClassFilter(txtClassFilter.Text, out var allowed, out var ferr))
            {
                MessageBox.Show(this, ferr, "클래스 필터", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            using (var dlg = new OpenFileDialog())
            {
                dlg.Filter = "이미지|*.jpg;*.jpeg;*.png;*.bmp;*.webp|모든 파일|*.*";
                if (dlg.ShowDialog(this) != DialogResult.OK)
                    return;

                _lastImageSourcePath = dlg.FileName;
                try
                {
                    using (var src = new Bitmap(dlg.FileName))
                    {
                        SetPicture(picInput, new Bitmap(src));
                        var conf = (float)numConf.Value;
                        var (rendered, list) = RunSegmentationThreadSafe(_session, src, conf, allowed);
                        SetOutputPicture(rendered, false);
                        Log($"이미지 처리: {Path.GetFileName(dlg.FileName)} — 인스턴스 {list.Count}개");
                    }
                }
                catch (Exception ex)
                {
                    Log("이미지 오류: " + ex.Message);
                    MessageBox.Show(this, ex.Message, "이미지", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            }
        }

        private async void btnVideo_Click(object sender, EventArgs e)
        {
            if (_session == null)
            {
                MessageBox.Show(this, "먼저 '모델 준비'를 실행하세요.", "동영상", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            if (!Coco80.TryParseClassFilter(txtClassFilter.Text, out var allowed, out var ferr))
            {
                MessageBox.Show(this, ferr, "클래스 필터", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            using (var openDlg = new OpenFileDialog())
            {
                openDlg.Filter = "동영상|*.mp4;*.avi;*.mkv;*.mov;*.wmv|모든 파일|*.*";
                if (openDlg.ShowDialog(this) != DialogResult.OK)
                    return;

                var inputPath = openDlg.FileName;
                using (var saveDlg = new SaveFileDialog())
                {
                    saveDlg.Filter = "MP4|*.mp4|AVI|*.avi|모든 파일|*.*";
                    saveDlg.FileName = Path.GetFileNameWithoutExtension(inputPath) + "_seg.mp4";
                    saveDlg.Title = "세그멘테이션 결과 저장";
                    if (saveDlg.ShowDialog(this) != DialogResult.OK)
                        return;

                    var outputPath = saveDlg.FileName;
                    _videoCts?.Cancel();
                    _videoCts?.Dispose();
                    ReleaseVideoPlaybackGate();
                    _videoCts = new CancellationTokenSource();
                    lock (_videoGateLock)
                        _videoPlaybackGate = new ManualResetEventSlim(true);
                    var token = _videoCts.Token;
                    ManualResetEventSlim gate;
                    lock (_videoGateLock)
                        gate = _videoPlaybackGate;
                    var conf = (float)numConf.Value;
                    var sess = _session;

                    SetVideoProcessingUi(true);
                    ResetVideoProgressUi();
                    try
                    {
                        await Task.Run(
                                () => RunVideoLoop(inputPath, outputPath, sess, conf, allowed, token, gate),
                                token)
                            .ConfigureAwait(true);
                        if (!token.IsCancellationRequested)
                            Log($"동영상 저장 완료: {outputPath}");
                    }
                    catch (OperationCanceledException)
                    {
                        Log("동영상 처리가 중지되었습니다.");
                    }
                    catch (Exception ex)
                    {
                        Log("동영상 오류: " + ex.Message);
                        MessageBox.Show(this, ex.Message, "동영상", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    }
                    finally
                    {
                        EndVideoProcessingUi();
                    }
                }
            }
        }

        private async void btnPlayResult_Click(object sender, EventArgs e)
        {
            using (var openDlg = new OpenFileDialog())
            {
                openDlg.Filter = "동영상|*.mp4;*.avi;*.mkv;*.mov;*.wmv|모든 파일|*.*";
                openDlg.Title = "재생할 결과 동영상";
                if (openDlg.ShowDialog(this) != DialogResult.OK)
                    return;

                var path = openDlg.FileName;
                _videoCts?.Cancel();
                _videoCts?.Dispose();
                ReleaseVideoPlaybackGate();
                _videoCts = new CancellationTokenSource();
                lock (_videoGateLock)
                    _videoPlaybackGate = new ManualResetEventSlim(true);
                var token = _videoCts.Token;
                ManualResetEventSlim gate;
                lock (_videoGateLock)
                    gate = _videoPlaybackGate;

                SetVideoProcessingUi(true);
                ResetVideoProgressUi();
                try
                {
                    await Task.Run(() => RunPlaybackVideoLoop(path, token, gate), token).ConfigureAwait(true);
                    if (!token.IsCancellationRequested)
                        Log($"결과 재생 완료: {path}");
                }
                catch (OperationCanceledException)
                {
                    Log("결과 재생이 중지되었습니다.");
                }
                catch (Exception ex)
                {
                    Log("결과 재생 오류: " + ex.Message);
                    MessageBox.Show(this, ex.Message, "결과 재생", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
                finally
                {
                    EndVideoProcessingUi();
                }
            }
        }

        private void ResetVideoProgressUi()
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action(ResetVideoProgressUi));
                return;
            }

            progressVideo.Style = ProgressBarStyle.Continuous;
            progressVideo.Maximum = 100;
            progressVideo.Value = 0;
            lblVideoProgressTime.Text = "";
        }

        private void UpdateVideoProgress(int framesDone, int totalFrames, double fps, string statusExtra = null)
        {
            if (progressVideo.InvokeRequired)
            {
                BeginInvoke(new Action(() => UpdateVideoProgress(framesDone, totalFrames, fps, statusExtra)));
                return;
            }

            if (totalFrames > 0 && fps > 1e-6)
            {
                progressVideo.Style = ProgressBarStyle.Continuous;
                var max = Math.Max(totalFrames, 1);
                progressVideo.Maximum = max;
                progressVideo.Value = Math.Min(Math.Max(framesDone, 0), max);
                var curSec = framesDone / fps;
                var totalSec = totalFrames / fps;
                lblVideoProgressTime.Text =
                    $"{FormatVideoTime(curSec)} / {FormatVideoTime(totalSec)}  ·  프레임 {framesDone:N0} / {totalFrames:N0}";
            }
            else
            {
                progressVideo.Style = ProgressBarStyle.Marquee;
                progressVideo.MarqueeAnimationSpeed = 40;
                lblVideoProgressTime.Text =
                    string.IsNullOrEmpty(statusExtra)
                        ? $"프레임 {framesDone:N0} (총 길이·프레임 수를 컨테이너에서 읽지 못함)"
                        : $"프레임 {framesDone:N0} · {statusExtra}";
            }
        }

        private static string FormatVideoTime(double seconds)
        {
            if (double.IsNaN(seconds) || double.IsInfinity(seconds) || seconds < 0)
                seconds = 0;
            var t = TimeSpan.FromSeconds(seconds);
            if (t.TotalHours >= 1)
                return $"{(int)t.TotalHours}:{t.Minutes:D2}:{t.Seconds:D2}";
            return $"{(int)t.TotalMinutes}:{t.Seconds:D2}";
        }

        private void SetVideoProcessingUi(bool running)
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action(() => SetVideoProcessingUi(running)));
                return;
            }

            btnVideo.Enabled = !running && _session != null;
            btnPlayResult.Enabled = !running;
            btnImage.Enabled = !running && _session != null;
            btnPrepareModel.Enabled = !running;
            comboModel.Enabled = !running;
            numConf.Enabled = !running;
            txtClassFilter.Enabled = !running;
            if (running)
            {
                btnVideoPause.Enabled = true;
                btnVideoResume.Enabled = false;
                btnStopVideo.Enabled = true;
            }
            else
            {
                btnVideoPause.Enabled = false;
                btnVideoResume.Enabled = false;
                btnStopVideo.Enabled = false;
            }
        }

        private void EndVideoProcessingUi()
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action(EndVideoProcessingUi));
                return;
            }

            ReleaseVideoPlaybackGate();
            ResetVideoProgressUi();
            SetVideoProcessingUi(false);
        }

        private void btnVideoPause_Click(object sender, EventArgs e)
        {
            _videoPlaybackGate?.Reset();
            btnVideoPause.Enabled = false;
            btnVideoResume.Enabled = true;
        }

        private void btnVideoResume_Click(object sender, EventArgs e)
        {
            _videoPlaybackGate?.Set();
            btnVideoPause.Enabled = true;
            btnVideoResume.Enabled = false;
        }

        private static VideoWriter TryCreateVideoWriter(string path, double fps, OpenCvSharp.Size size)
        {
            var ext = (Path.GetExtension(path) ?? "").ToLowerInvariant();
            var codes = new List<(char a, char b, char c, char d)>();
            if (ext == ".mp4" || ext == ".m4v")
            {
                codes.Add(('m', 'p', '4', 'v'));
                codes.Add(('a', 'v', 'c', '1'));
            }
            else if (ext == ".avi")
            {
                codes.Add(('X', 'V', 'I', 'D'));
                codes.Add(('M', 'J', 'P', 'G'));
            }
            else
            {
                codes.Add(('m', 'p', '4', 'v'));
                codes.Add(('X', 'V', 'I', 'D'));
            }

            foreach (var t in codes)
            {
                var fourcc = VideoWriter.FourCC(t.a, t.b, t.c, t.d);
                var w = new VideoWriter(path, fourcc, fps, size);
                if (w.IsOpened())
                    return w;
                w.Dispose();
            }

            return null;
        }

        private void RunVideoLoop(
            string inputPath,
            string outputPath,
            Yolo26SegmentationSession session,
            float conf,
            HashSet<int> allowed,
            CancellationToken token,
            ManualResetEventSlim playbackGate)
        {
            using (var cap = new VideoCapture(inputPath))
            {
                if (!cap.IsOpened())
                    throw new InvalidOperationException("동영상을 열 수 없습니다.");

                var fps = cap.Fps;
                if (fps <= 1e-3 || fps > 240 || double.IsNaN(fps) || double.IsInfinity(fps))
                    fps = 25;
                var totalFrames = GetApproxFrameCount(cap);
                var size = new OpenCvSharp.Size(cap.FrameWidth, cap.FrameHeight);
                if (size.Width <= 0 || size.Height <= 0)
                    throw new InvalidOperationException("동영상 해상도를 읽을 수 없습니다.");

                UpdateVideoProgress(0, totalFrames, fps, Path.GetFileName(outputPath));
                BeginInvoke(new Action(() =>
                    SetStatus($"동영상 처리 중 (저장: {Path.GetFileName(outputPath)})")));

                using (var writer = TryCreateVideoWriter(outputPath, fps, size))
                {
                    if (writer == null)
                        throw new InvalidOperationException(
                            "결과 동영상 인코더를 열 수 없습니다. MP4 또는 AVI로 저장해 보세요.");

                    Mat frame = null;
                    var frameIndex = 0;
                    try
                    {
                        while (!token.IsCancellationRequested)
                        {
                            if (!TryWaitPlaybackGate(playbackGate, token))
                                break;
                            frame?.Dispose();
                            frame = new Mat();
                            if (!cap.Read(frame) || frame.Empty())
                                break;

                            using (var bm = MatBitmapUtil.ToBitmapBgr(frame))
                            {
                                var seg = RunSegmentationThreadSafe(session, bm, conf, allowed);
                                Bitmap renderedBmp = seg.Rendered;
                                try
                                {
                                    using (var matOut = MatBitmapUtil.BitmapToMatBgr(renderedBmp))
                                        writer.Write(matOut);
                                    var inClone = new Bitmap(bm);
                                    var outClone = new Bitmap(renderedBmp);
                                    BeginInvoke(new Action(() =>
                                    {
                                        SetPicture(picInput, inClone);
                                        SetOutputPicture(outClone, false);
                                    }));
                                }
                                finally
                                {
                                    renderedBmp.Dispose();
                                }
                            }

                            frameIndex++;
                            if (frameIndex % 2 == 0 || frameIndex == 1)
                                UpdateVideoProgress(frameIndex, totalFrames, fps, Path.GetFileName(outputPath));
                        }

                        if (!token.IsCancellationRequested && totalFrames > 0)
                            UpdateVideoProgress(totalFrames, totalFrames, fps, Path.GetFileName(outputPath));
                    }
                    finally
                    {
                        frame?.Dispose();
                    }
                }
            }
        }

        private void RunPlaybackVideoLoop(string path, CancellationToken token, ManualResetEventSlim playbackGate)
        {
            using (var cap = new VideoCapture(path))
            {
                if (!cap.IsOpened())
                    throw new InvalidOperationException("동영상을 열 수 없습니다.");

                var fps = cap.Fps;
                if (fps <= 1e-3 || fps > 240 || double.IsNaN(fps) || double.IsInfinity(fps))
                    fps = 25;
                var totalFrames = GetApproxFrameCount(cap);

                UpdateVideoProgress(0, totalFrames, fps, Path.GetFileName(path));
                BeginInvoke(new Action(() =>
                {
                    SetPicture(picInput, null);
                    SetStatus($"결과 재생: {Path.GetFileName(path)}");
                }));

                Mat frame = null;
                var frameIndex = 0;
                var sw = Stopwatch.StartNew();
                try
                {
                    while (!token.IsCancellationRequested)
                    {
                        if (!TryWaitPlaybackGate(playbackGate, token))
                            break;
                        frame?.Dispose();
                        frame = new Mat();
                        if (!cap.Read(frame) || frame.Empty())
                            break;

                        using (var bm = MatBitmapUtil.ToBitmapBgr(frame))
                        {
                            var outClone = new Bitmap(bm);
                            BeginInvoke(new Action(() => SetOutputPicture(outClone, false)));
                        }

                        frameIndex++;
                        if (frameIndex % 2 == 0 || frameIndex == 1)
                            UpdateVideoProgress(frameIndex, totalFrames, fps, Path.GetFileName(path));

                        if (fps > 1e-6)
                        {
                            var targetMs = frameIndex * (1000.0 / fps);
                            var delay = (int)(targetMs - sw.Elapsed.TotalMilliseconds);
                            if (delay > 0 && delay < 500)
                            {
                                try
                                {
                                    token.WaitHandle.WaitOne(delay);
                                }
                                catch (ObjectDisposedException)
                                {
                                    break;
                                }

                                if (token.IsCancellationRequested)
                                    break;
                            }
                        }
                    }

                    if (!token.IsCancellationRequested && totalFrames > 0)
                        UpdateVideoProgress(totalFrames, totalFrames, fps, Path.GetFileName(path));
                }
                finally
                {
                    frame?.Dispose();
                }
            }
        }

        private void btnStopVideo_Click(object sender, EventArgs e)
        {
            _videoCts?.Cancel();
        }

        /// <summary>
        /// <see cref="ManualResetEventSlim.Wait(CancellationToken)"/>은 취소 시 <see cref="OperationCanceledException"/>을 던져
        /// 디버거/로그에 노이즈가 생기므로, 취소면 false를 반환합니다.
        /// </summary>
        private static bool TryWaitPlaybackGate(ManualResetEventSlim gate, CancellationToken token)
        {
            try
            {
                gate?.Wait(token);
                return true;
            }
            catch (OperationCanceledException)
            {
                return false;
            }
        }

        private void SetOutputPicture(Image image, bool placeholder)
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action(() => SetOutputPicture(image, placeholder)));
                return;
            }

            SetPicture(picOutput, image);
            picOutput.Tag = placeholder ? OutputIsPlaceholder : null;
            btnSaveResultImage.Enabled = !placeholder && image != null;
        }

        private static void SetPicture(PictureBox box, Image bmp)
        {
            var old = box.Image;
            box.Image = bmp;
            old?.Dispose();
        }

        private void btnSaveResultImage_Click(object sender, EventArgs e)
        {
            if (ReferenceEquals(picOutput.Tag, OutputIsPlaceholder) || picOutput.Image == null)
            {
                MessageBox.Show(
                    this,
                    "저장할 결과 이미지가 없습니다. 이미지를 처리하거나 동영상·결과 재생으로 출력을 만든 뒤 다시 시도하세요.",
                    "결과 저장",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return;
            }

            if (!(picOutput.Image is Bitmap bmp))
            {
                MessageBox.Show(this, "현재 출력 형식을 저장할 수 없습니다.", "결과 저장", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            using (var dlg = new SaveFileDialog())
            {
                dlg.Title = "결과 이미지 저장";
                dlg.Filter =
                    "JPEG (*.jpg)|*.jpg|PNG (*.png)|*.png|Bitmap (*.bmp)|*.bmp|GIF (*.gif)|*.gif|TIFF (*.tif)|*.tif;*.tiff|모든 파일|*.*";
                dlg.DefaultExt = "jpg";
                dlg.AddExtension = true;
                dlg.FileName = string.IsNullOrEmpty(_lastImageSourcePath)
                    ? "segmentation_result.jpg"
                    : Path.GetFileNameWithoutExtension(_lastImageSourcePath) + "_seg.jpg";
                if (dlg.ShowDialog(this) != DialogResult.OK)
                    return;

                try
                {
                    using (var copy = new Bitmap(bmp))
                        ImageResultSaver.Save(copy, dlg.FileName);
                    Log("결과 이미지 저장: " + dlg.FileName);
                }
                catch (Exception ex)
                {
                    Log("결과 저장 오류: " + ex.Message);
                    MessageBox.Show(this, ex.Message, "결과 저장", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            }
        }

        private static int GetApproxFrameCount(VideoCapture cap)
        {
            var fc = cap.FrameCount;
            if (fc <= 0 || double.IsNaN(fc) || double.IsInfinity(fc))
                return 0;
            return (int)Math.Min(fc, int.MaxValue);
        }
    }
}

