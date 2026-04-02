using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using OpenCvSharp;
using OpenCvSharp.Extensions;

namespace Yolo26Detection1._0
{
    public partial class MainForm : Form
    {
        private readonly object _detectorLock = new object();
        private Yolo26OnnxDetector _detector;
        private string _loadedOnnxPath;
        private bool _modelLoadConfirmed;
        private bool _videoApplyInitialFitZoom;
        private bool _inApplyImageZoomLayout;
        private bool _isImageOutput;
        private bool _isPanningImage;
        private System.Drawing.Point _panStartScreen;
        private System.Drawing.Point _panStartScroll;
        private VideoCapture _playbackCapture;
        private Timer _playbackTimer;
        private bool _playbackFitOnFirstFrame;
        private bool _playbackUiUpdating;
        private bool _playbackSeekingByUser;
        private int _playbackTotalFrames;
        private double _playbackFps;
        private bool _playbackPaused;
        private string _lastPlaybackPath;
        private string _lastImageDetectionSourcePath;
        private bool _startupInitDone;

        public MainForm()
        {
            InitializeComponent();
            ApplyWindowIcon();
            var def = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "models", "yolo26n.onnx");
            if (File.Exists(def))
                txtOnnxPath.Text = def;
            numConf.Value = 0.50M;
            btnImage.Enabled = false;
            btnVideo.Enabled = false;
            lblZoomPct.Text = $"{trackBarZoom.Value}%";
            RefreshLoadButtonState();
            panelImageHost.Resize += PanelImageHost_Resize;
            pictureBox.MouseDown += PictureBox_MouseDown;
            pictureBox.MouseClick += PictureBox_MouseClick;
            pictureBox.DoubleClick += PictureBox_DoubleClick;
            pictureBox.MouseMove += PictureBox_MouseMove;
            pictureBox.MouseUp += PictureBox_MouseUp;
            pictureBox.MouseLeave += PictureBox_MouseLeave;
            trackPlayback.MouseDown += TrackPlayback_MouseDown;
            trackPlayback.MouseUp += TrackPlayback_MouseUp;
            trackPlayback.ValueChanged += TrackPlayback_ValueChanged;
            Shown += MainForm_Shown;
            UpdateSaveImageResultButtonState();
        }

        private bool CanSaveImageDetectionResult()
        {
            return _isImageOutput && pictureBox.Image != null;
        }

        private void UpdateSaveImageResultButtonState()
        {
            if (btnSaveImageResult == null)
                return;
            btnSaveImageResult.Enabled = CanSaveImageDetectionResult();
        }

        private void BtnSaveImageResult_Click(object sender, EventArgs e)
        {
            SaveImageDetectionResult();
        }

