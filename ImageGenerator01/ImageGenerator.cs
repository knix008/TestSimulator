using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace ImageGenerator01
{
    public partial class Form1 : Form
    {
        private static readonly HttpClient _http = new() { Timeout = TimeSpan.FromMinutes(10) };
        private Image? _currentImage;

        public Form1()
        {
            InitializeComponent();
        }

        // ---------------------------------------------------------------
        // 서버 연결 확인
        // ---------------------------------------------------------------
        private async void BtnCheckServer_Click(object sender, EventArgs e)
        {
            SetStatus("서버 연결 확인 중...");
            try
            {
                var resp = await _http.GetAsync($"{ServerUrl}/health");
                if (resp.IsSuccessStatusCode)
                    SetStatus("서버 연결 OK");
                else
                    SetStatus($"서버 응답 오류: {resp.StatusCode}");
            }
            catch (Exception ex)
            {
                SetStatus($"연결 실패: {ex.Message}");
            }
        }

        // ---------------------------------------------------------------
        // 이미지 생성
        // ---------------------------------------------------------------
        private async void BtnGenerate_Click(object sender, EventArgs e)
        {
            if (string.IsNullOrWhiteSpace(txtPrompt.Text))
            {
                MessageBox.Show("Prompt를 입력하세요.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            SetGenerating(true);

            var request = new GenerateRequest
            {
                Prompt = txtPrompt.Text.Trim(),
                NegativePrompt = txtNegativePrompt.Text.Trim(),
                Width = (int)nudWidth.Value,
                Height = (int)nudHeight.Value,
                NumInferenceSteps = (int)nudSteps.Value,
                GuidanceScale = (double)nudGuidance.Value,
                TrueCfgScale = (double)nudTrueCfg.Value,
                MaxSequenceLength = (int)nudMaxSeqLen.Value,
                Seed = (int)nudSeed.Value,
            };

            try
            {
                SetStatus("이미지 생성 중... (수십 초 소요될 수 있습니다)");

                var resp = await _http.PostAsJsonAsync($"{ServerUrl}/generate", request);
                if (!resp.IsSuccessStatusCode)
                {
                    var err = await resp.Content.ReadAsStringAsync();
                    SetStatus($"오류: {resp.StatusCode}");
                    MessageBox.Show($"서버 오류:\n{err}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                var result = await resp.Content.ReadFromJsonAsync<GenerateResponse>();
                if (result is null)
                {
                    SetStatus("응답 파싱 실패");
                    return;
                }

                // base64 → Image
                byte[] imgBytes = Convert.FromBase64String(result.ImageBase64);
                using var ms = new MemoryStream(imgBytes);
                _currentImage?.Dispose();
                _currentImage = Image.FromStream(ms);
                picResult.Image = _currentImage;

                btnSave.Enabled = true;
                string clippedMsg = result.TokenClipped > 0 ? $"  ⚠ {result.TokenClipped}토큰 잘림" : "";
                SetStatus($"생성 완료  |  {result.Width}×{result.Height}  |  seed: {result.Seed}  |  T5 토큰: {result.TokenCount}{clippedMsg}");
            }
            catch (TaskCanceledException)
            {
                SetStatus("타임아웃 — 서버가 응답하지 않습니다.");
            }
            catch (Exception ex)
            {
                SetStatus($"오류: {ex.Message}");
                MessageBox.Show(ex.Message, "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                SetGenerating(false);
            }
        }

        // ---------------------------------------------------------------
        // 이미지 저장
        // ---------------------------------------------------------------
        private void BtnSave_Click(object sender, EventArgs e)
        {
            if (_currentImage is null) return;

            using var dlg = new SaveFileDialog
            {
                Filter = "PNG 이미지|*.png|JPEG 이미지|*.jpg",
                FileName = $"flux_{DateTime.Now:yyyyMMdd_HHmmss}",
            };

            if (dlg.ShowDialog() != DialogResult.OK) return;

            var fmt = dlg.FileName.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase)
                ? System.Drawing.Imaging.ImageFormat.Jpeg
                : System.Drawing.Imaging.ImageFormat.Png;

            _currentImage.Save(dlg.FileName, fmt);
            SetStatus($"저장 완료: {dlg.FileName}");
        }

        // ---------------------------------------------------------------
        // 헬퍼
        // ---------------------------------------------------------------
        private string ServerUrl => txtServerUrl.Text.TrimEnd('/');

        private void SetStatus(string msg) => lblStatus.Text = msg;

        private void SetGenerating(bool generating)
        {
            btnGenerate.Enabled = !generating;
            btnCheckServer.Enabled = !generating;
            nudWidth.Enabled = !generating;
            nudHeight.Enabled = !generating;
            nudSteps.Enabled = !generating;
            nudGuidance.Enabled = !generating;
            nudTrueCfg.Enabled = !generating;
            nudMaxSeqLen.Enabled = !generating;
            nudSeed.Enabled = !generating;
        }

        private void InitializeComponent()
        {

        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            _currentImage?.Dispose();
            base.OnFormClosed(e);
        }
    }

    // ---------------------------------------------------------------
    // API 요청/응답 DTO
    // ---------------------------------------------------------------
    internal sealed class GenerateRequest
    {
        [JsonPropertyName("prompt")]
        public string Prompt { get; set; } = "";

        [JsonPropertyName("positive_prompt")]
        public string PositivePrompt { get; set; } = "";

        [JsonPropertyName("negative_prompt")]
        public string NegativePrompt { get; set; } = "";

        [JsonPropertyName("width")]
        public int Width { get; set; } = 1024;

        [JsonPropertyName("height")]
        public int Height { get; set; } = 1024;

        [JsonPropertyName("num_inference_steps")]
        public int NumInferenceSteps { get; set; } = 28;

        [JsonPropertyName("guidance_scale")]
        public double GuidanceScale { get; set; } = 3.5;

        [JsonPropertyName("true_cfg_scale")]
        public double TrueCfgScale { get; set; } = 1.0;

        [JsonPropertyName("max_sequence_length")]
        public int MaxSequenceLength { get; set; } = 512;

        [JsonPropertyName("seed")]
        public int Seed { get; set; } = -1;
    }

    internal sealed class GenerateResponse
    {
        [JsonPropertyName("image_base64")]
        public string ImageBase64 { get; set; } = "";

        [JsonPropertyName("width")]
        public int Width { get; set; }

        [JsonPropertyName("height")]
        public int Height { get; set; }

        [JsonPropertyName("seed")]
        public int Seed { get; set; }

        [JsonPropertyName("token_count")]
        public int TokenCount { get; set; }

        [JsonPropertyName("token_clipped")]
        public int TokenClipped { get; set; }
    }
}
