using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Media;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using FluentFTP;
using Renci.SshNet;

namespace FTPClientWin
{
    public partial class MainForm : Form
    {
        // ── Connection state ─────────────────────────────────────────────────
        private AsyncFtpClient? _ftp;
        private SftpClient?     _sftp;
        private bool            _isConnected;
        private string          _serverPath = "/";
        private string          _localPath;
        private CancellationTokenSource? _connectCts;

        // ── App data ─────────────────────────────────────────────────────────
        private readonly List<ConnectionProfile> profiles = new();
        private readonly AppSettings _settings;

        private static readonly string ProfilePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FTPClientWin", "profiles.json");

        // ── Node metadata stored in TreeNode.Tag ─────────────────────────────
        private sealed record NodeInfo(string Path, bool IsDirectory, bool IsParent = false);

        // ── Init ─────────────────────────────────────────────────────────────
        public MainForm()
        {
            InitializeComponent();
            _settings  = AppSettings.Load();
            _localPath = Directory.Exists(_settings.LastLocalPath)
                ? _settings.LastLocalPath
                : Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
            LoadAppIcon();
            LoadProfiles();
        }

        private void LoadAppIcon()
        {
            var ico = Path.Combine(AppContext.BaseDirectory, "daemon_hammer.ico");
            if (File.Exists(ico)) Icon = new Icon(ico);
        }

        // ── Form load ────────────────────────────────────────────────────────
        private void OnFormLoad(object? sender, EventArgs e)
        {
            splitMain.Panel1MinSize  = 150;
            splitMain.Panel2MinSize  = 90;
            splitFiles.Panel1MinSize = 100;
            splitFiles.Panel2MinSize = 100;
            splitFiles.SplitterDistance = splitFiles.Width / 2;
            splitMain.SplitterDistance  = Math.Max(150, (int)(ClientSize.Height * 0.65));

            UpdateConnectButton(false);
            LoadFileIcons();
            SetupContextMenus();

            treeViewServer.NodeMouseDoubleClick += TreeViewServer_DoubleClick;
            treeViewLocal.NodeMouseDoubleClick  += TreeViewLocal_DoubleClick;
            treeViewServer.MouseDown += TreeView_MouseDown;
            treeViewLocal.MouseDown  += TreeView_MouseDown;

            LoadLocalDirectory(_localPath);
            SetStatus("준비됨");
            AppendLog("준비됨.");
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            base.OnFormClosing(e);
            _ftp?.Dispose();
            _sftp?.Dispose();
        }

        // ── Shell file icons ─────────────────────────────────────────────────
        private void LoadFileIcons()
        {
            TryAddIcon("folder", "",     isFolder: true);
            TryAddIcon("file",   "",     isFolder: false);
            foreach (var ext in new[] { ".txt", ".jpg", ".zip", ".exe", ".cs", ".xml", ".pdf", ".mp3", ".mp4" })
                TryAddIcon(ext, ext, isFolder: false);
        }

        private void TryAddIcon(string key, string ext, bool isFolder)
        {
            try { imageListFiles.Images.Add(key, NativeMethods.GetShellIcon(ext, isFolder)); }
            catch { }
        }

        private static string GetIconKey(string name, bool isFolder)
        {
            if (isFolder) return "folder";
            return Path.GetExtension(name).ToLowerInvariant() switch
            {
                ".txt" or ".log" or ".md"                               => ".txt",
                ".jpg" or ".jpeg" or ".png" or ".gif" or ".bmp" or ".ico" => ".jpg",
                ".zip" or ".rar" or ".7z" or ".tar" or ".gz"            => ".zip",
                ".exe" or ".dll"                                         => ".exe",
                ".cs" or ".py" or ".js" or ".ts" or ".c" or ".cpp" or ".h" => ".cs",
                ".xml" or ".json" or ".yaml" or ".yml" or ".html" or ".htm" => ".xml",
                ".pdf"                                                   => ".pdf",
                ".mp3" or ".wav" or ".flac" or ".aac"                   => ".mp3",
                ".mp4" or ".avi" or ".mkv" or ".mov"                    => ".mp4",
                _ => "file"
            };
        }

