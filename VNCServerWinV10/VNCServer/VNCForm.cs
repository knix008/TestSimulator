using VNCServer.Settings;
using VNCServer.VNCServer;

namespace VNCServer;

public partial class VNCForm : Form
{
    private VNCServerCore? _server;
    private ServerSettings _settings = new ServerSettings();
    private NotifyIcon? _trayIcon;
    private ContextMenuStrip? _trayMenu;

    public VNCForm()
    {
        InitializeComponent();
        InitializeTrayIcon();
        LoadSettings();
        InitializeServer();
        UpdateUI();
    }

    private void InitializeTrayIcon()
    {
        _trayMenu = new ContextMenuStrip();
        _trayMenu.Items.Add("열기", null, (s, e) => ShowWindow());
        _trayMenu.Items.Add(new ToolStripSeparator());
        _trayMenu.Items.Add("서버 시작", null, (s, e) => StartServer());
        _trayMenu.Items.Add("서버 중지", null, (s, e) => StopServer());
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
        
        // 프로필 목록 로드
        RefreshProfilesList();
        
        if (_settings.AutoStart)
        {
            StartServer();
        }
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
            if (InvokeRequired)
            {
                Invoke(() => AddLog($"클라이언트 연결: {client}"));
            }
            else
            {
                AddLog($"클라이언트 연결: {client}");
            }
        };

        _server.ClientDisconnected += (s, client) =>
        {
            if (InvokeRequired)
            {
                Invoke(() => AddLog($"클라이언트 연결 해제: {client}"));
            }
            else
            {
                AddLog($"클라이언트 연결 해제: {client}");
            }
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
        
        btnStart.Enabled = !isRunning;
        btnStop.Enabled = isRunning;
        grpSettings.Enabled = !isRunning;

        lblStatus.Text = isRunning ? "실행 중" : "중지됨";
        lblStatus.ForeColor = isRunning ? Color.Green : Color.Red;

        lblPort.Text = $"포트: {_settings.Port}";
        lblConnections.Text = $"연결: {_server?.ConnectedClients ?? 0}";

        if (_trayMenu != null)
        {
            _trayMenu.Items[2].Enabled = !isRunning; // 시작
            _trayMenu.Items[3].Enabled = isRunning;  // 중지
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
        
        // 설정 다시 로드
        LoadSettings();
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
                SettingsProfileManager.SaveProfile(profileName, _settings);
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
            _settings.Save(); // 현재 설정으로 저장
            LoadSettings();
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
            _settings.Save();
            LoadSettings();
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
