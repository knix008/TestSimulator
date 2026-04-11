using System;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using YOLO26V10.yolo26;

namespace YOLO26V10
{
    internal partial class PythonExportDependencyDialog : Form
    {
        private CancellationTokenSource _cts;
        private PythonExportDependencyResult _last;

        public PythonExportDependencyDialog()
        {
            InitializeComponent();
            Font = UiTheme.UiFont(9f);
            BackColor = UiTheme.Surface;
            ForeColor = UiTheme.TextPrimary;
            lblTitle.ForeColor = UiTheme.TextPrimary;
            lblSummary.ForeColor = UiTheme.TextPrimary;
            lblProgress.ForeColor = UiTheme.TextSecondary;
            UiTheme.StylePrimaryButton(btnCheck);
            UiTheme.StylePrimaryButton(btnInstall);
            UiTheme.StyleSecondaryButton(btnClose);
            txtLog.BorderStyle = BorderStyle.FixedSingle;
            txtLog.BackColor = UiTheme.LogBack;
            txtLog.ForeColor = UiTheme.TextPrimary;
            txtLog.Font = UiTheme.UiFont(9f);
            FormClosing += (_, __) => _cts?.Cancel();
            Shown += PythonExportDependencyDialog_Shown;
        }

        private async void PythonExportDependencyDialog_Shown(object sender, EventArgs e)
        {
            await RunCheckAsync().ConfigureAwait(true);
        }

        private void SetBusy(bool busy, string progressText)
        {
            btnCheck.Enabled = !busy;
            btnInstall.Enabled = !busy && _last != null && _last.Issue == PythonExportIssue.PipPackagesMissing;
            progressBar.Visible = busy;
            progressBar.Style = busy ? ProgressBarStyle.Marquee : ProgressBarStyle.Continuous;
            progressBar.MarqueeAnimationSpeed = busy ? 35 : 0;
            lblProgress.Text = busy ? (progressText ?? "") : "";
        }

        private async Task RunCheckAsync()
        {
            SetBusy(true, "의존성 검사 중...");
            try
            {
                _last = await Task.Run(() => Yolo26ModelPreparer.EvaluatePythonExportDependencies())
                    .ConfigureAwait(true);
                lblSummary.Text = PythonExportDependencyUi.FormatDependencyReport(_last);
            }
            finally
            {
                SetBusy(false, null);
            }
        }

        private async void btnCheck_Click(object sender, EventArgs e)
        {
            await RunCheckAsync().ConfigureAwait(true);
        }

        private async void btnInstall_Click(object sender, EventArgs e)
        {
            if (_last == null || _last.Issue != PythonExportIssue.PipPackagesMissing)
                return;

            _cts?.Cancel();
            _cts = new CancellationTokenSource();

            SetBusy(true, "pip install 실행 중...");
            try
            {
                AppendLog("");
                AppendLog("--- pip install -r requirements-export.txt ---");
                var log = new Progress<string>(AppendLog);
                var ok = await Task.Run(
                        () => Yolo26ModelPreparer.InstallPythonExportRequirements(
                            _last.PythonExecutable,
                            _last.PythonPrefixArguments,
                            _last.RequirementsFilePath,
                            log,
                            _cts.Token),
                        _cts.Token)
                    .ConfigureAwait(true);

                if (!ok)
                {
                    MessageBox.Show(
                        this,
                        "pip 설치가 실패했습니다. PowerShell에서 tools\\setup-python.ps1 을 시도해 보세요.",
                        "패키지 설치",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning);
                }
            }
            catch (OperationCanceledException)
            {
                AppendLog("(작업 취소)");
            }
            finally
            {
                SetBusy(false, null);
            }

            await RunCheckAsync().ConfigureAwait(true);
        }

        private void btnClose_Click(object sender, EventArgs e)
        {
            Close();
        }

        private void AppendLog(string line)
        {
            if (IsDisposed || txtLog == null || txtLog.IsDisposed || !txtLog.IsHandleCreated)
                return;

            if (txtLog.InvokeRequired)
            {
                try
                {
                    BeginInvoke(new Action(() => AppendLog(line)));
                }
                catch (ObjectDisposedException)
                {
                }
                catch (InvalidOperationException)
                {
                }

                return;
            }

            txtLog.AppendText(line + Environment.NewLine);
        }
    }
}
