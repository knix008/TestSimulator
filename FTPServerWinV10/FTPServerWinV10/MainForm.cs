using System;
using System.Windows.Forms;

namespace FTPServerWinV10
{
    public partial class MainForm : Form
    {
        private const string SettingsFile = "server_settings.json";
        private static string SettingsFilePath =>
            System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, SettingsFile);
        private bool allowAnonymous = true;
        private OpenFileDialog openCertDialog = new OpenFileDialog();
        private List<Server.SharedFolderEntry> _sharedFolders = new();
        private List<Server.UserEntry> _users = new();
        private int clientCount = 0;
        private int uploadCount = 0;
        private long uploadBytes = 0;
        private int downloadCount = 0;
        private long downloadBytes = 0;
        private Server.FtpServerManager? _ftpManager;
        private Server.FtpsServerManager? _ftpsManager;
        private Server.SftpServerManager? _sftpManager;
        private int _ftpClients;
        private int _ftpsClients;
        private int _sftpClients;
        private Server.LogManager? logManager;
        private bool _loadingProfiles = false;

        public MainForm()
        {
            InitializeComponent();
            this.KeyPreview = true;
            this.KeyDown += MainForm_KeyDown;
            openCertDialog.Filter = "PFX 인증서 (*.pfx)|*.pfx|모든 파일 (*.*)|*.*";
            logManager = new Server.LogManager(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ftpserver.log"));
            LoadProfileList();
            LoadSettings();
            UpdateProtocolUiState();
        }

        // ── Keyboard shortcuts ────────────────────────────────────────────────────
        private void MainForm_KeyDown(object? sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.F5)
            {
                SaveSettings();
                AddLog("설정 저장 완료 (F5)");
            }
            else if (e.KeyCode == Keys.F6)
            {
                LoadSettings();
                AddLog("설정 불러오기 완료 (F6)");
            }
        }

        private void MainForm_FormClosing(object? sender, FormClosingEventArgs e)
        {
            SaveSettings();
        }

        // ── Legacy settings (single file) ────────────────────────────────────────
        private void SaveSettings()
        {
            try
            {
                Server.ServerSettings.Save(SettingsFile, BuildSettings());
            }
            catch (Exception ex)
            {
                ErrorDialog.ShowError(this, "설정 저장 오류", "설정을 저장하지 못했습니다.", ex,
                    $"파일: {SettingsFilePath}");
            }
        }

        private void LoadSettings()
        {
            try
            {
                var settings = Server.ServerSettings.Load(SettingsFile);
                if (settings == null) return;
                ApplySettings(settings);
            }
            catch (Exception ex)
            {
                ErrorDialog.ShowError(this, "설정 불러오기 오류", "저장된 설정을 읽지 못했습니다.", ex,
                    $"파일: {SettingsFilePath}");
            }
        }

        // ── Profile management ────────────────────────────────────────────────────
        private void LoadProfileList()
        {
            _loadingProfiles = true;
            var current = cmbProfiles.SelectedItem as string;
            cmbProfiles.Items.Clear();
            foreach (var name in Server.ServerSettings.GetProfileNames())
                cmbProfiles.Items.Add(name);
            if (current != null && cmbProfiles.Items.Contains(current))
                cmbProfiles.SelectedItem = current;
            else
                cmbProfiles.SelectedIndex = -1;
            _loadingProfiles = false;
        }

