using System.ComponentModel;
using System.Drawing;
using System.Globalization;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using AxMSTSCLib;
using MSTSCLib;
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
    private bool _rdpConnecting;
    private bool _fullScreenChromeHidden;

    // RDP COM 객체 세대 번호 — ReinitRdpClient() 호출마다 증가, 구버전 이벤트 무시에 사용
    private int _rdpGen;

    // 사용자가 직접 끊기를 누른 경우 — 예기치 않은 종료 팝업 억제에 사용
    private bool _userDisconnecting;
    // OnFatalError가 이미 팝업을 띄운 경우 — OnDisconnected 팝업 중복 방지
    private bool _rdpFatalErrorFired;

    // 마지막으로 시도한 연결 정보 (OnConnected 핸들러에서 history 기록에 사용)
    private string _currentConnectHost = "";
    private int _currentConnectPort;

    // 마지막으로 적용한 RDP 옵션 (상태바 표시에 사용)
    private bool _rdpOptCredSsp = true;
    private bool _rdpOptNla = true;
    private bool _rdpOptRelaxedCert;
    private bool _rdpOptClipboard = true;
    private bool _rdpOptDrives;
    private bool _rdpOptPrinters;
    private FormBorderStyle _savedBorder = FormBorderStyle.Sizable;
    private FormWindowState _savedWindowState = FormWindowState.Normal;
    private Padding _savedRemotePanelPadding;

    // 전체화면 힌트 바 (전체화면 진입 시 상단에 표시, 3초 후 자동 숨김)
    private Panel _fullScreenBar = null!;
    private System.Windows.Forms.Timer _fullScreenBarHideTimer = null!;
    private System.Windows.Forms.Timer _fullScreenMousePollTimer = null!;

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
        InitializeFullScreenBar();

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
        // 폼과 핵심 패널에 더블버퍼 적용 — 전체화면 전환·VNC 고속 프레임 깜빡임 방지
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
        UpdateStyles();
        EnableDoubleBuffer(remotePanel);
        EnableDoubleBuffer(rdpHostPanel);
        EnableDoubleBuffer(vncHostPanel);

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

        WireRdpClientEvents(_rdpGen);

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

    /// <summary>
    /// RDP COM 객체를 재생성합니다. 한 번 연결을 시도한 COM 객체는 일부 보안 속성을
    /// 변경할 수 없으므로(E_INVALIDARG), 재연결 시 이 메서드로 초기화합니다.
    /// </summary>
    private void ReinitRdpClient()
    {
        var old = rdpClient;
        _rdpGen++; // 구버전 이벤트 핸들러를 무효화

        rdpClient = new AxMsRdpClient10NotSafeForScripting();
        ((ISupportInitialize)rdpClient).BeginInit();
        rdpClient.Dock = DockStyle.Fill;
        rdpClient.Enabled = true;
        rdpClient.Location = new Point(0, 0);
        rdpClient.Name = "rdpClient";
        rdpClient.TabIndex = 0;

        WireRdpClientEvents(_rdpGen);

        rdpHostPanel.Controls.Remove(old);
        rdpHostPanel.Controls.Add(rdpClient);
        ((ISupportInitialize)rdpClient).EndInit();

        try { old.Disconnect(); } catch { }
        try { old.Dispose(); } catch { }
    }

    /// <summary>현재 <see cref="rdpClient"/>에 이벤트 핸들러를 연결합니다. gen 으로 구버전 이벤트를 무시합니다.</summary>
    private void WireRdpClientEvents(int gen)
    {
        rdpClient.OnConnected += (_, _) => BeginInvoke(() =>
        {
            if (_rdpGen != gen) return;
            _rdpConnecting = false;
            SetStatusHeadline("RDP 연결됨 — 원격 데스크톱 세션이 수립되었습니다");
            TryRecordConnectionHistory(RemoteDesktopProtocol.Rdp, _currentConnectHost, _currentConnectPort);
            UpdateConnectUi();
        });

        rdpClient.OnDisconnected += (_, e) => BeginInvoke(() =>
        {
            if (_rdpGen != gen) return;
            var wasFatal = _rdpFatalErrorFired;
            _rdpFatalErrorFired = false;
            var wasUser = _userDisconnecting;
            _userDisconnecting = false;
            _rdpConnecting = false;

            if (rdpClient.FullScreen)
            {
                try { rdpClient.FullScreen = false; } catch { }
            }

            var disc = e.discReason;
            var ext = (int)rdpClient.ExtendedDisconnectReason;
            var hint = BuildRdpDisconnectHint(disc, ext);
            SetStatusHeadline("RDP 연결 종료");
            rdpHostPanel.Visible = false;
            UpdateConnectUi();

            var normalClose = wasUser || disc == 1;
            if (!normalClose && !wasFatal)
            {
                var msg = $"RDP 연결이 종료되었습니다.\n\n{hint}\n\n진단 코드: disc={disc}, ext={ext}";
                ErrorDialog.Show(this, msg, Text, MessageBoxIcon.Warning);
            }
        });

        rdpClient.OnFatalError += (_, e) => BeginInvoke(() =>
        {
            if (_rdpGen != gen) return;
            _rdpConnecting = false;
            _rdpFatalErrorFired = true;
            var code = Convert.ToInt64(e.errorCode);
            var desc = RdpFatalErrorDescription.Describe(code);
            var body =
                "RDP 클라이언트에서 치명적 오류가 보고되었습니다.\r\n\r\n"
                + "오류 코드(십진): " + code + "\r\n"
                + "오류 코드(16진): 0x" + code.ToString("X") + "\r\n\r\n"
                + desc
                + "\r\n\r\n자격 증명, NLA, 네트워크·방화벽, 서버 설정을 확인하세요.";
            SetStatusHeadline("RDP 치명적 오류 — 코드 " + code);
            ErrorDialog.Show(this, body, Text, MessageBoxIcon.Error);
            UpdateConnectUi();
        });

        rdpClient.OnLogonError += (_, e) => BeginInvoke(() =>
        {
            if (_rdpGen != gen) return;
            _rdpConnecting = false;
            var code = e.lError;
            if (code == 0)
            {
                return;
            }

            var body =
                "RDP 로그온에 실패했습니다.\r\n\r\n"
                + "로그온 오류 코드: " + code + "\r\n"
                + RdpLogonErrorDescription.Describe(code)
                + "\r\n\r\n• DOMAIN\\user 또는 user@도메인 형식 확인\r\n"
                + "• IP로 접속 시 로컬 계정은 사용자 이름만 또는 .\\사용자\r\n"
                + "• NLA·인증서 완화 옵션, 원격 데스크톱 사용자 그룹";
            SetStatusHeadline("RDP 로그온 실패 — 코드 " + code);
            ErrorDialog.Show(this, body, Text, MessageBoxIcon.Warning);
            UpdateConnectUi();
        });
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

        // IP·호스트만으로는 도메인을 추측하지 않습니다(잘못된 Domain=`.` 등으로 로그온 실패 방지).
        // 원격 로컬 계정: user 만 입력하거나 .\user / PC이름\user 를 직접 입력하세요.
    }

    private static string BuildRdpDisconnectHint(int disc, int ext)
    {
        // 확장 이유 코드 우선 (exDiscReasonXxx 값 기준)
        switch (ext)
        {
            case 7:  return "서버가 연결을 거부했습니다. 계정의 원격 데스크톱 액세스 권한을 확인하세요.";
            case 9:  return "계정에 원격 로그인 권한이 없습니다. 서버에서 'Remote Desktop Users' 그룹에 계정을 추가하세요.";
            case 10: return "NLA 인증에 실패했습니다. 사용자 이름·암호·도메인을 확인하거나 연결 옵션에서 '인증서 완화'를 활성화하세요.";
            case 12:
            case 256: return "원격 세션에서 로그오프했습니다.";
        }

        return disc switch
        {
            0    => "원인 불명 — 네트워크 상태를 확인하세요.",
            1    => "연결이 정상적으로 종료되었습니다.",
            2    => "원격 세션에서 로그오프했습니다.",
            3    => "서버에서 연결을 끊었습니다.",
            260  => "DNS 이름 조회에 실패했습니다. 호스트 이름을 확인하세요.",
            516  => "연결 시간이 초과되었습니다.",
            518  => "서버에 연결할 수 없습니다. 호스트·포트·방화벽을 확인하세요.",
            776  => "네트워크 연결이 끊겼습니다.",
            1800 => "CredSSP 보안 협상에 실패했습니다 (0x708).\n"
                  + "원인: 서버와 클라이언트의 CredSSP 암호화 정책이 일치하지 않거나, 서버 인증서를 신뢰할 수 없습니다.\n"
                  + "해결 방법:\n"
                  + "  1. '연결' 대화상자 → 'RDP 옵션'에서 '인증서 완화' 체크 후 재연결\n"
                  + "  2. NLA 체크 해제 후 재연결",
            2308 => "원격 세션이 서버에 의해 종료되었습니다.",
            2825 => "서버 인증서가 만료되었거나 신뢰할 수 없습니다. 연결 옵션에서 '인증서 완화'를 활성화하세요.",
            3591 => "서버 인증서 검증에 실패했습니다. 연결 옵션에서 '인증서 완화'를 활성화하세요.",
            _    => $"연결이 종료되었습니다. 자격 증명·도메인·NLA·인증서 설정을 확인하세요. (disc={disc}, ext={ext})",
        };
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
            var fs = _fullScreenChromeHidden;

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

        if (IsRdp)
        {
            var opts = new System.Text.StringBuilder("RDP:");
            opts.Append(_rdpOptCredSsp ? " CredSSP" : " NoCredSSP");
            opts.Append(_rdpOptNla ? " NLA" : " NoNLA");
            if (_rdpOptRelaxedCert) opts.Append(" 인증서완화");
            if (_rdpOptClipboard) opts.Append(" 클립보드");
            if (_rdpOptDrives) opts.Append(" 드라이브");
            if (_rdpOptPrinters) opts.Append(" 프린터");
            toolStripStatusOptions.Text = opts.ToString();
        }
        else
        {
            toolStripStatusOptions.Text = "VNC: 기본TCP=" + VncConnectionDefaults.DefaultPort;
        }
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
            if (IsRdp)
            {
                if (rdpClient.Connected != 0) rdpClient.Focus();
            }
            else
            {
                if (vncRemote.Client.IsConnected) vncRemote.Focus();
            }
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
            quickConnectToolStrip.Visible = false;
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
            quickConnectToolStrip.Visible = true;
            statusStrip.Visible = true;
            FormBorderStyle = _savedBorder;
            WindowState = _savedWindowState;

            _fullScreenChromeHidden = false;
            SetStatusHeadline("창 모드로 복귀");
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
            ErrorDialog.Show(
                this,
                ExceptionMessageFormatter.Format(ex, "최근 연결 기록을 저장하거나 다시 불러오지 못했습니다."),
                Text,
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

    private void ApplyRdpSecurityOptions(bool credSsp, bool nla, bool relaxedCert)
    {
        ((IMsRdpClientAdvancedSettings6)rdpClient.AdvancedSettings6).EnableCredSspSupport = credSsp;

        var ocx3 = (IMsRdpClientNonScriptable3)rdpClient.GetOcx();
        ocx3.NegotiateSecurityLayer = nla;

        // TrustedZoneSite / AuthenticationLevel 은 TLS/NLA 협상(nla=true)일 때만 유효.
        // nla=false(클래식 RDP 보안)에서 설정하면 COM E_INVALIDARG(0x80070057) 발생.
        if (nla)
        {
            try
            {
                var ocx4 = (IMsRdpClientNonScriptable4)rdpClient.GetOcx();
                ocx4.TrustedZoneSite = relaxedCert;
            }
            catch { }

            rdpClient.AdvancedSettings5.AuthenticationLevel = relaxedCert ? 0u : 2u;
        }
    }

    private void ApplyRdpRedirection(bool clipboard, bool drives, bool printers)
    {
        rdpClient.AdvancedSettings2.RedirectDrives = drives;
        rdpClient.AdvancedSettings2.RedirectPrinters = printers;
        rdpClient.AdvancedSettings6.RedirectClipboard = clipboard;
        try { rdpClient.AdvancedSettings2.SmartSizing = true; } catch { }
        try
        {
            var n4 = (IMsRdpClientNonScriptable4)rdpClient.GetOcx();
            n4.WarnAboutClipboardRedirection = false;
        }
        catch { }
    }

    private void ConnectRdp(string host, int port, string user, string password,
        bool credSsp, bool nla, bool relaxedCert, bool clipboard, bool drives, bool printers)
    {
        _rdpConnecting = true;
        _rdpFatalErrorFired = false;
        _userDisconnecting = false;
        _currentConnectHost = host;
        _currentConnectPort = port;
        _rdpOptCredSsp = credSsp;
        _rdpOptNla = nla;
        _rdpOptRelaxedCert = relaxedCert;
        _rdpOptClipboard = clipboard;
        _rdpOptDrives = drives;
        _rdpOptPrinters = printers;

        try
        {
            vncHostPanel.Visible = false;
            rdpHostPanel.Visible = true;

            // COM 객체 재생성 — 이전 연결 시도 후 일부 보안 속성(EnableCredSspSupport 등)은
            // 변경 불가(E_INVALIDARG) 상태가 되므로 매 연결마다 신선한 COM 객체를 사용합니다.
            ReinitRdpClient();

            ApplyRdpSecurityOptions(credSsp, nla, relaxedCert);

            var connectHost = RdpConnectionHelper.NormalizeConnectHost(host);

            SplitRdpUserForLogon(user, connectHost, out var rdpDomain, out var rdpUser);
            rdpClient.Domain = rdpDomain;
            rdpClient.UserName = rdpUser;
            rdpClient.Server = connectHost;
            rdpClient.AdvancedSettings9.RDPPort = port;
            rdpClient.AdvancedSettings9.ClearTextPassword = password;

            ApplyRdpRedirection(clipboard, drives, printers);

            if (!RdpConnectionHelper.TryReachPort(host.Trim(), port, 6000, out var tcpError))
            {
                SetStatusHeadline("RDP — TCP(3389) 수신 대기 없음");
                var proceed = ErrorDialog.ShowConfirm(
                    this,
                    tcpError!,
                    Text,
                    confirmText: "그래도 연결 시도",
                    cancelText: "취소",
                    icon: MessageBoxIcon.Warning);
                if (!proceed)
                {
                    _rdpConnecting = false;
                    rdpHostPanel.Visible = false;
                    UpdateConnectUi();
                    return;
                }
            }

            var logonHint = string.IsNullOrEmpty(rdpDomain)
                ? "로그온: " + rdpUser
                : "로그온: [" + rdpDomain + "]\\" + rdpUser;
            SetStatusHeadline("RDP 연결 중… — " + logonHint);
            UpdateConnectUi();

            void RunConnect()
            {
                try
                {
                    rdpHostPanel.PerformLayout();
                    var w = Math.Max(rdpHostPanel.ClientSize.Width, 800);
                    var h = Math.Max(rdpHostPanel.ClientSize.Height, 600);
                    try
                    {
                        rdpClient.DesktopWidth = w;
                        rdpClient.DesktopHeight = h;
                    }
                    catch
                    {
                        // ignore — 일부 환경에서만 지원
                    }

                    rdpClient.Connect();
                }
                catch (Exception ex)
                {
                    _rdpConnecting = false;
                    rdpHostPanel.Visible = false;
                    SetStatusHeadline("RDP 연결 실패");
                    ErrorDialog.Show(
                        this,
                        ExceptionMessageFormatter.Format(ex, "RDP Connect() 호출이 실패했습니다."),
                        Text,
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
            rdpHostPanel.Visible = false;
            SetStatusHeadline("RDP 연결 실패");
            ErrorDialog.Show(
                this,
                ExceptionMessageFormatter.Format(ex, "RDP 연결 준비 중 예외가 발생했습니다."),
                Text,
                MessageBoxIcon.Error);
            UpdateConnectUi();
        }
    }

    private async Task ConnectVncAsync(string host, int port, string password, VncClientSettings settings)
    {
        if (vncRemote.Client.IsConnected)
        {
            vncRemote.Client.Close();
        }

        rdpHostPanel.Visible = false;
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
                TryRecordConnectionHistory(RemoteDesktopProtocol.Vnc, host, port);
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
        _rdpConnecting = false;

        if (IsRdp)
        {
            if (rdpClient.Connected != 0)
            {
                _userDisconnecting = true;
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
        var uiSettings = UiSettingsStore.Load();
        
        // Load current toolbar settings into dialog
        dialog.Protocol = toolStripProtocol.SelectedItem?.ToString() ?? "RDP";
        dialog.Host = toolStripHost.Text.Trim();
        dialog.Port = toolStripPort.Text.Trim();
        dialog.Username = uiSettings.LastRdpUsername ?? "";
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

            var ui = UiSettingsStore.Load();
            ui.LastRdpUsername = user;
            UiSettingsStore.Save(ui);

            await Task.Yield();
            ConnectRdp(host, port, user, dialog.Password,
                dialog.EnableCredSsp, dialog.EnableNla, dialog.RelaxedCertificate,
                dialog.EnableClipboard, dialog.EnableDrives, dialog.EnablePrinters);
        }
        else
        {
            var vncSettings = new VncClientSettings
            {
                ViewOnly = dialog.VncViewOnly,
                ShareDesktop = dialog.VncShareDesktop,
                ClipboardFromServer = dialog.VncClipboardFromServer,
                ClipboardToServer = dialog.VncClipboardToServer,
                RemoteCursor = dialog.VncRemoteCursor,
                AutoReconnect = dialog.VncAutoReconnect,
                SizeMode = dialog.VncSizeMode,
                MaxUpdateRate = dialog.VncMaxFps > 0 ? (double)dialog.VncMaxFps : 15,
                UseTls = dialog.VncUseTls,
                IgnoreTlsCertErrors = dialog.VncIgnoreTlsCertErrors,
            };
            await ConnectVncAsync(host, port, dialog.Password, vncSettings);
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
