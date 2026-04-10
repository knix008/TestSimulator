using System;
using System.Drawing;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using YOLO26V10.yolo26;

namespace YOLO26V10
{
    internal partial class ModelDownloadDialog : Form
    {
        private CancellationTokenSource _cts;
        private readonly YoloModelKind _kind;

        public ModelDownloadDialog(string initialVariant, YoloModelKind kind)
        {
            InitializeComponent();
            _kind = kind;
            SelectedVariant = initialVariant ?? "n";
            var common =
                "아래에서 변형을 고른 뒤 [Download + ONNX Convert]를 누르면 .pt를 내려받고 Python(Ultralytics)으로 ONNX를 생성합니다.\r\n" +
                "[다시 시도] 시 해당 모델의 로컬 파일을 지우고 처음부터 다시 받습니다. 오류가 나면 안내 창에서 [다시 시도]를 누르거나, 닫은 뒤 같은 버튼으로 다시 실행할 수 있습니다.\r\n" +
                "(Python 3 및 pip install ultralytics 필요)";
            switch (kind)
            {
                case YoloModelKind.Segmentation:
                    lblInfo.Text = "YOLO26 세그멘테이션용 ONNX 모델이 없습니다.\r\n" + common;
                    Text = "세그멘테이션 모델 다운로드";
                    break;
                case YoloModelKind.Detection:
                    lblInfo.Text = "YOLO26 객체 검출용 ONNX 모델이 없습니다.\r\n" + common;
                    Text = "객체 검출 모델 다운로드";
                    break;
                case YoloModelKind.Pose:
                    lblInfo.Text = "YOLO26 포즈 추정용 ONNX 모델이 없습니다.\r\n" + common;
                    Text = "포즈 모델 다운로드";
                    break;
                case YoloModelKind.Classify:
                    lblInfo.Text = "YOLO26 이미지 분류용 ONNX 모델이 없습니다.\r\n" + common;
                    Text = "분류 모델 다운로드";
                    break;
                case YoloModelKind.Obb:
                    lblInfo.Text = "YOLO26 회전 박스(OBB)용 ONNX 모델이 없습니다.\r\n" + common;
                    Text = "OBB 모델 다운로드";
                    break;
                default:
                    lblInfo.Text = "YOLO26 ONNX 모델이 없습니다.\r\n" + common;
                    Text = "모델 다운로드";
                    break;
            }
            comboVariant.Items.Clear();
            foreach (var c in Yolo26SegModelChoice.All)
                comboVariant.Items.Add(c);

            for (var i = 0; i < comboVariant.Items.Count; i++)
            {
                if (comboVariant.Items[i] is Yolo26SegModelChoice ch && ch.Variant == SelectedVariant)
                {
                    comboVariant.SelectedIndex = i;
                    break;
                }
            }

            if (comboVariant.SelectedIndex < 0)
                comboVariant.SelectedIndex = 0;

            Font = UiTheme.UiFont(9f);
            BackColor = UiTheme.Surface;
            ForeColor = UiTheme.TextPrimary;
            lblInfo.ForeColor = UiTheme.TextPrimary;
            lblVariant.ForeColor = UiTheme.TextSecondary;
            lblProgress.ForeColor = UiTheme.TextSecondary;
            UiTheme.StylePrimaryButton(btnDownload);
            UiTheme.StyleSecondaryButton(btnCancel);
            comboVariant.FlatStyle = FlatStyle.Flat;
            txtLog.BorderStyle = BorderStyle.FixedSingle;
            txtLog.BackColor = UiTheme.LogBack;
            txtLog.ForeColor = UiTheme.TextPrimary;
            txtLog.Font = UiTheme.UiFont(9f);
        }

        public string SelectedVariant { get; private set; }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            _cts?.Cancel();
            base.OnFormClosing(e);
        }

        private void AppendLog(string line)
        {
            if (txtLog.InvokeRequired)
            {
                BeginInvoke(new Action(() => AppendLog(line)));
                return;
            }

            txtLog.AppendText(line + Environment.NewLine);
        }

