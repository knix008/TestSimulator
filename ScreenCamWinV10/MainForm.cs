using System.IO;
using ScreenCamWin.Core;  // CodecStatus, CodecManager, ScreenRecorder, …
using ScreenCamWin.Models;
using ScreenCamWin.Native;

namespace ScreenCamWin;

public partial class MainForm : Form
{
    // ── State ────────────────────────────────────────────────────────────────
    private ScreenRecorder? _recorder;
    private System.Windows.Forms.Timer _uiTimer   = new() { Interval = 500 };
    private System.Windows.Forms.Timer _prevTimer  = new() { Interval = 700 };
    private TimeSpan _elapsed = TimeSpan.Zero;
    private bool _previewOn;
    private bool _isRecording;

    public MainForm() => InitializeComponent();

    // ── Form load ────────────────────────────────────────────────────────────

    private void MainForm_Load(object? sender, EventArgs e)
    {
        RefreshWindowList();
        LoadCodecList();
        SetDefaultOutputPath();

        _uiTimer.Tick   += UiTimer_Tick;
        _prevTimer.Tick += PrevTimer_Tick;
    }

    // ── Title-bar drag (Win32 native — avoids coordinate feedback loop) ───────

    private void TitleBar_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Left)
        {
            NativeMethods.ReleaseCapture();
            NativeMethods.SendMessage(Handle,
                NativeMethods.WM_NCLBUTTONDOWN,
                new IntPtr(NativeMethods.HT_CAPTION),
                IntPtr.Zero);
        }
    }

    private void TitleBar_MouseMove(object? sender, MouseEventArgs e) { }

    // ── Window buttons ───────────────────────────────────────────────────────

    private void BtnClose_Click(object? sender, EventArgs e)
    {
        if (_isRecording) StopRecording();
        Close();
    }

    private void BtnMinimize_Click(object? sender, EventArgs e) =>
        WindowState = FormWindowState.Minimized;

    // ── Source window list ───────────────────────────────────────────────────

    private void BtnRefresh_Click(object? sender, EventArgs e) => RefreshWindowList();

    private void RefreshWindowList()
    {
        var previous = cboWindow.SelectedItem as WindowInfo;
        cboWindow.BeginUpdate();
        cboWindow.Items.Clear();

        foreach (var w in WindowEnumerator.GetVisibleWindows())
            cboWindow.Items.Add(w);

        // Try to re-select the same window after refresh
        if (previous != null && !previous.IsDesktop)
        {
            for (int i = 0; i < cboWindow.Items.Count; i++)
            {
                if (cboWindow.Items[i] is WindowInfo wi && wi.Handle == previous.Handle)
                {
                    cboWindow.SelectedIndex = i;
                    cboWindow.EndUpdate();
                    return;
                }
            }
        }

        if (cboWindow.Items.Count > 0)
            cboWindow.SelectedIndex = 0;

        cboWindow.EndUpdate();
    }

    // ── Preview ──────────────────────────────────────────────────────────────

    private void BtnTogglePreview_Click(object? sender, EventArgs e)
    {
        _previewOn = !_previewOn;
        btnTogglePreview.Text      = _previewOn ? "끄기" : "켜기";
        btnTogglePreview.ForeColor = _previewOn
            ? Color.FromArgb(99, 102, 241)
            : Color.FromArgb(148, 163, 184);

        if (_previewOn) _prevTimer.Start();
        else            StopPreview();
    }

    private void StopPreview()
    {
        _prevTimer.Stop();
        var old = picPreview.Image;
        picPreview.Image = null;
        old?.Dispose();
    }

    private void PrevTimer_Tick(object? sender, EventArgs e)
    {
        if (!_previewOn || _isRecording) return; // no concurrent GDI with recording thread

        try
        {
            var target = GetSelectedWindow();
            using var bmp = ScreenCapture.Capture(target);
            if (chkCursor.Checked)
                ScreenCapture.DrawCursor(bmp, target);

            int pw = Math.Max(picPreview.Width,  2);
            int ph = Math.Max(picPreview.Height, 2);
            var prev = new Bitmap(bmp, pw, ph);
            var old  = picPreview.Image;
            picPreview.Image = prev;
            old?.Dispose();
        }
        catch
        {
            // Window may have been closed; silently ignore
        }
    }

    // ── Codec list ───────────────────────────────────────────────────────────

    private void LoadCodecList()
    {
        cboCodec.Items.Clear();
        foreach (var codec in CodecInfo.All)
            cboCodec.Items.Add(codec);
        cboCodec.SelectedIndex = 0;
        UpdateCodecStatus();
    }

    private void CboCodec_SelectedIndexChanged(object? sender, EventArgs e)
    {
        UpdateCodecStatus();
        UpdateOutputExtension();
    }

    private void UpdateOutputExtension()
    {
        if (cboCodec.SelectedItem is not CodecInfo codec) return;
        string path = txtOutput.Text;
        if (string.IsNullOrWhiteSpace(path)) return;

        string want = codec.Kind == VideoCodecKind.H264_MF ? ".mp4" : ".avi";
        string current = Path.GetExtension(path).ToLowerInvariant();
        if (current != want)
            txtOutput.Text = Path.ChangeExtension(path, want);
    }

    private void UpdateCodecStatus()
    {
        if (cboCodec.SelectedItem is not CodecInfo codec) return;
        var status = CodecManager.GetCodecStatus(codec);

        if (status == CodecStatus.Available)
        {
            lblCodecStatus.Text      = "● 사용 가능";
            lblCodecStatus.ForeColor = Color.FromArgb(34, 197, 94);
            btnInstallCodec.Visible  = false;
        }
        else
        {
            // Any non-available state: treat as not installed.
            // Only 64-bit codecs work in this 64-bit app.
            string hint = (status == CodecStatus.RegisteredButUnloadable ||
                           status == CodecStatus.Only32Bit)
                ? "● 미설치 (64비트 버전 필요)"
                : "● 미설치";
            lblCodecStatus.Text      = hint;
            lblCodecStatus.ForeColor = Color.FromArgb(245, 158, 11);
            btnInstallCodec.Visible  = !codec.IsBuiltIn;
            btnInstallCodec.Text     = "설치";
        }
    }

    private void BtnInstallCodec_Click(object? sender, EventArgs e)
    {
        if (cboCodec.SelectedItem is not CodecInfo codec) return;

        var result = MessageBox.Show(
            $"{codec.DisplayName} 코덱을 자동으로 설치하시겠습니까?\n\n" +
            "설치 중 관리자 권한 요청이 나타날 수 있습니다.",
            "코덱 설치", MessageBoxButtons.YesNo, MessageBoxIcon.Question);

        if (result == DialogResult.Yes)
            _ = InstallCodecAsync(codec);
    }

    private async Task InstallCodecAsync(CodecInfo codec)
    {
        btnInstallCodec.Enabled  = false;
        btnInstallCodec.Text     = "다운로드 중...";
        lblCodecStatus.ForeColor = Color.FromArgb(245, 158, 11);

        var progress = new Progress<(int Percent, string Status)>(p =>
        {
            if (!IsDisposed)
            {
                btnInstallCodec.Text = $"{p.Percent}%";
                SetStatus(p.Status);
            }
        });

        var installResult = await CodecManager.DownloadAndInstallAsync(codec, progress);

        if (!IsDisposed)
        {
            btnInstallCodec.Enabled = true;
            UpdateCodecStatus();

            if (installResult.Success)
            {
                SetStatus(installResult.Message);
            }
            else if (installResult.BrowserOpened)
            {
                // Browser was opened — show as info, not error
                MessageBox.Show(installResult.Message, "수동 설치 안내",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else
            {
                MessageBox.Show(installResult.Message, "설치 실패",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
    }

    // ── Settings ─────────────────────────────────────────────────────────────

    private void TrkFps_ValueChanged(object? sender, EventArgs e) =>
        lblFpsVal.Text = $"{trkFps.Value} fps";

    private void TrkQuality_ValueChanged(object? sender, EventArgs e) =>
        lblQualityVal.Text = $"{trkQuality.Value}%";

    private void BtnBrowse_Click(object? sender, EventArgs e)
    {
        bool isMp4 = (cboCodec.SelectedItem as CodecInfo)?.Kind == VideoCodecKind.H264_MF;
        string filter = isMp4
            ? "MP4 파일 (*.mp4)|*.mp4|모든 파일 (*.*)|*.*"
            : "AVI 파일 (*.avi)|*.avi|모든 파일 (*.*)|*.*";

        using var dlg = new SaveFileDialog
        {
            Title            = "저장 경로 선택",
            Filter           = filter,
            FileName         = Path.GetFileName(txtOutput.Text),
            InitialDirectory = Path.GetDirectoryName(txtOutput.Text)
                               ?? Environment.GetFolderPath(Environment.SpecialFolder.MyVideos),
        };
        if (dlg.ShowDialog() == DialogResult.OK)
            txtOutput.Text = dlg.FileName;
    }

    private void SetDefaultOutputPath()
    {
        string folder = Environment.GetFolderPath(Environment.SpecialFolder.MyVideos);
        string stamp  = DateTime.Now.ToString("yyyy-MM-dd_HH-mm-ss");
        bool   isMp4  = (cboCodec.SelectedItem as CodecInfo)?.Kind == VideoCodecKind.H264_MF;
        string ext    = isMp4 ? "mp4" : "avi";
        txtOutput.Text = Path.Combine(folder, $"ScreenCamWin_{stamp}.{ext}");
    }

    // ── Recording ────────────────────────────────────────────────────────────

    private void BtnRecord_Click(object? sender, EventArgs e)
    {
        if (_isRecording) StopRecording();
        else              StartRecording();
    }

    private void StartRecording()
    {
        var codec  = cboCodec.SelectedItem as CodecInfo ?? CodecInfo.Mjpeg;
        var target = GetSelectedWindow();

        var codecStatus = CodecManager.GetCodecStatus(codec);
        if (codecStatus != CodecStatus.Available)
        {
            string msg = codecStatus switch
            {
                CodecStatus.RegisteredButUnloadable or CodecStatus.Only32Bit =>
                    $"'{codec.DisplayName}'의 32비트 버전이 설치되어 있습니다.\n\n" +
                    "이 앱은 64비트입니다. 반드시 64비트 버전의 코덱을 설치해야 합니다.\n" +
                    "또는 별도 코덱 없이 동작하는 'H.264 (Windows 내장)'을 사용하세요.",
                _ =>
                    $"'{codec.DisplayName}'이(가) 설치되어 있지 않습니다.\n\n" +
                    "설치 버튼을 눌러 64비트 버전을 설치하거나\n" +
                    "'H.264 (Windows 내장)'을 사용하세요.",
            };
            MessageBox.Show(msg, "코덱 없음", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        string path = txtOutput.Text.Trim();
        if (string.IsNullOrEmpty(path))
        {
            MessageBox.Show("저장 경로를 지정해 주세요.", "경로 필요",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        try { Directory.CreateDirectory(Path.GetDirectoryName(path)!); }
        catch (Exception ex)
        {
            MessageBox.Show($"저장 경로를 만들 수 없습니다:\n{ex.Message}",
                "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        // Stop preview to avoid GDI conflicts with the recording thread
        if (_previewOn)
        {
            _previewOn = false;
            StopPreview();
            btnTogglePreview.Text      = "켜기";
            btnTogglePreview.ForeColor = Color.FromArgb(148, 163, 184);
        }

        var settings = new RecordingSettings
        {
            Target        = target,
            Fps           = trkFps.Value,
            Quality       = trkQuality.Value,
            OutputPath    = path,
            CaptureCursor = chkCursor.Checked,
            Codec         = codec,
        };

        try
        {
            _elapsed  = TimeSpan.Zero;
            _recorder = new ScreenRecorder(settings);
            _recorder.Elapsed += (_, ts) => _elapsed = ts;
            _recorder.Error   += OnRecordingError;
            _recorder.Start();
        }
        catch (Exception ex)
        {
            _recorder?.Dispose();
            _recorder = null;
            MessageBox.Show($"녹화를 시작할 수 없습니다:\n{ex.Message}",
                "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        _isRecording = true;
        _uiTimer.Start();

        btnRecord.Text      = "■  녹화 중지";
        btnRecord.BackColor = Color.FromArgb(239, 68, 68);
        SetStatus($"녹화 중 → {target}");
        SetControlsEnabled(false);
    }

    private void OnRecordingError(object? sender, Exception ex)
    {
        if (IsDisposed || !IsHandleCreated) return;
        BeginInvoke(() =>
        {
            if (!IsDisposed)
            {
                StopRecording();
                MessageBox.Show($"녹화 중 오류가 발생했습니다:\n{ex.Message}",
                    "녹화 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        });
    }

    private void StopRecording()
    {
        _uiTimer.Stop();

        try
        {
            _recorder?.Stop();
        }
        catch (Exception ex)
        {
            SetStatus($"중지 오류: {ex.Message}");
        }
        finally
        {
            _recorder?.Dispose();
            _recorder    = null;
            _isRecording = false;
        }

        btnRecord.Text      = "● 녹화 시작";
        btnRecord.BackColor = Color.FromArgb(34, 197, 94);
        lblTimer.Text       = "00:00:00";

        string savedPath = txtOutput.Text;
        SetDefaultOutputPath();

        if (File.Exists(savedPath))
        {
            var info = new FileInfo(savedPath);
            SetStatus($"저장 완료 ({info.Length / 1024:N0} KB) → {savedPath}");
        }
        else
        {
            SetStatus("녹화 완료 (파일을 확인해 주세요)");
        }

        SetControlsEnabled(true);
    }

    // ── UI timer ─────────────────────────────────────────────────────────────

    private void UiTimer_Tick(object? sender, EventArgs e)
    {
        if (_recorder is { IsRecording: true })
            lblTimer.Text = _elapsed.ToString(@"hh\:mm\:ss");
        else if (_isRecording)
            StopRecording(); // recorder stopped unexpectedly (error)
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private WindowInfo GetSelectedWindow() =>
        cboWindow.SelectedItem as WindowInfo ?? WindowInfo.Desktop;

    private void SetStatus(string msg)
    {
        if (IsDisposed) return;
        if (lblStatus.InvokeRequired)
            lblStatus.Invoke(() => { if (!IsDisposed) lblStatus.Text = msg; });
        else
            lblStatus.Text = msg;
    }

    private void SetControlsEnabled(bool enabled)
    {
        cboWindow.Enabled        = enabled;
        btnRefresh.Enabled       = enabled;
        cboCodec.Enabled         = enabled;
        trkFps.Enabled           = enabled;
        trkQuality.Enabled       = enabled;
        txtOutput.Enabled        = enabled;
        btnBrowse.Enabled        = enabled;
        chkCursor.Enabled        = enabled;
        btnTogglePreview.Enabled = enabled;
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        _uiTimer.Stop();
        _prevTimer.Stop();

        if (_isRecording)
        {
            try { _recorder?.Stop(); } catch { }
        }

        _recorder?.Dispose();
        _uiTimer.Dispose();
        _prevTimer.Dispose();

        base.OnFormClosed(e);
    }
}
