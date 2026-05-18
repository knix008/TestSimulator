using System.ComponentModel;
using System.Drawing;
using System.Globalization;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using RemoteViewing.Vnc;
using RemoteViewing.Windows.Forms;

namespace RemoteDesktopWinV10.App;

public partial class MainForm : Form
{
    // 패널 더블버퍼 활성화 (DoubleBuffered 프로퍼티는 protected이므로 reflection 사용)
    private static void EnableDoubleBuffer(Control ctrl)
    {
        typeof(Control)
            .GetProperty("DoubleBuffered",
                System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)
            ?.SetValue(ctrl, true);
    }

    private bool _remoteClientsInitialized;
    private bool _vncConnecting;
    private TcpClient? _vncTlsClient;
    private bool _fullScreenChromeHidden;

    // 사용자가 직접 끊기를 누른 경우 — 예기치 않은 종료 팝업 억제에 사용
    private bool _userDisconnecting;

    private FormBorderStyle _savedBorder = FormBorderStyle.Sizable;
    private FormWindowState _savedWindowState = FormWindowState.Normal;
    private Padding _savedRemotePanelPadding;

    // 전체화면 힌트 바 (전체화면 진입 시 상단에 표시, 3초 후 자동 숨김)
    private Panel _fullScreenBar = null!;
    private System.Windows.Forms.Timer _fullScreenBarHideTimer = null!;
    private System.Windows.Forms.Timer _fullScreenMousePollTimer = null!;

    private List<ConnectionProfile> _profilesList = new();
    private List<ConnectionHistoryEntry> _historyList = new();
    private VncClientSettings _vncSettings = VncClientSettings.Default;
    private bool _suppressProfileChange;

    /// <summary>하단 상태 표시줄 첫 칸에 표시할 한 줄 요약.</summary>
    private string _statusHeadline = "준비됨";

    /// <summary>VNC 뷰어 — 디자이너에는 없고 <see cref="InitializeRemoteClients"/>에서만 생성합니다.</summary>
    private VncControl vncRemote = null!;

    private bool _runtimeUiInitialized;

    public MainForm()
    {
        InitializeComponent();
        // 생성자에서는 InitializeComponent 만 실행합니다. VS out-of-process 디자이너에서는
        // LicenseManager.UsageMode 가 Runtime 으로 잡혀 ActiveX 초기화가 실행되며 디자이너가 깨질 수 있습니다.
        Load += MainForm_OnFirstLoad;
    }

    private void MainForm_OnFirstLoad(object? sender, EventArgs e)
    {
        Load -= MainForm_OnFirstLoad;

        if (_runtimeUiInitialized || IsDesignHostedEnvironment())
        {
            return;
        }

        _runtimeUiInitialized = true;

        ApplyModernChrome();
        InitializeRemoteClients();
        InitializeFullScreenBar();

        manageProfilesToolStripMenuItem.Click += (_, _) => OpenProfileManager();
        appMenuVisibilityToolStripMenuItem.Click += (_, _) => OpenAppSettings();
        openDataFolderToolStripMenuItem.Click += (_, _) => OpenLocalDataFolder();
        exitToolStripMenuItem.Click += (_, _) => Application.Exit();
        fullScreenToolStripMenuItem.Click += (_, _) => ToggleFullScreen();
        connectToolStripMenuItem.Click += async (_, _) => await OnConnectClickAsync();
        advancedSettingsToolStripMenuItem.Click += (_, _) => OpenAdvancedSettings();
        connectButton.Click += async (_, _) => await OnConnectClickAsync();
        advancedSettingsButton.Click += (_, _) => OpenAdvancedSettings();
        profilesCombo.SelectedIndexChanged += OnProfileComboChanged;
        historyCombo.SelectedIndexChanged += OnHistoryComboChanged;

        hostText.TextChanged += OnStatusRelatedInputChanged;
        portText.TextChanged += OnStatusRelatedInputChanged;
        hostText.KeyDown += OnConnectFieldKeyDown;
        portText.KeyDown += OnConnectFieldKeyDown;
        passwordText.KeyDown += OnConnectFieldKeyDown;

        LoadProfilesAndHistory();

        ApplyMainMenuFromSettings();
        ApplyQuickConnectDefaults();
        UpdateConnectUi();
        Shown += (_, _) => EnsureWindowOnScreen();
    }