        // ── Context menus ────────────────────────────────────────────────────
        private void SetupContextMenus()
        {
            var ctxServer = new ContextMenuStrip();
            ctxServer.Items.Add("다운로드",   null, async (_, _) => await DownloadSelectedAsync());
            ctxServer.Items.Add(new ToolStripSeparator());
            ctxServer.Items.Add("새로 고침", null, async (_, _) => await LoadServerDirectoryAsync(_serverPath));
            treeViewServer.ContextMenuStrip = ctxServer;

            var ctxLocal = new ContextMenuStrip();
            ctxLocal.Items.Add("업로드",       null, async (_, _) => await UploadSelectedAsync());
            ctxLocal.Items.Add(new ToolStripSeparator());
            ctxLocal.Items.Add("새로 고침",   null, (_, _) => LoadLocalDirectory(_localPath));
            ctxLocal.Items.Add("탐색기에서 열기", null, (_, _) => System.Diagnostics.Process.Start("explorer.exe", _localPath));
            treeViewLocal.ContextMenuStrip = ctxLocal;
        }

        // ── Status bar ───────────────────────────────────────────────────────
        private void SetStatus(string message) => statusLabel.Text = message;

        // ── Connect button appearance ────────────────────────────────────────
        private void UpdateConnectButton(bool connected)
        {
            if (connected)
            {
                btnConnect.BackColor = Color.FromArgb(192, 32, 32);   // 붉은색
                btnConnect.ForeColor = Color.White;
                btnConnect.Text      = "Disconnect";
            }
            else
            {
                btnConnect.BackColor = Color.FromArgb(220, 240, 220); // 밝은 녹색
                btnConnect.ForeColor = Color.Black;
                btnConnect.Text      = "Connect";
            }
        }

        // ── Connect / Disconnect ─────────────────────────────────────────────
        private async void BtnConnect_Click(object? sender, EventArgs e)
        {
            if (_isConnected) { await DisconnectAsync(); return; }

            var host     = txtHost.Text.Trim();
            var portText = txtPort.Text.Trim();
            var user     = txtUser.Text.Trim();
            var pass     = txtPassword.Text;
            var protocol = comboProtocol.SelectedItem?.ToString() ?? "FTP";

            if (string.IsNullOrEmpty(host))
            {
                ShowErrorDialog("연결 오류", "호스트를 입력하세요.");
                return;
            }
            if (!int.TryParse(portText, out int port))
                port = protocol == "SFTP" ? 22 : 21;

            btnConnect.Enabled = false;
            statusProgress.Visible = true;
            SetStatus($"연결 중... {protocol}://{host}:{port}");
            AppendLog($"{protocol} 연결 시도 중...  host={host}  port={port}  user={user}");

            try
            {
                _connectCts = new CancellationTokenSource(TimeSpan.FromSeconds(30));

                if (protocol == "SFTP")
                {
                    await Task.Run(() =>
                    {
                        _sftp = new SftpClient(host, port, user, pass);
                        _sftp.Connect();
                    }, _connectCts.Token);
                }
                else
                {
                    var cfg = new FtpConfig
                    {
                        EncryptionMode         = protocol == "FTPS" ? FtpEncryptionMode.Explicit : FtpEncryptionMode.None,
                        ValidateAnyCertificate = true
                    };
                    _ftp = new AsyncFtpClient(host, user, pass, port, cfg);
                    await _ftp.Connect(_connectCts.Token);
                }

                _isConnected = true;
                UpdateConnectButton(true);
                SystemSounds.Asterisk.Play();
                SetStatus($"연결됨 — {protocol}://{host}:{port}");
                AppendLog($"연결 성공: {protocol}://{host}:{port}");

                MessageBox.Show(
                    $"연결이 완료되었습니다.\n\n프로토콜: {protocol}\n호스트: {host}\n포트: {port}\n사용자: {user}",
                    "연결 성공", MessageBoxButtons.OK, MessageBoxIcon.Information);

                _serverPath = "/";
                await LoadServerDirectoryAsync(_serverPath);
            }
            catch (Exception ex)
            {
                _ftp?.Dispose();  _ftp  = null;
                _sftp?.Dispose(); _sftp = null;
                SystemSounds.Hand.Play();
                SetStatus("연결 실패");
                AppendLog($"연결 실패: {ex.Message}");
                ShowErrorDialog("연결 오류", ex.Message);
            }
            finally
            {
                btnConnect.Enabled  = true;
                statusProgress.Visible = false;
                _connectCts?.Dispose();
                _connectCts = null;
            }
        }

