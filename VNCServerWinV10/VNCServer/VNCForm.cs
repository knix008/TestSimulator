using System.ComponentModel;
using VNCServer.Settings;
using VNCServer.VNCServer;

namespace VNCServer;

public partial class VNCForm : Form
{
    // 서버 시작: 밝은 파란색, 서버 중지: 빨간색(경고/중단)
    private static readonly Color ServerStartButtonColor = Color.FromArgb(100, 181, 255);
    private static readonly Color ServerStartButtonForeColor = Color.Black;
    private static readonly Color ServerStopButtonColor = Color.FromArgb(232, 82, 82);
    private static readonly Color ServerStopButtonForeColor = Color.White;
    private static readonly Color StatusRunningColor = Color.FromArgb(76, 175, 80);
    private static readonly Color StatusStoppedColor = Color.FromArgb(158, 158, 158);

    private VNCServerCore? _server;
    private ServerSettings _settings = new ServerSettings();
    private NotifyIcon? _trayIcon;
    private ContextMenuStrip? _trayMenu;
    private ToolStripMenuItem? _trayToggleServerItem;

    public VNCForm()
    {
        InitializeComponent();

        if (!IsDesignTime)
        {
            WireUpControlEvents();
            btnToggleServer.Font = new Font(btnToggleServer.Font.FontFamily, btnToggleServer.Font.Size, FontStyle.Bold);
            lblConnections.Font = new Font(lblConnections.Font.FontFamily, lblConnections.Font.Size, FontStyle.Bold);
            ApplyToggleServerButtonStyle(false);
            UpdateConnectionDisplay(0);
            TrySetFormIcon();
            InitializeTrayIcon();
            LoadSettings();
            InitializeServer();
            UpdateUI();
        }
    }

    private static bool IsDesignTime =>
        LicenseManager.UsageMode == LicenseUsageMode.Designtime;

    private void WireUpControlEvents()
    {
        btnSaveProfile.Click += BtnSaveProfile_Click;
        btnLoadProfile.Click += BtnLoadProfile_Click;
        btnDeleteProfile.Click += BtnDeleteProfile_Click;
        btnResetToDefaults.Click += BtnResetToDefaults_Click;
        btnToggleServer.Click += BtnToggleServer_Click;
        numPort.ValueChanged += NumPort_ValueChanged;
        chkRequirePassword.CheckedChanged += ChkRequirePassword_CheckedChanged;
        txtPassword.TextChanged += TxtPassword_TextChanged;
        chkAllowMouse.CheckedChanged += ChkAllowMouse_CheckedChanged;
        chkAllowKeyboard.CheckedChanged += ChkAllowKeyboard_CheckedChanged;
        chkAllowMultiple.CheckedChanged += ChkAllowMultiple_CheckedChanged;
        chkAutoStart.CheckedChanged += ChkAutoStart_CheckedChanged;
        chkMinimizeToTray.CheckedChanged += ChkMinimizeToTray_CheckedChanged;
        btnSaveSettings.Click += BtnSaveSettings_Click;
        btnAdvancedSettings.Click += BtnAdvancedSettings_Click;
        trackTransmissionSpeed.ValueChanged += TrackTransmissionSpeed_ValueChanged;
        trackTransmissionSpeed.Scroll += TrackTransmissionSpeed_Scroll;
    }

    private void BtnSaveProfile_Click(object? sender, EventArgs e) => SaveCurrentProfile();

    private void BtnLoadProfile_Click(object? sender, EventArgs e) => LoadSelectedProfile();

    private void BtnDeleteProfile_Click(object? sender, EventArgs e) => DeleteSelectedProfile();

    private void BtnResetToDefaults_Click(object? sender, EventArgs e) => ResetToDefaultSettings();

    private void BtnToggleServer_Click(object? sender, EventArgs e) => ToggleServer();

    private void ToggleServer()
    {
        if (_server?.IsRunning == true)
        {
            StopServer();
        }
        else
        {
            StartServer();
        }
    }