    /// <summary>다중 모니터·해상도 변경 후 창이 화면 밖에 있으면 주 모니터 중앙으로 이동합니다.</summary>
    private void EnsureWindowOnScreen()
    {
        if (WindowState != FormWindowState.Normal)
        {
            return;
        }

        var onScreen = Screen.AllScreens.Any(s => s.WorkingArea.IntersectsWith(Bounds));
        if (onScreen)
        {
            return;
        }

        var area = Screen.PrimaryScreen?.WorkingArea ?? Screen.FromControl(this).WorkingArea;
        var w = Math.Min(Width, area.Width);
        var h = Math.Min(Height, area.Height);
        StartPosition = FormStartPosition.Manual;
        Location = new Point(
            area.Left + Math.Max(0, (area.Width - w) / 2),
            area.Top + Math.Max(0, (area.Height - h) / 2));
        Size = new Size(w, h);
    }

    /// <summary>디자인 타임(디자이너·DesignToolsServer)이면 true.</summary>
    private bool IsDesignHostedEnvironment()
    {
        if (DesignMode)
        {
            return true;
        }

        if (LicenseManager.UsageMode == LicenseUsageMode.Designtime)
        {
            return true;
        }

        if (Site is { DesignMode: true })
        {
            return true;
        }

        var fn = AppDomain.CurrentDomain.FriendlyName;
        if (fn != null && fn.Contains("DesignToolsServer", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (string.Equals(System.Diagnostics.Process.GetCurrentProcess().ProcessName, "DesignToolsServer", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return false;
    }

    private void ApplyModernChrome()
    {
        // 폼과 핵심 패널에 더블버퍼 적용 — 전체화면 전환·VNC 고속 프레임 깜빡임 방지
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
        UpdateStyles();
        EnableDoubleBuffer(remotePanel);
        EnableDoubleBuffer(vncHostPanel);

        Font = UiTheme.UiFont;
        BackColor = UiTheme.BgApp;
        ForeColor = UiTheme.TextPrimary;

        UiTheme.ApplyLightToolStripChrome(mainMenuStrip);
        UiTheme.ApplyLightToolStripChrome(connectInputToolStrip);
        passwordText.TextBox.UseSystemPasswordChar = true;

        connectBarPanel.BackColor = UiTheme.BgToolbar;
        connectActionsPanel.BackColor = UiTheme.BgToolbar;
        UiTheme.StyleConnectButton(connectButton, sessionActive: false);
        UiTheme.StyleSecondaryButton(advancedSettingsButton, minHeight: 32);

        remotePanel.BackColor = UiTheme.BgRemote;
        vncHostPanel.BackColor = UiTheme.BgRemote;

        statusStrip.Font = UiTheme.UiFont;
        statusStrip.BackColor = Color.FromArgb(236, 236, 236);
        statusStrip.ForeColor = UiTheme.TextMuted;
        toolStripStatusState.ForeColor = UiTheme.TextPrimary;
        toolStripStatusState.BorderSides = ToolStripStatusLabelBorderSides.None;
        toolStripStatusConnection.BorderSides = ToolStripStatusLabelBorderSides.None;
        toolStripStatusConnection.ForeColor = UiTheme.TextMuted;
        toolStripStatusViewport.BorderSides = ToolStripStatusLabelBorderSides.None;
        toolStripStatusViewport.ForeColor = UiTheme.TextMuted;
        toolStripStatusOptions.BorderSides = ToolStripStatusLabelBorderSides.None;
        toolStripStatusOptions.ForeColor = UiTheme.TextMuted;
    }

    private void ApplyConnectionPanelChromeRecursive(Control parent)
    {
        foreach (Control c in parent.Controls)
        {
            ApplyConnectionPanelChromeRecursive(c);
            c.Font = UiTheme.UiFont;
            switch (c)
            {
                case Label lbl:
                    lbl.ForeColor = UiTheme.TextMuted;
                    lbl.BackColor = Color.Transparent;
                    break;
                case TextBox tb:
                    UiTheme.StyleTextBox(tb);
                    break;
                case ComboBox cb:
                    UiTheme.StyleCombo(cb);
                    break;
                case CheckBox chk:
                    UiTheme.StyleCheckBox(chk, UiTheme.BgToolbar);
                    break;
            }
        }
    }

    private void InitializeRemoteClients()
    {
        vncRemote = new VncControl();
        vncRemote.Dock = DockStyle.Fill;
        vncRemote.Location = new Point(0, 0);
        vncRemote.Name = "vncRemote";
        vncRemote.TabIndex = 0;
        vncHostPanel.Controls.Add(vncRemote);

        vncRemote.SizeMode = VncControlSizeMode.Zoom;
        vncRemote.Connected += (_, _) => BeginInvoke(UpdateConnectUi);
        vncRemote.Closed += (_, _) => BeginInvoke(() =>
        {
            _vncTlsClient?.Dispose();
            _vncTlsClient = null;
            var wasUser = _userDisconnecting;
            _userDisconnecting = false;
            vncHostPanel.Visible = false;
            SetStatusHeadline("VNC 연결 종료");
            UpdateConnectUi();
            if (!wasUser)
            {
                ErrorDialog.Show(this,
                    "VNC 연결이 종료되었습니다.\n\n서버가 연결을 끊었거나 네트워크 문제가 발생했을 수 있습니다.",
                    Text, MessageBoxIcon.Information);
            }
        });
        vncRemote.ConnectionFailed += (_, _) => BeginInvoke(() =>
        {
            SetStatusHeadline("VNC 연결 실패");
            UpdateConnectUi();
        });

        _remoteClientsInitialized = true;
    }

    private void ApplyMainMenuFromSettings()
    {
        var s = UiSettingsStore.Load();
        viewToolStripMenuItem.Visible = s.ShowViewMenu;
        fullScreenToolStripMenuItem.Enabled = s.ShowViewMenu;
        openDataFolderToolStripMenuItem.Visible = s.ShowOpenDataFolderMenuItem;
    }

    private void OpenAppSettings()
    {
        using var dlg = new AppSettingsForm();
        if (dlg.ShowDialog(this) == DialogResult.OK)
        {
            ApplyMainMenuFromSettings();
        }
    }

    private void OpenProfileManager()
    {
        using var dlg = new ProfileManagerForm();
        dlg.ShowDialog(this);
        // Reload profiles after profile manager closes
        LoadProfilesAndHistory();
        RefreshStatusStrip();
    }

    private static void OpenLocalDataFolder()
    {
        var dir = Path.GetDirectoryName(ConnectionProfileStore.ProfilesFilePath);
        if (string.IsNullOrEmpty(dir))
        {
            return;
        }

        try
        {
            Directory.CreateDirectory(dir);
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = dir,
                UseShellExecute = true,
            });
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(
                null,
                ExceptionMessageFormatter.Format(ex, "데이터 폴더를 열 수 없습니다.\r\n경로: " + dir),
                "Remote Desktop",
                MessageBoxIcon.Error);
        }
    }

    private void SetStatusHeadline(string headline)
    {
        _statusHeadline = headline;
        RefreshStatusStrip();
    }

    private void RefreshStatusStrip()
    {
        toolStripStatusState.Text = "상태: " + _statusHeadline;

        var host = hostText.Text.Trim();
        var portStr = portText.Text.Trim();
        if (host.Length == 0)
        {
            toolStripStatusConnection.Text = "연결: VNC — 호스트 미입력";
        }
        else if (!int.TryParse(portStr, out var portNum) || portNum is < 1 or > 65535)
        {
            toolStripStatusConnection.Text = $"연결: VNC {host} — 포트 확인 ({portStr})";
        }
        else
        {
            toolStripStatusConnection.Text = $"연결: VNC {host}:{portNum}";
        }

        if (!_remoteClientsInitialized)
        {
            toolStripStatusViewport.Text = "원격 패널: 클라이언트 초기화 전";
            toolStripStatusOptions.Text = "옵션: —";
            return;
        }

        if (!vncHostPanel.Visible)
        {
            toolStripStatusViewport.Text = "원격 패널: 비표시 — 연결 후 이 영역에 원격 화면이 나타납니다";
        }
        else if (_vncConnecting && !vncRemote.Client.IsConnected)
        {
            toolStripStatusViewport.Text = "원격 패널: VNC · 연결 시도 중…";
        }
        else if (vncRemote.Client.IsConnected)
        {
            toolStripStatusViewport.Text = "원격 패널: VNC · 세션 연결됨";
        }
        else
        {
            toolStripStatusViewport.Text = "원격 패널: VNC 영역 표시됨 · 미연결";
        }

        toolStripStatusOptions.Text = FormatVncOptionsSummary();
    }

    private string FormatVncOptionsSummary()
    {
        var parts = new List<string> { $"포트 기본 {VncConnectionDefaults.DefaultPort}" };
        if (_vncSettings.ViewOnly) parts.Add("뷰온리");
        if (_vncSettings.UseTls) parts.Add(_vncSettings.IgnoreTlsCertErrors ? "TLS(인증서무시)" : "TLS");
        if (_vncSettings.MaxUpdateRate > 0) parts.Add($"{_vncSettings.MaxUpdateRate:0}fps");
        parts.Add(_vncSettings.SizeMode.ToString());
        return "옵션: " + string.Join(" · ", parts);
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if (keyData == Keys.F11)
        {
            ToggleFullScreen();
            return true;
        }

        return base.ProcessCmdKey(ref msg, keyData);
    }

    private void InitializeFullScreenBar()
    {
        _savedRemotePanelPadding = remotePanel.Padding;

        // 3초 후 힌트 바 자동 숨김 후 원격 컨트롤에 포커스
        _fullScreenBarHideTimer = new System.Windows.Forms.Timer { Interval = 3000 };
        _fullScreenBarHideTimer.Tick += (_, _) =>
        {
            _fullScreenBarHideTimer.Stop();
            _fullScreenBar.Visible = false;
            FocusRemoteControl();
        };

        // 200ms마다 마우스 위치를 체크 — 상단 4px 안에 들어오면 바 재표시
        _fullScreenMousePollTimer = new System.Windows.Forms.Timer { Interval = 200 };
        _fullScreenMousePollTimer.Tick += (_, _) =>
        {
            if (!_fullScreenChromeHidden || _fullScreenBar.Visible) return;
            var cur = Cursor.Position;
            var b = Bounds;
            if (cur.Y <= b.Top + 4 && cur.X >= b.Left && cur.X <= b.Right)
            {
                ShowFullScreenBar();
            }
        };

        _fullScreenBar = new Panel
        {
            Height = 36,
            BackColor = Color.FromArgb(220, 20, 20, 20),
            Visible = false,
            Cursor = Cursors.Hand,
        };
        var barLabel = new Label
        {
            Text = "전체화면 모드  ·  F11 또는 여기 클릭하여 창 모드로 복귀",
            ForeColor = Color.White,
            Font = UiTheme.UiFont,
            AutoSize = false,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            Cursor = Cursors.Hand,
            BackColor = Color.Transparent,
        };
        barLabel.Click += (_, _) => ToggleFullScreen();
        _fullScreenBar.Click += (_, _) => ToggleFullScreen();
        _fullScreenBar.Controls.Add(barLabel);
        remotePanel.Controls.Add(_fullScreenBar);
        _fullScreenBar.BringToFront(); // z-order 초기 설정 — 이후에는 다시 호출하지 않음
    }

    private void FocusRemoteControl()
    {
        if (!_remoteClientsInitialized) return;
        try
        {
            if (vncRemote.Client.IsConnected) vncRemote.Focus();
        }
        catch { }
    }

    private void ShowFullScreenBar()
    {
        _fullScreenBar.Width = remotePanel.ClientSize.Width;
        _fullScreenBar.Location = new Point(0, 0);
        _fullScreenBar.Visible = true;
        // BringToFront는 InitializeFullScreenBar에서 1회만 호출 — 반복 호출 시 리페인트 발생
        _fullScreenBarHideTimer.Stop();
        _fullScreenBarHideTimer.Start();
    }

    private void ToggleFullScreen()
    {
        if (!_fullScreenChromeHidden)
        {
            _savedBorder = FormBorderStyle;
            _savedWindowState = WindowState;
            _savedRemotePanelPadding = remotePanel.Padding;

            mainMenuStrip.Visible = false;
            connectBarPanel.Visible = false;
            statusStrip.Visible = false;
            remotePanel.Padding = Padding.Empty;
            FormBorderStyle = FormBorderStyle.None;
            WindowState = FormWindowState.Maximized;

            _fullScreenChromeHidden = true;
            ShowFullScreenBar();
            _fullScreenMousePollTimer.Start();
            BeginInvoke(FocusRemoteControl);
            SetStatusHeadline("전체화면 모드 — F11 또는 상단 표시줄 클릭으로 복귀");
        }
        else
        {
            _fullScreenBarHideTimer.Stop();
            _fullScreenMousePollTimer.Stop();
            _fullScreenBar.Visible = false;

            remotePanel.Padding = _savedRemotePanelPadding;
            mainMenuStrip.Visible = true;
            connectBarPanel.Visible = true;
            statusStrip.Visible = true;
            FormBorderStyle = _savedBorder;
            WindowState = _savedWindowState;

            _fullScreenChromeHidden = false;
            SetStatusHeadline("창 모드로 복귀");
        }

        RefreshStatusStrip();
    }

    private void ReloadProfilesIntoCombo(Guid? selectId = null)
    {
        _suppressProfileChange = true;
        try
        {
            profilesCombo.Items.Clear();
            profilesCombo.Items.Add("(선택 안함)");
            var selectIndex = 0;
            for (var i = 0; i < _profilesList.Count; i++)
            {
                var idx = profilesCombo.Items.Add(_profilesList[i].Name);
                if (selectId.HasValue && _profilesList[i].Id == selectId.Value)
                {
                    selectIndex = idx;
                }
            }
            profilesCombo.SelectedIndex = selectIndex;
        }
        finally
        {
            _suppressProfileChange = false;
        }
    }

    private void ReloadHistoryIntoCombo()
    {
        historyCombo.Items.Clear();
        historyCombo.Items.Add("(최근 기록 없음)");
        foreach (var entry in _historyList.Take(20))
        {
            historyCombo.Items.Add($"{entry.Host}:{entry.Port}");
        }
        historyCombo.SelectedIndex = 0;
    }

    private void OnProfileComboChanged(object? sender, EventArgs e)
    {
        if (_suppressProfileChange || profilesCombo.SelectedIndex <= 0)
        {
            return;
        }

        var name = profilesCombo.SelectedItem?.ToString();
        var profile = _profilesList.FirstOrDefault(p => p.Name == name);
        if (profile != null)
        {
            ApplyProfileToForm(profile);
        }
    }

    private void OnHistoryComboChanged(object? sender, EventArgs e)
    {
        if (historyCombo.SelectedIndex <= 0)
        {
            return;
        }

        var text = historyCombo.SelectedItem?.ToString();
        var entry = _historyList.FirstOrDefault(h => $"{h.Host}:{h.Port}" == text);
        if (entry != null)
        {
            hostText.Text = entry.Host;
            portText.Text = entry.Port.ToString(CultureInfo.InvariantCulture);
        }
    }

    private void ApplyProfileToForm(ConnectionProfile profile)
    {
        hostText.Text = profile.Host;
        portText.Text = profile.Port > 0
            ? profile.Port.ToString(CultureInfo.InvariantCulture)
            : VncConnectionDefaults.DefaultPort.ToString(CultureInfo.InvariantCulture);
        var savedPw = ConnectionProfileStore.UnprotectPassword(profile.EncryptedPasswordBase64);
        passwordText.Text = savedPw ?? "";
        _vncSettings = VncClientSettings.FromProfile(profile);
        RefreshStatusStrip();
    }

    private void TryRecordConnectionHistory(string host, int port)
    {
        try
        {
            ConnectionHistoryStore.Record(host, port);
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(
                this,
                ExceptionMessageFormatter.Format(ex, "최근 연결 기록을 저장하거나 다시 불러오지 못했습니다."),
                Text,
                MessageBoxIcon.Warning);
        }
    }

    private bool IsSessionActive => vncRemote.Client.IsConnected;

    private void UpdateConnectUi()
    {
        var active = IsSessionActive;
        var connecting = _vncConnecting;

        if (active)
        {
            UiTheme.StyleConnectButton(connectButton, sessionActive: true);
            connectButton.Text = "연결 끊기";
        }
        else if (connecting)
        {
            UiTheme.StyleConnectButtonConnecting(connectButton);
            connectButton.Text = "연결 중…";
        }
        else
        {
            UiTheme.StyleConnectButton(connectButton, sessionActive: false);
            connectButton.Text = "연결";
        }

        var busy = active || connecting;
        UseWaitCursor = connecting;

        hostText.Enabled = !busy;
        portText.Enabled = !busy;
        passwordText.Enabled = !busy;
        profilesCombo.Enabled = !busy;
        historyCombo.Enabled = !busy;
        advancedSettingsButton.Enabled = !busy;
        connectButton.Enabled = active || !connecting;

        RefreshStatusStrip();
    }

    private void OnStatusRelatedInputChanged(object? sender, EventArgs e) => RefreshStatusStrip();

    private async void OnConnectFieldKeyDown(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.Enter)
        {
            e.SuppressKeyPress = true;
            await OnConnectClickAsync();
        }
    }

    private async Task ConnectVncAsync(string host, int port, string password, VncClientSettings settings)
    {
        if (vncRemote.Client.IsConnected)
        {
            vncRemote.Client.Close();
        }

        vncHostPanel.Visible = true;

        // VncControl 설정(입력·클립보드·커서·화면 맞춤·FPS)은 UI 스레드에서 미리 적용
        VncConnectionDefaults.ApplyControlSettings(vncRemote, settings);

        var options = new VncClientConnectOptions();
        VncConnectionDefaults.ApplyTo(options, settings);
        options.Password = password.ToCharArray();

        _vncConnecting = true;
        SetStatusHeadline("VNC 연결 중… — 서버와 핸드셰이크 중입니다");
        UpdateConnectUi();
        await Task.Yield();

        try
        {
            try
            {
                if (settings.UseTls)
                {
                    // TLS: 먼저 TCP 연결 후 SslStream으로 래핑, 그 위에 RFB 핸드셰이크
                    _vncTlsClient?.Dispose();
                    var tcpClient = new TcpClient();
                    _vncTlsClient = tcpClient;
                    await tcpClient.ConnectAsync(host, port);
                    var sslStream = new SslStream(
                        tcpClient.GetStream(),
                        leaveInnerStreamOpen: false,
                        userCertificateValidationCallback: settings.IgnoreTlsCertErrors
                            ? (_, _, _, _) => true
                            : null);
                    var sslOptions = new SslClientAuthenticationOptions
                    {
                        TargetHost = host,
                        EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13,
                    };
                    await sslStream.AuthenticateAsClientAsync(sslOptions);
                    await Task.Run(() => vncRemote.Client.Connect(sslStream, options));
                }
                else
                {
                    _vncTlsClient?.Dispose();
                    _vncTlsClient = null;
                    await Task.Run(() => vncRemote.Client.Connect(host, port, options));
                }
                SetStatusHeadline("VNC 연결됨 — 원격 화면이 아래에 표시됩니다");
                TryRecordConnectionHistory(host, port);
                BeginInvoke(() =>
                {
                    vncRemote.Focus();
                });
            }
            catch (VncException ex)
            {
                SetStatusHeadline("VNC 연결 실패");
                var body = ExceptionMessageFormatter.Format(
                    ex,
                    "VNC 연결에 실패했습니다.\r\nReason: " + ex.Reason);
                var hint = VncFailureReasonUserHints.GetHint(ex.Reason);
                if (!string.IsNullOrEmpty(hint)) body += "\r\n\r\n" + hint;
                var extra = VncFailureReasonUserHints.GetMessageSpecificHint(ex.Message);
                if (!string.IsNullOrEmpty(extra)) body += "\r\n\r\n" + extra;
                ErrorDialog.Show(this, body, Text, MessageBoxIcon.Error);
            }
            catch (SocketException ex)
            {
                SetStatusHeadline("VNC 연결 실패");
                ErrorDialog.Show(
                    this,
                    ExceptionMessageFormatter.Format(ex, "VNC TCP 연결에 실패했습니다."),
                    Text,
                    MessageBoxIcon.Error);
            }
            catch (AuthenticationException ex)
            {
                SetStatusHeadline("VNC TLS 인증 실패");
                ErrorDialog.Show(
                    this,
                    ExceptionMessageFormatter.Format(ex,
                        "TLS 핸드셰이크에 실패했습니다.\r\n서버 인증서를 신뢰할 수 없거나 TLS 버전이 맞지 않습니다.\r\n'인증서 오류 무시' 옵션을 활성화하거나 서버 설정을 확인하세요."),
                    Text,
                    MessageBoxIcon.Error);
            }
            catch (Exception ex)
            {
                SetStatusHeadline("VNC 연결 실패");
                ErrorDialog.Show(
                    this,
                    ExceptionMessageFormatter.Format(ex, "VNC 연결 중 예외가 발생했습니다."),
                    Text,
                    MessageBoxIcon.Error);
            }
        }
        finally
        {
            if (options.Password != null)
            {
                Array.Clear(options.Password, 0, options.Password.Length);
            }

            _vncConnecting = false;
            // 연결 실패 시 VNC 패널도 검은 화면으로
            if (!vncRemote.Client.IsConnected)
            {
                _vncTlsClient?.Dispose();
                _vncTlsClient = null;
                vncHostPanel.Visible = false;
            }
            UpdateConnectUi();
        }
    }

    private void DisconnectCurrent()
    {
        if (vncRemote.Client.IsConnected)
        {
            _userDisconnecting = true;
            vncRemote.Client.Close();
        }

        if (_fullScreenChromeHidden)
        {
            ToggleFullScreen();
        }

        SetStatusHeadline("준비됨 — 연결할 서버를 입력한 뒤 연결을 누르세요");
        UpdateConnectUi();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (_runtimeUiInitialized)
        {
            PersistVncSettingsToUi();
        }

        if (_remoteClientsInitialized)
        {
            try
            {
                DisconnectCurrent();
            }
            catch
            {
                // ignore shutdown errors
            }
        }

        base.OnFormClosing(e);
    }

    private void ApplyQuickConnectDefaults()
    {
        var ui = UiSettingsStore.Load();
        if (!string.IsNullOrWhiteSpace(ui.LastVncHost))
        {
            hostText.Text = ui.LastVncHost;
        }

        portText.Text = ui.LastVncPort is > 0 and <= 65535
            ? ui.LastVncPort.Value.ToString(CultureInfo.InvariantCulture)
            : VncConnectionDefaults.DefaultPort.ToString(CultureInfo.InvariantCulture);

        if (string.IsNullOrWhiteSpace(hostText.Text) && _historyList.Count > 0)
        {
            hostText.Text = _historyList[0].Host;
            portText.Text = _historyList[0].Port.ToString(CultureInfo.InvariantCulture);
        }

        _vncSettings = ui.ToVncClientSettings();
        RefreshStatusStrip();
    }

    private void SaveLastConnectFields(string host, int port)
    {
        var ui = UiSettingsStore.Load();
        ui.LastVncHost = host;
        ui.LastVncPort = port;
        ui.ApplyVncClientSettings(_vncSettings);
        UiSettingsStore.Save(ui);
    }

    private void PersistVncSettingsToUi()
    {
        var ui = UiSettingsStore.Load();
        ui.ApplyVncClientSettings(_vncSettings);
        UiSettingsStore.Save(ui);
    }

    private VncClientSettings GetEffectiveVncSettings() => _vncSettings;

    private async Task OnConnectClickAsync()
    {
        if (IsSessionActive)
        {
            DisconnectCurrent();
            return;
        }

        var host = hostText.Text.Trim();
        if (host.Length == 0)
        {
            SetStatusHeadline("입력 필요 — 서버(호스트) 주소를 입력하세요");
            MessageBox.Show(this, "서버 주소를 입력하세요.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            hostText.Focus();
            return;
        }

        if (!int.TryParse(portText.Text.Trim(), out var port) || port is < 1 or > 65535)
        {
            SetStatusHeadline("입력 오류 — 포트는 1~65535 숫자여야 합니다");
            MessageBox.Show(this, "포트는 1~65535 사이여야 합니다.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            portText.Focus();
            return;
        }

        var settings = GetEffectiveVncSettings();
        SaveLastConnectFields(host, port);
        await ConnectVncAsync(host, port, passwordText.Text, settings);
    }

    private void OpenAdvancedSettings()
    {
        using var dlg = new VncAdvancedSettingsDialog();
        dlg.LoadSettings(_vncSettings);
        if (dlg.ShowDialog(this) == DialogResult.OK)
        {
            _vncSettings = dlg.ToSettings();
            PersistVncSettingsToUi();
            RefreshStatusStrip();
        }
    }

    private void LoadProfilesAndHistory()
    {
        try
        {
            _profilesList = ConnectionProfileStore.Load();
        }
        catch
        {
            _profilesList = new List<ConnectionProfile>();
        }

        try
        {
            _historyList = ConnectionHistoryStore.Load();
        }
        catch
        {
            _historyList = new List<ConnectionHistoryEntry>();
        }

        ReloadProfilesIntoCombo();
        ReloadHistoryIntoCombo();
    }
}
