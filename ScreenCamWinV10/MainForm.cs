using System.IO;
using ScreenCamWin.Core;
using ScreenCamWin.Models;
using ScreenCamWin.Native;
using ScreenCamWin.UI;

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
    private bool _hiddenForDesktopCapture;
    private NotifyIcon? _recordingTray;
    private Icon? _formIcon;
    private MicrophoneCapture? _micMonitor;
    private int _micMonitorGeneration;
    private readonly ManualResetEventSlim _micDeviceReleased = new(initialState: true);
    private Action<float>? _recorderMicLevelHandler;
    private readonly System.Windows.Forms.Timer _micMeterTimer = new() { Interval = 33 };
    private float _micLevelUi;
    private bool _syncingMicGain;
    private bool _formLoaded;

    public MainForm()
    {
        InitializeComponent();
        SetDaemonHammerIcon();
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        ApplyTaskbarIcon();
    }

    static string? DaemonHammerIconPath
    {
        get
        {
            foreach (string dir in new[]
            {
                AppContext.BaseDirectory,
                AppDomain.CurrentDomain.BaseDirectory,
            })
            {
                string path = Path.Combine(dir, "daemon_hammer.ico");
                if (File.Exists(path))
                    return path;
            }
            return null;
        }
    }

    void SetDaemonHammerIcon()
    {
        string? path = DaemonHammerIconPath;
        if (path is null)
            return;

        _formIcon?.Dispose();
        _formIcon = new Icon(path);
        Icon = (Icon)_formIcon.Clone();

        const int titleIconPx = 22;
        using var sized = new Icon(_formIcon, new Size(titleIconPx, titleIconPx));
        picAppIcon.Image?.Dispose();
        picAppIcon.Image = sized.ToBitmap();

        ApplyTaskbarIcon();
    }

    void ApplyTaskbarIcon()
    {
        if (!IsHandleCreated || Icon is null)
            return;

        NativeMethods.SendMessage(Handle, NativeMethods.WM_SETICON,
            (IntPtr)NativeMethods.ICON_SMALL, Icon.Handle);
        NativeMethods.SendMessage(Handle, NativeMethods.WM_SETICON,
            (IntPtr)NativeMethods.ICON_BIG, Icon.Handle);
    }

    // ── Form load ────────────────────────────────────────────────────────────

    private void MainForm_Load(object? sender, EventArgs e)
    {
        ApplyTaskbarIcon();
        ApplyLabelTheme();
        ApplyControlTheme();
        LayoutValueLabels();
        RefreshWindowList();
        LoadCodecList();
        LoadMicrophoneList();
        SetDefaultOutputPath();
        _formLoaded = true;
        UpdateMicrophoneControls();
        LayoutMicInputRow();
        pnlAudio.Resize += (_, _) => LayoutMicInputRow();

        _uiTimer.Tick   += UiTimer_Tick;
        _prevTimer.Tick += PrevTimer_Tick;
        _micMeterTimer.Tick += MicMeterTimer_Tick;
    }

    int MicGain => nudMicGain is null ? 100 : (int)nudMicGain.Value;
    float MicInputGain => MicGain / 100f;

    bool MicUiReady =>
        _formLoaded && !IsDisposed
        && chkMicrophone is not null
        && cboMicrophone is not null
        && micMeterPanel is not null
        && lblMicInputVal is not null
        && trkMicGain is not null
        && nudMicGain is not null;

    static void SetControlEnabled(Control? control, bool enabled)
    {
        if (control is not null)
            control.Enabled = enabled;
    }

    void SetMicInputLevelDisplay(float level)
    {
        _micLevelUi = Math.Clamp(level, 0f, 1f);
        if (!IsDisposed && micMeterPanel is not null && !micMeterPanel.IsDisposed)
            micMeterPanel.SetLevel(_micLevelUi);
        if (lblMicInputVal is not null && !lblMicInputVal.IsDisposed)
            lblMicInputVal.Text = $"{(int)Math.Round(_micLevelUi * 100f)}%";
    }

    void MicMeterTimer_Tick(object? sender, EventArgs e)
    {
        if (IsDisposed || chkMicrophone is null || !chkMicrophone.Checked) return;
        micMeterPanel?.SetLevel(_micLevelUi);
        if (lblMicInputVal is not null)
            lblMicInputVal.Text = $"{(int)Math.Round(_micLevelUi * 100f)}%";
    }

    void ResetMicInputLevelDisplay()
    {
        micMeterPanel?.ResetLevel();
        if (lblMicInputVal is not null)
            lblMicInputVal.Text = "0%";
    }

    /// <summary>Keeps gain slider, meter, and labels on one horizontal line (meter fills middle).</summary>
    void LayoutMicInputRow()
    {
        if (pnlAudio.IsDisposed || micMeterPanel is null || nudMicGain is null
            || trkMicGain is null || lblMicInputVal is null)
            return;

        const int rowY  = 92;
        const int rowH  = 32;
        const int barY  = 96;
        const int barH  = 28;
        const int padR  = 10;
        const int valW  = 44;

        const int nudW  = 52;
        const int gainX = 88;

        int right = pnlAudio.ClientSize.Width - padR;
        lblMicInputVal.SetBounds(right - valW, rowY, valW, rowH);

        int nudLeft = gainX + 154;
        int maxNud  = lblMicInputVal.Left - 6 - nudW - 70;
        if (nudLeft > maxNud) nudLeft = Math.Max(gainX + 60, maxNud);
        nudMicGain.SetBounds(nudLeft, rowY + 2, nudW, rowH - 4);

        int meterLeft = nudMicGain.Right + 6;
        int meterW    = lblMicInputVal.Left - meterLeft - 6;
        if (meterW >= 60)
            micMeterPanel.SetBounds(meterLeft, barY, meterW, barH);

        int sliderW = nudMicGain.Left - gainX - 6;
        if (sliderW >= 40)
            trkMicGain.SetBounds(gainX, barY, sliderW, barH);
    }

    private void ApplyLabelTheme()
    {
        Theme.ApplySectionLabel(lblSourceTitle);
        Theme.ApplySectionLabel(lblPreviewTitle);
        Theme.ApplySectionLabel(lblCodecTitle);
        Theme.ApplySectionLabel(lblSettingsTitle);
        Theme.ApplySectionLabel(lblAudioTitle);
        Theme.ApplyFieldLabel(lblFps);
        Theme.ApplyFieldLabel(lblQuality);
        Theme.ApplyFieldLabel(lblOutput);
        if (lblMicrophone is not null) Theme.ApplyFieldLabel(lblMicrophone);
        if (lblMicLevel is not null) Theme.ApplyFieldLabel(lblMicLevel);
        if (trkMicGain is not null) Theme.ApplyTrackBar(trkMicGain, Theme.BgCard);
        if (nudMicGain is not null) Theme.ApplyNumericUpDown(nudMicGain, Theme.BgCard);
        if (lblMicInputVal is not null) Theme.ApplyValueLabel(lblMicInputVal, Theme.BgCard);
        Theme.ApplyValueLabel(lblFpsVal);
        Theme.ApplyValueLabel(lblQualityVal);
        lblTimer.BackColor = Theme.BgCard;
        lblTimer.ForeColor = Theme.TextMain;
        lblStatus.BackColor = Theme.BgMain;
        lblStatus.ForeColor = Theme.TextSub;
        lblCodecStatus.BackColor = Theme.BgCard;
        lblCodecStatus.BringToFront();
    }

    private void ApplyControlTheme()
    {
        foreach (var cb in new[] { cboWindow, cboCodec, cboMicrophone })
        {
            if (cb is not null)
                Theme.ApplyComboBox(cb);
        }

        Theme.ApplyTextBox(txtOutput);
        Theme.ApplyTrackBar(trkFps, Theme.BgCard);
        Theme.ApplyTrackBar(trkQuality, Theme.BgCard);
        Theme.ApplyCheckBox(chkCursor, Theme.BgCard);
        if (chkMicrophone is not null)
            Theme.ApplyCheckBox(chkMicrophone, Theme.BgCard);
        Theme.ApplySecondaryButton(btnRefresh);
        Theme.ApplySecondaryButton(btnBrowse);
        Theme.ApplySecondaryButton(btnTogglePreview);

        pnlTitle.BackColor    = Color.FromArgb(18, 18, 36);
        pnlSource.BackColor   = Theme.BgCard;
        pnlPreview.BackColor  = Theme.BgCard;
        pnlCodec.BackColor    = Theme.BgCard;
        pnlSettings.BackColor = Theme.BgCard;
        pnlAudio.BackColor    = Theme.BgCard;
        pnlRecord.BackColor   = Theme.BgCard;
        picPreview.BackColor  = Theme.BgMain;
    }

    private void LayoutValueLabels()
    {
        const int rightPad = 8;
        int right = pnlSettings.ClientSize.Width - rightPad;
        lblFpsVal.Location = new Point(right - lblFpsVal.PreferredSize.Width, 34);
        lblQualityVal.Location = new Point(right - lblQualityVal.PreferredSize.Width, 70);
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
        // Output is a session folder; extensions are fixed inside (video/merged + codec).
    }

    private void UpdateCodecStatus()
    {
        if (cboCodec.SelectedItem is not CodecInfo codec) return;

        lblCodecStatus.Text      = "● 사용 가능";
        lblCodecStatus.ForeColor = Color.FromArgb(34, 197, 94);
        btnInstallCodec.Visible  = false;
    }

    private void BtnInstallCodec_Click(object? sender, EventArgs e)
    {
        // All codecs are built-in; install button is hidden.
    }

    // ── Settings ─────────────────────────────────────────────────────────────

    private void TrkFps_ValueChanged(object? sender, EventArgs e) =>
        lblFpsVal.Text = $"{trkFps.Value} fps";

    private void TrkQuality_ValueChanged(object? sender, EventArgs e) =>
        lblQualityVal.Text = $"{trkQuality.Value}%";

    private void BtnBrowse_Click(object? sender, EventArgs e)
    {
        string initial = txtOutput.Text.Trim();
        if (string.IsNullOrEmpty(initial) || !Directory.Exists(initial))
        {
            string? parent = Path.GetDirectoryName(initial);
            initial = string.IsNullOrEmpty(parent)
                ? Environment.GetFolderPath(Environment.SpecialFolder.MyVideos)
                : parent;
        }

        using var dlg = new FolderBrowserDialog
        {
            Description            = "녹화 파일을 저장할 폴더를 선택하세요.",
            UseDescriptionForTitle = true,
            SelectedPath           = initial,
        };

        if (dlg.ShowDialog() == DialogResult.OK && !string.IsNullOrEmpty(dlg.SelectedPath))
            txtOutput.Text = dlg.SelectedPath;
    }

    private void SetDefaultOutputPath()
    {
        string folder = Environment.GetFolderPath(Environment.SpecialFolder.MyVideos);
        string stamp  = DateTime.Now.ToString("yyyy-MM-dd_HH-mm-ss");
        txtOutput.Text = Path.Combine(folder, $"ScreenCamWin_{stamp}");
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

        string basePath = txtOutput.Text.Trim();
        if (string.IsNullOrEmpty(basePath))
        {
            MessageBox.Show("저장 경로를 지정해 주세요.", "경로 필요",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        string videoPath = RecordingPathHelper.CreateVideoPath(basePath, codec.Kind);

        string? dir = Path.GetDirectoryName(videoPath);
        if (!string.IsNullOrEmpty(dir))
        {
            try { Directory.CreateDirectory(dir); }
            catch (Exception ex)
            {
                CopyableDialog.ShowError(this, ex, "저장 경로 오류");
                return;
            }
        }

        if (_previewOn)
        {
            _previewOn = false;
            StopPreview();
            btnTogglePreview.Text      = "켜기";
            btnTogglePreview.ForeColor = Color.FromArgb(148, 163, 184);
        }

        StopMicMonitoring(waitForDevice: true);

        var settings = new RecordingSettings
        {
            Target             = target,
            Fps                = trkFps.Value,
            Quality            = trkQuality.Value,
            OutputPath         = videoPath,
            CaptureCursor      = chkCursor.Checked,
            Codec              = codec,
            CaptureMicrophone  = chkMicrophone.Checked,
            MicrophoneDeviceId = (cboMicrophone.SelectedItem as AudioDeviceInfo)?.Id ?? string.Empty,
            MicrophoneGain     = MicGain,
        };

        btnRecord.Enabled = false;
        SetStatus("녹화 준비 중…");
        Task.Run(() => StartRecordingWorker(settings, target));
    }

    void StartRecordingWorker(RecordingSettings settings, WindowInfo target)
    {
        ScreenRecorder? recorder = null;
        Action<float>? micHandler = null;
        try
        {
            recorder = new ScreenRecorder(settings);
            recorder.Elapsed += (_, ts) => _elapsed = ts;
            recorder.Error   += OnRecordingError;
            if (settings.CaptureMicrophone)
            {
                micHandler = OnRecorderMicLevel;
                recorder.MicLevel += micHandler;
            }

            recorder.Start();

            if (IsDisposed)
            {
                recorder.Dispose();
                return;
            }

            BeginInvoke(() => FinishStartRecording(recorder, micHandler, target));
        }
        catch (Exception ex)
        {
            recorder?.Dispose();
            if (IsDisposed) return;
            BeginInvoke(() =>
            {
                btnRecord.Enabled = true;
                CopyableDialog.ShowError(this, ex, "녹화 시작 오류");
                SetStatus("준비됨");
            });
        }
    }

    void FinishStartRecording(ScreenRecorder recorder, Action<float>? micHandler, WindowInfo target)
    {
        if (IsDisposed) { recorder.Dispose(); return; }

        _recorder = recorder;
        _recorderMicLevelHandler = micHandler;
        _isRecording = true;
        _uiTimer.Start();
        if (chkMicrophone.Checked)
            _micMeterTimer.Start();

        if (target.IsDesktop)
            HideForDesktopRecording();

        btnRecord.Text      = "■  녹화 중지";
        btnRecord.BackColor = Color.FromArgb(239, 68, 68);
        btnRecord.Enabled   = true;
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
                CopyableDialog.ShowError(this, ex, "녹화 오류");
            }
        });
    }

    private void StopRecording()
    {
        _uiTimer.Stop();
        _micMeterTimer.Stop();

        string savedPath = string.Empty;

        try
        {
            _recorder?.Stop();
            var stopResult = _recorder?.GetStopResult();
            if (stopResult is not null && File.Exists(stopResult.VideoPath))
                savedPath = stopResult.VideoPath;
        }
        catch (Exception ex)
        {
            SetStatus($"중지 오류: {ex.Message}");
        }
        finally
        {
            if (_recorder is not null && _recorderMicLevelHandler is not null)
                _recorder.MicLevel -= _recorderMicLevelHandler;
            _recorderMicLevelHandler = null;
            _recorder?.Dispose();
            _recorder    = null;
            _isRecording = false;
        }

        RestoreAfterDesktopRecording();

        btnRecord.Text      = "● 녹화 시작";
        btnRecord.BackColor = Color.FromArgb(34, 197, 94);
        btnRecord.Enabled   = true;
        lblTimer.Text       = "00:00:00";

        SetDefaultOutputPath();

        if (!string.IsNullOrEmpty(savedPath))
            SetStatus($"저장 완료 → {savedPath}");

        SetControlsEnabled(true);
        if (chkMicrophone.Checked)
            StartMicMonitoring();
    }

    // ── UI timer ─────────────────────────────────────────────────────────────

    private void UiTimer_Tick(object? sender, EventArgs e)
    {
        if (_recorder is { IsRecording: true })
            lblTimer.Text = _elapsed.ToString(@"hh\:mm\:ss");
        else if (_isRecording)
            StopRecording(); // recorder stopped unexpectedly (error)
    }

    // ── Desktop capture: hide main window ────────────────────────────────────

    private void HideForDesktopRecording()
    {
        if (_hiddenForDesktopCapture) return;
        _hiddenForDesktopCapture = true;

        var menu = new ContextMenuStrip();
        var stopItem = new ToolStripMenuItem("녹화 중지");
        stopItem.Click += (_, _) =>
        {
            if (!IsDisposed && IsHandleCreated)
                BeginInvoke(StopRecording);
        };
        menu.Items.Add(stopItem);

        _recordingTray = new NotifyIcon
        {
            Icon               = Icon ?? SystemIcons.Application,
            Text               = "ScreenCamWin — 녹화 중",
            Visible            = true,
            ContextMenuStrip   = menu,
        };
        _recordingTray.DoubleClick += (_, _) =>
        {
            if (!IsDisposed && IsHandleCreated)
                BeginInvoke(StopRecording);
        };

        Hide();
    }

    private void RestoreAfterDesktopRecording()
    {
        if (!_hiddenForDesktopCapture) return;
        _hiddenForDesktopCapture = false;

        if (_recordingTray != null)
        {
            _recordingTray.Visible = false;
            _recordingTray.Dispose();
            _recordingTray = null;
        }

        if (IsDisposed) return;

        Show();
        WindowState = FormWindowState.Normal;
        Activate();
        BringToFront();
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
        btnInstallCodec.Enabled  = enabled;
        trkFps.Enabled           = enabled;
        trkQuality.Enabled       = enabled;
        btnBrowse.Enabled        = enabled;
        chkCursor.Enabled        = enabled;
        SetControlEnabled(chkMicrophone, enabled);
        bool micOn = enabled && chkMicrophone is not null && chkMicrophone.Checked;
        SetControlEnabled(cboMicrophone, micOn);
        SetControlEnabled(lblMicrophone, micOn);
        SetControlEnabled(lblMicLevel, micOn);
        SetControlEnabled(trkMicGain, micOn);
        SetControlEnabled(nudMicGain, micOn);
        SetControlEnabled(micMeterPanel, micOn);
        SetControlEnabled(lblMicInputVal, micOn);
        if (micOn)
            _micMeterTimer.Start();
        else
            _micMeterTimer.Stop();
        btnTogglePreview.Enabled = enabled;

        // Enabled=false on dark theme makes text invisible — use ReadOnly + explicit colors
        txtOutput.ReadOnly  = !enabled;
        txtOutput.Enabled   = true;
        txtOutput.ForeColor = Theme.TextMain;
        txtOutput.BackColor = Theme.BgSection;

        foreach (var cb in new[] { cboWindow, cboCodec })
        {
            cb.ForeColor = enabled ? Theme.TextMain : Theme.TextSub;
            cb.BackColor = Theme.BgSection;
        }

        chkCursor.ForeColor = enabled ? Theme.TextMain : Theme.TextSub;
        if (chkMicrophone is not null)
            chkMicrophone.ForeColor = enabled ? Theme.TextMain : Theme.TextSub;
        if (cboMicrophone is not null)
        {
            cboMicrophone.ForeColor = micOn ? Theme.TextMain : Theme.TextSub;
            cboMicrophone.BackColor = Theme.BgSection;
        }

        ApplyLabelTheme();
        ApplyControlTheme();
        lblCodecStatus.BringToFront();
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        _uiTimer.Stop();
        _prevTimer.Stop();

        if (_isRecording)
        {
            try { _recorder?.Stop(); } catch { }
        }

        RestoreAfterDesktopRecording();

        _recorder?.Dispose();
        _uiTimer.Dispose();
        _prevTimer.Dispose();

        picAppIcon.Image?.Dispose();
        _formIcon?.Dispose();
        _formIcon = null;

        StopMicMonitoring();
        _micMeterTimer.Stop();
        _micMeterTimer.Dispose();
        _micDeviceReleased.Dispose();

        base.OnFormClosed(e);
    }

    // ── Microphone ───────────────────────────────────────────────────────────

    private void LoadMicrophoneList()
    {
        cboMicrophone.Items.Clear();
        try
        {
            foreach (var device in MicrophoneCapture.EnumerateDevices())
                cboMicrophone.Items.Add(device);
            if (cboMicrophone.Items.Count > 0)
                cboMicrophone.SelectedIndex = 0;
        }
        catch (Exception ex)
        {
            SetStatus($"마이크 목록 오류: {ex.Message}");
        }
    }

    private void ChkMicrophone_CheckedChanged(object? sender, EventArgs e)
    {
        if (!_formLoaded || chkMicrophone is null || IsDisposed) return;
        try { UpdateMicrophoneControls(); }
        catch (Exception ex) { SetStatus($"마이크 설정 오류: {ex.Message}"); }
    }

    private void CboMicrophone_SelectedIndexChanged(object? sender, EventArgs e)
    {
        if (chkMicrophone is { Checked: true } && !_isRecording)
            StartMicMonitoring();
    }

    private void UpdateMicrophoneControls()
    {
        if (!MicUiReady) return;

        bool on = chkMicrophone!.Checked;
        SetControlEnabled(cboMicrophone, on && !_isRecording);
        SetControlEnabled(lblMicrophone, on);
        SetControlEnabled(lblMicLevel, on);
        SetControlEnabled(trkMicGain, on);
        SetControlEnabled(nudMicGain, on);
        SetControlEnabled(micMeterPanel, on);
        SetControlEnabled(lblMicInputVal, on);

        if (lblMicInputVal is not null)
            lblMicInputVal.ForeColor = on ? Theme.TextMain : Theme.TextSub;

        if (!on)
        {
            _micMeterTimer.Stop();
            ResetMicInputLevelDisplay();
            StopMicMonitoring();
            return;
        }

        if (!_isRecording)
        {
            if (!_micMeterTimer.Enabled)
                _micMeterTimer.Start();
            StartMicMonitoring();
        }
    }

    private void StartMicMonitoring()
    {
        if (_isRecording || !MicUiReady) return;
        if (chkMicrophone is not { Checked: true }) return;
        if (cboMicrophone!.SelectedItem is not AudioDeviceInfo device) return;

        StopMicMonitoring();

        int generation = ++_micMonitorGeneration;
        string deviceId = device.Id;
        float gain = MicInputGain;

        Task.Run(() =>
        {
            MicrophoneCapture? mic = null;
            try
            {
                mic = new MicrophoneCapture { InputGain = gain };
                mic.LevelChanged += OnMicMonitorLevelChanged;
                mic.StartMonitoring(deviceId);
            }
            catch (Exception ex)
            {
                mic?.Dispose();
                if (generation != _micMonitorGeneration || IsDisposed) return;
                try
                {
                    BeginInvoke(() =>
                    {
                        if (generation != _micMonitorGeneration || IsDisposed) return;
                        SetStatus($"마이크 열기 실패: {ex.Message}");
                    });
                }
                catch { }
                return;
            }

            if (generation != _micMonitorGeneration || IsDisposed)
            {
                mic.Dispose();
                return;
            }

            try
            {
                BeginInvoke(() =>
                {
                    if (generation != _micMonitorGeneration || IsDisposed
                        || chkMicrophone is not { Checked: true })
                    {
                        mic.Dispose();
                        return;
                    }

                    _micMonitor = mic;
                    if (!_micMeterTimer.Enabled)
                        _micMeterTimer.Start();
                });
            }
            catch
            {
                mic.Dispose();
            }
        });
    }

    private void StopMicMonitoring(bool waitForDevice = false)
    {
        _micMonitorGeneration++;

        var mic = _micMonitor;
        _micMonitor = null;
        if (mic is null)
        {
            _micDeviceReleased.Set();
            return;
        }

        _micDeviceReleased.Reset();
        mic.LevelChanged -= OnMicMonitorLevelChanged;

        var waitHandle = waitForDevice ? _micDeviceReleased : null;
        Task.Run(() =>
        {
            try
            {
                mic.Stop();
                mic.Dispose();
            }
            catch { }
            finally
            {
                _micDeviceReleased.Set();
            }

            if (!IsDisposed)
            {
                try
                {
                    BeginInvoke(ResetMicInputLevelDisplay);
                }
                catch { }
            }
        });

        waitHandle?.Wait(3000);
    }

    private void OnMicMonitorLevelChanged(float level) =>
        _micLevelUi = Math.Clamp(level, 0f, 1f);

    private void OnRecorderMicLevel(float level) =>
        _micLevelUi = Math.Clamp(level, 0f, 1f);

    private void TrkMicGain_ValueChanged(object? sender, EventArgs e)
    {
        if (_syncingMicGain || trkMicGain is null || nudMicGain is null) return;
        _syncingMicGain = true;
        try
        {
            int v = Math.Clamp(trkMicGain.Value, trkMicGain.Minimum, trkMicGain.Maximum);
            if (trkMicGain.Value != v) trkMicGain.Value = v;
            if ((int)nudMicGain.Value != v) nudMicGain.Value = v;
            ApplyMicGain();
        }
        finally { _syncingMicGain = false; }
    }

    private void NudMicGain_ValueChanged(object? sender, EventArgs e)
    {
        if (_syncingMicGain || trkMicGain is null || nudMicGain is null) return;
        _syncingMicGain = true;
        try
        {
            int v = (int)Math.Clamp(nudMicGain.Value, nudMicGain.Minimum, nudMicGain.Maximum);
            if (trkMicGain.Value != v) trkMicGain.Value = v;
            ApplyMicGain();
        }
        finally { _syncingMicGain = false; }
    }

    void ApplyMicGain()
    {
        float gain = MicInputGain;
        if (_micMonitor is not null)
            _micMonitor.InputGain = gain;
        if (_recorder is { IsRecording: true })
            _recorder.SetMicrophoneGain(MicGain);
    }
}