    private void NumPort_ValueChanged(object? sender, EventArgs e) =>
        _settings.Port = (int)numPort.Value;

    private void ChkRequirePassword_CheckedChanged(object? sender, EventArgs e)
    {
        _settings.RequirePassword = chkRequirePassword.Checked;
        txtPassword.Enabled = chkRequirePassword.Checked;
    }

    private void TxtPassword_TextChanged(object? sender, EventArgs e) =>
        _settings.Password = txtPassword.Text;

    private void ChkAllowMouse_CheckedChanged(object? sender, EventArgs e) =>
        _settings.AllowMouseControl = chkAllowMouse.Checked;

    private void ChkAllowKeyboard_CheckedChanged(object? sender, EventArgs e) =>
        _settings.AllowKeyboardControl = chkAllowKeyboard.Checked;

    private void ChkAllowMultiple_CheckedChanged(object? sender, EventArgs e) =>
        _settings.AllowMultipleConnections = chkAllowMultiple.Checked;

    private void ChkAutoStart_CheckedChanged(object? sender, EventArgs e) =>
        _settings.AutoStart = chkAutoStart.Checked;

    private void ChkMinimizeToTray_CheckedChanged(object? sender, EventArgs e) =>
        _settings.MinimizeToTray = chkMinimizeToTray.Checked;

    private void BtnSaveSettings_Click(object? sender, EventArgs e)
    {
        SyncSettingsFromControls();
        _settings.Save();
        _server?.UpdateSettings(_settings);
        MessageBox.Show("설정이 저장되었습니다.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private void BtnAdvancedSettings_Click(object? sender, EventArgs e) => ShowAdvancedSettings();

    private void TrackTransmissionSpeed_Scroll(object? sender, EventArgs e) =>
        ApplyTransmissionSpeedFromTrackBar();

    private void TrackTransmissionSpeed_ValueChanged(object? sender, EventArgs e) =>
        ApplyTransmissionSpeedFromTrackBar();

    private void ApplyTransmissionSpeedFromTrackBar()
    {
        _settings.TransmissionSpeedPercent = trackTransmissionSpeed.Value;
        UpdateTransmissionSpeedLabel();
        _server?.UpdateSettings(_settings);
    }

    private void UpdateTransmissionSpeedLabel()
    {
        var effectiveFps = _settings.GetEffectiveMaxFrameRate();
        lblTransmissionSpeedValue.Text = $"{trackTransmissionSpeed.Value}% ({effectiveFps} FPS)";
    }

    private void InitializeTrayIcon()
    {
        _trayMenu = new ContextMenuStrip();
        _trayMenu.Items.Add("열기", null, (s, e) => ShowWindow());
        _trayMenu.Items.Add(new ToolStripSeparator());
        _trayToggleServerItem = new ToolStripMenuItem("서버 시작", null, (s, e) => ToggleServer());
        _trayMenu.Items.Add(_trayToggleServerItem);
        _trayMenu.Items.Add(new ToolStripSeparator());
        _trayMenu.Items.Add("종료", null, (s, e) => ExitApplication());

        // Load icon from embedded resource or file
        Icon? appIcon = LoadApplicationIcon();
        
        _trayIcon = new NotifyIcon
        {
            Text = "VNC Server",
            Icon = appIcon ?? SystemIcons.Application,
            ContextMenuStrip = _trayMenu,
            Visible = true
        };

        _trayIcon.DoubleClick += (s, e) => ShowWindow();
    }

    private void TrySetFormIcon()
    {
        var icon = LoadApplicationIcon();
        if (icon != null)
        {
            Icon = icon;
        }
    }

    private Icon? LoadApplicationIcon()
    {
        try
        {
            // Try to load from file
            var iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "daemon_hammer.ico");
            if (File.Exists(iconPath))
            {
                return new Icon(iconPath);
            }

            // Try to load from parent directory (for development)
            iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "daemon_hammer.ico");
            if (File.Exists(iconPath))
            {
                return new Icon(iconPath);
            }
        }
        catch
        {
            // Fall back to system icon
        }
        
        return null;
    }

