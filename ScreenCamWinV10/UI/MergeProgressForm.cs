using ScreenCamWin.Core;

namespace ScreenCamWin.UI;

internal sealed class MergeProgressForm : Form
{
    private readonly ProgressBar _progressBar = new();
    private readonly Label       _lblStatus   = new();
    private readonly Label       _lblPercent  = new();
    private readonly Label       _lblHint    = new();

    private Exception? _error;

    string _tempVideoPath  = string.Empty;
    string _tempAudioPath  = string.Empty;
    string _savedVideoPath = string.Empty;
    string _savedAudioPath = string.Empty;
    string? _mergedPath;

    public string? SavedVideoPath => _savedVideoPath;
    public string? SavedAudioPath => _savedAudioPath;
    public string? MergedPath     => _mergedPath;
    public Exception? Error => _error;

    MergeProgressForm()
    {
        Text            = "저장 중";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox     = false;
        MinimizeBox     = false;
        ShowInTaskbar   = false;
        StartPosition   = FormStartPosition.CenterParent;
        ClientSize      = new Size(420, 130);
        BackColor       = Theme.BgMain;
        Font            = Theme.FontBody;

        _lblStatus.AutoSize  = false;
        _lblStatus.Location  = new Point(20, 14);
        _lblStatus.Size      = new Size(300, 22);
        _lblStatus.ForeColor = Theme.TextMain;
        _lblStatus.Text      = "준비 중…";

        _lblPercent.AutoSize  = false;
        _lblPercent.Location  = new Point(330, 14);
        _lblPercent.Size      = new Size(70, 22);
        _lblPercent.ForeColor = Theme.TextMain;
        _lblPercent.Text      = "0%";
        _lblPercent.TextAlign = ContentAlignment.MiddleRight;

        _progressBar.Location = new Point(20, 48);
        _progressBar.Size     = new Size(380, 24);
        _progressBar.Minimum  = 0;
        _progressBar.Maximum  = 100;
        _progressBar.Value    = 0;
        Theme.ApplyProgressBar(_progressBar, Theme.BgMain);

        _lblHint.AutoSize  = false;
        _lblHint.Location  = new Point(20, 82);
        _lblHint.Size      = new Size(380, 36);
        _lblHint.ForeColor = Theme.TextSub;

        Controls.Add(_lblStatus);
        Controls.Add(_lblPercent);
        Controls.Add(_progressBar);
        Controls.Add(_lblHint);
    }

    /// <summary>Mic on: save separate video + audio, then FFmpeg merge (merged file only in this path).</summary>
    public static bool ShowSaveAndMerge(
        IWin32Window owner,
        string tempVideoPath,
        string tempAudioPath,
        string savedVideoPath,
        string savedAudioPath,
        string mergedOutputPath,
        out string? savedVideo,
        out string? savedAudio,
        out string? mergedPath,
        out Exception? error)
    {
        using var form = new MergeProgressForm
        {
            _tempVideoPath  = tempVideoPath,
            _tempAudioPath  = tempAudioPath,
            _savedVideoPath = savedVideoPath,
            _savedAudioPath = savedAudioPath,
            _mergedPath     = mergedOutputPath,
            _lblHint        = { Text = "영상·오디오를 저장한 뒤 Windows 내장 기능으로 합칩니다." },
        };

        form.ShowDialog(owner);
        error      = form._error;
        savedVideo = form._savedVideoPath;
        savedAudio = form._savedAudioPath;
        mergedPath = form._mergedPath;
        return form.DialogResult == DialogResult.OK;
    }

    /// <summary>Mic on but no FFmpeg: separate files only — no merged output.</summary>
    public static bool ShowSaveSeparateOnly(
        IWin32Window owner,
        string tempVideoPath,
        string? tempAudioPath,
        string savedVideoPath,
        string? savedAudioPath,
        out string? savedVideo,
        out string? savedAudio,
        out Exception? error)
    {
        using var form = new MergeProgressForm
        {
            _tempVideoPath  = tempVideoPath,
            _tempAudioPath  = tempAudioPath ?? string.Empty,
            _savedVideoPath = savedVideoPath,
            _savedAudioPath = savedAudioPath ?? string.Empty,
            _mergedPath     = null,
            _lblHint        = { Text = "영상·오디오 파일만 저장합니다. (합친 파일은 만들지 않습니다)" },
        };

        form.ShowDialog(owner);
        error      = form._error;
        savedVideo = form._savedVideoPath;
        savedAudio = form._savedAudioPath;
        return form.DialogResult == DialogResult.OK;
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        _ = _mergedPath is null ? RunSaveSeparateOnlyAsync() : RunSaveAndMergeAsync();
    }

    async Task RunSaveSeparateOnlyAsync()
    {
        try
        {
            var progress = new Progress<MergeProgress>(p => ApplyProgress(p));

            await RecordingSaveHelper.CopyFileWithProgressAsync(
                _tempVideoPath, _savedVideoPath,
                "영상 파일 저장 중…", 0, 50, progress).ConfigureAwait(true);

            if (!string.IsNullOrEmpty(_tempAudioPath) && File.Exists(_tempAudioPath)
                && !string.IsNullOrEmpty(_savedAudioPath))
            {
                await RecordingSaveHelper.CopyFileWithProgressAsync(
                    _tempAudioPath, _savedAudioPath,
                    "오디오 파일 저장 중…", 51, 100, progress).ConfigureAwait(true);
            }
            else
            {
                ApplyProgress(new MergeProgress(100, "완료", "100%"));
            }

            DialogResult = DialogResult.OK;
        }
        catch (Exception ex)
        {
            _error       = ex;
            DialogResult = DialogResult.Abort;
        }
        finally
        {
            if (!IsDisposed) Close();
        }
    }

    async Task RunSaveAndMergeAsync()
    {
        try
        {
            var progress = new Progress<MergeProgress>(p => ApplyProgress(p));

            await RecordingSaveHelper.CopyFileWithProgressAsync(
                _tempVideoPath, _savedVideoPath,
                "영상 파일 저장 중…", 0, 15, progress).ConfigureAwait(true);

            await RecordingSaveHelper.CopyFileWithProgressAsync(
                _tempAudioPath, _savedAudioPath,
                "오디오 파일 저장 중…", 16, 32, progress).ConfigureAwait(true);

            ApplyProgress(new MergeProgress(33, "합친 동영상 만드는 중…", "0%"));

            await RecordingMerger.MergeAsync(
                _savedVideoPath, _savedAudioPath, _mergedPath!, progress).ConfigureAwait(true);

            ApplyProgress(new MergeProgress(100, "완료", "100%"));
            await Task.Delay(200).ConfigureAwait(true);

            DialogResult = DialogResult.OK;
        }
        catch (Exception ex)
        {
            _error       = ex;
            DialogResult = DialogResult.Abort;
        }
        finally
        {
            if (!IsDisposed) Close();
        }
    }

    void ApplyProgress(MergeProgress p)
    {
        if (IsDisposed) return;

        void Update()
        {
            int value = Math.Clamp(p.Percent, 0, 100);
            _progressBar.Value = value;
            _lblPercent.Text   = p.Detail ?? $"{value}%";
            _lblStatus.Text    = p.Status;
            _progressBar.Refresh();
        }

        if (InvokeRequired) BeginInvoke(Update);
        else Update();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (DialogResult == DialogResult.None && _error is null)
            e.Cancel = true;
        base.OnFormClosing(e);
    }
}
