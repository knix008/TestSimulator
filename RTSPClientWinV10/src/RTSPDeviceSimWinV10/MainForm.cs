using System.ComponentModel;
using LibVLCSharp.WinForms;
using RTSPCall.Core.Models;
using RTSPCall.Core.Services;
using RTSPCall.Core.Ui;
using RTSPDeviceSimWinV10.Services;

namespace RTSPDeviceSimWinV10;

public partial class MainForm : Form
{
    private const string AppFolder = "RTSPDeviceSimWinV10";
    private DeviceSimHost? _host;
    private VideoView? _remoteVideo;
    private DeviceSimSettings _settings = new();
    private UiStrings _s = UiStrings.En;
    private bool _runtimeReady;
    private bool _updatingPrefs;
    private bool _busy;

    public MainForm()
    {
        InitializeComponent();
        ApplyWindowIcon("device-sim.ico");
        if (IsDesignMode())
        {
            lblStatus.Text = "Status: Design mode";
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
        _settings = SettingsStore.Load(AppFolder, () => new DeviceSimSettings());
        _s = UiStrings.For(_settings.Language);
        txtSignalingPort.Text = _settings.SignalingPort.ToString();
        txtRtspPort.Text = _settings.RtspPort.ToString();
        chkLoopback.Checked = _settings.PreferLoopback;

        _host = new DeviceSimHost();
        _remoteVideo = new VideoView { Dock = DockStyle.Fill };
        panelVideo.Controls.Add(_remoteVideo);
        _remoteVideo.MediaPlayer = _host.Player.Player;
        _remoteVideo.BringToFront();
        lblVideoTitle.BringToFront();

        InitPreferenceCombos();
        ApplyTheme();
        ApplyLanguage();
        ApplyButtonIcons();

        _host.Log += msg => BeginInvoke(() => AppendLog(msg));
        _host.StateChanged += () => BeginInvoke(UpdateStatus);

        await RefreshDevicesAsync();
        UpdateStatus();

        // Auto-start so /api/call/status is reachable without an extra click.
        AppendLog("Auto-starting simulator...");
        await StartSimulatorAsync();
    }

    private async void MainForm_FormClosed(object? sender, FormClosedEventArgs e)
    {
        if (!_runtimeReady)
            return;

        Persist();
        SettingsStore.Save(AppFolder, _settings);
        if (_host is not null)
            await _host.DisposeAsync();
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
        UpdateStatus();
    }

    private void ApplyTheme()
    {
        var p = UiTheme.Get(_settings.Theme);
        if (_settings.Theme == UiThemeMode.Dark)
        {
            p = new ThemePalette
            {
                FormBack = Color.FromArgb(26, 35, 50),
                PanelTop = Color.FromArgb(36, 52, 71),
                PanelContent = Color.FromArgb(15, 22, 32),
                PanelLog = Color.FromArgb(36, 52, 71),
                VideoBack = Color.FromArgb(15, 22, 32),
                Label = p.Label,
                LabelMuted = p.LabelMuted,
                LabelAccent = p.LabelAccent,
                InputBack = p.InputBack,
                InputFore = p.InputFore,
                ButtonBack = p.ButtonBack,
                ButtonFore = p.ButtonFore
            };
        }

        UiTheme.ApplyForm(this, p);
        UiTheme.ApplyPanel(panelTop, p.PanelTop);
        UiTheme.ApplyPanel(panelMain, p.FormBack);
        UiTheme.ApplyPanel(panelVideo, p.VideoBack);
        UiTheme.ApplyPanel(panelSide, p.PanelContent);
        UiTheme.ApplyPanel(panelLog, p.PanelLog);

        foreach (var lbl in new[] { lblSignaling, lblRtsp, lblSource, lblStatus, lblTheme, lblLanguage, lblHowTo, lblLog })
            UiTheme.ApplyLabel(lbl, p.Label);

        UiTheme.ApplyLabel(lblVideoTitle, p.LabelMuted);
        UiTheme.ApplyLabel(lblHowToBody, p.Label);
        UiTheme.ApplyLabel(lblDeviceUrl, p.LabelAccent);
        UiTheme.ApplyLabel(lblPcUrl, p.LabelAccent);

        UiTheme.ApplyInput(txtSignalingPort, p);
        UiTheme.ApplyInput(txtRtspPort, p);
        UiTheme.ApplyInput(cboVideo, p);
        UiTheme.ApplyInput(cboTheme, p);
        UiTheme.ApplyInput(cboLanguage, p);
        UiTheme.ApplyInput(txtLog, p);
        UiTheme.ApplyCheckBox(chkLoopback, p);

        foreach (var btn in new[] { btnStartStop, btnRefresh })
            UiTheme.ApplyButton(btn, p);
    }

    private void ApplyLanguage()
    {
        Text = _s.SimTitle;
        lblSignaling.Text = _s.SignalingPort;
        lblRtsp.Text = _s.RtspPort;
        chkLoopback.Text = _s.LoopbackLocal;
        lblSource.Text = _s.Source;
        lblTheme.Text = _s.Theme;
        lblLanguage.Text = _s.LanguageLabel;
        lblHowTo.Text = _s.HowTo;
        lblHowToBody.Text = _s.HowToBody;
        lblLog.Text = _s.Log;
    }

    private void ApplyButtonIcons()
    {
        var listening = _host?.IsListening == true;
        if (listening)
            UiButtonIcons.Apply(btnStartStop, UiButtonIcons.Stop(), _s.Stop);
        else
            UiButtonIcons.Apply(btnStartStop, UiButtonIcons.Play(), _s.StartSimulator);

        UiButtonIcons.Apply(btnRefresh, UiButtonIcons.Refresh(), _s.RefreshDevices);
    }

    private async void btnStartStop_Click(object? sender, EventArgs e)
    {
        if (!_runtimeReady || _host is null || _busy) return;

        if (_host.IsListening)
            await StopSimulatorAsync();
        else
            await StartSimulatorAsync();
    }

    private async Task StartSimulatorAsync()
    {
        if (_host is null) return;
        _busy = true;
        btnStartStop.Enabled = false;
        try
        {
            Persist();
            SettingsStore.Save(AppFolder, _settings);
            await _host.StartAsync(_settings);
            lblDeviceUrl.Text = $"{_s.DeviceRtsp}: {_host.DeviceRtspUrl}";
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(this, _s.SimStartFailed, ex, _settings.Language);
            AppendLog("ERROR: " + ex.Message);
        }
        finally
        {
            _busy = false;
            UpdateStatus();
        }
    }

    private async Task StopSimulatorAsync()
    {
        if (_host is null) return;
        _busy = true;
        btnStartStop.Enabled = false;
        try
        {
            await _host.StopAsync();
            lblDeviceUrl.Text = "";
            lblPcUrl.Text = "";
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(this, _s.Stop, ex, _settings.Language);
            AppendLog("ERROR: " + ex.Message);
        }
        finally
        {
            _busy = false;
            UpdateStatus();
        }
    }

    private async void btnRefresh_Click(object? sender, EventArgs e)
    {
        if (!_runtimeReady) return;
        await RefreshDevicesAsync();
    }

    private async Task RefreshDevicesAsync()
    {
        try
        {
            var devices = await DirectShowDeviceEnumerator.ListAsync(_settings.FfmpegPath);
            var videos = devices.Where(d => d.Kind == "video").Select(d => d.Name).ToList();
            cboVideo.DataSource = videos;
            if (!string.IsNullOrWhiteSpace(_settings.VideoDevice) && videos.Contains(_settings.VideoDevice))
                cboVideo.SelectedItem = _settings.VideoDevice;
            else
                cboVideo.SelectedItem = CaptureSources.TestPattern;
        }
        catch (Exception ex)
        {
            AppendLog($"{_s.DeviceEnumFailed}: {ex.Message}");
            cboVideo.DataSource = new[] { CaptureSources.TestPattern };
            cboVideo.SelectedItem = CaptureSources.TestPattern;
            ErrorDialog.Show(this, _s.DevicesTitle, _s.DeviceEnumFailed, ex, _settings.Language);
        }
    }

    private void Persist()
    {
        if (int.TryParse(txtSignalingPort.Text.Trim(), out var sp))
            _settings.SignalingPort = sp;
        if (int.TryParse(txtRtspPort.Text.Trim(), out var rp))
            _settings.RtspPort = rp;
        _settings.PreferLoopback = chkLoopback.Checked;
        _settings.VideoDevice = cboVideo.SelectedItem as string ?? CaptureSources.TestPattern;
        _settings.Theme = cboTheme.SelectedIndex == 1 ? UiThemeMode.Light : UiThemeMode.Dark;
        _settings.Language = cboLanguage.SelectedIndex == 1 ? UiLanguage.Korean : UiLanguage.English;
    }

    private void UpdateStatus()
    {
        if (_host is null) return;
        var listening = _host.IsListening;
        lblStatus.Text = listening
            ? $"{_s.Status}: {_s.StatusListening}  |  {_s.Call}={_host.Signaling.State}  |  {_s.Video}={_host.VideoMode}"
            : $"{_s.Status}: {_s.StatusStopped}";
        btnStartStop.Enabled = !_busy;
        txtSignalingPort.Enabled = !listening;
        txtRtspPort.Enabled = !listening;
        cboVideo.Enabled = !listening;
        chkLoopback.Enabled = !listening;
        lblVideoTitle.Text = _host.IsInCall ? _s.VideoRemotePc : _s.VideoLocalPreview;
        lblPcUrl.Text = string.IsNullOrWhiteSpace(_host.PcRtspUrl) ? "" : $"{_s.PcRtsp}: {_host.PcRtspUrl}";
        if (!string.IsNullOrWhiteSpace(_host.DeviceRtspUrl))
            lblDeviceUrl.Text = $"{_s.DeviceRtsp}: {_host.DeviceRtspUrl}";
        ApplyButtonIcons();
    }

    private void AppendLog(string message)
    {
        var line = $"[{DateTime.Now:HH:mm:ss}] {message}";
        if (txtLog.Text.Length > 0)
            txtLog.AppendText(Environment.NewLine);
        txtLog.AppendText(line);
    }
}