        private void ApplyPrepareProgress(ModelPrepareProgress p)
        {
            if (progressBar.InvokeRequired)
            {
                BeginInvoke(new Action(() => ApplyPrepareProgress(p)));
                return;
            }

            switch (p.Phase)
            {
                case ModelPreparePhase.Checking:
                    progressBar.Style = ProgressBarStyle.Continuous;
                    progressBar.MarqueeAnimationSpeed = 0;
                    progressBar.Maximum = 100;
                    progressBar.Value = 0;
                    break;
                case ModelPreparePhase.Downloading:
                    if (p.Percent.HasValue)
                    {
                        progressBar.Style = ProgressBarStyle.Continuous;
                        progressBar.MarqueeAnimationSpeed = 0;
                        progressBar.Maximum = 100;
                        var v = p.Percent.Value;
                        if (v < 0)
                            v = 0;
                        if (v > 100)
                            v = 100;
                        progressBar.Value = v;
                    }
                    else
                    {
                        progressBar.Style = ProgressBarStyle.Marquee;
                        progressBar.MarqueeAnimationSpeed = 35;
                    }

                    break;
                case ModelPreparePhase.Converting:
                    progressBar.Style = ProgressBarStyle.Marquee;
                    progressBar.MarqueeAnimationSpeed = 35;
                    break;
                case ModelPreparePhase.Done:
                    progressBar.Style = ProgressBarStyle.Continuous;
                    progressBar.MarqueeAnimationSpeed = 0;
                    progressBar.Maximum = 100;
                    progressBar.Value = 100;
                    break;
            }

            lblProgress.Text = p.Detail;
        }

        private void ResetProgressUi()
        {
            if (progressBar.InvokeRequired)
            {
                BeginInvoke(new Action(ResetProgressUi));
                return;
            }

            progressBar.Style = ProgressBarStyle.Continuous;
            progressBar.MarqueeAnimationSpeed = 0;
            progressBar.Maximum = 100;
            progressBar.Value = 0;
            lblProgress.Text = string.Empty;
        }

        private async void btnDownload_Click(object sender, EventArgs e)
        {
            var variant = comboVariant.SelectedItem is Yolo26SegModelChoice sel
                ? sel.Variant
                : "n";
            var attempt = 0;

            while (true)
            {
                attempt++;
                _cts?.Cancel();
                _cts = new CancellationTokenSource();
                var token = _cts.Token;

                if (attempt == 1)
                {
                    txtLog.Clear();
                    ResetProgressUi();
                }
                else
                {
                    AppendLog(string.Empty);
                    AppendLog("--- 재시도: 기존 가중치·ONNX를 삭제한 뒤 처음부터 다시 받습니다 ---");
                    Yolo26ModelPreparer.DeletePreparedAssets(variant, _kind);
                    ResetProgressUi();
                }

                btnDownload.Enabled = false;
                btnCancel.Text = "중지";
                comboVariant.Enabled = false;
                try
                {
                    var progress = new Progress<string>(AppendLog);
                    var barProgress = new Progress<ModelPrepareProgress>(ApplyPrepareProgress);
                    await Yolo26ModelPreparer.EnsureOnnxModelAsync(
                            variant,
                            progress,
                            token,
                            forceReexport: attempt > 1,
                            prepareProgress: barProgress,
                            kind: _kind)
                        .ConfigureAwait(true);

                    SelectedVariant = variant;
                    DialogResult = DialogResult.OK;
                    Close();
                    return;
                }
                catch (OperationCanceledException)
                {
                    AppendLog("작업이 취소되었습니다.");
                    break;
                }
                catch (Exception ex)
                {
                    AppendLog("오류: " + ex.Message);
                    var msg = ex.Message + Environment.NewLine + Environment.NewLine +
                              "[다시 시도]를 누르면 이 모델의 로컬 .pt / ONNX를 삭제한 뒤 다시 받고 변환합니다.\r\n" +
                              "네트워크·디스크·Python 환경도 함께 확인해 주세요.";
                    var dr = MessageBox.Show(
                        this,
                        msg,
                        "모델 다운로드",
                        MessageBoxButtons.RetryCancel,
                        MessageBoxIcon.Warning);
                    if (dr != DialogResult.Retry)
                        break;
                }
                finally
                {
                    btnDownload.Enabled = true;
                    btnCancel.Text = "닫기";
                    comboVariant.Enabled = true;
                }
            }

            if (DialogResult != DialogResult.OK)
                ResetProgressUi();
        }

        private void btnCancel_Click(object sender, EventArgs e)
        {
            if (btnDownload.Enabled == false)
            {
                _cts?.Cancel();
                return;
            }

            DialogResult = DialogResult.Cancel;
            Close();
        }
    }
}

