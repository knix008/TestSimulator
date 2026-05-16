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

        _trayIcon = new NotifyIcon
        {
            Text = "VNC Server",
            Icon = SystemIcons.Application,
            ContextMenuStrip = _trayMenu,
            Visible = true
        };

        _trayIcon.DoubleClick += (s, e) => ShowWindow();
    }

    private void LoadSettings()
    {
        _settings = ServerSettings.Load();
        
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