        private async Task DisconnectAsync()
        {
            try
            {
                if (_ftp  != null) { await _ftp.Disconnect();  _ftp.Dispose();  _ftp  = null; }
                if (_sftp != null) { _sftp.Disconnect(); _sftp.Dispose(); _sftp = null; }
            }
            catch { }

            _isConnected = false;
            UpdateConnectButton(false);
            treeViewServer.Nodes.Clear();
            _serverPath = "/";
            UpdateServerLabel();
            SetStatus("연결 해제됨");
            AppendLog("연결 해제됨.");
        }

        // ── Server directory ─────────────────────────────────────────────────
        private async Task LoadServerDirectoryAsync(string path)
        {
            if (!_isConnected) return;

            treeViewServer.Nodes.Clear();
            SetStatus($"서버 디렉토리 로드 중: {path}");
            AppendLog($"서버 디렉토리: {path}");

            try
            {
                RemoteItem[] items;

                if (_ftp != null)
                {
                    var list = await _ftp.GetListing(path);
                    items = list.Select(i => new RemoteItem(
                        i.Name, i.FullName,
                        i.Type == FtpObjectType.Directory || i.Type == FtpObjectType.Link && i.LinkObject?.Type == FtpObjectType.Directory))
                        .ToArray();
                }
                else if (_sftp != null)
                {
                    var list = await Task.Run(() =>
                        _sftp.ListDirectory(path)
                             .Where(f => f.Name != "." && f.Name != "..")
                             .ToArray());
                    items = list.Select(f => new RemoteItem(f.Name, f.FullName, f.IsDirectory)).ToArray();
                }
                else return;

                _serverPath = path;
                UpdateServerLabel();

                // Go-up node
                if (path != "/" && path.Length > 0)
                    treeViewServer.Nodes.Add(MakeNode("[..]", GetServerParent(path), true, isParent: true));

                // Folders first, then files (sorted)
                foreach (var item in items.OrderBy(i => i.IsDirectory ? 0 : 1).ThenBy(i => i.Name, StringComparer.OrdinalIgnoreCase))
                    treeViewServer.Nodes.Add(MakeNode(item.Name, item.FullPath, item.IsDirectory));

                SetStatus($"서버: {path}  ({items.Length}개 항목)");
            }
            catch (Exception ex)
            {
                AppendLog($"서버 목록 오류: {ex.Message}");
                ShowErrorDialog("디렉토리 조회 오류", ex.Message);
                SetStatus("서버 목록 조회 실패");
            }
        }

        private static string GetServerParent(string path)
        {
            var p = path.TrimEnd('/');
            var i = p.LastIndexOf('/');
            return i <= 0 ? "/" : p[..i];
        }

        private void UpdateServerLabel() =>
            lblServer.Text = _isConnected
                ? $"서버 (Server)  │  {_serverPath}"
                : "서버 (Server)";

        // ── Local directory ──────────────────────────────────────────────────
        private void LoadLocalDirectory(string path)
        {
            if (!Directory.Exists(path))
                path = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);

            _localPath               = path;
            _settings.LastLocalPath  = path;
            _settings.Save();

            treeViewLocal.Nodes.Clear();
            lblLocal.Text = $"로컬 (Local)  │  {path}";

            var di = new DirectoryInfo(path);
            if (di.Parent != null)
                treeViewLocal.Nodes.Add(MakeNode("[..]", di.Parent.FullName, true, isParent: true));

            try
            {
                foreach (var dir in Directory.GetDirectories(path).OrderBy(d => Path.GetFileName(d), StringComparer.OrdinalIgnoreCase))
                    treeViewLocal.Nodes.Add(MakeNode(Path.GetFileName(dir), dir, true));

                foreach (var file in Directory.GetFiles(path).OrderBy(f => Path.GetFileName(f), StringComparer.OrdinalIgnoreCase))
                    treeViewLocal.Nodes.Add(MakeNode(Path.GetFileName(file), file, false));

                SetStatus($"로컬: {path}");
            }
            catch (UnauthorizedAccessException)
            {
                AppendLog($"접근 거부: {path}");
                SetStatus("접근 거부됨");
            }
            catch (Exception ex)
            {
                AppendLog($"로컬 디렉토리 오류: {ex.Message}");
            }
        }

