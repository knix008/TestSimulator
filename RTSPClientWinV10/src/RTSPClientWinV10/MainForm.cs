using System.ComponentModel;
using LibVLCSharp.WinForms;
using RTSPCall.Core.Models;
using RTSPCall.Core.Services;
using RTSPCall.Core.Ui;

namespace RTSPClientWinV10;

public partial class MainForm : Form
{
    private const string AppFolder = "RTSPClientWinV10";
    private CallSessionController? _call;
    private RtspPlayerService? _player;
    private VideoView? _remoteVideo;
    private AppSettings _settings = new();
    private UiStrings _s = UiStrings.En;
    private bool _runtimeReady;
    private bool _updatingPrefs;
    private bool _busy;

    public MainForm()
    {
        InitializeComponent();
        ApplyWindowIcon("app.ico");
        if (IsDesignMode())
        {
            lblState.Text = "State: Idle (Design)";
            return;
        }

        Load += MainForm_Load;
        FormClosed += MainForm_FormClosed;
    }

    private void ApplyWindowIcon(string fileName)
    {
        try
        {
            var path = Path.Combine(AppContext.BaseDirectory, "assets", fileName);
            if (!File.Exists(path))
                path = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "assets", fileName));
            if (File.Exists(path))
                Icon = new Icon(path);
        }
        catch
        {
            // Designer / missing asset — keep default
        }
    }

    private async void MainForm_Load(object? sender, EventArgs e)
    {
        if (_runtimeReady || IsDesignMode())
            return;

        _runtimeReady = true;
        _settings = SettingsStore.Load(AppFolder, () => new AppSettings
        {
            DeviceBaseUrl = "http://127.0.0.1:8080",
            PreferLoopback = true,
            VideoDevice = CaptureSources.TestPattern
        });
        _s = UiStrings.For(_settings.Language);

        _call = new CallSessionController();
        _player = new RtspPlayerService();
        _remoteVideo = new VideoView { Dock = DockStyle.Fill, BackColor = Color.Black };
        panelVideo.Controls.Add(_remoteVideo);
        // Create HWND first, then bind MediaPlayer (LibVLCSharp requirement).
        _ = _remoteVideo.Handle;
        _remoteVideo.MediaPlayer = _player.Player;
        _player.AttachHwnd(_remoteVideo.Handle);
        _remoteVideo.BringToFront();
        lblVideoTitle.BringToFront();

        txtDeviceUrl.Text = _settings.DeviceBaseUrl;
        txtLocalPort.Text = _settings.LocalRtspPort.ToString();
        chkLoopback.Checked = _settings.PreferLoopback;

        InitPreferenceCombos();
        ApplyTheme();
        ApplyLanguage();
        ApplyButtonIcons();
        Resize += (_, _) =>
        {
            if (_runtimeReady)
                LayoutToolbar();
        };

        _call.Log += msg => BeginInvoke(() => AppendLog(msg));
        _call.StateChanged += () => BeginInvoke(UpdateUiForState);
        _call.Publisher.LogLine += msg => BeginInvoke(() => AppendLog("[ffmpeg] " + msg));
        _player.Log += msg => BeginInvoke(() => AppendLog(msg));

        UpdateUiForState();
        await RefreshDevicesAsync();
        LayoutToolbar();
    }

    private async void MainForm_FormClosed(object? sender, FormClosedEventArgs e)
    {
        if (!_runtimeReady)
            return;

        try
        {
            PersistSettingsFromUi();
            SettingsStore.Save(AppFolder, _settings);
            if (_call is not null)
                await _call.DisposeAsync();
        }
        catch
        {
            // ignore
        }
        finally
        {
            _player?.Dispose();
            _remoteVideo = null;
        }
    }

    private static bool IsDesignMode() =>
        LicenseManager.UsageMode == LicenseUsageMode.Designtime;

    private void InitPreferenceCombos()
    {
        _updatingPrefs = true;
        try
        {
            cboTheme.Items.Clear();
            cboTheme.Items.Add(_s.ThemeDark);
            cboTheme.Items.Add(_s.ThemeLight);
            cboTheme.SelectedIndex = _settings.Theme == UiThemeMode.Light ? 1 : 0;

            cboLanguage.Items.Clear();
            cboLanguage.Items.Add(_s.LangEnglish);
            cboLanguage.Items.Add(_s.LangKorean);
            cboLanguage.SelectedIndex = _settings.Language == UiLanguage.Korean ? 1 : 0;
        }
        finally
        {
            _updatingPrefs = false;
        }
    }

    private void cboTheme_SelectedIndexChanged(object? sender, EventArgs e)
    {
        if (!_runtimeReady || _updatingPrefs) return;
        _settings.Theme = cboTheme.SelectedIndex == 1 ? UiThemeMode.Light : UiThemeMode.Dark;
        SettingsStore.Save(AppFolder, _settings);
        ApplyTheme();
        ApplyButtonIcons();
    }

    private void cboLanguage_SelectedIndexChanged(object? sender, EventArgs e)
    {
        if (!_runtimeReady || _updatingPrefs) return;
        _settings.Language = cboLanguage.SelectedIndex == 1 ? UiLanguage.Korean : UiLanguage.English;
        _s = UiStrings.For(_settings.Language);
        SettingsStore.Save(AppFolder, _settings);
        InitPreferenceCombos();
        ApplyLanguage();
        ApplyButtonIcons();
        UpdateUiForState();
    }

    private void ApplyTheme()
    {
        var p = UiTheme.Get(_settings.Theme);
        UiTheme.ApplyForm(this, p);
        UiTheme.ApplyPanel(panelTop, p.PanelTop);
        UiTheme.ApplyPanel(panelMain, p.FormBack);
        UiTheme.ApplyPanel(panelVideo, p.VideoBack);
        UiTheme.ApplyPanel(panelSide, p.PanelContent);
        UiTheme.ApplyPanel(panelLog, p.PanelLog);

        foreach (var lbl in new[]
                 {
                     lblDeviceUrl, lblRtspPort, lblCamera, lblMic, lblState, lblTheme, lblLanguage,
                     lblSessionTitle, lblSessionId, lblLogTitle
                 })
            UiTheme.ApplyLabel(lbl, p.Label);

        UiTheme.ApplyLabel(lblHint, p.LabelMuted);
        UiTheme.ApplyLabel(lblVideoTitle, p.LabelMuted);
        UiTheme.ApplyLabel(lblHost, p.LabelAccent);
        UiTheme.ApplyLabel(lblDeviceRtsp, p.LabelAccent);
        UiTheme.ApplyLabel(lblLocalRtsp, p.LabelAccent);
        UiTheme.ApplyLabel(lblPorts, p.Label);

        UiTheme.ApplyInput(txtDeviceUrl, p);
        UiTheme.ApplyInput(txtLocalPort, p);
        UiTheme.ApplyInput(cboVideo, p);
        UiTheme.ApplyInput(cboAudio, p);
        UiTheme.ApplyInput(cboTheme, p);
        UiTheme.ApplyInput(cboLanguage, p);
        UiTheme.ApplyInput(txtLog, p);
        UiTheme.ApplyCheckBox(chkLoopback, p);

        foreach (var btn in new[] { btnLocalSim, btnRefresh, btnCallToggle })
            UiTheme.ApplyButton(btn, p);
    }

    private void ApplyLanguage()
    {
        Text = _s.ClientTitle;
        lblDeviceUrl.Text = _s.DeviceUrl;
        lblRtspPort.Text = _s.RtspPort;
        chkLoopback.Text = _s.Loopback;
        lblCamera.Text = _s.Camera;
        lblMic.Text = _s.Mic;
        lblTheme.Text = _s.Theme;
        lblLanguage.Text = _s.LanguageLabel;
        lblHint.Text = _s.HintClient;
        lblVideoTitle.Text = _s.VideoRemoteDevice;
        lblSessionTitle.Text = _s.Session;
        lblPorts.Text = _s.PortsHelp;
        lblLogTitle.Text = _s.Log;
        lblHost.Text = $"{_s.Host}: {LanAddressHelper.GetPreferredIPv4(chkLoopback.Checked)}";
        LayoutToolbar();
    }

    private void ApplyButtonIcons()
    {
        var showHangup = _call?.State is CallState.Connecting or CallState.Publishing
            or CallState.InCall or CallState.Ending or CallState.Error;

        if (showHangup)
            UiButtonIcons.Apply(btnCallToggle, UiButtonIcons.HangUp(), _s.HangUp);
        else
            UiButtonIcons.Apply(btnCallToggle, UiButtonIcons.Call(), _s.StartCall);

        UiButtonIcons.Apply(btnRefresh, UiButtonIcons.Refresh(), _s.RefreshDevices);
        UiButtonIcons.Apply(btnLocalSim, UiButtonIcons.LocalSim(), _s.LocalSim);
        LayoutToolbar();
    }

    private void LayoutToolbar()
    {
        const int pad = 12;
        const int gap = 8;

        foreach (var lbl in new[]
                 {
                     lblDeviceUrl, lblRtspPort, lblHost, lblCamera, lblMic, lblState, lblTheme, lblLanguage
                 })
            lbl.AutoSize = true;

        chkLoopback.AutoSize = true;

        // Row 1 — connection + actions
        var x = pad;
        var yLbl = 16;
        var yCtrl = 12;

        void PlaceLabel(Label label)
        {
            label.Location = new Point(x, yLbl);
            x = label.Right + 6;
        }

        void Place(Control control)
        {
            control.Location = new Point(x, yCtrl);
            x = control.Right + gap;
        }

        PlaceLabel(lblDeviceUrl);
        txtDeviceUrl.Width = 210;
        Place(txtDeviceUrl);
        Place(btnLocalSim);
        PlaceLabel(lblRtspPort);
        txtLocalPort.Width = 56;
        Place(txtLocalPort);
        Place(chkLoopback);
        PlaceLabel(lblHost);
        Place(btnRefresh);
        Place(btnCallToggle);

        // Row 2 — devices + prefs
        x = pad;
        yLbl = 56;
        yCtrl = 52;
        PlaceLabel(lblCamera);
        cboVideo.Width = 240;
        Place(cboVideo);
        PlaceLabel(lblMic);
        cboAudio.Width = 200;
        Place(cboAudio);
        PlaceLabel(lblState);
        x += 4;
        PlaceLabel(lblTheme);
        cboTheme.Width = 90;
        Place(cboTheme);
        PlaceLabel(lblLanguage);
        cboLanguage.Width = 100;
        Place(cboLanguage);

        // Row 3 — hint
        lblHint.AutoSize = false;
        lblHint.Location = new Point(pad, 92);
        lblHint.Size = new Size(Math.Max(480, panelTop.ClientSize.Width - pad * 2), 36);
    }

    private async void btnLocalSim_Click(object? sender, EventArgs e)
    {
        txtDeviceUrl.Text = "http://127.0.0.1:8080";
        chkLoopback.Checked = true;
        txtLocalPort.Text = "8554";
        AppendLog(_s.ConfiguredLocalSim);
        lblHost.Text = $"{_s.Host}: {LanAddressHelper.GetPreferredIPv4(true)}";
        await EnsureSimulatorReadyAsync();
    }

    private async void btnRefresh_Click(object? sender, EventArgs e)
    {
        if (!_runtimeReady) return;
        await RefreshDevicesAsync();
    }

    private async void btnCallToggle_Click(object? sender, EventArgs e)
    {
        if (!_runtimeReady || _call is null || _player is null || _busy) return;

        var active = _call.State is CallState.Connecting or CallState.Publishing or CallState.InCall
            or CallState.Ending or CallState.Error;
        if (active)
            await HangupAsync();
        else
            await StartCallAsync();
    }

    private async Task EnsureSimulatorReadyAsync()
    {
        PersistSettingsFromUi();
        using (var probe = new SignalingClient(_settings.DeviceBaseUrl))
        {
            if (await probe.PingAsync())
            {
                AppendLog(_s.SimulatorReady);
                return;
            }
        }

        AppendLog(_s.LaunchingSimulator);
        if (!LocalSimulatorLauncher.TryLaunch(out var path, out var launchError))
        {
            AppendLog($"{_s.SimulatorLaunchFailed}: {launchError}");
            return;
        }

        AppendLog($"Started: {path}");
        if (await LocalSimulatorLauncher.WaitUntilReachableAsync(_settings.DeviceBaseUrl, TimeSpan.FromSeconds(20)))
            AppendLog(_s.SimulatorReady);
        else
            AppendLog(_s.SimulatorLaunchFailed);
    }

    private async Task StartCallAsync()
    {
        if (_call is null || _player is null) return;
        _busy = true;
        btnCallToggle.Enabled = false;
        try
        {
            PersistSettingsFromUi();
            SettingsStore.Save(AppFolder, _settings);
            await EnsureSimulatorReadyAsync();
            AppendLog(_s.StartingCall);
            await _call.StartCallAsync(_settings);

            if (!string.IsNullOrWhiteSpace(_call.DeviceRtspUrl))
            {
                AppendLog($"{_s.Playing} {_call.DeviceRtspUrl}");
                if (_remoteVideo is not null)
                {
                    _ = _remoteVideo.Handle;
                    _remoteVideo.MediaPlayer = _player.Player;
                    _player.AttachHwnd(_remoteVideo.Handle);
                }
                await Task.Delay(1000);
                _player.Play(_call.DeviceRtspUrl);
            }

            lblDeviceRtsp.Text = $"{_s.DeviceRtsp}: {_call.DeviceRtspUrl}";
            lblLocalRtsp.Text = $"{_s.PcRtsp}: {_call.LocalRtspUrl}";
            lblSessionId.Text = $"{_s.SessionId}: {_call.SessionId}";
        }
        catch (Exception ex)
        {
            var title = _s.CallFailed;
            if (ex.Message.Contains("signaling API is not reachable", StringComparison.OrdinalIgnoreCase) ||
                ex.Message.Contains("Device signaling", StringComparison.OrdinalIgnoreCase))
            {
                ErrorDialog.Show(this, title, _s.SignalingUnreachable, ex, _settings.Language);
            }
            else
            {
                ErrorDialog.Show(this, title, ex, _settings.Language);
            }

            AppendLog($"{_s.CallFailed}: {ex.Message}");
            _player.Stop();
        }
        finally
        {
            _busy = false;
            UpdateUiForState();
        }
    }

    private async Task HangupAsync()
    {
        if (_call is null || _player is null) return;
        _busy = true;
        btnCallToggle.Enabled = false;
        try
        {
            _player.Stop();
            await _call.HangupAsync();
            lblDeviceRtsp.Text = "";
            lblLocalRtsp.Text = "";
            lblSessionId.Text = "";
            AppendLog(_s.CallEnded);
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(this, _s.HangupError, ex, _settings.Language);
            AppendLog($"{_s.HangupError}: {ex.Message}");
        }
        finally
        {
            _busy = false;
            UpdateUiForState();
        }
    }

    private async Task RefreshDevicesAsync()
    {
        try
        {
            btnRefresh.Enabled = false;
            AppendLog(_s.EnumeratingDevices);
            var devices = await DirectShowDeviceEnumerator.ListAsync(_settings.FfmpegPath);
            var videos = devices.Where(d => d.Kind == "video").Select(d => d.Name).ToList();
            var audios = devices.Where(d => d.Kind == "audio").Select(d => d.Name).ToList();

            cboVideo.DataSource = videos;
            cboAudio.DataSource = audios;

            if (!string.IsNullOrWhiteSpace(_settings.VideoDevice) && videos.Contains(_settings.VideoDevice))
                cboVideo.SelectedItem = _settings.VideoDevice;
            else if (videos.Count > 0)
                cboVideo.SelectedItem = CaptureSources.TestPattern;

            if (!string.IsNullOrWhiteSpace(_settings.AudioDevice) && audios.Contains(_settings.AudioDevice))
                cboAudio.SelectedItem = _settings.AudioDevice;
            else if (audios.Count > 0)
                cboAudio.SelectedIndex = 0;

            AppendLog(string.Format(_s.FoundDevices, videos.Count, audios.Count));
        }
        catch (Exception ex)
        {
            AppendLog($"{_s.DeviceEnumFailed}: {ex.Message}");
            cboVideo.DataSource = new[] { CaptureSources.TestPattern };
            cboVideo.SelectedItem = CaptureSources.TestPattern;
            ErrorDialog.Show(this, _s.DevicesTitle, _s.DeviceEnumFailed, ex, _settings.Language);
        }
        finally
        {
            btnRefresh.Enabled = true;
        }
    }

    private void PersistSettingsFromUi()
    {
        _settings.DeviceBaseUrl = txtDeviceUrl.Text.Trim();
        if (int.TryParse(txtLocalPort.Text.Trim(), out var port) && port is > 0 and < 65536)
            _settings.LocalRtspPort = port;
        _settings.PreferLoopback = chkLoopback.Checked;
        _settings.VideoDevice = cboVideo.SelectedItem as string ?? CaptureSources.TestPattern;
        _settings.AudioDevice = cboAudio.SelectedItem as string;
        _settings.Theme = cboTheme.SelectedIndex == 1 ? UiThemeMode.Light : UiThemeMode.Dark;
        _settings.Language = cboLanguage.SelectedIndex == 1 ? UiLanguage.Korean : UiLanguage.English;
        lblHost.Text = $"{_s.Host}: {LanAddressHelper.GetPreferredIPv4(_settings.PreferLoopback)}";
    }

    private void UpdateUiForState()
    {
        if (_call is null) return;

        lblState.Text = $"{_s.State}: {_call.State}";
        var inProgress = _call.State is CallState.Connecting or CallState.Publishing or CallState.InCall or CallState.Ending;
        var transitional = _call.State is CallState.Connecting or CallState.Publishing or CallState.Ending;
        btnCallToggle.Enabled = !_busy && !transitional;

        txtDeviceUrl.Enabled = !inProgress;
        txtLocalPort.Enabled = !inProgress;
        cboVideo.Enabled = !inProgress;
        cboAudio.Enabled = !inProgress;
        chkLoopback.Enabled = !inProgress;
        btnLocalSim.Enabled = !inProgress;
        ApplyButtonIcons();
        LayoutToolbar();
    }

    private void AppendLog(string message)
    {
        var line = $"[{DateTime.Now:HH:mm:ss}] {message}";
        if (txtLog.Text.Length > 0)
            txtLog.AppendText(Environment.NewLine);
        txtLog.AppendText(line);
    }
}
