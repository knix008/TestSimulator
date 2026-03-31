using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows.Forms;
using OpenCvSharp;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;

namespace ImageScaler4x1._0
{
    // 마우스 휠의 기본 스크롤 동작을 막아 줌 핸들러가 단독으로 처리하도록 함
    public class ZoomPanel : Panel
    {
        private const int WM_MOUSEWHEEL = 0x020A;
        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_MOUSEWHEEL)
                return; // 기본 스크롤 억제
            base.WndProc(ref m);
        }
    }

    public partial class ImageScalerForm : Form
    {
        private InferenceSession? inferenceSession;
        private float zoomFactorOriginal = 1.0f;
        private float zoomFactorUpscaled = 1.0f;
        private string? loadedImagePath;
        private Panel? dragPanel;
        private Panel? activePanel;
        private System.Drawing.Point dragStartPoint;

        public ImageScalerForm()
        {
            InitializeComponent();
            InitializeMouseInteractions();
            TryLoadModel(txtModelPath.Text);
        }

        private void InitializeMouseInteractions()
        {
            pnlOriginal.TabStop = true;
            pnlUpscaled.TabStop = true;

            // 패널/이미지 영역 어디서든 동일하게 휠 줌/드래그 팬 동작
            AttachMouseHandlers(pnlOriginal);
            AttachMouseHandlers(pbOriginal);
            AttachMouseHandlers(pnlUpscaled);
            AttachMouseHandlers(pbUpscaled);
        }

        private void AttachMouseHandlers(Control control)
        {
            control.MouseEnter += OnImageAreaMouseEnter;
            control.MouseWheel += OnImageAreaMouseWheel;
            control.MouseDown += OnImageAreaMouseDown;
            control.MouseMove += OnImageAreaMouseMove;
            control.MouseUp += OnImageAreaMouseUp;
            control.MouseLeave += OnImageAreaMouseLeave;
        }

        private static Panel? GetHostPanel(Control control)
        {
            if (control is Panel panel)
                return panel;
            return control.Parent as Panel;
        }

        private void OnImageAreaMouseEnter(object? sender, EventArgs e)
        {
            if (sender is not Control control)
                return;
            var panel = GetHostPanel(control);
            activePanel = panel;
            panel?.Focus();
        }

        private void OnImageAreaMouseWheel(object? sender, MouseEventArgs e)
        {
            if (sender is not Control control)
                return;
            var panel = GetHostPanel(control);
            if (panel == null)
                return;
            activePanel = panel;

            float oldZoom = GetZoomFactor(panel);
            float currentZoom = oldZoom;
            if (e.Delta > 0)
                currentZoom = Math.Min(8.0f, currentZoom + 0.05f);
            else if (e.Delta < 0)
                currentZoom = Math.Max(0.1f, currentZoom - 0.05f);

            SetZoomFactor(panel, currentZoom);
            var panelPoint = panel.PointToClient(control.PointToScreen(e.Location));
            ApplyZoom(panel, panelPoint, oldZoom);
        }

        private void OnImageAreaMouseDown(object? sender, MouseEventArgs e)
        {
            if (sender is not Control control)
                return;

            var panel = GetHostPanel(control);
            if (panel == null)
                return;

            if (e.Button == MouseButtons.Right)
            {
                if (panel == pnlOriginal && pbOriginal.Image != null)
                    SaveImageWithDialog(pbOriginal.Image, "original.jpg");
                else if (panel == pnlUpscaled && pbUpscaled.Image != null)
                    SaveImageWithDialog(pbUpscaled.Image, "upscaled.jpg");
                else
                    MessageBox.Show("저장할 이미지가 없습니다.", "안내",
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            if (e.Button != MouseButtons.Left)
                return;

            dragPanel = panel;
            activePanel = panel;
            dragStartPoint = e.Location;
            panel.Cursor = Cursors.Hand;
        }

        private void OnImageAreaMouseMove(object? sender, MouseEventArgs e)
        {
            if (dragPanel == null || e.Button != MouseButtons.Left)
                return;

            int dx = e.Location.X - dragStartPoint.X;
            int dy = e.Location.Y - dragStartPoint.Y;

            int currentX = -dragPanel.AutoScrollPosition.X;
            int currentY = -dragPanel.AutoScrollPosition.Y;

            int maxX = Math.Max(0, dragPanel.DisplayRectangle.Width - dragPanel.ClientSize.Width);
            int maxY = Math.Max(0, dragPanel.DisplayRectangle.Height - dragPanel.ClientSize.Height);

            int nextX = Math.Max(0, Math.Min(maxX, currentX - dx));
            int nextY = Math.Max(0, Math.Min(maxY, currentY - dy));

            dragPanel.AutoScrollPosition = new System.Drawing.Point(nextX, nextY);
        }

        private void OnImageAreaMouseUp(object? sender, MouseEventArgs e)
        {
            EndDragPan();
        }

        private void OnImageAreaMouseLeave(object? sender, EventArgs e)
        {
            if (Control.MouseButtons == MouseButtons.None)
                EndDragPan();
        }

        private void EndDragPan()
        {
            if (dragPanel != null)
                dragPanel.Cursor = Cursors.Default;
            dragPanel = null;
        }

        private void TryLoadModel(string modelPath)
        {
            try
            {
                inferenceSession?.Dispose();
                inferenceSession = new InferenceSession(modelPath);
                SetStatus($"모델 로드 완료: {System.IO.Path.GetFileName(modelPath)}", System.Drawing.Color.Green);
            }
            catch (Exception ex)
            {
                inferenceSession = null;
                SetStatus($"모델 로드 실패: {GetErrorMessage(ex)}", System.Drawing.Color.Red);
            }
        }

        private void SetStatus(string message, System.Drawing.Color color)
        {
            lblStatus.Text      = message;
            lblStatus.ForeColor = color;
        }

        private void btnBrowseModel_Click(object sender, EventArgs e)
        {
            using var dlg = new OpenFileDialog();
            dlg.Filter = "ONNX 모델|*.onnx|모든 파일|*.*";

            if (!string.IsNullOrWhiteSpace(txtModelPath.Text))
            {
                string currentModelPath = txtModelPath.Text;
                string? currentDir = Path.GetDirectoryName(currentModelPath);
                if (!string.IsNullOrWhiteSpace(currentDir) && Directory.Exists(currentDir))
                    dlg.InitialDirectory = currentDir;
                else
                    dlg.InitialDirectory = AppDomain.CurrentDomain.BaseDirectory;

                dlg.FileName = Path.GetFileName(currentModelPath);
            }
            else
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string downloadsDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
                dlg.InitialDirectory = Directory.Exists(downloadsDir) ? downloadsDir : baseDir;
            }

            if (dlg.ShowDialog() == DialogResult.OK)
            {
                txtModelPath.Text = dlg.FileName;
                TryLoadModel(dlg.FileName);
            }
        }

        private void btnApplySettings_Click(object sender, EventArgs e)
        {
            TryLoadModel(txtModelPath.Text);
        }

        private void btnDownloadModel_Click(object sender, EventArgs e)
        {
            using var dlg = new DownloadModelForm();
            dlg.ShowDialog(this);
            if (dlg.SavedFilePath != null)
            {
                txtModelPath.Text = dlg.SavedFilePath;
                TryLoadModel(dlg.SavedFilePath);
            }
        }

        private void btnLoadImage_Click(object sender, EventArgs e)
        {
            using var dlg = new OpenFileDialog();
            dlg.Filter = "Image Files|*.jpg;*.jpeg;*.png;*.bmp;*.webp;*.tif;*.tiff";
            if (dlg.ShowDialog() == DialogResult.OK)
                LoadOriginalImage(dlg.FileName);
        }

        private void menuOpenFile_Click(object sender, EventArgs e)
        {
            btnLoadImage_Click(sender, e);
        }

        private void menuSaveFile_Click(object sender, EventArgs e)
        {
            var imageToSave = pbUpscaled.Image;
            if (imageToSave == null)
            {
                MessageBox.Show("저장할 확대 결과 이미지가 없습니다. 먼저 '이미지 확대'를 실행하세요.",
                    "안내", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            SaveImageWithDialog(imageToSave, "upscaled.jpg");
        }

        private void SaveImageWithDialog(System.Drawing.Image imageToSave, string defaultFileName)
        {
            using var dlg = new SaveFileDialog();
            dlg.Filter = "JPEG 파일|*.jpg;*.jpeg|PNG 파일|*.png|BMP 파일|*.bmp";
            dlg.DefaultExt = "jpg";
            dlg.FileName = defaultFileName;
            if (dlg.ShowDialog() != DialogResult.OK)
                return;

            try
            {
                var extension = Path.GetExtension(dlg.FileName).ToLowerInvariant();
                var format = extension switch
                {
                    ".jpg" or ".jpeg" => System.Drawing.Imaging.ImageFormat.Jpeg,
                    ".bmp" => System.Drawing.Imaging.ImageFormat.Bmp,
                    _ => System.Drawing.Imaging.ImageFormat.Png,
                };

                imageToSave.Save(dlg.FileName, format);
                SetStatus($"이미지 저장 완료: {Path.GetFileName(dlg.FileName)}", System.Drawing.Color.Green);
            }
            catch (Exception ex)
            {
                SetStatus($"저장 오류: {ex.Message}", System.Drawing.Color.Red);
            }
        }

        private async Task ProcessAndDisplayImageAsync(string filePath)
        {
            try
            {
                SetStatus("처리 준비 중...", System.Drawing.Color.Blue);
                prgUpscale.Value = 0;
                int requestedTileSize = (int)nudTileSize.Value;
                int requestedTilePadding = (int)nudTilePadding.Value;
                int selectedScale = int.Parse(cmbScaleFactor.SelectedItem?.ToString() ?? "4");

                var sw = Stopwatch.StartNew();
                var result = await Task.Run(() =>
                {
                    Mat inputImage = Cv2.ImRead(filePath, ImreadModes.Color);
                    if (inputImage.Empty())
                        throw new InvalidOperationException("이미지 파일을 읽지 못했습니다. 파일 형식 또는 경로를 확인하세요.");

                    int tileSize = ResolveTileSize(inputImage.Width, inputImage.Height, requestedTileSize);
                    int tilePadding = ResolveTilePadding(tileSize, requestedTilePadding);
                    int scale = selectedScale;
                    int totalTiles;
                    Mat outputImage;

                    if (TryGetFixedModelInputSize(out int fixedW, out int fixedH))
                    {
                        totalTiles = GetTileCount(inputImage.Width, inputImage.Height, fixedW, fixedH);
                        UpdateUpscaleProgress(0, totalTiles, sw);
                        outputImage = RunTiledInferenceFixed(inputImage, fixedW, fixedH,
                            (done, total) => UpdateUpscaleProgress(done, total, sw));
                    }
                    else if (tileSize > 0)
                    {
                        totalTiles = GetTileCount(inputImage.Width, inputImage.Height, tileSize, tileSize);
                        UpdateUpscaleProgress(0, totalTiles, sw);
                        outputImage = RunTiledInference(inputImage, tileSize, tilePadding, scale,
                            (done, total) => UpdateUpscaleProgress(done, total, sw));
                    }
                    else
                    {
                        totalTiles = 1;
                        UpdateUpscaleProgress(0, totalTiles, sw);
                        outputImage = RunInference(inputImage);
                        UpdateUpscaleProgress(1, totalTiles, sw);
                    }

                    return new
                    {
                        InputWidth = inputImage.Width,
                        InputHeight = inputImage.Height,
                        OutputWidth = outputImage.Width,
                        OutputHeight = outputImage.Height,
                        TileSize = tileSize,
                        TilePadding = tilePadding,
                        Bitmap = OpenCvSharp.Extensions.BitmapConverter.ToBitmap(outputImage)
                    };
                });

                pbUpscaled.Image?.Dispose();
                pbUpscaled.Image = result.Bitmap;
                activePanel = pnlUpscaled;
                FitPanel(pnlUpscaled);
                prgUpscale.Value = 100;
                SetStatus($"완료  {result.InputWidth}x{result.InputHeight} → {result.OutputWidth}x{result.OutputHeight} (tile={result.TileSize}, pad={result.TilePadding})",
                    System.Drawing.Color.Green);
            }
            catch (Exception ex)
            {
                prgUpscale.Value = 0;
                SetStatus($"오류: {GetErrorMessage(ex)}", System.Drawing.Color.Red);
            }
        }

        private static int GetTileCount(int width, int height, int tileW, int tileH)
        {
            int xCount = (width + tileW - 1) / tileW;
            int yCount = (height + tileH - 1) / tileH;
            return Math.Max(1, xCount * yCount);
        }

        private void UpdateUpscaleProgress(int completed, int total, Stopwatch stopwatch)
        {
            if (InvokeRequired)
            {
                BeginInvoke(() => UpdateUpscaleProgress(completed, total, stopwatch));
                return;
            }

            int safeTotal = Math.Max(1, total);
            int safeCompleted = Math.Max(0, Math.Min(completed, safeTotal));
            int pct = (int)(safeCompleted * 100.0 / safeTotal);
            prgUpscale.Value = Math.Max(0, Math.Min(100, pct));

            if (safeCompleted <= 0)
            {
                SetStatus($"업스케일 시작... (0/{safeTotal})", System.Drawing.Color.Blue);
                return;
            }

            TimeSpan elapsed = stopwatch.Elapsed;
            double avgPerStepSec = elapsed.TotalSeconds / safeCompleted;
            int remainingSteps = safeTotal - safeCompleted;
            TimeSpan remaining = TimeSpan.FromSeconds(avgPerStepSec * remainingSteps);
            SetStatus($"업스케일 {safeCompleted}/{safeTotal} ({pct}%)  남은 시간 약 {FormatTime(remaining)}",
                System.Drawing.Color.Blue);
        }

        private static string FormatTime(TimeSpan time)
        {
            if (time.TotalHours >= 1)
                return $"{(int)time.TotalHours}시간 {time.Minutes}분";
            if (time.TotalMinutes >= 1)
                return $"{(int)time.TotalMinutes}분 {time.Seconds}초";
            return $"{Math.Max(0, time.Seconds)}초";
        }

        // RealESRGANExample01.py 기준: tile=0이면 이미지 크기에 따라 자동 선택
        private static int GetAutoTileSize(int width, int height)
        {
            int maxSide = Math.Max(width, height);
            if (maxSide > 2048)
                return 1024;
            if (maxSide > 1024)
                return 512;
            return 0;
        }

        private static int ResolveTileSize(int width, int height, int requestedTileSize)
        {
            int tileSize = requestedTileSize;
            if (tileSize == 0)
                tileSize = GetAutoTileSize(width, height);

            return tileSize;
        }

        // 권장값: tile_pad=10, 그리고 tile는 tile_pad의 최소 6배 이상
        private static int ResolveTilePadding(int tileSize, int requestedTilePadding)
        {
            int tilePadding = requestedTilePadding;
            if (tilePadding <= 0)
                tilePadding = 10;

            if (tileSize > 0 && tileSize < tilePadding * 6)
            {
                // 타일이 작을수록 패딩을 자동 축소해서 경계 아티팩트/비효율을 완화
                tilePadding = Math.Max(1, tileSize / 6);
            }

            return tilePadding;
        }

        private bool TryGetFixedModelInputSize(out int width, out int height)
        {
            width = 0;
            height = 0;
            if (inferenceSession == null)
                return false;

            string inputName = inferenceSession.InputMetadata.Keys.First();
            var dims = inferenceSession.InputMetadata[inputName].Dimensions;
            if (dims.Length != 4)
                return false;

            // 일반적인 NCHW [1,3,H,W]
            if (dims[1] == 3 && dims[2] > 0 && dims[3] > 0)
            {
                width = dims[3];
                height = dims[2];
                return true;
            }

            // NHWC [1,H,W,3]
            if (dims[3] == 3 && dims[1] > 0 && dims[2] > 0)
            {
                width = dims[2];
                height = dims[1];
                return true;
            }

            return false;
        }

        private void LoadOriginalImage(string filePath)
        {
            try
            {
                Mat inputImage = Cv2.ImRead(filePath, ImreadModes.Color);
                if (inputImage.Empty())
                {
                    SetStatus("이미지 파일을 읽지 못했습니다. 파일 형식 또는 경로를 확인하세요.", System.Drawing.Color.Red);
                    return;
                }

                loadedImagePath = filePath;
                pbOriginal.Image?.Dispose();
                pbOriginal.Image = OpenCvSharp.Extensions.BitmapConverter.ToBitmap(inputImage);

                // 예제 스크립트와 동일하게 입력 이미지 크기에 따라 tile 기본값 자동 추천
                nudTileSize.Value = GetAutoTileSize(inputImage.Width, inputImage.Height);
                if (nudTilePadding.Value <= 0)
                    nudTilePadding.Value = 10;

                pbUpscaled.Image?.Dispose();
                pbUpscaled.Image = null;
                prgUpscale.Value = 0;
                activePanel = pnlOriginal;
                FitPanel(pnlOriginal);
                SetStatus("원본 이미지를 불러왔습니다. '이미지 확대' 버튼으로 AI 확대를 실행하세요.", System.Drawing.Color.DarkOrange);
            }
            catch (Exception ex)
            {
                SetStatus($"오류: {GetErrorMessage(ex)}", System.Drawing.Color.Red);
            }
        }

        private async void btnImageZoom_Click(object sender, EventArgs e)
        {
            if (string.IsNullOrWhiteSpace(loadedImagePath))
            {
                MessageBox.Show("먼저 이미지를 불러오세요.", "안내", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            if (inferenceSession == null)
            {
                MessageBox.Show("모델이 로드되지 않았습니다.\n설정에서 모델 경로를 확인하세요.",
                    "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            btnImageZoom.Enabled = false;
            btnLoadImage.Enabled = false;
            try
            {
                await ProcessAndDisplayImageAsync(loadedImagePath);
            }
            finally
            {
                btnImageZoom.Enabled = true;
                btnLoadImage.Enabled = true;
            }
        }

        // 단일 이미지(또는 타일) 추론: BGR 입력 → BGR 출력
        private Mat RunInference(Mat inputBgr)
        {
            int h = inputBgr.Rows;
            int w = inputBgr.Cols;

            // BGR → RGB, [0,255] → [0,1] float32
            Mat rgbFloat = new Mat();
            Cv2.CvtColor(inputBgr, rgbFloat, ColorConversionCodes.BGR2RGB);
            rgbFloat.ConvertTo(rgbFloat, MatType.CV_32FC3, 1.0 / 255.0);

            // HWC → CHW: [H, W, 3] → [1, 3, H, W]
            Mat[] channels  = Cv2.Split(rgbFloat);
            int   planeSize = h * w;
            float[] inputData = new float[3 * planeSize];
            for (int c = 0; c < 3; c++)
            {
                channels[c].GetArray(out float[] plane);
                Array.Copy(plane, 0, inputData, c * planeSize, planeSize);
            }

            // ONNX 추론
            string inputName = inferenceSession!.InputMetadata.Keys.First();
            var inputTensor  = new DenseTensor<float>(inputData, new[] { 1, 3, h, w });
            var inputs       = new[] { NamedOnnxValue.CreateFromTensor(inputName, inputTensor) };

            using var results     = inferenceSession.Run(inputs);
            var firstResult = results.First();
            (int outH, int outW, float[] outputData) = ExtractOutputData(firstResult);

            // CHW → HWC, [0,1] → [0,255] clamp → byte
            int outPlane = outH * outW;
            Mat[] outChannels = new Mat[3];
            for (int c = 0; c < 3; c++)
            {
                float[] plane = new float[outPlane];
                Array.Copy(outputData, c * outPlane, plane, 0, outPlane);
                for (int i = 0; i < outPlane; i++)
                    plane[i] = Math.Clamp(plane[i], 0f, 1f) * 255f;

                Mat planeMat  = Mat.FromPixelData(outH, outW, MatType.CV_32FC1, plane);
                outChannels[c] = new Mat();
                planeMat.ConvertTo(outChannels[c], MatType.CV_8UC1);
            }

            Mat outputRgb = new Mat();
            Cv2.Merge(outChannels, outputRgb);
            Mat outputBgr = new Mat();
            Cv2.CvtColor(outputRgb, outputBgr, ColorConversionCodes.RGB2BGR);
            return outputBgr;
        }

        private static (int outH, int outW, float[] outputData) ExtractOutputData(NamedOnnxValue outputValue)
        {
            try
            {
                var tensor = outputValue.AsTensor<float>();
                return (tensor.Dimensions[2], tensor.Dimensions[3], tensor.ToArray());
            }
            catch
            {
                try
                {
                    var tensorHalf = outputValue.AsTensor<Half>();
                    int outH = tensorHalf.Dimensions[2];
                    int outW = tensorHalf.Dimensions[3];
                    var halfArray = tensorHalf.ToArray();
                    var floatArray = new float[halfArray.Length];
                    for (int i = 0; i < halfArray.Length; i++)
                        floatArray[i] = (float)halfArray[i];
                    return (outH, outW, floatArray);
                }
                catch (Exception ex)
                {
                    throw new InvalidOperationException("모델 출력 텐서 형식을 해석하지 못했습니다. (float/float16 지원)", ex);
                }
            }
        }

        private static string GetErrorMessage(Exception ex)
        {
            var sb = new StringBuilder(ex.Message);
            if (ex.InnerException != null)
                sb.Append(" | ").Append(ex.InnerException.Message);
            return sb.ToString();
        }

        // 타일 기반 추론: 대용량 이미지의 메모리 절약
        private Mat RunTiledInference(Mat inputBgr, int tileSize, int padding, int scale, Action<int, int>? progress = null)
        {
            int h = inputBgr.Rows;
            int w = inputBgr.Cols;
            int total = GetTileCount(w, h, tileSize, tileSize);
            int done = 0;

            Mat output = new Mat(h * scale, w * scale, MatType.CV_8UC3, Scalar.All(0));

            for (int tileY = 0; tileY < h; tileY += tileSize)
            {
                for (int tileX = 0; tileX < w; tileX += tileSize)
                {
                    int tileW = Math.Min(tileSize, w - tileX);
                    int tileH = Math.Min(tileSize, h - tileY);

                    // 경계 밖으로 나가지 않게 패딩 범위 조정
                    int padLeft   = Math.Min(padding, tileX);
                    int padTop    = Math.Min(padding, tileY);
                    int padRight  = Math.Min(padding, w - (tileX + tileW));
                    int padBottom = Math.Min(padding, h - (tileY + tileH));

                    // 패딩 포함 타일 추출 후 추론
                    Mat tile     = inputBgr[new Rect(tileX - padLeft, tileY - padTop,
                                                     tileW + padLeft + padRight,
                                                     tileH + padTop  + padBottom)];
                    Mat upscaled = RunInference(tile);

                    // 패딩 영역 제거 (출력 스케일 적용)
                    int cropX = padLeft * scale;
                    int cropY = padTop  * scale;
                    int cropW = tileW   * scale;
                    int cropH = tileH   * scale;

                    Mat valid = upscaled[new Rect(cropX, cropY, cropW, cropH)];
                    valid.CopyTo(output[new Rect(tileX * scale, tileY * scale, cropW, cropH)]);
                    done++;
                    progress?.Invoke(done, total);
                }
            }

            return output;
        }

        // 고정 입력 크기 모델 대응: 가장자리 타일을 모델 입력 크기까지 패딩해서 추론
        private Mat RunTiledInferenceFixed(Mat inputBgr, int modelInputW, int modelInputH, Action<int, int>? progress = null)
        {
            int h = inputBgr.Rows;
            int w = inputBgr.Cols;
            int total = GetTileCount(w, h, modelInputW, modelInputH);
            int done = 0;

            Mat? output = null;
            int scaleX = 0;
            int scaleY = 0;

            for (int tileY = 0; tileY < h; tileY += modelInputH)
            {
                for (int tileX = 0; tileX < w; tileX += modelInputW)
                {
                    int validW = Math.Min(modelInputW, w - tileX);
                    int validH = Math.Min(modelInputH, h - tileY);
                    var srcRect = new Rect(tileX, tileY, validW, validH);

                    Mat tile = inputBgr[srcRect];
                    Mat paddedTile = new Mat();
                    Cv2.CopyMakeBorder(
                        tile,
                        paddedTile,
                        0, modelInputH - validH,
                        0, modelInputW - validW,
                        BorderTypes.Reflect101);

                    Mat upscaled = RunInference(paddedTile);

                    if (output == null)
                    {
                        scaleX = Math.Max(1, upscaled.Cols / modelInputW);
                        scaleY = Math.Max(1, upscaled.Rows / modelInputH);
                        output = new Mat(h * scaleY, w * scaleX, MatType.CV_8UC3, Scalar.All(0));
                    }

                    int cropW = validW * scaleX;
                    int cropH = validH * scaleY;
                    Mat valid = upscaled[new Rect(0, 0, cropW, cropH)];
                    valid.CopyTo(output[new Rect(tileX * scaleX, tileY * scaleY, cropW, cropH)]);
                    done++;
                    progress?.Invoke(done, total);
                }
            }

            return output ?? new Mat();
        }

        private void btnZoomOut_Click(object sender, EventArgs e)
        {
            float old = zoomFactorOriginal;
            zoomFactorOriginal = Math.Max(0.1f, zoomFactorOriginal - 0.1f);
            var center = new System.Drawing.Point(pnlOriginal.ClientSize.Width / 2, pnlOriginal.ClientSize.Height / 2);
            ApplyZoom(pnlOriginal, center, old);
        }

        private void btnZoomIn_Click(object sender, EventArgs e)
        {
            float old = zoomFactorOriginal;
            zoomFactorOriginal = Math.Min(8.0f, zoomFactorOriginal + 0.1f);
            var center = new System.Drawing.Point(pnlOriginal.ClientSize.Width / 2, pnlOriginal.ClientSize.Height / 2);
            ApplyZoom(pnlOriginal, center, old);
        }

        private void btnZoomFit_Click(object sender, EventArgs e)
        {
            FitPanel(pnlOriginal);
        }

        private void btnZoom100_Click(object sender, EventArgs e)
        {
            zoomFactorOriginal = 1.0f;
            ApplyZoom(pnlOriginal);
        }

        private void btnZoomOutOutput_Click(object sender, EventArgs e)
        {
            float old = zoomFactorUpscaled;
            zoomFactorUpscaled = Math.Max(0.1f, zoomFactorUpscaled - 0.1f);
            var center = new System.Drawing.Point(pnlUpscaled.ClientSize.Width / 2, pnlUpscaled.ClientSize.Height / 2);
            ApplyZoom(pnlUpscaled, center, old);
        }

        private void btnZoomInOutput_Click(object sender, EventArgs e)
        {
            float old = zoomFactorUpscaled;
            zoomFactorUpscaled = Math.Min(8.0f, zoomFactorUpscaled + 0.1f);
            var center = new System.Drawing.Point(pnlUpscaled.ClientSize.Width / 2, pnlUpscaled.ClientSize.Height / 2);
            ApplyZoom(pnlUpscaled, center, old);
        }

        private void btnZoomFitOutput_Click(object sender, EventArgs e)
        {
            FitPanel(pnlUpscaled);
        }

        private void btnZoom100Output_Click(object sender, EventArgs e)
        {
            zoomFactorUpscaled = 1.0f;
            ApplyZoom(pnlUpscaled);
        }

        private void FitPanel(Panel panel)
        {
            PictureBox targetPictureBox = panel == pnlOriginal ? pbOriginal : pbUpscaled;
            if (targetPictureBox.Image == null || panel.ClientSize.Width <= 0 || panel.ClientSize.Height <= 0)
                return;

            float scaleX = panel.ClientSize.Width / (float)targetPictureBox.Image.Width;
            float scaleY = panel.ClientSize.Height / (float)targetPictureBox.Image.Height;
            SetZoomFactor(panel, Math.Max(0.1f, Math.Min(scaleX, scaleY)));
            ApplyZoom(panel);
        }

        private float GetZoomFactor(Panel panel)
        {
            return panel == pnlOriginal ? zoomFactorOriginal : zoomFactorUpscaled;
        }

        private void SetZoomFactor(Panel panel, float zoom)
        {
            if (panel == pnlOriginal)
                zoomFactorOriginal = zoom;
            else
                zoomFactorUpscaled = zoom;
        }

        private void ApplyZoom(Panel panel, System.Drawing.Point? anchorPanelPoint = null, float? previousZoom = null)
        {
            float oldZoom = previousZoom ?? GetZoomFactor(panel);
            PictureBox pb = panel == pnlOriginal ? pbOriginal : pbUpscaled;

            // pb.Location은 패널 클라이언트 영역 기준 화면 좌표(스크롤 반영됨).
            // 리사이즈 전에 먼저 읽어야 ResizePictureBox의 Location 변경 영향을 받지 않음.
            int picXBefore = pb.Location.X;
            int picYBefore = pb.Location.Y;

            if (panel == pnlOriginal)
            {
                ResizePictureBox(pbOriginal, pnlOriginal, zoomFactorOriginal);
                lblZoomLevel.Text = $"{(int)(zoomFactorOriginal * 100)}%";
            }
            else
            {
                ResizePictureBox(pbUpscaled, pnlUpscaled, zoomFactorUpscaled);
                lblZoomLevelOutput.Text = $"{(int)(zoomFactorUpscaled * 100)}%";
            }

            if (anchorPanelPoint.HasValue && oldZoom > 0f && pb.Image != null)
            {
                float newZoom = GetZoomFactor(panel);

                // 마우스 아래의 이미지 픽셀 좌표 (줌 전 화면 위치 기준)
                double imgX = (anchorPanelPoint.Value.X - picXBefore) / (double)oldZoom;
                double imgY = (anchorPanelPoint.Value.Y - picYBefore) / (double)oldZoom;

                // ResizePictureBox 후 실제 상태를 읽음
                // (AutoScrollMinSize 변경 시 스크롤 클램핑 등 중간 변화 반영)
                int scrollXAfter = -panel.AutoScrollPosition.X;
                int scrollYAfter = -panel.AutoScrollPosition.Y;
                int newPicX = pb.Location.X;
                int newPicY = pb.Location.Y;

                // 앵커 포인트가 화면상 같은 위치에 오도록 스크롤 설정
                // display_of_imgX = newPicX + (scrollXAfter - nextScrollX) + imgX * newZoom = mouseX
                int nextScrollX = (int)Math.Round(scrollXAfter + newPicX + imgX * newZoom - anchorPanelPoint.Value.X);
                int nextScrollY = (int)Math.Round(scrollYAfter + newPicY + imgY * newZoom - anchorPanelPoint.Value.Y);

                panel.AutoScrollPosition = new System.Drawing.Point(Math.Max(0, nextScrollX), Math.Max(0, nextScrollY));
            }
        }

        private static void SetPanelScrollPosition(Panel panel, int desiredX, int desiredY)
        {
            int targetX = Math.Max(0, desiredX);
            int targetY = Math.Max(0, desiredY);

            if (panel.HorizontalScroll.Visible)
            {
                int maxX = Math.Max(panel.HorizontalScroll.Minimum,
                    panel.HorizontalScroll.Maximum - panel.HorizontalScroll.LargeChange + 1);
                panel.HorizontalScroll.Value = Math.Min(targetX, maxX);
            }

            if (panel.VerticalScroll.Visible)
            {
                int maxY = Math.Max(panel.VerticalScroll.Minimum,
                    panel.VerticalScroll.Maximum - panel.VerticalScroll.LargeChange + 1);
                panel.VerticalScroll.Value = Math.Min(targetY, maxY);
            }

            panel.PerformLayout();
        }

        private void ResizePictureBox(PictureBox pictureBox, Panel parentPanel, float zoomFactor)
        {
            if (pictureBox.Image == null)
                return;

            pictureBox.SizeMode = PictureBoxSizeMode.Zoom;
            int width  = Math.Max(1, (int)(pictureBox.Image.Width * zoomFactor));
            int height = Math.Max(1, (int)(pictureBox.Image.Height * zoomFactor));
            pictureBox.Size = new System.Drawing.Size(width, height);

            int x = width < parentPanel.ClientSize.Width ? (parentPanel.ClientSize.Width - width) / 2 : 0;
            int y = height < parentPanel.ClientSize.Height ? (parentPanel.ClientSize.Height - height) / 2 : 0;
            pictureBox.Location = new System.Drawing.Point(x, y);
            parentPanel.AutoScrollMinSize = pictureBox.Size;
        }
    }
}
