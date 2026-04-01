using System;
using System.Drawing;
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

        public MainForm()
        {
            InitializeComponent();
            var def = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "models", "yolo26n.onnx");
            if (File.Exists(def))
                txtOnnxPath.Text = def;
            numConf.Value = 0.25M;
            btnImage.Enabled = false;
            btnVideo.Enabled = false;
            lblZoomPct.Text = $"{trackBarZoom.Value}%";
            panelImageHost.Resize += PanelImageHost_Resize;
        }

        private void PanelImageHost_Resize(object sender, EventArgs e)
        {
            if (_inApplyImageZoomLayout || pictureBox.Image == null)
                return;
            ApplyImageZoomLayout();
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
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
        }

        private void TxtOnnxPath_TextChanged(object sender, EventArgs e)
        {
            if (!_modelLoadConfirmed)
                return;
            var t = txtOnnxPath.Text.Trim();
            if (string.Equals(t, _loadedOnnxPath ?? "", StringComparison.OrdinalIgnoreCase))
                return;
            InvalidateLoadedModel("경로가 바뀌었습니다. 「모델 로드」를 다시 누르세요.");
        }

        private void BtnLoadModel_Click(object sender, EventArgs e)
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
                MessageBox.Show(this, ex.Message, "모델 로드 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
                lblStatus.Text = "모델 로드 실패: " + ex.Message;
            }
            finally
            {
                UseWaitCursor = false;
                Cursor.Current = Cursors.Default;
                btnLoadModel.Enabled = true;
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
                            pictureBox.Image?.Dispose();
                            pictureBox.Image = new Bitmap(bmp);
                            lblMediaInfo.Text = FormatMediaInfoImage(bmp.Width, bmp.Height, path);
                            trackBarZoom.Value = ComputeZoomPercentToFitPanel(bmp.Width, bmp.Height);
                            ApplyImageZoomLayout();
                            lblStatus.Text = $"완료 — 검출 {dets.Count}개 (스크롤·배율 슬라이더로 확대/축소)";
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
                    pictureBox.Image?.Dispose();
                    pictureBox.Image = new Bitmap(bmp);
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
                }
                if (InvokeRequired)
                    Invoke((Action)apply);
                else
                    apply();
            }
        }
    }
}