        // ── TreeNode factory ─────────────────────────────────────────────────
        private static TreeNode MakeNode(string text, string path, bool isDir, bool isParent = false)
        {
            var key = GetIconKey(text, isDir);
            return new TreeNode(text)
            {
                Tag              = new NodeInfo(path, isDir, isParent),
                ImageKey         = key,
                SelectedImageKey = key
            };
        }

        // ── Double-click ─────────────────────────────────────────────────────
        private async void TreeViewServer_DoubleClick(object? sender, TreeNodeMouseClickEventArgs e)
        {
            if (e.Node?.Tag is not NodeInfo info) return;
            if (info.IsDirectory)
                await LoadServerDirectoryAsync(info.Path);
            else
                await DownloadAsync(info.Path, isDirectory: false);
        }

        private async void TreeViewLocal_DoubleClick(object? sender, TreeNodeMouseClickEventArgs e)
        {
            if (e.Node?.Tag is not NodeInfo info) return;
            if (info.IsDirectory)
                LoadLocalDirectory(info.Path);
            else
                await UploadAsync(info.Path, isDirectory: false);
        }

        // Right-click selects node before showing context menu
        private static void TreeView_MouseDown(object? sender, MouseEventArgs e)
        {
            if (sender is not TreeView tv || e.Button != MouseButtons.Right) return;
            var node = tv.GetNodeAt(e.X, e.Y);
            if (node != null) tv.SelectedNode = node;
        }

        // ── Download ─────────────────────────────────────────────────────────
        private async Task DownloadSelectedAsync()
        {
            if (treeViewServer.SelectedNode?.Tag is not NodeInfo info || info.IsParent) return;
            await DownloadAsync(info.Path, info.IsDirectory);
        }

        private async Task DownloadAsync(string serverPath, bool isDirectory)
        {
            if (!_isConnected) { ShowErrorDialog("오류", "서버에 연결되어 있지 않습니다."); return; }

            var name      = serverPath.Split('/').LastOrDefault(s => s.Length > 0) ?? serverPath;
            var localDest = Path.Combine(_localPath, name);

            AppendLog($"다운로드 시작: {serverPath}  →  {localDest}");

            var progress = new Progress<FtpProgress>(p =>
                SetStatus($"다운로드: {name}  {p.Progress:F0}%  ({p.TransferredBytes / 1024} KB)"));

            try
            {
                if (_ftp != null)
                {
                    if (isDirectory)
                        await _ftp.DownloadDirectory(localDest, serverPath,
                            FtpFolderSyncMode.Update, FtpLocalExists.Overwrite);
                    else
                        await _ftp.DownloadFile(localDest, serverPath,
                            FtpLocalExists.Overwrite, FtpVerify.None, progress);
                }
                else if (_sftp != null)
                {
                    await Task.Run(() =>
                    {
                        using var fs = File.Create(localDest);
                        _sftp.DownloadFile(serverPath, fs);
                    });
                }

                SystemSounds.Asterisk.Play();
                AppendLog($"다운로드 완료: {name}");
                SetStatus($"다운로드 완료: {name}");
                LoadLocalDirectory(_localPath);
            }
            catch (Exception ex)
            {
                SystemSounds.Hand.Play();
                AppendLog($"다운로드 실패: {ex.Message}");
                SetStatus("다운로드 실패");
                ShowErrorDialog("다운로드 오류", ex.Message);
            }
        }

        // ── Upload ───────────────────────────────────────────────────────────
        private async Task UploadSelectedAsync()
        {
            if (treeViewLocal.SelectedNode?.Tag is not NodeInfo info || info.IsParent) return;
            await UploadAsync(info.Path, info.IsDirectory);
        }

