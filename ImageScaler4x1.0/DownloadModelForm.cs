using System;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace ImageScaler4x1._0
{
    public partial class DownloadModelForm : Form
    {
        private static readonly (string Name, string Url, string FileName)[] PredefinedModels =
        {
            (
                "RealESRGAN x4plus - General (Qualcomm, ~67 MB)",
                "https://huggingface.co/qualcomm/Real-ESRGAN-x4plus/resolve/01179a4da7bf5ac91faca650e6afbf282ac93933/Real-ESRGAN-x4plus.onnx",
                "RealESRGAN_x4plus.onnx"
            ),
        };

        private CancellationTokenSource? cts;

        // 다운로드 완료 시 저장된 파일 경로 (호출자가 참조)
        public string? SavedFilePath { get; private set; }

        public DownloadModelForm()
        {
            InitializeComponent();
            foreach (var (name, _, _) in PredefinedModels)
                cmbModel.Items.Add(name);
            cmbModel.Items.Add("직접 URL 입력...");
            cmbModel.SelectedIndex = 0;
        }

        private void cmbModel_SelectedIndexChanged(object? sender, EventArgs e)
        {
            int idx = cmbModel.SelectedIndex;
            if (idx < PredefinedModels.Length)
            {
                var (_, url, fileName) = PredefinedModels[idx];
                txtUrl.Text      = url;
                txtSavePath.Text = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, fileName);
            }
            else
            {
                txtUrl.Text      = "";
                txtSavePath.Text = "";
            }
        }

        private void btnBrowseSave_Click(object? sender, EventArgs e)
        {
            using var dlg = new SaveFileDialog();
            dlg.Filter           = "ONNX 모델|*.onnx";
            dlg.FileName         = Path.GetFileName(txtSavePath.Text);
            dlg.InitialDirectory = Path.GetDirectoryName(txtSavePath.Text)
                                   ?? AppDomain.CurrentDomain.BaseDirectory;
            if (dlg.ShowDialog() == DialogResult.OK)
                txtSavePath.Text = dlg.FileName;
        }

        private async void btnDownload_Click(object? sender, EventArgs e)
        {
            if (string.IsNullOrWhiteSpace(txtUrl.Text) || string.IsNullOrWhiteSpace(txtSavePath.Text))
            {
                MessageBox.Show("URL과 저장 경로를 입력하세요.", "입력 오류",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            // 버튼을 취소 모드로 전환
            cts = new CancellationTokenSource();
            btnDownload.Text   = "취소";
            btnDownload.Click -= btnDownload_Click;
            btnDownload.Click += btnCancel_Click;
            btnClose.Enabled   = false;
            progressBar.Value  = 0;
            SetStatus("다운로드 중...", System.Drawing.Color.Blue);

            try
            {
                await DownloadFileAsync(txtUrl.Text, txtSavePath.Text, cts.Token);
                SavedFilePath = txtSavePath.Text;
                progressBar.Value = 100;
                SetStatus($"완료: {Path.GetFileName(txtSavePath.Text)}", System.Drawing.Color.Green);
            }
            catch (OperationCanceledException)
            {
                progressBar.Value = 0;
                SetStatus("취소됨", System.Drawing.Color.Gray);
                TryDeletePartialFile(txtSavePath.Text);
            }
            catch (Exception ex)
            {
                SetStatus($"오류: {ex.Message}", System.Drawing.Color.Red);
                TryDeletePartialFile(txtSavePath.Text);
            }
            finally
            {
                btnDownload.Click -= btnCancel_Click;
                btnDownload.Click += btnDownload_Click;
                btnDownload.Text   = "다운로드";
                btnClose.Enabled   = true;
                cts?.Dispose();
                cts = null;
            }
        }

        private void btnCancel_Click(object? sender, EventArgs e) => cts?.Cancel();

        private async Task DownloadFileAsync(string url, string savePath, CancellationToken token)
        {
            // HuggingFace는 CDN으로 리다이렉트하므로 AllowAutoRedirect = true 명시
            var handler = new HttpClientHandler
            {
                AllowAutoRedirect    = true,
                MaxAutomaticRedirections = 10,
            };
            using var client = new HttpClient(handler);
            client.DefaultRequestHeaders.Add("User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
            client.Timeout = TimeSpan.FromMinutes(10);

            SetStatus("서버에 연결 중...", System.Drawing.Color.Blue);
            using var response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, token);

            if (!response.IsSuccessStatusCode)
                throw new Exception($"HTTP {(int)response.StatusCode} {response.ReasonPhrase}");

            long? totalBytes = response.Content.Headers.ContentLength;

            string? dir = Path.GetDirectoryName(savePath);
            if (!string.IsNullOrEmpty(dir))
                Directory.CreateDirectory(dir);

            using var src  = await response.Content.ReadAsStreamAsync(token);
            using var dest = new FileStream(savePath, FileMode.Create, FileAccess.Write,
                                            FileShare.None, 65536, useAsync: true);
            byte[] buf        = new byte[65536];
            long   downloaded = 0;
            int    read;

            while ((read = await src.ReadAsync(buf, token)) > 0)
            {
                await dest.WriteAsync(buf.AsMemory(0, read), token);
                downloaded += read;

                string sizeStr = totalBytes is > 0
                    ? $"{downloaded / 1048576.0:F1} MB / {totalBytes.Value / 1048576.0:F1} MB " +
                      $"({downloaded * 100 / totalBytes.Value}%)"
                    : $"{downloaded / 1048576.0:F1} MB";

                int pct = totalBytes is > 0 ? (int)(downloaded * 100 / totalBytes.Value) : 0;
                progressBar.Value = Math.Min(pct, 99);
                SetStatus($"다운로드 중... {sizeStr}", System.Drawing.Color.Blue);
            }
        }

        private static void TryDeletePartialFile(string path)
        {
            try { if (File.Exists(path)) File.Delete(path); } catch { }
        }

        private void SetStatus(string message, System.Drawing.Color color)
        {
            lblDownloadStatus.Text      = message;
            lblDownloadStatus.ForeColor = color;
        }
    }
}
