using System.Drawing.Imaging;

namespace RemBGWin1._0
{
    public partial class RemBG : Form
    {
        private readonly BackgroundRemovalProcessor _processor  = new();
        private readonly ModelDownloader            _downloader = new();
        private CancellationTokenSource? _downloadCts;
        private Bitmap? _inputBmp;
        private Bitmap? _outputBmp;

        public RemBG()
        {
            InitializeComponent();

            // DesignerSerializationVisibility.Hidden 속성은 생성자에서 설정
            panelInput.PlaceholderText  = "이미지를 열거나 여기에 드래그하세요";
            panelOutput.PlaceholderText = "배경 제거 결과가 여기에 표시됩니다";

            WireEvents();
        }

        // ── Event wiring ─────────────────────────────────────────────────

        private void WireEvents()
        {
            btnOpen.Click     += BtnOpen_Click;
            btnModel.Click    += BtnModel_Click;
            btnRemove.Click   += BtnRemove_Click;
            btnSave.Click     += BtnSave_Click;
            btnCancel.Click   += BtnCancel_Click;
            btnDelModel.Click += BtnDelModel_Click;

            panelInput.DragEnter += (_, e) =>
            {
                if (e.Data?.GetDataPresent(DataFormats.FileDrop) == true)
                    e.Effect = DragDropEffects.Copy;
            };
            panelInput.DragDrop += (_, e) =>
            {
                if (e.Data?.GetData(DataFormats.FileDrop) is string[] files && files.Length > 0)
                    OpenImage(files[0]);
            };

            Load       += async (_, _) => await AutoLoadAsync();
            FormClosed += (_, _) =>
            {
                _downloadCts?.Cancel();
                _processor.Dispose();
                _inputBmp?.Dispose();
                _outputBmp?.Dispose();
            };
        }

        // ── Auto model load / download ───────────────────────────────────

        private async Task AutoLoadAsync()
        {
            string path = ModelDownloader.DefaultModelPath;
            if (File.Exists(path)) { TryLoadModel(path); return; }

            var answer = MessageBox.Show(
                "U2Net ONNX 모델 파일이 없습니다.\n\n" +
                "자동으로 다운로드할까요? (약 176 MB)\n\n" +
                "저장 위치:\n" + path,
                "모델 다운로드",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);

            if (answer == DialogResult.Yes)
                await StartDownloadAsync(path);
        }