    private void LoadSettings()
    {
        _settings = ServerSettings.Load();
        ApplySettingsToControls();

        // 프로필 목록 로드
        RefreshProfilesList();

        if (_settings.AutoStart)
        {
            StartServer();
        }
    }

    private void ApplySettingsToControls()
    {
        numPort.Value = Math.Clamp(_settings.Port, (int)numPort.Minimum, (int)numPort.Maximum);
        txtPassword.Text = _settings.Password;
        chkRequirePassword.Checked = _settings.RequirePassword;
        chkAllowMouse.Checked = _settings.AllowMouseControl;
        chkAllowKeyboard.Checked = _settings.AllowKeyboardControl;
        chkAllowMultiple.Checked = _settings.AllowMultipleConnections;
        chkAutoStart.Checked = _settings.AutoStart;
        chkMinimizeToTray.Checked = _settings.MinimizeToTray;
        txtPassword.Enabled = _settings.RequirePassword;
        trackTransmissionSpeed.Value = Math.Clamp(_settings.TransmissionSpeedPercent, 10, 100);
        UpdateTransmissionSpeedLabel();
    }

    /// <summary>메인 화면 컨트롤 값을 설정 객체에 반영 (프로필/설정 저장 전 호출)</summary>
    private void SyncSettingsFromControls()
    {
        _settings.Port = (int)numPort.Value;
        _settings.Password = txtPassword.Text;
        _settings.RequirePassword = chkRequirePassword.Checked;
        _settings.AllowMouseControl = chkAllowMouse.Checked;
        _settings.AllowKeyboardControl = chkAllowKeyboard.Checked;
        _settings.AllowMultipleConnections = chkAllowMultiple.Checked;
        _settings.AutoStart = chkAutoStart.Checked;
        _settings.MinimizeToTray = chkMinimizeToTray.Checked;
        _settings.TransmissionSpeedPercent = (int)trackTransmissionSpeed.Value;
    }

    private void InitializeServer()
    {
        _server = new VNCServerCore(_settings);

        _server.StatusChanged += (s, status) =>
        {
            if (InvokeRequired)
            {
                Invoke(() => UpdateStatus(status));
            }
            else
            {
                UpdateStatus(status);
            }
        };

        _server.ClientConnected += (s, client) =>
        {
            RunOnUiThread(() => OnClientConnected(client));
        };

        _server.ClientDisconnected += (s, client) =>
        {
            RunOnUiThread(() => OnClientDisconnected(client));
        };

        _server.ClientCountChanged += (s, count) =>
        {
            RunOnUiThread(() => UpdateConnectionDisplay(count));
        };

        _server.ErrorOccurred += (s, ex) =>
        {
            if (InvokeRequired)
            {
                Invoke(() => AddLog($"오류: {ex.Message}"));
            }
            else
            {
                AddLog($"오류: {ex.Message}");
            }
        };
    }

