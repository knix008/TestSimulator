namespace OCRWinV10.Ocr;

public sealed class OcrInstallProgressForm : Form
{
    private readonly Label _lblTitle;
    private readonly Label _lblMessage;
    private readonly ProgressBar _progressBar;
    private readonly Button _btnCancel;
    private readonly CancellationTokenSource _cts = new();

    public OcrInstallProgressForm(IOcrProvider provider)
    {
        Text = "OCR 엔진 설치";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(460, 175);
        Font = new Font("Segoe UI", 9F);

        _lblTitle = new Label
        {
            AutoSize = false,
            Location = new Point(16, 16),
            Size = new Size(428, 24),
            Font = new Font(Font.FontFamily, 10F, FontStyle.Bold),
            Text = provider.DisplayName
        };

        _lblMessage = new Label
        {
            AutoSize = false,
            Location = new Point(16, 44),
            Size = new Size(428, 48),
            Text = provider.Description
        };

        _progressBar = new ProgressBar
        {
            Location = new Point(16, 96),
            Size = new Size(428, 22),
            Style = ProgressBarStyle.Marquee,
            MarqueeAnimationSpeed = 30
        };

        _btnCancel = new Button
        {
            Text = "취소",
            Location = new Point(369, 130),
            Size = new Size(75, 28),
            DialogResult = DialogResult.Cancel
        };
        _btnCancel.Click += (_, _) =>
        {
            _cts.Cancel();
            _btnCancel.Enabled = false;
            _lblMessage.Text = "취소하는 중...";
        };

        Controls.AddRange([_lblTitle, _lblMessage, _progressBar, _btnCancel]);
        CancelButton = _btnCancel;
        FormClosing += (_, e) =>
        {
            if (DialogResult == DialogResult.None)
            {
                _cts.Cancel();
                e.Cancel = false;
            }
        };
    }

    public void ApplyProgress(InstallProgressReport report)
    {
        _lblMessage.Text = report.Message;

        if (report.Percent is int pct)
        {
            _progressBar.Style = ProgressBarStyle.Continuous;
            _progressBar.MarqueeAnimationSpeed = 0;
            _progressBar.Value = Math.Clamp(pct, 0, 100);
        }
        else
        {
            _progressBar.Style = ProgressBarStyle.Marquee;
            _progressBar.MarqueeAnimationSpeed = 30;
        }
    }

    /// <summary>
    /// 미설치 엔진 설치를 모달 팝업으로 실행합니다.
    /// </summary>
    public static async Task<bool> RunInstallAsync(
        IWin32Window? owner,
        IOcrProvider provider,
        Func<IProgress<InstallProgressReport>, CancellationToken, Task<bool>> installAction,
        CancellationToken externalCancellation = default)
    {
        using var form = new OcrInstallProgressForm(provider);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(
            externalCancellation, form._cts.Token);

        var progress = new Progress<InstallProgressReport>(report =>
        {
            if (form.IsDisposed) return;
            if (form.InvokeRequired)
                form.BeginInvoke(() => form.ApplyProgress(report));
            else
                form.ApplyProgress(report);
        });

        var installTask = installAction(progress, linked.Token);

        form.Shown += async (_, _) =>
        {
            form.ApplyProgress(InstallProgressReport.Indeterminate(
                $"{provider.DisplayName} 설치를 시작합니다..."));

            bool success;
            try
            {
                success = await installTask.ConfigureAwait(true);
            }
            catch (OperationCanceledException)
            {
                success = false;
            }
            catch (Exception ex)
            {
                form.ApplyProgress(InstallProgressReport.Indeterminate($"오류: {ex.Message}"));
                await Task.Delay(1200).ConfigureAwait(true);
                success = false;
            }

            if (success)
            {
                form.ApplyProgress(InstallProgressReport.Determinate("설치 완료", 100));
                form.DialogResult = DialogResult.OK;
            }
            else if (!linked.Token.IsCancellationRequested)
            {
                form.ApplyProgress(InstallProgressReport.Indeterminate("설치에 실패했습니다."));
                await Task.Delay(800).ConfigureAwait(true);
                form.DialogResult = DialogResult.Cancel;
            }
            else
            {
                form.DialogResult = DialogResult.Cancel;
            }

            form.Close();
        };

        var result = form.ShowDialog(owner);
        return result == DialogResult.OK;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
            _cts.Dispose();
        base.Dispose(disposing);
    }
}
