using System.ComponentModel;
using System.Drawing;
using System.Globalization;
using System.Net;
using System.Net.Sockets;
using AxMSTSCLib;
using MSTSCLib;
using RemoteViewing.Vnc;
using RemoteViewing.Windows.Forms;

namespace RemoteDesktopWinV10.App;

public partial class MainForm : Form
{
    private bool _remoteClientsInitialized;
    private bool _vncConnecting;
    private bool _rdpConnecting;
    private bool _fullScreenChromeHidden;
    private FormBorderStyle _savedBorder = FormBorderStyle.Sizable;
    private FormWindowState _savedWindowState = FormWindowState.Normal;

    private List<ConnectionProfile> _profilesList = new();
    private List<ConnectionHistoryEntry> _historyList = new();

    /// <summary>하단 상태 표시줄 첫 칸에 표시할 한 줄 요약.</summary>
    private string _statusHeadline = "준비됨";

    /// <summary>RDP ActiveX — 디자이너에는 없고 <see cref="InitializeRemoteClients"/>에서만 생성합니다.</summary>
    private AxMsRdpClient10NotSafeForScripting rdpClient = null!;

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

        toolStripProtocol.Items.AddRange(new object[] { "RDP", "VNC" });
        toolStripProtocol.SelectedIndex = 0;

        manageProfilesToolStripMenuItem.Click += (_, _) => OpenProfileManager();
        appMenuVisibilityToolStripMenuItem.Click += (_, _) => OpenAppSettings();
        openDataFolderToolStripMenuItem.Click += (_, _) => OpenLocalDataFolder();
        exitToolStripMenuItem.Click += (_, _) => Application.Exit();
        fullScreenToolStripMenuItem.Click += (_, _) => ToggleFullScreen();
        connectToolStripMenuItem.Click += async (_, _) => await OnQuickConnectClickAsync();
        connectionSettingsToolStripMenuItem.Click += (_, _) => OpenConnectionSettings();

        toolStripProtocol.SelectedIndexChanged += (_, _) => ApplyQuickConnectDefaults();
        toolStripConnect.Click += async (_, _) => await OnQuickConnectClickAsync();
        
        KeyDown += OnFormKeyDown;
        toolStripHost.TextChanged += OnStatusRelatedInputChanged;
        toolStripPort.TextChanged += OnStatusRelatedInputChanged;

        // Load profiles and history
        LoadProfilesAndHistory();

        ApplyMainMenuFromSettings();
        ApplyQuickConnectDefaults();
        UpdateConnectUi();
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
        Font = UiTheme.UiFont;
        BackColor = UiTheme.BgApp;
        ForeColor = UiTheme.TextPrimary;

        UiTheme.ApplyLightToolStripChrome(mainMenuStrip);
        UiTheme.ApplyLightToolStripChrome(quickConnectToolStrip);