    private void StartServer()
    {
        try
        {
            if (_server != null && !_server.IsRunning)
            {
                _server.Start();
                UpdateUI();
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"서버 시작 실패: {ex.Message}", "오류", 
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void StopServer()
    {
        try
        {
            if (_server != null && _server.IsRunning)
            {
                _server.Stop();
                UpdateUI();
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"서버 중지 실패: {ex.Message}", "오류", 
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void UpdateUI()
    {
        bool isRunning = _server?.IsRunning ?? false;
        
        btnToggleServer.Text = isRunning ? "서버 중지" : "서버 시작";
        ApplyToggleServerButtonStyle(isRunning);
        grpSettings.Enabled = !isRunning;

        lblStatus.Text = isRunning ? "실행 중" : "중지됨";
        lblStatus.ForeColor = isRunning ? StatusRunningColor : StatusStoppedColor;

        lblPort.Text = $"포트: {_settings.Port}";
        UpdateConnectionDisplay(_server?.ConnectedClients ?? 0);

        if (_trayToggleServerItem != null)
        {
            _trayToggleServerItem.Text = isRunning ? "서버 중지" : "서버 시작";
        }
    }

    private void RunOnUiThread(Action action)
    {
        if (InvokeRequired)
        {
            Invoke(action);
        }
        else
        {
            action();
        }
    }

    private void OnClientConnected(string clientAddress)
    {
        var count = _server?.ConnectedClients ?? 0;
        AddLog($"클라이언트 접속: {clientAddress} (현재 {count}개)");
    }

    private void OnClientDisconnected(string clientAddress)
    {
        var count = _server?.ConnectedClients ?? 0;
        AddLog($"클라이언트 접속 종료: {clientAddress} (현재 {count}개)");
    }

    private void UpdateConnectionDisplay(int count)
    {
        lblConnections.Text = $"접속 클라이언트: {count}개";
        lblConnections.ForeColor = count > 0 ? StatusRunningColor : StatusStoppedColor;
    }

    private void ApplyToggleServerButtonStyle(bool isRunning)
    {
        if (isRunning)
        {
            btnToggleServer.BackColor = ServerStopButtonColor;
            btnToggleServer.ForeColor = ServerStopButtonForeColor;
            btnToggleServer.FlatAppearance.MouseOverBackColor = ServerStopButtonColor;
            btnToggleServer.FlatAppearance.MouseDownBackColor = ServerStopButtonColor;
        }
        else
        {
            btnToggleServer.BackColor = ServerStartButtonColor;
            btnToggleServer.ForeColor = ServerStartButtonForeColor;
            btnToggleServer.FlatAppearance.MouseOverBackColor = ServerStartButtonColor;
            btnToggleServer.FlatAppearance.MouseDownBackColor = ServerStartButtonColor;
        }
    }

    private void UpdateStatus(string status)
    {
        AddLog(status);
        UpdateUI();
    }

    private void AddLog(string message)
    {
        if (lstLog.InvokeRequired)
        {
            lstLog.Invoke(() => AddLog(message));
            return;
        }

        lstLog.Items.Insert(0, $"[{DateTime.Now:HH:mm:ss}] {message}");
        
        if (lstLog.Items.Count > 100)
        {
            lstLog.Items.RemoveAt(lstLog.Items.Count - 1);
        }
    }

    private void ShowWindow()
    {
        Show();
        WindowState = FormWindowState.Normal;
        Activate();
    }

    private void ShowAdvancedSettings()
    {
        using var advancedForm = new AdvancedSettingsForm(_settings);
        advancedForm.ShowDialog(this);
        SyncSettingsFromControls();
        _settings.Save();
        _server?.UpdateSettings(_settings);
        ApplySettingsToControls();
        UpdateUI();
    }

    private void RefreshProfilesList()
    {
        cmbProfiles.Items.Clear();
        var profiles = SettingsProfileManager.GetProfileNames();
        foreach (var profile in profiles)
        {
            cmbProfiles.Items.Add(profile);
        }
        if (cmbProfiles.Items.Count > 0)
        {
            cmbProfiles.SelectedIndex = 0;
        }
    }

    private void SaveCurrentProfile()
    {
        using var dialog = new Form
        {
            Text = "프로필 저장",
            ClientSize = new Size(400, 120),
            FormBorderStyle = FormBorderStyle.FixedDialog,
            StartPosition = FormStartPosition.CenterParent,
            MaximizeBox = false,
            MinimizeBox = false
        };

        var lblName = new Label
        {
            Text = "프로필 이름:",
            Location = new Point(15, 20),
            AutoSize = true
        };

        var txtName = new TextBox
        {
            Location = new Point(100, 17),
            Size = new Size(280, 23)
        };

        // 현재 선택된 프로필이 있으면 기본값으로 설정
        if (cmbProfiles.SelectedItem != null)
        {
            txtName.Text = cmbProfiles.SelectedItem.ToString();
        }

        var btnOk = new Button
        {
            Text = "저장",
            DialogResult = DialogResult.OK,
            Location = new Point(220, 60),
            Size = new Size(80, 30)
        };

        var btnCancel = new Button
        {
            Text = "취소",
            DialogResult = DialogResult.Cancel,
            Location = new Point(310, 60),
            Size = new Size(80, 30)
        };

        dialog.Controls.AddRange(new Control[] { lblName, txtName, btnOk, btnCancel });
        dialog.AcceptButton = btnOk;
        dialog.CancelButton = btnCancel;

        if (dialog.ShowDialog() == DialogResult.OK)
        {
            var profileName = txtName.Text.Trim();
            if (string.IsNullOrWhiteSpace(profileName))
            {
                MessageBox.Show("프로필 이름을 입력해주세요.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            // 프로필이 이미 존재하는 경우 덮어쓰기 확인
            if (SettingsProfileManager.ProfileExists(profileName))
            {
                var result = MessageBox.Show(
                    $"프로필 '{profileName}'이(가) 이미 존재합니다. 덮어쓰시겠습니까?",
                    "확인",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question);

                if (result != DialogResult.Yes)
                {
                    return;
                }
            }

            try
            {
                SyncSettingsFromControls();
                SettingsProfileManager.SaveProfile(profileName, _settings.Clone());
                RefreshProfilesList();
                cmbProfiles.SelectedItem = profileName;
                MessageBox.Show($"프로필 '{profileName}'이(가) 저장되었습니다.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    private void LoadSelectedProfile()
    {
        if (cmbProfiles.SelectedItem == null)
        {
            MessageBox.Show("불러올 프로필을 선택해주세요.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        try
        {
            var profileName = cmbProfiles.SelectedItem.ToString()!;
            _settings = SettingsProfileManager.LoadProfile(profileName);
            ApplySettingsToControls();
            _settings.Save();
            _server?.UpdateSettings(_settings);
            cmbProfiles.SelectedItem = profileName;
            UpdateUI();
            MessageBox.Show($"프로필 '{profileName}'을(를) 불러왔습니다.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void DeleteSelectedProfile()
    {
        if (cmbProfiles.SelectedItem == null)
        {
            MessageBox.Show("삭제할 프로필을 선택해주세요.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var profileName = cmbProfiles.SelectedItem.ToString()!;
        var result = MessageBox.Show(
            $"프로필 '{profileName}'을(를) 삭제하시겠습니까?",
            "확인",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question);

        if (result == DialogResult.Yes)
        {
            try
            {
                SettingsProfileManager.DeleteProfile(profileName);
                RefreshProfilesList();
                MessageBox.Show($"프로필 '{profileName}'이(가) 삭제되었습니다.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    private void ResetToDefaultSettings()
    {
        var result = MessageBox.Show(
            "모든 설정을 기본값으로 초기화하시겠습니까?",
            "확인",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question);

        if (result == DialogResult.Yes)
        {
            _settings.ResetToDefaults();
            ApplySettingsToControls();
            _settings.Save();
            _server?.UpdateSettings(_settings);
            UpdateUI();
            MessageBox.Show("기본값으로 초기화되었습니다.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }

    private void ExitApplication()
    {
        if (_server != null && _server.IsRunning)
        {
            var result = MessageBox.Show(
                "서버가 실행 중입니다. 종료하시겠습니까?",
                "확인",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);

            if (result != DialogResult.Yes)
            {
                return;
            }

            _server.Stop();
        }

        _trayIcon?.Dispose();
        Application.Exit();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (_settings.MinimizeToTray && e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            Hide();
        }
        else
        {
            base.OnFormClosing(e);
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            components?.Dispose();
            _trayIcon?.Dispose();
            _trayMenu?.Dispose();
            _server?.Stop();
        }
        base.Dispose(disposing);
    }
}