        private void PictureBox_MouseClick(object sender, MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Right && CanSaveImageDetectionResult())
                SaveImageDetectionResult();
        }

        private void PictureBox_DoubleClick(object sender, EventArgs e)
        {
            if (CanSaveImageDetectionResult())
                SaveImageDetectionResult();
        }

        private void SaveImageDetectionResult()
        {
            if (!CanSaveImageDetectionResult())
                return;

            using (var dlg = new SaveFileDialog())
            {
                dlg.Filter = "PNG|*.png|JPEG|*.jpg;*.jpeg|Bitmap|*.bmp";
                dlg.DefaultExt = "png";
                dlg.Title = "검출 결과 이미지 저장";
                if (!string.IsNullOrEmpty(_lastImageDetectionSourcePath))
                    dlg.FileName = Path.GetFileNameWithoutExtension(_lastImageDetectionSourcePath) + "_detected.png";
                else
                    dlg.FileName = "detected.png";

                if (dlg.ShowDialog(this) != DialogResult.OK)
                    return;

                try
                {
                    using (var bmp = new Bitmap(pictureBox.Image))
                    {
                        string ext = Path.GetExtension(dlg.FileName).ToLowerInvariant();
                        if (ext == ".jpg" || ext == ".jpeg")
                            bmp.Save(dlg.FileName, ImageFormat.Jpeg);
                        else if (ext == ".bmp")
                            bmp.Save(dlg.FileName, ImageFormat.Bmp);
                        else
                            bmp.Save(dlg.FileName, ImageFormat.Png);
                    }
                    lblStatus.Text = "검출 결과 저장: " + dlg.FileName;
                }
                catch (Exception ex)
                {
                    MessageBox.Show(this, ex.Message, "저장 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    lblStatus.Text = "저장 실패: " + ex.Message;
                }
            }
        }

        private async void MainForm_Shown(object sender, EventArgs e)
        {
            if (_startupInitDone)
                return;
            _startupInitDone = true;
            await InitializeDefaultModelOnStartupAsync();
        }

        private async Task InitializeDefaultModelOnStartupAsync()
        {
            string projectRoot = FindProjectRoot();
            string defaultOnnx = Path.Combine(projectRoot, "models", "yolo26n.onnx");
            txtOnnxPath.Text = defaultOnnx;

            if (!File.Exists(defaultOnnx))
            {
                var confirm = MessageBox.Show(
                    this,
                    "기본 모델 파일이 없습니다.\r\n지금 모델을 다운로드하고 ONNX로 변환하시겠습니까?",
                    "모델 다운로드 필요",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question);

                if (confirm != DialogResult.Yes)
                {
                    lblStatus.Text = "기본 ONNX가 없어 모델 로드가 보류되었습니다. 「모델 다운로드」 버튼으로 다시 시도하세요.";
                    return;
                }

                if (!RunModelPrepareWithFailurePopup(projectRoot, defaultOnnx))
                {
                    lblStatus.Text = "기본 ONNX 다운로드/변환 실패. 「모델 다운로드」 버튼으로 다시 시도하세요.";
                    return;
                }
            }

            await Task.Yield();
            TryLoadModel(showErrorDialog: true);
        }

        private bool RunModelPrepareWithFailurePopup(string projectRoot, string targetOnnxPath)
        {
            while (true)
            {
                bool success;
                using (var dlg = new ModelPrepareDialog(projectRoot, targetOnnxPath))
                {
                    dlg.ShowDialog(this);
                    success = dlg.IsSuccess && File.Exists(targetOnnxPath);
                }

                if (success)
                    return true;

                var retry = MessageBox.Show(
                    this,
                    "모델 다운로드 또는 변환에 실패했습니다.\r\n네트워크/Python 환경을 확인한 뒤 다시 시도하시겠습니까?",
                    "모델 다운로드 실패",
                    MessageBoxButtons.RetryCancel,
                    MessageBoxIcon.Warning);

                if (retry != DialogResult.Retry)
                    return false;
            }
        }

        private static string FindProjectRoot()
        {
            string dir = AppDomain.CurrentDomain.BaseDirectory;
            for (int i = 0; i < 6; i++)
            {
                if (File.Exists(Path.Combine(dir, "Yolo26Detection1.0.csproj")))
                    return dir;
                var parent = Directory.GetParent(dir);
                if (parent == null)
                    break;
                dir = parent.FullName;
            }
            return AppDomain.CurrentDomain.BaseDirectory;
        }

        private void RefreshLoadButtonState()
        {
            string path = txtOnnxPath.Text.Trim();
            bool sameAsLoaded = _modelLoadConfirmed &&
                                _detector != null &&
                                !string.IsNullOrEmpty(_loadedOnnxPath) &&
                                string.Equals(path, _loadedOnnxPath, StringComparison.OrdinalIgnoreCase);
            btnLoadModel.Enabled = !sameAsLoaded;
        }

        private void ApplyWindowIcon()
        {
            try
            {
                string iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "daemon_hammer.ico");
                if (File.Exists(iconPath))
                {
                    using (var icon = new Icon(iconPath))
                        this.Icon = (Icon)icon.Clone();
                    return;
                }
            }
            catch
            {
                // 파일 아이콘 로드 실패 시 아래 fallback 사용
            }

            try
            {
                var exeIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                this.Icon = exeIcon ?? SystemIcons.Application;
            }
            catch
            {
                this.Icon = SystemIcons.Application;
            }
        }

        private void PictureBox_MouseDown(object sender, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left || !_isImageOutput || pictureBox.Image == null)
                return;

            _isPanningImage = true;
            _panStartScreen = Cursor.Position;
            _panStartScroll = new System.Drawing.Point(
                -panelImageHost.AutoScrollPosition.X,
                -panelImageHost.AutoScrollPosition.Y);
            pictureBox.Cursor = Cursors.SizeAll;
        }

        private void PictureBox_MouseMove(object sender, MouseEventArgs e)
        {
            if (!_isPanningImage)
                return;

            var now = Cursor.Position;
            int dx = now.X - _panStartScreen.X;
            int dy = now.Y - _panStartScreen.Y;
            int targetX = Math.Max(0, _panStartScroll.X - dx);
            int targetY = Math.Max(0, _panStartScroll.Y - dy);
            panelImageHost.AutoScrollPosition = new System.Drawing.Point(targetX, targetY);
        }

        private void PictureBox_MouseUp(object sender, MouseEventArgs e)
        {
            EndImagePan();
        }

        private void PictureBox_MouseLeave(object sender, EventArgs e)
        {
            EndImagePan();
        }

        private void EndImagePan()
        {
            if (!_isPanningImage)
                return;
            _isPanningImage = false;
            pictureBox.Cursor = _isImageOutput ? Cursors.Hand : Cursors.Default;
        }

        private void PanelImageHost_Resize(object sender, EventArgs e)
        {
            if (_inApplyImageZoomLayout || pictureBox.Image == null)
                return;
            ApplyImageZoomLayout();
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            StopOutputVideoPlayback();
            _detector?.Dispose();
            pictureBox.Image?.Dispose();
            base.OnFormClosed(e);
        }

        private void TrackBarZoom_ValueChanged(object sender, EventArgs e)
        {
            ApplyImageZoomLayout();
        }

        private void ApplyImageZoomLayout()
        {
            lblZoomPct.Text = $"{trackBarZoom.Value}%";
            if (pictureBox.Image == null)
                return;

            _inApplyImageZoomLayout = true;
            float z = trackBarZoom.Value / 100f;
            int w = Math.Max(1, (int)Math.Round(pictureBox.Image.Width * z));
            int h = Math.Max(1, (int)Math.Round(pictureBox.Image.Height * z));

            panelImageHost.SuspendLayout();
            pictureBox.SuspendLayout();
            try
            {
                pictureBox.Size = new System.Drawing.Size(w, h);

                var cr = panelImageHost.ClientRectangle;
                int cw = Math.Max(1, cr.Width);
                int ch = Math.Max(1, cr.Height);

                int docW = Math.Max(cw, w);
                int docH = Math.Max(ch, h);
                panelImageHost.AutoScrollMinSize = new System.Drawing.Size(docW, docH);

                int x = (docW - w) / 2;
                int y = (docH - h) / 2;
                pictureBox.Location = new System.Drawing.Point(x, y);
            }
            finally
            {
                pictureBox.ResumeLayout();
                panelImageHost.ResumeLayout();
                _inApplyImageZoomLayout = false;
            }
        }

        /// <summary>스크롤 영역(패널 클라이언트) 안에 이미지가 들어가도록 하는 배율(%)을 반환합니다.</summary>
        private int ComputeZoomPercentToFitPanel(int imageW, int imageH)
        {
            if (imageW < 1 || imageH < 1)
                return 100;
            var host = panelImageHost.ClientSize;
            if (host.Width < 8 || host.Height < 8)
                return 100;
            double sx = host.Width / (double)imageW;
            double sy = host.Height / (double)imageH;
            double scale = Math.Min(sx, sy);
            int pct = (int)Math.Round(scale * 100.0);
            return Math.Max(trackBarZoom.Minimum, Math.Min(trackBarZoom.Maximum, pct));
        }

        private static string FormatMediaInfoImage(int w, int h, string filePath)
        {
            var name = string.IsNullOrEmpty(filePath) ? "" : Path.GetFileName(filePath);
            return "이미지\r\n" +
                   $"{w} × {h} px\r\n" +
                   (string.IsNullOrEmpty(name) ? "" : $"파일\r\n{name}");
        }

        private static string FormatMediaInfoVideo(int w, int h, double fps, int totalFrames)
        {
            var fpsLine = fps > 0 && fps <= 480 ? $"FPS {fps:0.###}" : $"FPS (추정) {fps:0.###}";
            var frameLine = totalFrames > 0
                ? $"총 프레임 {totalFrames:N0}"
                : "총 프레임 (알 수 없음)";
            return "동영상\r\n" +
                   $"{w} × {h} px\r\n" +
                   fpsLine + "\r\n" +
                   frameLine;
        }

        private void StopOutputVideoPlayback(bool preserveForReplay = false)
        {
            if (_playbackTimer != null)
            {
                _playbackTimer.Stop();
                _playbackTimer.Tick -= PlaybackTimer_Tick;
                _playbackTimer.Dispose();
                _playbackTimer = null;
            }
            if (_playbackCapture != null)
            {
                _playbackCapture.Dispose();
                _playbackCapture = null;
            }
            _playbackTotalFrames = 0;
            _playbackFps = 0;
            _playbackUiUpdating = false;
            _playbackSeekingByUser = false;
            _playbackPaused = false;
            if (!preserveForReplay)
            {
                _lastPlaybackPath = null;
                trackPlayback.Enabled = false;
                trackPlayback.Value = 0;
                lblPlaybackPos.Text = "00:00 / 00:00";
                btnPlaybackPause.Enabled = false;
                btnPlaybackResume.Enabled = false;
                btnPlaybackStop.Enabled = false;
            }
            else
            {
                _playbackUiUpdating = true;
                trackPlayback.Value = trackPlayback.Minimum;
                _playbackUiUpdating = false;
                lblPlaybackPos.Text = BuildPlaybackPositionText(0);
                btnPlaybackPause.Enabled = false;
                btnPlaybackResume.Enabled = !string.IsNullOrEmpty(_lastPlaybackPath) && File.Exists(_lastPlaybackPath);
                btnPlaybackStop.Enabled = false;
            }
            UpdateSaveImageResultButtonState();
        }

        private void StartOutputVideoPlayback(string outputPath)
        {
            StopOutputVideoPlayback();
            if (!File.Exists(outputPath))
                return;
            _lastPlaybackPath = outputPath;

            _playbackCapture = new VideoCapture(outputPath);
            if (!_playbackCapture.IsOpened())
            {
                _playbackCapture.Dispose();
                _playbackCapture = null;
                return;
            }

            double fps = _playbackCapture.Fps;
            if (fps <= 1 || fps > 240)
                fps = 30;
            _playbackFps = fps;
            _playbackTotalFrames = Math.Max(0, (int)_playbackCapture.FrameCount);
            int w = Math.Max(0, (int)_playbackCapture.FrameWidth);
            int h = Math.Max(0, (int)_playbackCapture.FrameHeight);
            lblMediaInfo.Text = FormatMediaInfoVideo(w, h, _playbackFps, _playbackTotalFrames);
            _playbackUiUpdating = true;
            trackPlayback.Maximum = Math.Max(1, _playbackTotalFrames > 0 ? _playbackTotalFrames : 1000);
            trackPlayback.Value = 0;
            trackPlayback.Enabled = _playbackTotalFrames > 1;
            _playbackUiUpdating = false;
            lblPlaybackPos.Text = BuildPlaybackPositionText(0);
            _playbackPaused = false;
            btnPlaybackPause.Enabled = true;
            btnPlaybackResume.Enabled = false;
            btnPlaybackStop.Enabled = true;
            int interval = Math.Max(10, (int)Math.Round(1000.0 / fps));

            _playbackFitOnFirstFrame = true;
            _playbackTimer = new Timer { Interval = interval };
            _playbackTimer.Tick += PlaybackTimer_Tick;
            _playbackTimer.Start();
            UpdateSaveImageResultButtonState();
        }

        private void PlaybackTimer_Tick(object sender, EventArgs e)
        {
            if (_playbackCapture == null)
                return;
            if (_playbackSeekingByUser)
                return;
            if (_playbackPaused)
                return;

            using (var frame = new Mat())
            {
                if (!_playbackCapture.Read(frame) || frame.Empty())
                {
                    _playbackCapture.Set(VideoCaptureProperties.PosFrames, 0);
                    if (!_playbackCapture.Read(frame) || frame.Empty())
                    {
                        StopOutputVideoPlayback();
                        return;
                    }
                }

                using (var bmp = BitmapConverter.ToBitmap(frame))
                {
                    _isImageOutput = false;
                    pictureBox.Image?.Dispose();
                    pictureBox.Image = new Bitmap(bmp);
                    pictureBox.Cursor = Cursors.Default;
                    if (_playbackFitOnFirstFrame)
                    {
                        trackBarZoom.Value = ComputeZoomPercentToFitPanel(bmp.Width, bmp.Height);
                        _playbackFitOnFirstFrame = false;
                    }
                    ApplyImageZoomLayout();
                }
            }
            UpdatePlaybackUiFromCapture();
            UpdateSaveImageResultButtonState();
        }

        private void TrackPlayback_MouseDown(object sender, MouseEventArgs e)
        {
            _playbackSeekingByUser = true;
        }

        private void TrackPlayback_MouseUp(object sender, MouseEventArgs e)
        {
            ApplyPlaybackSeek(trackPlayback.Value);
            _playbackSeekingByUser = false;
        }

        private void TrackPlayback_ValueChanged(object sender, EventArgs e)
        {
            if (_playbackUiUpdating || _playbackCapture == null)
                return;
            lblPlaybackPos.Text = BuildPlaybackPositionText(trackPlayback.Value);
            if (_playbackSeekingByUser)
                return;
            ApplyPlaybackSeek(trackPlayback.Value);
        }

        private void ApplyPlaybackSeek(int targetFrame)
        {
            if (_playbackCapture == null)
                return;

            int frame = Math.Max(0, targetFrame);
            if (_playbackTotalFrames > 0)
                frame = Math.Min(frame, _playbackTotalFrames - 1);
            _playbackCapture.Set(VideoCaptureProperties.PosFrames, frame);
            UpdatePlaybackUiFromCapture();
        }

        private void UpdatePlaybackUiFromCapture()
        {
            if (_playbackCapture == null)
                return;

            int currentFrame = Math.Max(0, (int)_playbackCapture.Get(VideoCaptureProperties.PosFrames));
            if (_playbackTotalFrames > 0)
                currentFrame = Math.Min(currentFrame, _playbackTotalFrames);

            _playbackUiUpdating = true;
            if (currentFrame <= trackPlayback.Maximum)
                trackPlayback.Value = Math.Max(trackPlayback.Minimum, currentFrame);
            _playbackUiUpdating = false;
            lblPlaybackPos.Text = BuildPlaybackPositionText(currentFrame);
        }

        private string BuildPlaybackPositionText(int currentFrame)
        {
            if (_playbackFps <= 0)
                return "00:00 / 00:00";

            double curSec;
            if (_playbackCapture != null)
            {
                double posMs = _playbackCapture.Get(VideoCaptureProperties.PosMsec);
                curSec = posMs > 0 ? posMs / 1000.0 : currentFrame / _playbackFps;
            }
            else
                curSec = currentFrame / _playbackFps;

            int totalFrame = _playbackTotalFrames > 0 ? _playbackTotalFrames : 0;
            double totalSec = totalFrame > 0 ? (totalFrame / _playbackFps) : 0;
            return $"{FormatSeconds(curSec)} / {FormatSeconds(totalSec)}";
        }

        private static string FormatSeconds(double sec)
        {
            if (sec < 0) sec = 0;
            var ts = TimeSpan.FromSeconds(sec);
            if (ts.TotalHours >= 1)
                return ts.ToString(@"hh\:mm\:ss");
            return ts.ToString(@"mm\:ss");
        }

        private void BtnPlaybackPause_Click(object sender, EventArgs e)
        {
            if (_playbackCapture == null)
                return;
            _playbackPaused = true;
            btnPlaybackPause.Enabled = false;
            btnPlaybackResume.Enabled = true;
        }

        private void BtnPlaybackResume_Click(object sender, EventArgs e)
        {
            if (_playbackCapture == null)
            {
                if (!string.IsNullOrEmpty(_lastPlaybackPath) && File.Exists(_lastPlaybackPath))
                {
                    StartOutputVideoPlayback(_lastPlaybackPath);
                    lblStatus.Text = "동영상 재생 중: " + _lastPlaybackPath;
                }
                return;
            }
            _playbackPaused = false;
            btnPlaybackPause.Enabled = true;
            btnPlaybackResume.Enabled = false;
        }

        private void BtnPlaybackStop_Click(object sender, EventArgs e)
        {
            StopOutputVideoPlayback(preserveForReplay: true);
            lblStatus.Text = "동영상 재생이 중지되었습니다. ▶ 버튼으로 다시 재생할 수 있습니다.";
        }

        private void ProgressBegin(bool continuous, int maximum = 100)
        {
            if (InvokeRequired)
            {
                Invoke(new Action(() => ProgressBegin(continuous, maximum)));
                return;
            }
            progressBarMain.Visible = true;
            if (continuous)
            {
                progressBarMain.Style = ProgressBarStyle.Continuous;
                progressBarMain.MarqueeAnimationSpeed = 0;
                progressBarMain.Maximum = Math.Max(1, maximum);
                progressBarMain.Value = 0;
            }
            else
            {
                progressBarMain.Style = ProgressBarStyle.Marquee;
                progressBarMain.MarqueeAnimationSpeed = 35;
            }
        }

        private void ProgressSet(int value)
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action(() => ProgressSet(value)));
                return;
            }
            if (progressBarMain.Style != ProgressBarStyle.Continuous)
                return;
            int v = Math.Max(progressBarMain.Minimum, Math.Min(value, progressBarMain.Maximum));
            progressBarMain.Value = v;
        }

        private void ProgressEnd()
        {
            if (InvokeRequired)
            {
                Invoke(new Action(ProgressEnd));
                return;
            }
            progressBarMain.Visible = false;
            progressBarMain.Style = ProgressBarStyle.Continuous;
            progressBarMain.Value = 0;
        }

        /// <summary>추론 세션을 만들거나, 같은 경로면 기존 세션을 반환합니다.</summary>
        private Yolo26OnnxDetector LoadOrReloadDetector()
        {
            var path = txtOnnxPath.Text.Trim();
            if (string.IsNullOrEmpty(path))
                throw new InvalidOperationException("ONNX 파일 경로를 입력하거나 찾기로 선택하세요.");
            if (!File.Exists(path))
                throw new FileNotFoundException("ONNX 파일이 없습니다. python\\download_and_export_onnx.py 로 생성하세요.", path);

            lock (_detectorLock)
            {
                if (_detector != null && string.Equals(_loadedOnnxPath, path, StringComparison.OrdinalIgnoreCase))
                    return _detector;

                _detector?.Dispose();
                _detector = null;
                _loadedOnnxPath = null;

                try
                {
                    _detector = new Yolo26OnnxDetector(path);
                    _loadedOnnxPath = path;
                }
                catch
                {
                    _detector = null;
                    _loadedOnnxPath = null;
                    throw;
                }

                return _detector;
            }
        }

        private Yolo26OnnxDetector GetLoadedDetector()
        {
            if (!_modelLoadConfirmed || _detector == null)
                throw new InvalidOperationException("먼저 「모델 로드」를 눌러 ONNX 모델을 불러오세요.");

            var path = txtOnnxPath.Text.Trim();
            if (!string.Equals(path, _loadedOnnxPath, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("ONNX 경로가 바뀌었습니다. 「모델 로드」를 다시 누르세요.");

            return _detector;
        }

        private void InvalidateLoadedModel(string statusMessage)
        {
            lock (_detectorLock)
            {
                _detector?.Dispose();
                _detector = null;
                _loadedOnnxPath = null;
            }
            _modelLoadConfirmed = false;
            btnImage.Enabled = false;
            btnVideo.Enabled = false;
            lblStatus.Text = statusMessage;
            RefreshLoadButtonState();
        }

        private void TxtOnnxPath_TextChanged(object sender, EventArgs e)
        {
            if (!_modelLoadConfirmed)
            {
                RefreshLoadButtonState();
                return;
            }
            var t = txtOnnxPath.Text.Trim();
            if (string.Equals(t, _loadedOnnxPath ?? "", StringComparison.OrdinalIgnoreCase))
            {
                RefreshLoadButtonState();
                return;
            }
            InvalidateLoadedModel("경로가 바뀌었습니다. 「모델 로드」를 다시 누르세요.");
        }

        private void BtnLoadModel_Click(object sender, EventArgs e)
        {
            TryLoadModel(showErrorDialog: true);
        }

        private async void BtnDownloadModel_Click(object sender, EventArgs e)
        {
            string projectRoot = FindProjectRoot();
            string defaultOnnx = Path.Combine(projectRoot, "models", "yolo26n.onnx");
            txtOnnxPath.Text = defaultOnnx;

            if (!RunModelPrepareWithFailurePopup(projectRoot, defaultOnnx))
            {
                lblStatus.Text = "모델 다운로드/변환 실패. 다시 시도해주세요.";
                return;
            }

            lblStatus.Text = "모델 다운로드/변환 완료. 모델을 로드합니다...";
            await Task.Yield();
            TryLoadModel(showErrorDialog: true);
        }

        private bool TryLoadModel(bool showErrorDialog)
        {
            btnLoadModel.Enabled = false;
            btnBrowseOnnx.Enabled = false;
            lblStatus.Text = "모델 로딩 중...";
            UseWaitCursor = true;
            Cursor.Current = Cursors.WaitCursor;
            try
            {
                LoadOrReloadDetector();
                _modelLoadConfirmed = true;
                btnImage.Enabled = true;
                btnVideo.Enabled = true;
                lblStatus.Text = "모델 로드 완료 — 이미지/동영상 검출을 사용할 수 있습니다.";
                RefreshLoadButtonState();
                return true;
            }
            catch (Exception ex)
            {
                _modelLoadConfirmed = false;
                lock (_detectorLock)
                {
                    _detector?.Dispose();
                    _detector = null;
                    _loadedOnnxPath = null;
                }
                btnImage.Enabled = false;
                btnVideo.Enabled = false;
                if (showErrorDialog)
                    MessageBox.Show(this, ex.Message, "모델 로드 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
                lblStatus.Text = "모델 로드 실패: " + ex.Message;
                RefreshLoadButtonState();
                return false;
            }
            finally
            {
                UseWaitCursor = false;
                Cursor.Current = Cursors.Default;
                btnBrowseOnnx.Enabled = true;
            }
        }

        private void BtnBrowseOnnx_Click(object sender, EventArgs e)
        {
            using (var dlg = new OpenFileDialog())
            {
                dlg.Filter = "ONNX|*.onnx|모든 파일|*.*";
                dlg.Title = "YOLO26 ONNX 선택";
                if (dlg.ShowDialog(this) == DialogResult.OK)
                    txtOnnxPath.Text = dlg.FileName;
            }
        }

        private async void BtnImage_Click(object sender, EventArgs e)
        {
            using (var dlg = new OpenFileDialog())
            {
                dlg.Filter = "이미지|*.jpg;*.jpeg;*.png;*.bmp;*.tif;*.tiff|모든 파일|*.*";
                if (dlg.ShowDialog(this) != DialogResult.OK)
                    return;

                lblStatus.Text = "이미지 검출 중...";
                btnImage.Enabled = false;
                btnVideo.Enabled = false;
                btnSaveImageResult.Enabled = false;
                StopOutputVideoPlayback();
                ProgressBegin(true, 100);
                try
                {
                    await Task.Run(() => RunImage(dlg.FileName));
                }
                catch (Exception ex)
                {
                    MessageBox.Show(this, ex.Message, "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    lblStatus.Text = "오류: " + ex.Message;
                }
                finally
                {
                    ProgressEnd();
                    btnImage.Enabled = true;
                    btnVideo.Enabled = true;
                    UpdateSaveImageResultButtonState();
                }
            }
        }

        private void RunImage(string path)
        {
            var det = GetLoadedDetector();
            float conf = (float)numConf.Value;

            ProgressSet(5);
            using (var mat = Cv2.ImRead(path, ImreadModes.Color))
            {
                if (mat.Empty())
                    throw new InvalidOperationException("이미지를 열 수 없습니다.");

                ProgressSet(25);
                var dets = det.Detect(mat, conf);
                ProgressSet(55);
                using (var vis = Yolo26OnnxDetector.DrawDetections(mat, dets))
                {
                    ProgressSet(75);
                    using (var bmp = BitmapConverter.ToBitmap(vis))
                    {
                        ProgressSet(90);
                        void apply()
                        {
                            _isImageOutput = true;
                            _lastImageDetectionSourcePath = path;
                            pictureBox.Image?.Dispose();
                            pictureBox.Image = new Bitmap(bmp);
                            pictureBox.Cursor = Cursors.Hand;
                            lblMediaInfo.Text = FormatMediaInfoImage(bmp.Width, bmp.Height, path);
                            trackBarZoom.Value = ComputeZoomPercentToFitPanel(bmp.Width, bmp.Height);
                            ApplyImageZoomLayout();
                            lblStatus.Text = $"완료 — 검출 {dets.Count}개 (우클릭·더블클릭 또는 「검출 결과 저장」으로 저장)";
                            UpdateSaveImageResultButtonState();
                        }
                        if (this.IsDisposed || this.Disposing)
                            return;

                        if (InvokeRequired)
                            Invoke((Action)apply);
                        else
                            apply();
                    }
                }
                ProgressSet(100);
            }
        }

        private async void BtnVideo_Click(object sender, EventArgs e)
        {
            using (var open = new OpenFileDialog())
            {
                open.Filter = "동영상|*.mp4;*.avi;*.mov;*.mkv;*.webm|모든 파일|*.*";
                if (open.ShowDialog(this) != DialogResult.OK)
                    return;

                using (var save = new SaveFileDialog())
                {
                    save.Filter = "MP4|*.mp4";
                    save.DefaultExt = "mp4";
                    save.FileName = Path.GetFileNameWithoutExtension(open.FileName) + "_detected.mp4";
                    if (save.ShowDialog(this) != DialogResult.OK)
                        return;

                    lblStatus.Text = "동영상 처리 중...";
                    btnImage.Enabled = false;
                    btnVideo.Enabled = false;
                    btnSaveImageResult.Enabled = false;
                    StopOutputVideoPlayback();
                    _isImageOutput = false;
                    EndImagePan();
                    _videoApplyInitialFitZoom = true;
                    try
                    {
                        await Task.Run(() => RunVideo(open.FileName, save.FileName));
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show(this, ex.Message, "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        lblStatus.Text = "오류: " + ex.Message;
                    }
                    finally
                    {
                        ProgressEnd();
                        btnImage.Enabled = true;
                        btnVideo.Enabled = true;
                    }
                }
            }
        }

        private void BtnPlayOutput_Click(object sender, EventArgs e)
        {
            using (var open = new OpenFileDialog())
            {
                open.Filter = "동영상|*.mp4;*.avi;*.mov;*.mkv;*.webm|모든 파일|*.*";
                open.Title = "재생할 검출 결과 동영상 선택";
                if (open.ShowDialog(this) != DialogResult.OK)
                    return;

                StartOutputVideoPlayback(open.FileName);
                lblStatus.Text = "결과 동영상 재생 중: " + open.FileName;
            }
        }

        private void RunVideo(string inputPath, string outputPath)
        {
            var det = GetLoadedDetector();
            float conf = (float)numConf.Value;

            using (var cap = new VideoCapture(inputPath))
            {
                if (!cap.IsOpened())
                    throw new InvalidOperationException("동영상을 열 수 없습니다.");

                int totalFrames = (int)Math.Max(0, cap.FrameCount);
                if (totalFrames > 0)
                    ProgressBegin(true, Math.Min(totalFrames, 1_000_000));
                else
                    ProgressBegin(false);

                double fps = cap.Fps;
                if (fps <= 1 || fps > 240)
                    fps = 25;
                int w = (int)cap.FrameWidth;
                int h = (int)cap.FrameHeight;
                if (w <= 0 || h <= 0)
                    throw new InvalidOperationException("동영상 크기를 읽을 수 없습니다.");

                void setVideoInfo()
                {
                    lblMediaInfo.Text = FormatMediaInfoVideo(w, h, fps, totalFrames);
                }
                if (InvokeRequired)
                    Invoke((Action)setVideoInfo);
                else
                    setVideoInfo();

                using (var writer = new VideoWriter(outputPath, VideoWriter.FourCC('m', 'p', '4', 'v'), fps, new OpenCvSharp.Size(w, h)))
                {
                    if (!writer.IsOpened())
                        throw new InvalidOperationException("출력 동영상을 만들 수 없습니다. 다른 경로나 코덱을 시도하세요.");

                    using (var frame = new Mat())
                    {
                        long n = 0;
                        while (cap.Read(frame) && !frame.Empty())
                        {
                            var dets = det.Detect(frame, conf);
                            using (var vis = Yolo26OnnxDetector.DrawDetections(frame, dets))
                            {
                                writer.Write(vis);
                                PushVideoPreviewFrame(vis, n, totalFrames, dets.Count);
                            }
                            n++;
                            if (totalFrames > 0)
                            {
                                int shown = (int)Math.Min(n, totalFrames);
                                ProgressSet(shown);
                            }
                        }
                    }
                }
            }

            void done()
            {
                lblStatus.Text = "동영상 저장 완료: " + outputPath;
                StartOutputVideoPlayback(outputPath);
                MessageBox.Show(
                    this,
                    "동영상 검출이 완료되었습니다.\r\n저장된 파일을 자동으로 재생합니다.\r\n\r\n저장 위치:\r\n" + outputPath,
                    "검출 완료",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }
            if (InvokeRequired)
                Invoke((Action)done);
            else
                done();
        }

        /// <summary>
        /// 동영상 검출 중 현재 프레임을 화면에 반영합니다. Invoke로 UI 스레드와 맞추어 BeginInvoke 적체를 막습니다.
        /// </summary>
        private void PushVideoPreviewFrame(Mat vis, long frameIndex, int totalFrames, int detCount)
        {
            using (var bmp = BitmapConverter.ToBitmap(vis))
            {
                void apply()
                {
                    _isImageOutput = false;
                    pictureBox.Image?.Dispose();
                    pictureBox.Image = new Bitmap(bmp);
                    pictureBox.Cursor = Cursors.Default;
                    if (_videoApplyInitialFitZoom)
                    {
                        trackBarZoom.Value = ComputeZoomPercentToFitPanel(bmp.Width, bmp.Height);
                        _videoApplyInitialFitZoom = false;
                    }
                    ApplyImageZoomLayout();
                    if (totalFrames > 0)
                        lblStatus.Text = $"동영상 검출 중... 프레임 {frameIndex + 1} / {totalFrames} (검출 {detCount}개)";
                    else
                        lblStatus.Text = $"동영상 검출 중... 프레임 {frameIndex + 1} (검출 {detCount}개)";
                    UpdateSaveImageResultButtonState();
                }
                if (InvokeRequired)
                    Invoke((Action)apply);
                else
                    apply();
            }
        }
    }
}