        private async Task StartDownloadAsync(string destination)
        {
            _downloadCts = new CancellationTokenSource();
            SetBusy(true);
            btnCancel.Visible  = true;
            btnDelModel.Visible = false;

            var progress = new Progress<(long dl, long total)>(p =>
            {
                int pct  = p.total > 0 ? (int)(p.dl * 100 / p.total) : 0;
                string sz = FormatBytes(p.dl) + (p.total > 0 ? $" / {FormatBytes(p.total)}" : "");
                SetDownloadProgress(pct, $"다운로드 중... {sz}  ({pct}%)");
            });

            try
            {
                await _downloader.DownloadAsync(
                    ModelDownloader.ModelUrl, destination, progress, _downloadCts.Token);

                MessageBox.Show(
                    "모델 다운로드 완료!\n이제 배경 제거를 사용할 수 있습니다.",
                    "완료", MessageBoxButtons.OK, MessageBoxIcon.Information);

                TryLoadModel(destination, wasDownloaded: true);
            }
            catch (OperationCanceledException)
            {
                string tmp = destination + ".tmp";
                if (File.Exists(tmp)) File.Delete(tmp);
                SetStatus("다운로드 취소됨");
            }
            catch (Exception ex)
            {
                SetStatus("다운로드 실패");
                MessageBox.Show($"오류:\n{ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                _downloadCts?.Dispose();
                _downloadCts       = null;
                btnCancel.Visible  = false;
                SetBusy(false);
            }
        }

        private void TryLoadModel(string path, bool wasDownloaded = false)
        {
            SetStatus("모델 로드 중...", working: true);
            try
            {
                _processor.Load(path);
                lblModelStatus.Text      = $"모델: {Path.GetFileName(path)}";
                lblModelStatus.ForeColor = Color.FromArgb(80, 210, 120);
                btnDelModel.Visible      = true;
                RefreshButtons();
                SetStatus(wasDownloaded ? "모델 다운로드 완료" : "모델 준비 완료");
            }
            catch (Exception ex)
            {
                SetStatus("모델 로드 실패");
                MessageBox.Show($"모델 로드 오류:\n{ex.Message}", "오류",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // ── Button handlers ──────────────────────────────────────────────

        private void BtnOpen_Click(object? sender, EventArgs e)
        {
            using var dlg = new OpenFileDialog
            {
                Title  = "이미지 열기",
                Filter = "이미지 파일|*.png;*.jpg;*.jpeg;*.bmp;*.webp|모든 파일|*.*"
            };
            if (dlg.ShowDialog() == DialogResult.OK)
                OpenImage(dlg.FileName);
        }

        private void BtnModel_Click(object? sender, EventArgs e)
        {
            using var dlg = new OpenFileDialog
            {
                Title  = "ONNX 모델 선택",
                Filter = "ONNX 모델|*.onnx|모든 파일|*.*"
            };
            if (dlg.ShowDialog() == DialogResult.OK)
                TryLoadModel(dlg.FileName);
        }

        private async void BtnRemove_Click(object? sender, EventArgs e)
        {
            if (_inputBmp == null || !_processor.IsLoaded) return;

            SetBusy(true);
            SetStatus("배경 제거 중...", working: true);

            try
            {
                var src    = (Bitmap)_inputBmp.Clone();
                var result = await Task.Run(() => _processor.Process(src));

                _outputBmp?.Dispose();
                _outputBmp                   = result;
                panelOutput.ShowCheckerboard = true;
                panelOutput.Image            = _outputBmp;
                btnSave.Enabled              = true;

                SetStatus($"완료  ({_outputBmp.Width} × {_outputBmp.Height})");
            }
            catch (Exception ex)
            {
                SetStatus("오류 발생");
                MessageBox.Show($"배경 제거 오류:\n{ex.Message}", "오류",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                SetBusy(false);
            }
        }

        private void BtnSave_Click(object? sender, EventArgs e)
        {
            if (_outputBmp == null) return;

            using var dlg = new SaveFileDialog
            {
                Title      = "결과 저장",
                Filter     = "PNG 파일|*.png|BMP 파일|*.bmp",
                DefaultExt = "png",
                FileName   = "result"
            };
            if (dlg.ShowDialog() != DialogResult.OK) return;

            var fmt = dlg.FilterIndex == 2 ? ImageFormat.Bmp : ImageFormat.Png;
            _outputBmp.Save(dlg.FileName, fmt);
            SetStatus($"저장 완료: {Path.GetFileName(dlg.FileName)}");
        }

        private void BtnCancel_Click(object? sender, EventArgs e) =>
            _downloadCts?.Cancel();

        private void BtnDelModel_Click(object? sender, EventArgs e)
        {
            string path = ModelDownloader.DefaultModelPath;
            if (!File.Exists(path))
            {
                MessageBox.Show("기본 경로에 모델 파일이 없습니다.", "알림",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            var answer = MessageBox.Show(
                $"다운로드된 모델 파일을 삭제하시겠습니까?\n\n{path}",
                "모델 삭제", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
            if (answer != DialogResult.Yes) return;

            try
            {
                _processor.Unload();
                File.Delete(path);
                lblModelStatus.Text      = "모델 미로드 — ONNX 모델 파일(.onnx)을 로드하세요";
                lblModelStatus.ForeColor = Color.FromArgb(170, 170, 170);
                btnDelModel.Visible      = false;
                RefreshButtons();
                SetStatus("모델 삭제 완료");
            }
            catch (Exception ex)
            {
                MessageBox.Show($"삭제 오류:\n{ex.Message}", "오류",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // ── Image loading ────────────────────────────────────────────────

        private void OpenImage(string path)
        {
            try
            {
                var bmp = new Bitmap(path);
                _inputBmp?.Dispose();
                _inputBmp = bmp;
                panelInput.Image = _inputBmp;

                _outputBmp?.Dispose();
                _outputBmp        = null;
                panelOutput.ShowCheckerboard = false;
                panelOutput.Image = null;
                btnSave.Enabled   = false;

                RefreshButtons();
                SetStatus($"이미지: {Path.GetFileName(path)}  ({bmp.Width} × {bmp.Height})");
            }
            catch (Exception ex)
            {
                MessageBox.Show($"이미지를 열 수 없습니다:\n{ex.Message}", "오류",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // ── Helpers ──────────────────────────────────────────────────────

        private void RefreshButtons()
        {
            btnRemove.Enabled = _inputBmp != null && _processor.IsLoaded;
        }

        private void SetStatus(string text, bool working = false)
        {
            lblStatus.Text      = text;
            progressBar.Visible = working;
            if (working) progressBar.Style = ProgressBarStyle.Marquee;
        }

        private void SetDownloadProgress(int percent, string text)
        {
            lblStatus.Text      = text;
            progressBar.Visible = true;
            progressBar.Style   = ProgressBarStyle.Continuous;
            progressBar.Value   = Math.Clamp(percent, 0, 100);
        }

        private void SetBusy(bool busy)
        {
            btnOpen.Enabled   = !busy;
            btnModel.Enabled  = !busy;
            btnRemove.Enabled = !busy && _inputBmp != null && _processor.IsLoaded;
            btnSave.Enabled   = !busy && _outputBmp != null;
            if (!busy) progressBar.Visible = false;
        }

        private static string FormatBytes(long bytes) =>
            bytes >= 1 << 20 ? $"{bytes / 1048576.0:F1} MB" :
            bytes >= 1 << 10 ? $"{bytes / 1024.0:F1} KB" :
            $"{bytes} B";
    }
}