        private async Task UploadAsync(string localPath, bool isDirectory)
        {
            if (!_isConnected) { ShowErrorDialog("오류", "서버에 연결되어 있지 않습니다."); return; }

            var name       = Path.GetFileName(localPath.TrimEnd(Path.DirectorySeparatorChar));
            var serverDest = (_serverPath.TrimEnd('/') + "/" + name).Replace("//", "/");

            AppendLog($"업로드 시작: {localPath}  →  {serverDest}");

            var progress = new Progress<FtpProgress>(p =>
                SetStatus($"업로드: {name}  {p.Progress:F0}%  ({p.TransferredBytes / 1024} KB)"));

            try
            {
                if (_ftp != null)
                {
                    if (isDirectory)
                        await _ftp.UploadDirectory(localPath, serverDest,
                            FtpFolderSyncMode.Update, FtpRemoteExists.Overwrite);
                    else
                        await _ftp.UploadFile(localPath, serverDest,
                            FtpRemoteExists.Overwrite, false, FtpVerify.None, progress);
                }
                else if (_sftp != null)
                {
                    await Task.Run(() =>
                    {
                        using var fs = File.OpenRead(localPath);
                        _sftp.UploadFile(fs, serverDest, true);
                    });
                }

                SystemSounds.Asterisk.Play();
                AppendLog($"업로드 완료: {name}");
                SetStatus($"업로드 완료: {name}");
                await LoadServerDirectoryAsync(_serverPath);
            }
            catch (Exception ex)
            {
                SystemSounds.Hand.Play();
                AppendLog($"업로드 실패: {ex.Message}");
                SetStatus("업로드 실패");
                ShowErrorDialog("업로드 오류", ex.Message);
            }
        }

        // ── Toolbar upload / download ─────────────────────────────────────────
        private async void BtnUpload_Click(object? sender, EventArgs e)   => await UploadSelectedAsync();
        private async void BtnDownload_Click(object? sender, EventArgs e) => await DownloadSelectedAsync();

        // ── Profile persistence ──────────────────────────────────────────────
        private void LoadProfiles()
        {
            try
            {
                if (File.Exists(ProfilePath))
                {
                    var loaded = JsonSerializer.Deserialize<List<ConnectionProfile>>(File.ReadAllText(ProfilePath));
                    if (loaded != null) { profiles.Clear(); profiles.AddRange(loaded); }
                }
            }
            catch { }
            RefreshProfileCombo();
        }

        private void SaveProfilesFile()
        {
            Directory.CreateDirectory(Path.GetDirectoryName(ProfilePath)!);
            File.WriteAllText(ProfilePath,
                JsonSerializer.Serialize(profiles, new JsonSerializerOptions { WriteIndented = true }));
        }

        private void RefreshProfileCombo()
        {
            var saved = comboProfile.SelectedIndex;
            comboProfile.Items.Clear();
            foreach (var p in profiles) comboProfile.Items.Add(p.Name);
            if (saved >= 0 && saved < comboProfile.Items.Count)
                comboProfile.SelectedIndex = saved;
        }

        private void ComboProfile_SelectedIndexChanged(object? sender, EventArgs e)
        {
            if (comboProfile.SelectedIndex < 0) return;
            var p = profiles[comboProfile.SelectedIndex];
            comboProtocol.SelectedItem = p.Protocol;
            txtHost.Text     = p.Host;
            txtPort.Text     = p.Port;
            txtUser.Text     = p.User;
            txtPassword.Text = p.Password;
            AppendLog($"프로파일 로드: {p.Name}");
        }

        private void BtnProfileSave_Click(object? sender, EventArgs e)
        {
            var defaultName = comboProfile.SelectedIndex >= 0
                ? profiles[comboProfile.SelectedIndex].Name
                : $"{comboProtocol.SelectedItem}_{txtHost.Text}";

            var name = ShowInputDialog("프로파일 저장", "프로파일 이름:", defaultName);
            if (string.IsNullOrWhiteSpace(name)) return;

            var profile = new ConnectionProfile
            {
                Name = name, Protocol = comboProtocol.SelectedItem?.ToString() ?? "FTP",
                Host = txtHost.Text, Port = txtPort.Text,
                User = txtUser.Text, Password = txtPassword.Text
            };

            var idx = profiles.FindIndex(p => p.Name == name);
            if (idx >= 0) { profiles[idx] = profile; AppendLog($"프로파일 수정: {name}"); }
            else          { profiles.Add(profile);   AppendLog($"프로파일 추가: {name}"); }

            SaveProfilesFile();
            RefreshProfileCombo();
            comboProfile.SelectedIndex = profiles.FindIndex(p => p.Name == name);
        }

