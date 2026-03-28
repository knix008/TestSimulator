using System.Drawing.Imaging;

namespace BGRemoveWin1._0
{
    public partial class BackgroundRemoval : Form
    {
        private readonly BackgroundRemovalProcessor _processor = new();
        private readonly ModelDownloader            _downloader = new();
        private CancellationTokenSource? _downloadCts;
        private Bitmap? _inputImage;
        private Bitmap? _outputImage;

        public BackgroundRemoval()
        {
            InitializeComponent();
            WireEvents();
        }

        // ── Event wiring ────────────────────────────────────────────────

        private void WireEvents()
        {
            btnOpenImage.Click      += BtnOpenImage_Click;
            btnLoadModel.Click      += BtnLoadModel_Click;
            btnRemoveBg.Click       += BtnRemoveBg_Click;
            btnSave.Click           += BtnSave_Click;
            btnCancelDownload.Click += BtnCancelDownload_Click;
            btnDeleteModel.Click    += BtnDeleteModel_Click;

            picInput.DragEnter += PicInput_DragEnter;
            picInput.DragDrop  += PicInput_DragDrop;

            Load       += async (_, _) => await TryAutoLoadModelAsync();
            FormClosed += (_, _) =>
            {
                _downloadCts?.Cancel();
                _processor.Dispose();
                _inputImage?.Dispose();
                _outputImage?.Dispose();
            };
        }

        // ── Auto model load / download ───────────────────────────────────

        private async Task TryAutoLoadModelAsync()
        {
            string modelPath = ModelDownloader.DefaultModelPath;

            if (File.Exists(modelPath))
            {
                TryLoadModel(modelPath);
                return;
            }

            var answer = MessageBox.Show(
                "U2Net ONNX 모델 파일이 없습니다.\n\n" +
                "자동으로 다운로드할까요? (약 176 MB)\n\n" +
                "저장 위치:\n" + modelPath,
                "모델 다운로드",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);

            if (answer == DialogResult.Yes)
                await DownloadModelAsync(modelPath);
        }