        private void cmbProfiles_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (_loadingProfiles) return;
            if (cmbProfiles.SelectedItem is not string name) return;
            try
            {
                var settings = Server.ServerSettings.LoadProfile(name);
                if (settings == null)
                {
                    ErrorDialog.ShowWarning(this, "프로파일 불러오기",
                        $"프로파일 '{name}'을(를) 읽을 수 없습니다.",
                        $"파일: {GetProfileFilePath(name)}");
                    return;
                }
                ApplySettings(settings);
                AddLog($"프로파일 '{name}' 불러오기 완료");
            }
            catch (Exception ex)
            {
                ErrorDialog.ShowError(this, "프로파일 불러오기 오류",
                    $"프로파일 '{name}'을(를) 불러오지 못했습니다.", ex,
                    $"파일: {GetProfileFilePath(name)}");
            }
        }

        private void btnSaveProfile_Click(object sender, EventArgs e)
        {
            string? name = cmbProfiles.SelectedItem as string ?? PromptForProfileName();
            if (string.IsNullOrWhiteSpace(name)) return;
            try
            {
                Server.ServerSettings.SaveProfile(name, BuildSettings());
                LoadProfileList();
                cmbProfiles.SelectedItem = name;
                AddLog($"프로파일 '{name}' 저장 완료");
            }
            catch (Exception ex)
            {
                ErrorDialog.ShowError(this, "프로파일 저장 오류",
                    $"프로파일 '{name}'을(를) 저장하지 못했습니다.", ex,
                    $"파일: {GetProfileFilePath(name)}");
            }
        }

        private void btnDeleteProfile_Click(object sender, EventArgs e)
        {
            if (cmbProfiles.SelectedItem is not string name) return;
            if (MessageBox.Show($"'{name}' 프로파일을 삭제할까요?", "삭제 확인",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            try
            {
                Server.ServerSettings.DeleteProfile(name);
                LoadProfileList();
                AddLog($"프로파일 '{name}' 삭제됨");
            }
            catch (Exception ex)
            {
                ErrorDialog.ShowError(this, "프로파일 삭제 오류",
                    $"프로파일 '{name}'을(를) 삭제하지 못했습니다.", ex,
                    $"파일: {GetProfileFilePath(name)}");
            }
        }

        private static string GetProfileFilePath(string name) =>
            System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "profiles", name + ".json");

        private string? PromptForProfileName()
        {
            using var dlg = new Form
            {
                Text = "프로파일 이름",
                ClientSize = new System.Drawing.Size(320, 110),
                FormBorderStyle = FormBorderStyle.FixedDialog,
                StartPosition = FormStartPosition.CenterParent,
                MaximizeBox = false,
                MinimizeBox = false,
                Font = new System.Drawing.Font("Segoe UI", 9F)
            };
            var lbl = new Label
            {
                Text = "이름:",
                Location = new System.Drawing.Point(12, 18),
                Size = new System.Drawing.Size(40, 27),
                TextAlign = System.Drawing.ContentAlignment.MiddleLeft
            };
            var txt = new TextBox
            {
                Location = new System.Drawing.Point(56, 16),
                Size = new System.Drawing.Size(244, 27),
                Font = new System.Drawing.Font("Segoe UI", 9F)
            };
            var btnOK = new Button
            {
                Text = "확인",
                DialogResult = DialogResult.OK,
                Location = new System.Drawing.Point(134, 62),
                Size = new System.Drawing.Size(76, 29)
            };
            var btnCancel = new Button
            {
                Text = "취소",
                DialogResult = DialogResult.Cancel,
                Location = new System.Drawing.Point(218, 62),
                Size = new System.Drawing.Size(76, 29)
            };
            dlg.Controls.AddRange(new Control[] { lbl, txt, btnOK, btnCancel });
            dlg.AcceptButton = btnOK;
            dlg.CancelButton = btnCancel;
            return (dlg.ShowDialog(this) == DialogResult.OK && !string.IsNullOrWhiteSpace(txt.Text))
                ? txt.Text.Trim()
                : null;
        }

        // ── SSL certificate generation ────────────────────────────────────────────
        private void btnGenerateCert_Click(object sender, EventArgs e)
        {
            using var dlg = new GenerateCertDialog();
            dlg.StartPosition = FormStartPosition.CenterParent;
            if (dlg.ShowDialog(this) != DialogResult.OK) return;
            try
            {
                Server.CertificateGenerator.GenerateSelfSignedPfx(
                    dlg.CommonName, dlg.ValidityYears, dlg.PfxPath, dlg.PfxPassword);
                txtCertPath.Text = dlg.PfxPath;
                txtCertPw.Text = dlg.PfxPassword;
                AddLog($"자체 서명 인증서 생성 완료: {dlg.PfxPath}");
                MessageBox.Show(
                    $"인증서가 생성되었습니다.\n경로: {dlg.PfxPath}\n유효 기간: {dlg.ValidityYears}년",
                    "생성 완료", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                AddLog($"인증서 생성 실패: {ex.Message}");
                ErrorDialog.ShowError(this, "인증서 생성 오류", "자체 서명 인증서를 생성하지 못했습니다.", ex,
                    $"CN: {dlg.CommonName}\r\n저장 경로: {dlg.PfxPath}\r\n유효 기간: {dlg.ValidityYears}년");
            }
        }

        // ── Shared folder management ──────────────────────────────────────────────
        private void btnAddFolder_Click(object sender, EventArgs e)
        {
            using var dlg = new Form
            {
                Text = "공유 폴더 추가",
                ClientSize = new System.Drawing.Size(480, 150),
                FormBorderStyle = FormBorderStyle.FixedDialog,
                StartPosition = FormStartPosition.CenterParent,
                MaximizeBox = false,
                MinimizeBox = false,
                Font = new System.Drawing.Font("Segoe UI", 9F)
            };

            var lblVirtual = new Label { Text = "가상 이름:", Location = new System.Drawing.Point(12, 18), Size = new System.Drawing.Size(72, 27), TextAlign = System.Drawing.ContentAlignment.MiddleLeft };
            var txtVirtual = new TextBox { Location = new System.Drawing.Point(88, 16), Size = new System.Drawing.Size(370, 27), Font = new System.Drawing.Font("Segoe UI", 9F), PlaceholderText = "예: data" };

            var lblPhysical = new Label { Text = "실제 경로:", Location = new System.Drawing.Point(12, 56), Size = new System.Drawing.Size(72, 27), TextAlign = System.Drawing.ContentAlignment.MiddleLeft };
            var txtPhysical = new TextBox { Location = new System.Drawing.Point(88, 54), Size = new System.Drawing.Size(296, 27), Font = new System.Drawing.Font("Segoe UI", 9F) };
            var btnBrowse = new Button { Text = "찾기", Location = new System.Drawing.Point(390, 53), Size = new System.Drawing.Size(68, 29), FlatStyle = FlatStyle.System };

            var btnOK = new Button { Text = "확인", DialogResult = DialogResult.OK, Location = new System.Drawing.Point(314, 105), Size = new System.Drawing.Size(76, 29) };
            var btnCancel = new Button { Text = "취소", DialogResult = DialogResult.Cancel, Location = new System.Drawing.Point(396, 105), Size = new System.Drawing.Size(76, 29) };

            btnBrowse.Click += (_, __) =>
            {
                using var fbd = new FolderBrowserDialog();
                if (fbd.ShowDialog() == DialogResult.OK)
                    txtPhysical.Text = fbd.SelectedPath;
            };

            dlg.Controls.AddRange(new Control[] { lblVirtual, txtVirtual, lblPhysical, txtPhysical, btnBrowse, btnOK, btnCancel });
            dlg.AcceptButton = btnOK;
            dlg.CancelButton = btnCancel;

            if (dlg.ShowDialog(this) != DialogResult.OK) return;

            var virtualName = txtVirtual.Text.Trim().Trim('/');
            var physicalPath = txtPhysical.Text.Trim();

            if (string.IsNullOrEmpty(virtualName))
            {
                ErrorDialog.ShowWarning(this, "입력 오류", "가상 이름을 입력하세요.",
                    "공유 폴더의 URL 경로에 사용됩니다. 예: data → ftp://서버/data/");
                return;
            }
            if (!System.IO.Directory.Exists(physicalPath))
            {
                ErrorDialog.ShowWarning(this, "입력 오류", "실제 경로가 존재하지 않습니다.",
                    $"입력한 경로:\r\n{physicalPath}\r\n\r\n폴더가 있는지, 드라이브·네트워크 경로가 연결되어 있는지 확인하세요.");
                return;
            }

            var entry = new Server.SharedFolderEntry { VirtualName = virtualName, PhysicalPath = physicalPath };
            _sharedFolders.Add(entry);
            var item = new ListViewItem(virtualName);
            item.SubItems.Add(physicalPath);
            lvFolders.Items.Add(item);
        }

        private void btnRemoveFolder_Click(object sender, EventArgs e)
        {
            if (lvFolders.SelectedIndices.Count == 0) return;
            int idx = lvFolders.SelectedIndices[0];
            lvFolders.Items.RemoveAt(idx);
            _sharedFolders.RemoveAt(idx);
        }

        // ── User management ───────────────────────────────────────────────────────
        private void btnAddUser_Click(object sender, EventArgs e)
        {
            using var dlg = new Form
            {
                Text = "사용자 추가",
                ClientSize = new System.Drawing.Size(340, 130),
                FormBorderStyle = FormBorderStyle.FixedDialog,
                StartPosition = FormStartPosition.CenterParent,
                MaximizeBox = false,
                MinimizeBox = false,
                Font = new System.Drawing.Font("Segoe UI", 9F)
            };
            var lblId  = new Label { Text = "아이디:", Location = new System.Drawing.Point(12, 18), Size = new System.Drawing.Size(56, 27), TextAlign = System.Drawing.ContentAlignment.MiddleLeft };
            var txtId  = new TextBox { Location = new System.Drawing.Point(72, 16), Size = new System.Drawing.Size(248, 27) };
            var lblPw  = new Label { Text = "암호:", Location = new System.Drawing.Point(12, 52), Size = new System.Drawing.Size(56, 27), TextAlign = System.Drawing.ContentAlignment.MiddleLeft };
            var txtPw  = new TextBox { Location = new System.Drawing.Point(72, 50), Size = new System.Drawing.Size(248, 27), PasswordChar = '*' };
            var btnOK  = new Button { Text = "확인", DialogResult = DialogResult.OK, Location = new System.Drawing.Point(154, 90), Size = new System.Drawing.Size(76, 29) };
            var btnCnl = new Button { Text = "취소", DialogResult = DialogResult.Cancel, Location = new System.Drawing.Point(236, 90), Size = new System.Drawing.Size(76, 29) };
            dlg.Controls.AddRange(new Control[] { lblId, txtId, lblPw, txtPw, btnOK, btnCnl });
            dlg.AcceptButton = btnOK;
            dlg.CancelButton = btnCnl;

            if (dlg.ShowDialog(this) != DialogResult.OK) return;
            string id = txtId.Text.Trim();
            string pw = txtPw.Text;
            if (string.IsNullOrEmpty(id))
            {
                ErrorDialog.ShowWarning(this, "입력 오류", "아이디를 입력하세요.",
                    "익명 접속이 꺼져 있으면 등록된 사용자만 로그인할 수 있습니다.");
                return;
            }
            var entry = new Server.UserEntry { Username = id, Password = pw };
            _users.Add(entry);
            var item = new ListViewItem(id);
            item.SubItems.Add(new string('*', Math.Max(pw.Length, 1)));
            lvUsers.Items.Add(item);
        }

        private void btnRemoveUser_Click(object sender, EventArgs e)
        {
            if (lvUsers.SelectedIndices.Count == 0) return;
            int idx = lvUsers.SelectedIndices[0];
            lvUsers.Items.RemoveAt(idx);
            _users.RemoveAt(idx);
        }

        // ── Cert selection ────────────────────────────────────────────────────────
        private void chkAnonymous_CheckedChanged(object sender, EventArgs e)
        {
            allowAnonymous = chkAnonymous.Checked;
        }

        private void btnSelectCert_Click(object sender, EventArgs e)
        {
            if (openCertDialog.ShowDialog() == DialogResult.OK)
                txtCertPath.Text = openCertDialog.FileName;
        }

        // ── Server toggle (start / stop) ─────────────────────────────────────────
        private bool _serverRunning = false;

        private void btnStartServer_Click(object sender, EventArgs e)
        {
            if (_serverRunning)
                StopServer();
            else
                StartServer();
        }

        private void StartServer()
        {
            if (_sharedFolders.Count == 0)
            {
                ErrorDialog.ShowWarning(this, "설정 오류", "공유 폴더를 먼저 추가하세요.",
                    "「공유 폴더」 탭에서 가상 이름과 실제 경로를 하나 이상 등록해야 서버를 시작할 수 있습니다.");
                return;
            }

            if (!chkEnableFtp.Checked && !chkEnableFtps.Checked && !chkEnableSftp.Checked)
            {
                ErrorDialog.ShowWarning(this, "설정 오류",
                    "FTP, FTPS, SFTP 중 하나 이상을 선택하세요.",
                    "「프로토콜」 그룹에서 사용할 프로토콜을 체크하고 포트를 확인하세요.");
                return;
            }

            if (chkEnableFtps.Checked && string.IsNullOrWhiteSpace(txtCertPath.Text))
            {
                ErrorDialog.ShowWarning(this, "설정 오류",
                    "FTPS를 사용하려면 SSL 인증서(PFX)를 지정하세요.",
                    "「인증」 영역에서 PFX 파일을 선택하거나 「인증서 생성」으로 새 인증서를 만드세요.");
                return;
            }

            if (chkEnableFtps.Checked && !System.IO.File.Exists(txtCertPath.Text.Trim()))
            {
                ErrorDialog.ShowWarning(this, "설정 오류", "지정한 SSL 인증서 파일을 찾을 수 없습니다.",
                    $"경로:\r\n{txtCertPath.Text.Trim()}");
                return;
            }

            var vfs = new Server.VirtualFileSystem(_sharedFolders);
            int bufferKb = (int)numBuffer.Value;
            int threads  = (int)numThreads.Value;
            var users    = _users.ToList();
            string certPath = txtCertPath.Text.Trim();
            string certPw   = txtCertPw.Text;

            try
            {
                if (chkEnableFtp.Checked)
                {
                    _ftpManager = new Server.FtpServerManager(vfs, (int)numFtpPort.Value)
                    {
                        AllowAnonymous = allowAnonymous,
                        Users          = users,
                        BufferSizeKb   = bufferKb,
                        MaxThreads     = threads
                    };
                    WireFtpEvents(_ftpManager);
                    _ftpManager.Start();
                    AddLog($"FTP 서버 시작 (포트 {(int)numFtpPort.Value})");
                }

                if (chkEnableFtps.Checked)
                {
                    _ftpsManager = new Server.FtpsServerManager(vfs, certPath, certPw, (int)numFtpsPort.Value)
                    {
                        AllowAnonymous = allowAnonymous,
                        Users          = users,
                        BufferSizeKb   = bufferKb,
                        MaxThreads     = threads
                    };
                    WireFtpEvents(_ftpsManager);
                    _ftpsManager.Start();
                    AddLog($"FTPS 서버 시작 (포트 {(int)numFtpsPort.Value})");
                }

                if (chkEnableSftp.Checked)
                {
                    _sftpManager = new Server.SftpServerManager(vfs, (int)numSftpPort.Value)
                    {
                        AllowAnonymous = allowAnonymous,
                        Users          = users
                    };
                    _sftpManager.OnLog += AddLog;
                    _sftpManager.OnClientCountChanged += c => UpdateProtocolClientCount(ref _sftpClients, c);
                    _sftpManager.Start();
                    AddLog($"SFTP 서버 시작 (포트 {(int)numSftpPort.Value})");
                }

                _serverRunning = true;
                UpdateServerStatus(true);
                UpdateProtocolUiState();
            }
            catch (Exception ex)
            {
                AddLog($"서버 시작 실패: {ex.Message}");
                StopServer();
                ErrorDialog.ShowError(this, "서버 시작 오류", "서버를 시작하지 못했습니다.", ex,
                    BuildServerStartDetails(certPath));
            }
        }

        private void OnServerError(string message, Exception? ex)
        {
            if (InvokeRequired)
            {
                Invoke(new Action(() => OnServerError(message, ex)));
                return;
            }
            AddLog($"{message}: {ex?.Message ?? ""}");
            ErrorDialog.ShowError(this, "서버 실행 오류", message, ex);
        }

        private void WireFtpEvents(Server.FtpServerManager mgr)
        {
            mgr.OnLog += AddLog;
            mgr.OnError += OnServerError;
            if (mgr is Server.FtpsServerManager)
                mgr.OnClientCountChanged += c => UpdateProtocolClientCount(ref _ftpsClients, c);
            else
                mgr.OnClientCountChanged += c => UpdateProtocolClientCount(ref _ftpClients, c);
            mgr.OnFileUploaded += OnFileUploaded;
            mgr.OnFileDownloaded += OnFileDownloaded;
        }

        private void StopServer()
        {
            _ftpManager?.Stop();
            _ftpsManager?.Stop();
            _sftpManager?.Dispose();
            _ftpManager = null;
            _ftpsManager = null;
            _sftpManager = null;
            _ftpClients = _ftpsClients = _sftpClients = 0;
            AddLog("서버 중지됨");
            logManager?.Stop();
            uploadCount = 0; uploadBytes = 0;
            downloadCount = 0; downloadBytes = 0;
            UpdateStats();
            UpdateClientCount(0);
            _serverRunning = false;
            UpdateServerStatus(false);
            UpdateProtocolUiState();
        }

        private void UpdateProtocolClientCount(ref int field, int count)
        {
            field = count;
            UpdateClientCount(_ftpClients + _ftpsClients + _sftpClients);
        }

        private void UpdateProtocolUiState()
        {
            bool running = _serverRunning;
            grpProtocol.Enabled = !running;
            grpServer.Enabled = !running;
            grpAuth.Enabled = !running;

            bool ftp = chkEnableFtp.Checked;
            bool ftps = chkEnableFtps.Checked;
            bool sftp = chkEnableSftp.Checked;

            numFtpPort.Enabled = ftp && !running;
            numFtpsPort.Enabled = ftps && !running;
            numSftpPort.Enabled = sftp && !running;

            lblCert.Enabled = txtCertPath.Enabled = btnSelectCert.Enabled =
                btnGenerateCert.Enabled = lblCertPw.Enabled = txtCertPw.Enabled = ftps && !running;
        }

        private void ProtocolCheckChanged(object? sender, EventArgs e)
        {
            // 프로토콜을 켤 때 표준 포트로 자동 설정
            if (sender == chkEnableFtp && chkEnableFtp.Checked)
                numFtpPort.Value = Server.ProtocolSettings.DefaultFtpPort;
            else if (sender == chkEnableFtps && chkEnableFtps.Checked)
                numFtpsPort.Value = Server.ProtocolSettings.DefaultFtpsPort;
            else if (sender == chkEnableSftp && chkEnableSftp.Checked)
                numSftpPort.Value = Server.ProtocolSettings.DefaultSftpPort;

            UpdateProtocolUiState();
        }

        private static void ApplyProtocolPorts(Server.ProtocolSettings proto,
            NumericUpDown numFtp, NumericUpDown numFtps, NumericUpDown numSftp)
        {
            numFtp.Value = ClampPort(Server.ProtocolSettings.NormalizePort(proto.FtpPort, Server.ProtocolSettings.DefaultFtpPort), numFtp);
            numFtps.Value = ClampPort(Server.ProtocolSettings.NormalizePort(proto.FtpsPort, Server.ProtocolSettings.DefaultFtpsPort), numFtps);
            numSftp.Value = ClampPort(Server.ProtocolSettings.NormalizePort(proto.SftpPort, Server.ProtocolSettings.DefaultSftpPort), numSftp);
        }

        // ── Stats / log callbacks ─────────────────────────────────────────────────
        private void OnFileUploaded(string fileName, long size)   { uploadCount++;   uploadBytes   += size; UpdateStats(); }
        private void OnFileDownloaded(string fileName, long size) { downloadCount++; downloadBytes += size; UpdateStats(); }

        private void UpdateStats()
        {
            if (InvokeRequired) { Invoke(new Action(UpdateStats)); return; }
            lblUploadStats.Text   = $"↑ 업로드: {uploadCount} 파일 ({FormatBytes(uploadBytes)})";
            lblDownloadStats.Text = $"↓ 다운로드: {downloadCount} 파일 ({FormatBytes(downloadBytes)})";
        }

        private void UpdateClientCount(int count)
        {
            if (InvokeRequired) { Invoke(new Action(() => UpdateClientCount(count))); return; }
            clientCount = count;
            lblClients.Text = $"● 클라이언트: {clientCount}";
        }

        private void AddLog(string message)
        {
            if (InvokeRequired) { Invoke(new Action(() => AddLog(message))); return; }
            lstLog.Items.Add($"[{DateTime.Now:HH:mm:ss}] {message}");
            lstLog.TopIndex = lstLog.Items.Count - 1;
            logManager?.WriteLog(message);
        }

        private void UpdateServerStatus(bool running)
        {
            if (running)
            {
                btnStartServer.Text      = "■  중지";
                btnStartServer.BackColor = System.Drawing.Color.FromArgb(192, 57, 43);
            }
            else
            {
                btnStartServer.Text      = "▶  시작";
                btnStartServer.BackColor = System.Drawing.Color.FromArgb(39, 174, 96);
            }
        }

        // ── Helpers ───────────────────────────────────────────────────────────────
        private Server.ServerSettings BuildSettings() => new Server.ServerSettings
        {
            SharedFolders  = _sharedFolders.ToList(),
            CertPath       = txtCertPath.Text,
            CertPassword   = txtCertPw.Text,
            AllowAnonymous = chkAnonymous.Checked,
            Users          = _users.ToList(),
            BufferSizeKb   = (int)numBuffer.Value,
            MaxThreads     = (int)numThreads.Value,
            Protocols      = new Server.ProtocolSettings
            {
                EnableFtp   = chkEnableFtp.Checked,
                EnableFtps  = chkEnableFtps.Checked,
                EnableSftp  = chkEnableSftp.Checked,
                FtpPort     = (int)numFtpPort.Value,
                FtpsPort    = (int)numFtpsPort.Value,
                SftpPort    = (int)numSftpPort.Value
            }
        };

        private void ApplySettings(Server.ServerSettings s)
        {
            _sharedFolders = s.SharedFolders.ToList();
            lvFolders.Items.Clear();
            foreach (var entry in _sharedFolders)
            {
                var item = new ListViewItem(entry.VirtualName);
                item.SubItems.Add(entry.PhysicalPath);
                lvFolders.Items.Add(item);
            }

            _users = s.Users.ToList();
            lvUsers.Items.Clear();
            foreach (var u in _users)
            {
                var item = new ListViewItem(u.Username);
                item.SubItems.Add(new string('*', Math.Max(u.Password.Length, 1)));
                lvUsers.Items.Add(item);
            }

            txtCertPath.Text      = s.CertPath;
            txtCertPw.Text        = s.CertPassword;
            chkAnonymous.Checked  = s.AllowAnonymous;
            numBuffer.Value       = Math.Max(numBuffer.Minimum, Math.Min(numBuffer.Maximum, s.BufferSizeKb));
            numThreads.Value      = Math.Max(numThreads.Minimum, Math.Min(numThreads.Maximum, s.MaxThreads));
            var proto = s.Protocols ?? new Server.ProtocolSettings();
            chkEnableFtp.Checked  = proto.EnableFtp;
            chkEnableFtps.Checked = proto.EnableFtps;
            chkEnableSftp.Checked = proto.EnableSftp;
            ApplyProtocolPorts(proto, numFtpPort, numFtpsPort, numSftpPort);
            UpdateProtocolUiState();
        }

        private static decimal ClampPort(int port, NumericUpDown ctrl) =>
            Math.Max(ctrl.Minimum, Math.Min(ctrl.Maximum, port));

        private static string FormatBytes(long bytes)
        {
            if (bytes >= 1_073_741_824) return $"{bytes / 1_073_741_824.0:F1} GB";
            if (bytes >= 1_048_576)     return $"{bytes / 1_048_576.0:F1} MB";
            if (bytes >= 1_024)         return $"{bytes / 1_024.0:F1} KB";
            return $"{bytes} B";
        }

        private string BuildServerStartDetails(string certPath)
        {
            var sb = new System.Text.StringBuilder();
            sb.AppendLine("── 프로토콜 ──");
            if (chkEnableFtp.Checked)
                sb.AppendLine($"FTP  : 포트 {(int)numFtpPort.Value}");
            if (chkEnableFtps.Checked)
                sb.AppendLine($"FTPS : 포트 {(int)numFtpsPort.Value}, 인증서: {certPath}");
            if (chkEnableSftp.Checked)
                sb.AppendLine($"SFTP : 포트 {(int)numSftpPort.Value}");
            sb.AppendLine($"익명 접속: {(chkAnonymous.Checked ? "허용" : "거부")}");
            sb.AppendLine($"사용자 수: {_users.Count}");
            sb.AppendLine();
            sb.AppendLine("── 공유 폴더 ──");
            foreach (var f in _sharedFolders)
                sb.AppendLine($"  /{f.VirtualName} → {f.PhysicalPath}");
            sb.AppendLine();
            sb.AppendLine("포트가 다른 프로그램에서 사용 중이거나, SFTP junction 생성에 관리자 권한이 필요할 수 있습니다.");
            return sb.ToString();
        }
    }
}