        private void BtnProfileDelete_Click(object? sender, EventArgs e)
        {
            if (comboProfile.SelectedIndex < 0)
            {
                MessageBox.Show("삭제할 프로파일을 선택하세요.", "알림",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            var name = profiles[comboProfile.SelectedIndex].Name;
            if (MessageBox.Show($"'{name}' 프로파일을 삭제하시겠습니까?", "확인",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;

            profiles.RemoveAt(comboProfile.SelectedIndex);
            SaveProfilesFile();
            comboProfile.SelectedIndex = -1;
            RefreshProfileCombo();
            AppendLog($"프로파일 삭제: {name}");
        }

        // ── Log ──────────────────────────────────────────────────────────────
        private void AppendLog(string message)
        {
            var line = $"[{DateTime.Now:HH:mm:ss}]  {message}";
            richTextLog.AppendText(line + Environment.NewLine);
            richTextLog.ScrollToCaret();
        }

        // ── Dialogs ──────────────────────────────────────────────────────────
        private void ShowErrorDialog(string title, string message)
        {
            using var dlg = new Form
            {
                Text = title, Width = 480, Height = 230,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                StartPosition = FormStartPosition.CenterParent,
                MaximizeBox = false, MinimizeBox = false, Font = Font
            };
            var icon = new PictureBox { Image = SystemIcons.Error.ToBitmap(), SizeMode = PictureBoxSizeMode.StretchImage, Location = new Point(12, 14), Size = new Size(32, 32) };
            var txt  = new TextBox   { Left = 52, Top = 14, Width = 400, Height = 120, Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, Text = message, BackColor = SystemColors.Window };
            var hint = new Label     { Left = 52, Top = 140, AutoSize = true, Text = "내용을 선택하여 복사할 수 있습니다.", ForeColor = Color.Gray };
            var btn  = new Button    { Text = "닫기", Left = 380, Top = 164, Width = 75, Height = 28, DialogResult = DialogResult.OK };
            dlg.Controls.AddRange(new Control[] { icon, txt, hint, btn });
            dlg.AcceptButton = btn;
            txt.SelectAll();
            dlg.ShowDialog(this);
        }

        private string? ShowInputDialog(string title, string prompt, string defaultValue = "")
        {
            using var dlg = new Form
            {
                Text = title, Width = 360, Height = 148,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                StartPosition = FormStartPosition.CenterParent,
                MaximizeBox = false, MinimizeBox = false, Font = Font
            };
            var lbl   = new Label  { Left = 12, Top = 12, Width = 320, Text = prompt, AutoSize = true };
            var txt   = new TextBox{ Left = 12, Top = 34, Width = 320, Text = defaultValue };
            var btnOk = new Button { Text = "확인", Left = 165, Top = 70, Width = 80, Height = 28, DialogResult = DialogResult.OK };
            var btnCa = new Button { Text = "취소", Left = 255, Top = 70, Width = 80, Height = 28, DialogResult = DialogResult.Cancel };
            dlg.Controls.AddRange(new Control[] { lbl, txt, btnOk, btnCa });
            dlg.AcceptButton = btnOk; dlg.CancelButton = btnCa;
            txt.SelectAll();
            return dlg.ShowDialog(this) == DialogResult.OK ? txt.Text.Trim() : null;
        }
    }

    // ── Data models ──────────────────────────────────────────────────────────

    file sealed record RemoteItem(string Name, string FullPath, bool IsDirectory);

    public class ConnectionProfile
    {
        public string Name     { get; set; } = "";
        public string Protocol { get; set; } = "FTP";
        public string Host     { get; set; } = "";
        public string Port     { get; set; } = "";
        public string User     { get; set; } = "";
        public string Password { get; set; } = "";
    }

    public class AppSettings
    {
        public string LastLocalPath { get; set; } = "";

        private static readonly string Path_ = System.IO.Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FTPClientWin", "settings.json");

        public static AppSettings Load()
        {
            try
            {
                if (File.Exists(Path_))
                    return JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(Path_)) ?? new();
            }
            catch { }
            return new();
        }

        public void Save()
        {
            try
            {
                Directory.CreateDirectory(System.IO.Path.GetDirectoryName(Path_)!);
                File.WriteAllText(Path_,
                    JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
            }
            catch { }
        }
    }
}