        private async Task DownloadModelAsync(string destPath)
        {
            _downloadCts = new CancellationTokenSource();
            SetBusy(true);
            btnCancelDownload.Visible = true;
            btnDeleteModel.Visible    = false;

            var progress = new Progress<(long downloaded, long total)>(p =>
            {
                string size    = FormatBytes(p.downloaded);
                string total   = p.total > 0 ? $" / {FormatBytes(p.total)}" : "";
                int    percent = p.total > 0 ? (int)(p.downloaded * 100 / p.total) : 0;
                SetDownloadProgress(percent, $"다운로드 중... {size}{total}  ({percent}%)");
            });

            try
            {
                await _downloader.DownloadAsync(ModelDownloader.ModelUrl, destPath, progress, _downloadCts.Token);

                MessageBox.Show(
                    "모델 다운로드가 완료되었습니다!\n이제 배경 제거를 사용할 수 있습니다.",
                    "다운로드 완료",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);

                TryLoadModel(destPath, wasDownloaded: true);
            }
            catch (OperationCanceledException)
            {
                if (File.Exists(destPath + ".tmp")) File.Delete(destPath + ".tmp");
                SetStatus("다운로드 취소됨");
            }
            catch (Exception ex)
            {
                SetStatus("다운로드 실패");
                MessageBox.Show($"다운로드 오류:\n{ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                _downloadCts.Dispose();
                _downloadCts              = null;
                btnCancelDownload.Visible = false;
                SetBusy(false);
            }
        }

        private void TryLoadModel(string modelPath, bool wasDownloaded = false)
        {
            SetStatus("모델 로드 중...", working: true);
            try
            {
                _processor.LoadModel(modelPath);

                lblModelStatus.Text = wasDownloaded
                    ? $"모델 다운로드 완료: {Path.GetFileName(modelPath)}"
                    : $"모델: {Path.GetFileName(modelPath)}";
                lblModelStatus.ForeColor = Color.FromArgb(100, 220, 140);

                btnDeleteModel.Visible = true;
                UpdateButtonStates();
                SetStatus(wasDownloaded ? "모델 다운로드 완료" : "모델 준비 완료");
            }
            catch (Exception ex)
            {
                SetStatus("모델 로드 실패");
                MessageBox.Show($"모델 로드 오류:\n{ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // ── Button handlers ─────────────────────────────────────────────

        private void BtnOpenImage_Click(object? sender, EventArgs e)
        {
            using var dlg = new OpenFileDialog
            {
                Title  = "이미지 열기",
                Filter = "이미지 파일|*.png;*.jpg;*.jpeg;*.bmp;*.webp|모든 파일|*.*"
            };
            if (dlg.ShowDialog() == DialogResult.OK)
                LoadImageFromPath(dlg.FileName);
        }

        private void BtnLoadModel_Click(object? sender, EventArgs e)
        {
            using var dlg = new OpenFileDialog
            {
                Title  = "ONNX 모델 파일 선택",
                Filter = "ONNX 모델|*.onnx|모든 파일|*.*"
            };
            if (dlg.ShowDialog() == DialogResult.OK)
                TryLoadModel(dlg.FileName);
        }

        private async void BtnRemoveBg_Click(object? sender, EventArgs e)
        {
            if (_inputImage == null || !_processor.IsModelLoaded) return;

            SetBusy(true);
            SetStatus("배경 제거 중...", working: true);
            try
            {
                var src    = (Bitmap)_inputImage.Clone();
                var result = await Task.Run(() => _processor.RemoveBackground(src));

                _outputImage?.Dispose();
                _outputImage           = result;
                pnlOutputCanvas.Image  = _outputImage;

                btnSave.Enabled = true;
                SetStatus($"완료  ({_outputImage.Width} × {_outputImage.Height})");
            }
            catch (Exception ex)
            {
                SetStatus("오류 발생");
                MessageBox.Show($"배경 제거 오류:\n{ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                SetBusy(false);
            }
        }

        private void BtnSave_Click(object? sender, EventArgs e)
        {
            if (_outputImage == null) return;
            using var dlg = new SaveFileDialog
            {
                Title      = "결과 저장",
                Filter     = "PNG 파일|*.png|BMP 파일|*.bmp",
                DefaultExt = "png",
                FileName   = "result"
            };
            if (dlg.ShowDialog() != DialogResult.OK) return;

            var fmt = dlg.FilterIndex == 2 ? ImageFormat.Bmp : ImageFormat.Png;
            _outputImage.Save(dlg.FileName, fmt);
            SetStatus($"저장 완료: {Path.GetFileName(dlg.FileName)}");
        }

        private void BtnCancelDownload_Click(object? sender, EventArgs e)
        {
            _downloadCts?.Cancel();
        }

        private void BtnDeleteModel_Click(object? sender, EventArgs e)
        {
            string modelPath = ModelDownloader.DefaultModelPath;

            if (!File.Exists(modelPath))
            {
                MessageBox.Show("기본 경로에 저장된 모델 파일이 없습니다.", "알림",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            var answer = MessageBox.Show(
                $"다운로드된 모델 파일을 삭제하시겠습니까?\n\n{modelPath}",
                "모델 삭제",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning);

            if (answer != DialogResult.Yes) return;

            try
            {
                _processor.UnloadModel();
                File.Delete(modelPath);

                lblModelStatus.Text      = "모델 미로드 — ONNX 모델 파일(.onnx)을 로드하세요";
                lblModelStatus.ForeColor = Color.FromArgb(180, 180, 180);
                btnDeleteModel.Visible   = false;
                UpdateButtonStates();
                SetStatus("모델 삭제 완료");
            }
            catch (Exception ex)
            {
                MessageBox.Show($"모델 삭제 오류:\n{ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // ── Drag & Drop ─────────────────────────────────────────────────

        private void PicInput_DragEnter(object? sender, DragEventArgs e)
        {
            if (e.Data?.GetDataPresent(DataFormats.FileDrop) == true)
                e.Effect = DragDropEffects.Copy;
        }

        private void PicInput_DragDrop(object? sender, DragEventArgs e)
        {
            var files = e.Data?.GetData(DataFormats.FileDrop) as string[];
            if (files?.Length > 0) LoadImageFromPath(files[0]);
        }

        // ── Image loading ────────────────────────────────────────────────

        private void LoadImageFromPath(string path)
        {
            try
            {
                var bmp = new Bitmap(path);
                _inputImage?.Dispose();
                _inputImage    = bmp;
                picInput.Image = _inputImage;

                _outputImage?.Dispose();
                _outputImage           = null;
                pnlOutputCanvas.Image  = null;

                btnSave.Enabled = false;
                UpdateButtonStates();
                SetStatus($"이미지 로드: {Path.GetFileName(path)}  ({bmp.Width} × {bmp.Height})");
            }
            catch (Exception ex)
            {
                MessageBox.Show($"이미지를 열 수 없습니다:\n{ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // ── Helpers ──────────────────────────────────────────────────────

        private void UpdateButtonStates()
        {
            btnRemoveBg.Enabled = _inputImage != null && _processor.IsModelLoaded;
        }

        private void SetStatus(string text, bool working = false)
        {
            lblStatus.Text      = text;
            progressBar.Visible = working;
            if (working) progressBar.Style = ProgressBarStyle.Marquee;
        }

        private void SetDownloadProgress(int percent, string statusText)
        {
            lblStatus.Text      = statusText;
            progressBar.Visible = true;
            progressBar.Style   = ProgressBarStyle.Continuous;
            progressBar.Value   = Math.Clamp(percent, 0, 100);
        }

        private void SetBusy(bool busy)
        {
            btnOpenImage.Enabled = !busy;
            btnLoadModel.Enabled = !busy;
            btnRemoveBg.Enabled  = !busy;
            btnSave.Enabled      = !busy && _outputImage != null;
            if (!busy) progressBar.Visible = false;
        }

        private static string FormatBytes(long bytes)
        {
            if (bytes >= 1024 * 1024) return $"{bytes / 1024.0 / 1024.0:F1} MB";
            if (bytes >= 1024)        return $"{bytes / 1024.0:F1} KB";
            return $"{bytes} B";
        }
    }
}