        remotePanel.BackColor = UiTheme.BgRemote;
        rdpHostPanel.BackColor = UiTheme.BgRemote;
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
        rdpClient = new AxMsRdpClient10NotSafeForScripting();
        ((ISupportInitialize)rdpClient).BeginInit();
        rdpClient.Dock = DockStyle.Fill;
        rdpClient.Enabled = true;
        rdpClient.Location = new Point(0, 0);
        rdpClient.Name = "rdpClient";
        rdpClient.TabIndex = 0;
        rdpHostPanel.Controls.Add(rdpClient);
        ((ISupportInitialize)rdpClient).EndInit();

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
            SetStatusHeadline("VNC 연결 종료");
            UpdateConnectUi();
        });
        vncRemote.ConnectionFailed += (_, _) => BeginInvoke(() =>
        {
            SetStatusHeadline("VNC 연결 실패 — 암호·포트·서버 주소를 확인하세요");
            UpdateConnectUi();
        });

        rdpClient.OnConnected += (_, _) => BeginInvoke(() =>
        {
            _rdpConnecting = false;
            SetStatusHeadline("RDP 연결됨 — 원격 데스크톱 세션이 수립되었습니다");
            // TODO: Record connection history from toolbar controls
            // if (int.TryParse(toolStripPort.Text.Trim(), out var hp) && hp > 0)
            // {
            //     TryRecordConnectionHistory(RemoteDesktopProtocol.Rdp, toolStripHost.Text.Trim(), hp);
            // }

            UpdateConnectUi();
        });
        rdpClient.OnDisconnected += (_, _) => BeginInvoke(() =>
        {
            _rdpConnecting = false;
            if (rdpClient.FullScreen)
            {
                try
                {
                    rdpClient.FullScreen = false;
                }
                catch
                {
                    // ignore
                }
            }

            SetStatusHeadline("RDP 연결 종료 — 자격 증명·도메인(PC\\사용자)·NLA·인증서 완화 설정을 확인하세요");
            UpdateConnectUi();
        });
        rdpClient.OnFatalError += (_, e) => BeginInvoke(() =>
        {
            _rdpConnecting = false;
            var code = Convert.ToInt64(e.errorCode);
            var desc = RdpFatalErrorDescription.Describe(code);
            var body =
                "RDP 클라이언트에서 치명적 오류가 보고되었습니다.\r\n\r\n"
                + "오류 코드(십진): " + code + "\r\n"
                + "오류 코드(16진): 0x" + code.ToString("X") + "\r\n\r\n"
                + desc
                + "\r\n\r\n자격 증명, NLA, 네트워크·방화벽, 서버 설정을 확인하세요.";
            SetStatusHeadline("RDP 치명적 오류 — 코드 " + code);
            MessageBox.Show(this, body, Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
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
            MessageBox.Show(
                null,
                ExceptionMessageFormatter.Format(ex, "데이터 폴더를 열 수 없습니다.\r\n경로: " + dir),
                "Remote Desktop",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    /// <summary>
    /// <c>DOMAIN\user</c>, <c>user@fqdn</c>, 또는 단일 이름(원격 PC 로컬 계정)에 맞춰 RDP Domain / UserName 을 나눕니다.
    /// </summary>
    private static void SplitRdpUserForLogon(string combinedUser, string serverHost, out string domain, out string userName)
    {
        domain = string.Empty;
        userName = combinedUser.Trim();
        if (userName.Length == 0)
        {
            return;
        }

        var slash = userName.IndexOf('\\');
        if (slash > 0)
        {
            domain = userName[..slash].Trim();
            userName = userName[(slash + 1)..].Trim();
            return;
        }

        if (slash == 0 && userName.Length > 1)
        {
            domain = ".";
            userName = userName[1..].Trim();
            return;
        }

        var at = userName.LastIndexOf('@');
        if (at > 0 && at < userName.Length - 1)
        {
            domain = userName[(at + 1)..].Trim();
            userName = userName[..at].Trim();
            return;
        }

        var host = serverHost.Trim();
        if (host.Length == 0)
        {
            return;
        }

        if (IPAddress.TryParse(host, out _))
        {
            domain = ".";
            return;
        }

        var dot = host.IndexOf('.');
        domain = dot > 0 ? host[..dot] : host;
    }

    private void SetStatusHeadline(string headline)
    {
        _statusHeadline = headline;
        RefreshStatusStrip();
    }

    private void RefreshStatusStrip()
    {
        toolStripStatusState.Text = "상태: " + _statusHeadline;

        var proto = IsRdp ? "RDP" : "VNC";
        var host = toolStripHost.Text.Trim();
        var portStr = toolStripPort.Text.Trim();
        if (host.Length == 0)
        {
            toolStripStatusConnection.Text = "연결: " + proto + " — 호스트 미입력";
        }
        else if (!int.TryParse(portStr, out var portNum) || portNum is < 1 or > 65535)
        {
            toolStripStatusConnection.Text = $"연결: {proto} {host} — 포트 확인 ({portStr})";
        }
        else
        {
            toolStripStatusConnection.Text = $"연결: {proto} {host}:{portNum}";
        }

        if (!_remoteClientsInitialized)
        {
            toolStripStatusViewport.Text = "원격 패널: 클라이언트 초기화 전";
            toolStripStatusOptions.Text = "옵션: —";
            return;
        }

        if (!rdpHostPanel.Visible && !vncHostPanel.Visible)
        {
            toolStripStatusViewport.Text = "원격 패널: 비표시 — 연결 후 이 영역에 원격 화면이 나타납니다";
        }
        else if (rdpHostPanel.Visible)
        {
            var conn = rdpClient.Connected != 0;
            var fs = false;
            try
            {
                fs = rdpClient.FullScreen;
            }
            catch
            {
                // ignore
            }

            if (conn && fs)
            {
                toolStripStatusViewport.Text = "원격 패널: RDP · 전체 화면";
            }
            else if (conn)
            {
                toolStripStatusViewport.Text = "원격 패널: RDP · 창 모드 (F11 전체 화면)";
            }
            else if (_rdpConnecting)
            {
                toolStripStatusViewport.Text = "원격 패널: RDP · 서버에 연결하는 중(잠시 걸릴 수 있음)…";
            }
            else
            {
                toolStripStatusViewport.Text = "원격 패널: RDP 영역 표시됨 · 세션 수립 중(검은 화면이면 NLA·인증서 완화·계정 확인)";
            }
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

        // TODO: Display RDP/VNC options from connection settings dialog
        if (IsRdp)
        {
            toolStripStatusOptions.Text = "RDP: 설정 확인 필요";
        }
        else
        {
            toolStripStatusOptions.Text =
                "VNC: ShareDesktop=" + VncConnectionDefaults.ShareDesktop
                + ", 기본TCP=" + VncConnectionDefaults.DefaultPort;
        }
    }

    private void OnFormKeyDown(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.F11)
        {
            e.Handled = true;
            ToggleFullScreen();
        }
    }

    private void ToggleFullScreen()
    {
        if (!_fullScreenChromeHidden)
        {
            _savedBorder = FormBorderStyle;
            _savedWindowState = WindowState;

            mainMenuStrip.Visible = false;
            quickConnectToolStrip.Visible = false;
            statusStrip.Visible = false;

            FormBorderStyle = FormBorderStyle.None;
            WindowState = FormWindowState.Maximized;

            if (IsRdp && rdpClient.Connected != 0)
            {
                try
                {
                    rdpClient.FullScreen = true;
                }
                catch
                {
                    // ignore
                }
            }
            else if (!IsRdp && vncRemote.Client.IsConnected)
            {
                vncRemote.SizeMode = VncControlSizeMode.Zoom;
            }

            _fullScreenChromeHidden = true;
            SetStatusHeadline("전체 화면 모드 — 메뉴/도구줄 숨김 (F11로 복귀)");
        }
        else
        {
            if (rdpClient.Connected != 0)
            {
                try
                {
                    rdpClient.FullScreen = false;
                }
                catch
                {
                    // ignore
                }
            }

            mainMenuStrip.Visible = true;
            quickConnectToolStrip.Visible = true;
            statusStrip.Visible = true;

            FormBorderStyle = _savedBorder;
            WindowState = _savedWindowState;

            if (vncRemote.Client.IsConnected)
            {
                vncRemote.SizeMode = VncControlSizeMode.Zoom;
            }

            _fullScreenChromeHidden = false;
            SetStatusHeadline("창 모드 — 메뉴/도구줄 표시");
        }

        RefreshStatusStrip();
    }

    // Profiles combo no longer exists - profiles are managed through ConnectionDialog
    /*
    private void ReloadProfilesIntoCombo(Guid? selectId)
    {
        _suppressProfileChange = true;
        try
        {
            _profilesList = ConnectionProfileStore.Load();
            profilesCombo.Items.Clear();
            profilesCombo.Items.Add("(프로필 없음)");
            var selectIndex = 0;
            for (var i = 0; i < _profilesList.Count; i++)
            {
                var p = _profilesList[i];
                var idx = profilesCombo.Items.Add(p.Name);
                if (selectId.HasValue && p.Id == selectId.Value)
                {
                    selectIndex = idx;
                }
            }

            profilesCombo.SelectedIndex = selectIndex >= 0 && selectIndex < profilesCombo.Items.Count ? selectIndex : 0;
        }
        catch (Exception ex)
        {
            _profilesList = new List<ConnectionProfile>();
            profilesCombo.Items.Clear();
            profilesCombo.Items.Add("(프로필 없음)");
            profilesCombo.SelectedIndex = 0;
            MessageBox.Show(
                this,
                ExceptionMessageFormatter.Format(ex, "프로필 목록을 불러오지 못했습니다."),
                Text,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
        finally
        {
            _suppressProfileChange = false;
        }

        RefreshStatusStrip();
    }
    */

    // History combo no longer exists - history is managed through ConnectionDialog
    /*
    private void ReloadHistoryIntoCombo(bool preserveSelection)
    {
        var prev = preserveSelection && historyCombo.SelectedIndex > 0 && historyCombo.SelectedIndex <= _historyList.Count
            ? _historyList[historyCombo.SelectedIndex - 1]
            : null;

        _suppressHistoryChange = true;
        try
        {
            _historyList = ConnectionHistoryStore.Load();
            historyCombo.Items.Clear();
            historyCombo.Items.Add("(최근 연결 없음)");
            var selectIndex = 0;
            for (var i = 0; i < _historyList.Count; i++)
            {
                var h = _historyList[i];
                var label = (h.Protocol == RemoteDesktopProtocol.Rdp ? "RDP" : "VNC") + "  " + h.Host + ":" + h.Port.ToString(CultureInfo.InvariantCulture);
                var idx = historyCombo.Items.Add(label);
                if (prev != null
                    && h.Port == prev.Port
                    && string.Equals(h.Host, prev.Host, StringComparison.OrdinalIgnoreCase)
                    && h.Protocol == prev.Protocol)
                {
                    selectIndex = idx;
                }
            }

            historyCombo.SelectedIndex = selectIndex >= 0 && selectIndex < historyCombo.Items.Count ? selectIndex : 0;
        }
        catch (Exception ex)
        {
            _historyList = new List<ConnectionHistoryEntry>();
            historyCombo.Items.Clear();
            historyCombo.Items.Add("(최근 연결 없음)");
            historyCombo.SelectedIndex = 0;
            MessageBox.Show(
                this,
                ExceptionMessageFormatter.Format(ex, "최근 연결 목록을 불러오지 못했습니다."),
                Text,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
        finally
        {
            _suppressHistoryChange = false;
        }

        RefreshStatusStrip();
    }
    */

    private void TryRecordConnectionHistory(RemoteDesktopProtocol protocol, string host, int port)
    {
        try
        {
            ConnectionHistoryStore.Record(protocol, host, port);
            // ReloadHistoryIntoCombo(preserveSelection: false); // History combo removed
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                this,
                ExceptionMessageFormatter.Format(ex, "최근 연결 기록을 저장하거나 다시 불러오지 못했습니다."),
                Text,
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }

    // History selection handled by ConnectionDialog
    /*
    private void OnHistorySelected()
    {
        if (_suppressHistoryChange)
        {
            return;
        }

        if (historyCombo.SelectedIndex <= 0)
        {
            return;
        }

        var h = _historyList[historyCombo.SelectedIndex - 1];
        _suppressDefaults = true;
        _suppressProfileChange = true;
        profilesCombo.SelectedIndex = 0;
        _suppressProfileChange = false;
        protocolCombo.SelectedIndex = h.Protocol == RemoteDesktopProtocol.Rdp ? 0 : 1;
        hostText.Text = h.Host;
        portText.Text = h.Port.ToString(CultureInfo.InvariantCulture);
        passwordText.Clear();
        _suppressDefaults = false;
        SetRdpRedirectControlsEnabled(IsRdp);
        RefreshStatusStrip();
    }
    */

    // Profile selection handled by ConnectionDialog
    /*
    private void OnProfileSelected()
    {
        if (_suppressProfileChange)
        {
            return;
        }

        if (profilesCombo.SelectedIndex <= 0)
        {
            return;
        }

        var p = _profilesList[profilesCombo.SelectedIndex - 1];
        _suppressDefaults = true;
        protocolCombo.SelectedIndex = p.Protocol == RemoteDesktopProtocol.Rdp ? 0 : 1;
        hostText.Text = p.Host;
        portText.Text = p.Port.ToString(CultureInfo.InvariantCulture);
        userText.Text = p.User;
        passwordText.Clear();
        var saved = ConnectionProfileStore.UnprotectPassword(p.EncryptedPasswordBase64);
        if (!string.IsNullOrEmpty(saved))
        {
            passwordText.Text = saved;
        }

        if (p.CredSspEnabled.HasValue)
        {
            credSspCheck.Checked = p.CredSspEnabled.Value;
        }

        if (p.NegotiateSecurityLayer.HasValue)
        {
            nlaCheck.Checked = p.NegotiateSecurityLayer.Value;
        }

        if (p.RelaxedCertificateValidation.HasValue)
        {
            relaxedCertCheck.Checked = p.RelaxedCertificateValidation.Value;
        }

        if (p.RdpRedirectClipboard.HasValue)
        {
            rdpClipboardCheck.Checked = p.RdpRedirectClipboard.Value;
        }

        if (p.RdpRedirectDrives.HasValue)
        {
            rdpDrivesCheck.Checked = p.RdpRedirectDrives.Value;
        }

        if (p.RdpRedirectPrinters.HasValue)
        {
            rdpPrintersCheck.Checked = p.RdpRedirectPrinters.Value;
        }

        _suppressDefaults = false;
        SetRdpRedirectControlsEnabled(IsRdp);
        RefreshStatusStrip();
    }
    */

    // Protocol defaults handled by toolbar controls (ApplyQuickConnectDefaults)
    /*
    private void ApplyProtocolDefaults()
    {
        if (_suppressDefaults)
        {
            return;
        }

        var isRdp = protocolCombo.SelectedIndex == 0;
        portText.Text = isRdp ? "3389" : VncConnectionDefaults.DefaultPort.ToString(CultureInfo.InvariantCulture);
        userText.Enabled = isRdp;
        hostText.PlaceholderText = isRdp
            ? "호스트 이름 또는 IP"
            : "localhost 또는 서버 IP (같은 PC면 localhost)";
        passwordText.PlaceholderText = isRdp
            ? ""
            : "VNC 암호(없으면 빈 칸; 표준 인증은 앞 8자만)";
        SetRdpRedirectControlsEnabled(isRdp);
        RefreshStatusStrip();
    }
    */

    // RDP redirect controls removed - settings managed through ConnectionDialog
    /*
    private void SetRdpRedirectControlsEnabled(bool rdp)
    {
        rdpClipboardCheck.Enabled = rdp;
        rdpDrivesCheck.Enabled = rdp;
        rdpPrintersCheck.Enabled = rdp;
    }
    */

    private bool IsRdp => toolStripProtocol.SelectedIndex == 0;

    private bool IsSessionActive
    {
        get
        {
            if (IsRdp)
            {
                return rdpClient.Connected != 0;
            }

            return vncRemote.Client.IsConnected;
        }
    }

    private void UpdateConnectUi()
    {
        var active = IsSessionActive;
        var connecting = _vncConnecting || _rdpConnecting;

        // Update toolbar connect button
        if (active)
        {
            toolStripConnect.Enabled = true;
            toolStripConnect.Text = "연결 끊기";
            toolStripConnect.BackColor = Color.FromArgb(220, 53, 69); // Red for disconnect
            toolStripConnect.ForeColor = Color.White;
        }
        else if (connecting)
        {
            toolStripConnect.Enabled = false;
            toolStripConnect.Text = "연결 중…";
            toolStripConnect.BackColor = Color.FromArgb(255, 193, 7); // Yellow for connecting
            toolStripConnect.ForeColor = Color.Black;
        }
        else
        {
            toolStripConnect.Enabled = true;
            toolStripConnect.Text = "연결";
            toolStripConnect.BackColor = Color.FromArgb(40, 167, 69); // Green for connect
            toolStripConnect.ForeColor = Color.White;
        }

        var busy = active || connecting;
        UseWaitCursor = connecting;

        // Enable/disable toolbar controls
        toolStripProtocol.Enabled = !busy;
        toolStripHost.Enabled = !busy;
        toolStripPort.Enabled = !busy;
        
        RefreshStatusStrip();
    }

    private void OnStatusRelatedInputChanged(object? sender, EventArgs e) => RefreshStatusStrip();

    // Old connect method - replaced by OnQuickConnectClickAsync
    /*
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
            return;
        }

        if (!int.TryParse(portText.Text.Trim(), out var port) || port is < 1 or > 65535)
        {
            SetStatusHeadline("입력 오류 — 포트는 1~65535 숫자여야 합니다");
            MessageBox.Show(this, "포트는 1~65535 사이여야 합니다.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (IsRdp)
        {
            var user = userText.Text.Trim();
            if (user.Length == 0)
            {
                SetStatusHeadline("입력 필요 — RDP 사용자 이름을 입력하세요");
                MessageBox.Show(this, "RDP 사용자 이름을 입력하세요.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            await Task.Yield();
            ConnectRdp(host, port, user, passwordText.Text);
        }
        else
        {
            await ConnectVncAsync(host, port, passwordText.Text);
        }
    }
    */

    private void ApplyRdpSecurityOptions()
    {
        // TODO: Get security options from ConnectionDialog settings
        // Using defaults for now
        ((IMsRdpClientAdvancedSettings6)rdpClient.AdvancedSettings6).EnableCredSspSupport = true;

        var ocx = (IMsRdpClientNonScriptable3)rdpClient.GetOcx();
        ocx.NegotiateSecurityLayer = true;

        var n4 = (IMsRdpClientNonScriptable4)rdpClient.GetOcx();
        n4.TrustedZoneSite = false;
        rdpClient.AdvancedSettings5.AuthenticationLevel = 2u;
    }

    private void ApplyRdpRedirection()
    {
        // TODO: Get redirection options from ConnectionDialog settings
        // Using defaults for now
        rdpClient.AdvancedSettings2.RedirectDrives = false;
        rdpClient.AdvancedSettings2.RedirectPrinters = false;
        rdpClient.AdvancedSettings6.RedirectClipboard = true;
        var n4 = (IMsRdpClientNonScriptable4)rdpClient.GetOcx();
        n4.WarnAboutClipboardRedirection = false;
    }

    private void ConnectRdp(string host, int port, string user, string password)
    {
        _rdpConnecting = true;
        try
        {
            vncHostPanel.Visible = false;
            rdpHostPanel.Visible = true;

            if (rdpClient.Connected != 0)
            {
                try
                {
                    rdpClient.Disconnect();
                }
                catch
                {
                    // ignore
                }
            }

            ApplyRdpSecurityOptions();

            SplitRdpUserForLogon(user, host, out var rdpDomain, out var rdpUser);
            rdpClient.Domain = rdpDomain;
            rdpClient.UserName = rdpUser;
            rdpClient.Server = host.Trim();
            rdpClient.AdvancedSettings9.RDPPort = port;
            rdpClient.AdvancedSettings9.ClearTextPassword = password;

            ApplyRdpRedirection();

            var logonHint = string.IsNullOrEmpty(rdpDomain)
                ? "로그온: " + rdpUser
                : "로그온: [" + rdpDomain + "]\\" + rdpUser;
            SetStatusHeadline("RDP 연결 중… — " + logonHint);
            UpdateConnectUi();

            void RunConnect()
            {
                try
                {
                    rdpClient.Connect();
                }
                catch (Exception ex)
                {
                    _rdpConnecting = false;
                    SetStatusHeadline("RDP 연결 실패 — " + ex.Message);
                    MessageBox.Show(
                        this,
                        ExceptionMessageFormatter.Format(ex, "RDP Connect() 호출이 실패했습니다."),
                        Text,
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                    UpdateConnectUi();
                }
            }

            if (IsHandleCreated)
            {
                BeginInvoke((Action)RunConnect);
            }
            else
            {
                RunConnect();
            }
        }
        catch (Exception ex)
        {
            _rdpConnecting = false;
            SetStatusHeadline("RDP 연결 실패 — " + ex.Message);
            MessageBox.Show(
                this,
                ExceptionMessageFormatter.Format(ex, "RDP 연결 준비 중 예외가 발생했습니다."),
                Text,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            UpdateConnectUi();
        }
    }

    private async Task ConnectVncAsync(string host, int port, string password)
    {
        if (vncRemote.Client.IsConnected)
        {
            vncRemote.Client.Close();
        }

        rdpHostPanel.Visible = false;
        vncHostPanel.Visible = true;

        var options = new VncClientConnectOptions();
        VncConnectionDefaults.ApplyTo(options);
        options.Password = password.ToCharArray();

        _vncConnecting = true;
        SetStatusHeadline("VNC 연결 중… — 서버와 핸드셰이크 중입니다");
        UpdateConnectUi();
        await Task.Yield();

        try
        {
            try
            {
                await Task.Run(() => vncRemote.Client.Connect(host, port, options));
                SetStatusHeadline("VNC 연결됨 — 원격 화면이 아래에 표시됩니다");
                TryRecordConnectionHistory(RemoteDesktopProtocol.Vnc, host, port);
                BeginInvoke(() =>
                {
                    vncRemote.SizeMode = VncControlSizeMode.Zoom;
                    vncRemote.Focus();
                });
            }
            catch (VncException ex)
            {
                SetStatusHeadline(
                    "VNC 연결 실패 — "
                    + (string.IsNullOrWhiteSpace(ex.Message) ? ex.Reason.ToString() : ex.Message));
                var body = ExceptionMessageFormatter.Format(
                    ex,
                    "VNC 연결에 실패했습니다.\r\nReason: " + ex.Reason);
                var hint = VncFailureReasonUserHints.GetHint(ex.Reason);
                if (!string.IsNullOrEmpty(hint))
                {
                    body += "\r\n\r\n" + hint;
                }

                var extra = VncFailureReasonUserHints.GetMessageSpecificHint(ex.Message);
                if (!string.IsNullOrEmpty(extra))
                {
                    body += "\r\n\r\n" + extra;
                }

                MessageBox.Show(this, body, Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            catch (SocketException ex)
            {
                SetStatusHeadline("VNC 연결 실패 — 소켓: " + ex.SocketErrorCode);
                MessageBox.Show(
                    this,
                    ExceptionMessageFormatter.Format(ex, "VNC TCP 연결에 실패했습니다."),
                    Text,
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
            catch (Exception ex)
            {
                SetStatusHeadline("VNC 연결 실패 — " + ex.Message);
                MessageBox.Show(
                    this,
                    ExceptionMessageFormatter.Format(ex, "VNC 연결 중 예외가 발생했습니다."),
                    Text,
                    MessageBoxButtons.OK,
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
            UpdateConnectUi();
        }
    }

    private void DisconnectCurrent()
    {
        _rdpConnecting = false;

        if (IsRdp)
        {
            if (rdpClient.Connected != 0)
            {
                try
                {
                    if (rdpClient.FullScreen)
                    {
                        rdpClient.FullScreen = false;
                    }
                }
                catch
                {
                    // ignore
                }

                rdpClient.Disconnect();
            }
        }
        else if (vncRemote.Client.IsConnected)
        {
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
        var isRdp = toolStripProtocol.SelectedIndex == 0;
        toolStripPort.Text = isRdp ? "3389" : "5900";
        RefreshStatusStrip();
    }

    private async Task OnQuickConnectClickAsync()
    {
        if (IsSessionActive)
        {
            DisconnectCurrent();
            return;
        }

        // Reload profiles and history before opening dialog
        LoadProfilesAndHistory();

        // Open ConnectionDialog to get connection details
        using var dialog = new ConnectionDialog();
        
        // Load current toolbar settings into dialog
        dialog.Protocol = toolStripProtocol.SelectedItem?.ToString() ?? "RDP";
        dialog.Host = toolStripHost.Text.Trim();
        dialog.Port = toolStripPort.Text.Trim();
        dialog.SetProfiles(_profilesList);
        dialog.SetHistory(_historyList);
        dialog.LoadCurrentSettings();
        
        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        // Update toolbar from dialog
        toolStripProtocol.SelectedItem = dialog.Protocol;
        toolStripHost.Text = dialog.Host;
        toolStripPort.Text = dialog.Port;

        var host = dialog.Host.Trim();
        if (host.Length == 0)
        {
            SetStatusHeadline("입력 필요 — 서버(호스트) 주소를 입력하세요");
            MessageBox.Show(this, "서버 주소를 입력하세요.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (!int.TryParse(dialog.Port.Trim(), out var port) || port is < 1 or > 65535)
        {
            SetStatusHeadline("입력 오류 — 포트는 1~65535 숫자여야 합니다");
            MessageBox.Show(this, "포트는 1~65535 사이여야 합니다.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (dialog.Protocol == "RDP")
        {
            var user = dialog.Username.Trim();
            if (string.IsNullOrWhiteSpace(user))
            {
                SetStatusHeadline("입력 필요 — RDP 사용자 이름을 입력하세요");
                MessageBox.Show(this, "RDP 사용자 이름을 입력하세요.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            await Task.Yield();
            ConnectRdp(host, port, user, dialog.Password);
        }
        else
        {
            await ConnectVncAsync(host, port, dialog.Password);
        }
    }

    private void OpenConnectionSettings()
    {
        // Reload profiles and history before opening dialog
        LoadProfilesAndHistory();
        
        using var dialog = new ConnectionDialog();
        
        // Load current toolbar settings into dialog
        dialog.Protocol = toolStripProtocol.SelectedItem?.ToString() ?? "RDP";
        dialog.Host = toolStripHost.Text.Trim();
        dialog.Port = toolStripPort.Text.Trim();
        dialog.SetProfiles(_profilesList);
        dialog.SetHistory(_historyList);
        dialog.LoadCurrentSettings();
        
        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            // Apply settings from dialog to toolbar
            toolStripProtocol.SelectedItem = dialog.Protocol;
            toolStripHost.Text = dialog.Host;
            toolStripPort.Text = dialog.Port;
        }
        
        // Reload profiles in case any were saved
        LoadProfilesAndHistory();
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
    }
}
