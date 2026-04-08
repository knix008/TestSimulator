using System;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using YOLO26SegmentationV10.Segmentation;

namespace YOLO26SegmentationV10
{
    internal partial class ModelDownloadDialog : Form
    {
        private CancellationTokenSource _cts;

        public ModelDownloadDialog(string initialVariant)
        {
            InitializeComponent();
            SelectedVariant = initialVariant ?? "n";
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
            _cts?.Cancel();
            _cts = new CancellationTokenSource();
            var variant = comboVariant.SelectedItem is Yolo26SegModelChoice sel
                ? sel.Variant
                : "n";
            btnDownload.Enabled = false;
            btnCancel.Text = "중지";
            comboVariant.Enabled = false;
            txtLog.Clear();
            ResetProgressUi();
            try
            {
                var progress = new Progress<string>(AppendLog);
                var barProgress = new Progress<ModelPrepareProgress>(ApplyPrepareProgress);
                await Yolo26ModelPreparer.EnsureOnnxModelAsync(
                        variant,
                        progress,
                        _cts.Token,
                        forceReexport: false,
                        prepareProgress: barProgress)
                    .ConfigureAwait(true);

                SelectedVariant = variant;
                DialogResult = DialogResult.OK;
                Close();
            }
            catch (OperationCanceledException)
            {
                AppendLog("작업이 취소되었습니다.");
            }
            catch (Exception ex)
            {
                AppendLog("오류: " + ex.Message);
                MessageBox.Show(this, ex.Message, "모델 다운로드", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            finally
            {
                btnDownload.Enabled = true;
                btnCancel.Text = "닫기";
                comboVariant.Enabled = true;
                if (DialogResult != DialogResult.OK)
                    ResetProgressUi();
            }
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
