using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace Yolo26Detection1._0
{
    internal sealed class ModelPrepareDialog : Form
    {
        private readonly string _projectRoot;
        private readonly string _targetOnnxPath;

        private readonly Label _lblStatus;
        private readonly ProgressBar _progress;
        private readonly TextBox _txtLog;
        private readonly Button _btnOk;
        private readonly Timer _progressTimer;

        private bool _running;
        internal bool IsSuccess { get; private set; }

        internal ModelPrepareDialog(string projectRoot, string targetOnnxPath)
        {
            _projectRoot = projectRoot;
            _targetOnnxPath = targetOnnxPath;

            Text = "모델 다운로드/변환";
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            Width = 700;
            Height = 430;

            _lblStatus = new Label
            {
                Left = 12,
                Top = 12,
                Width = 660,
                Height = 32,
                Text = "YOLO26 모델을 다운로드하고 ONNX로 변환하는 중..."
            };
            Controls.Add(_lblStatus);

            _progress = new ProgressBar
            {
                Left = 12,
                Top = 48,
                Width = 660,
                Height = 20,
                Minimum = 0,
                Maximum = 100,
                Value = 0,
                Style = ProgressBarStyle.Continuous
            };
            Controls.Add(_progress);

            _txtLog = new TextBox
            {
                Left = 12,
                Top = 76,
                Width = 660,
                Height = 270,
                Multiline = true,
                ScrollBars = ScrollBars.Vertical,
                ReadOnly = true
            };
            Controls.Add(_txtLog);

            _btnOk = new Button
            {
                Left = 597,
                Top = 352,
                Width = 75,
                Height = 28,
                Text = "대기 중",
                Enabled = false
            };
            _btnOk.Click += (s, e) => DialogResult = DialogResult.OK;
            Controls.Add(_btnOk);

            _progressTimer = new Timer { Interval = 200 };
            _progressTimer.Tick += (s, e) =>
            {
                if (_progress.Value < 95)
                    _progress.Value += 1;
            };

            Shown += async (s, e) => await RunPrepareAsync();
            FormClosing += ModelPrepareDialog_FormClosing;
        }

        private void ModelPrepareDialog_FormClosing(object sender, FormClosingEventArgs e)
        {
            if (_running)
                e.Cancel = true;
        }

        private async Task RunPrepareAsync()
        {
            _running = true;
            _progressTimer.Start();
            AppendLog("변환 스크립트 실행:");
            AppendLog("python python/download_and_export_onnx.py");
            AppendLog("");

            string scriptPath = Path.Combine(_projectRoot, "python", "download_and_export_onnx.py");
            if (!File.Exists(scriptPath))
            {
                MarkFailed("변환 스크립트를 찾을 수 없습니다: " + scriptPath);
                return;
            }

            var psi = new ProcessStartInfo
            {
                FileName = "python",
                Arguments = "\"python/download_and_export_onnx.py\"",
                WorkingDirectory = _projectRoot,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            try
            {
                using (var p = new Process { StartInfo = psi, EnableRaisingEvents = true })
                {
                    p.OutputDataReceived += (s, e) => { if (!string.IsNullOrWhiteSpace(e.Data)) AppendLog(e.Data); };
                    p.ErrorDataReceived += (s, e) => { if (!string.IsNullOrWhiteSpace(e.Data)) AppendLog("[ERR] " + e.Data); };
                    p.Start();
                    p.BeginOutputReadLine();
                    p.BeginErrorReadLine();
                    await Task.Run(() => p.WaitForExit());

                    if (p.ExitCode != 0)
                    {
                        MarkFailed("모델 준비 실패 (exit code " + p.ExitCode + ")");
                        return;
                    }
                }
            }
            catch (Exception ex)
            {
                MarkFailed("모델 준비 실행 오류: " + ex.Message);
                return;
            }

            if (!File.Exists(_targetOnnxPath))
            {
                MarkFailed("변환은 끝났지만 ONNX 파일을 찾지 못했습니다: " + _targetOnnxPath);
                return;
            }

            _progressTimer.Stop();
            _progress.Value = 100;
            _lblStatus.Text = "변환 완료. 아래 확인 버튼을 눌러 계속 진행하세요.";
            AppendLog("");
            AppendLog("완료: " + _targetOnnxPath);
            _btnOk.Text = "확인";
            _btnOk.Enabled = true;
            IsSuccess = true;
            _running = false;
        }

        private void MarkFailed(string message)
        {
            _progressTimer.Stop();
            _lblStatus.Text = "변환 실패. 로그를 확인하세요.";
            AppendLog("");
            AppendLog(message);
            _btnOk.Text = "닫기";
            _btnOk.Enabled = true;
            IsSuccess = false;
            _running = false;
        }

        private void AppendLog(string line)
        {
            if (InvokeRequired)
            {
                BeginInvoke((Action)(() => AppendLog(line)));
                return;
            }
            _txtLog.AppendText(line + Environment.NewLine);
        }
    }
}
