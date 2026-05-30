using System;
using System.Linq;
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
        private SaveFileDialog saveLogDialog = new SaveFileDialog();
        private readonly string _defaultLogFilePath;
        private List<Server.SharedFolderEntry> _sharedFolders = new();
        private List<Server.UserEntry> _users = new();
        private int totalClientCount = 0;
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
            openCertDialog.Filter = "SSL 인증서 (*.pfx)|*.pfx|모든 파일 (*.*)|*.*";
            _defaultLogFilePath = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ftpserver.log");
            logManager = new Server.LogManager(_defaultLogFilePath);
            saveLogDialog.Filter = "로그 파일 (*.log)|*.log|텍스트 (*.txt)|*.txt|모든 파일 (*.*)|*.*";
            saveLogDialog.InitialDirectory = AppDomain.CurrentDomain.BaseDirectory;
            saveLogDialog.FileName = $"FTPServerWinV10_{DateTime.Now:yyyyMMdd_HHmmss}.log";
            LoadProfileList();
            LoadSettings();
            RefreshSftpHostKeyUi();
            SetupSecurityTooltips();
            UpdateProtocolUiState();
            SetupLogCopy();
            SetupUserListEvents();
            AddLog($"자동 로그 저장: {_defaultLogFilePath}");
        }

        private void SetupUserListEvents()
        {
            lvUsers.DoubleClick += (_, _) =>
            {
                if (lvUsers.SelectedIndices.Count == 0) return;
                int idx = lvUsers.SelectedIndices[0];
                var existing = _users.ElementAtOrDefault(idx)
                    ?? lvUsers.SelectedItems[0].Tag as Server.UserEntry;
                if (existing == null) return;
                if (!ShowUserEditorDialog(existing, out var updated)) return;
                _users[idx] = updated;
                lvUsers.Items[idx] = CreateUserListItem(updated);
            };
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
            logManager?.Dispose();
            logManager = null;
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
                var u = settings.Users?.Count ?? 0;
                AddLog($"프로파일 '{name}' 불러오기 완료 — 공유 {settings.SharedFolders.Count}개, 사용자 {u}명");
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
                var settings = BuildSettings();
                Server.ServerSettings.SaveProfile(name, settings);
                Server.ServerSettings.Save(SettingsFile, settings);
                LoadProfileList();
                cmbProfiles.SelectedItem = name;
                AddLog(FormatProfileSaveSummary(name, settings));
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

        // ── FTPS SSL / SFTP host key ──────────────────────────────────────────────
        private void SetupSecurityTooltips()
        {
            toolTipSecurity.SetToolTip(lblFtpsSection,
                "FTPS(Implicit SSL, 기본 포트 990)에서만 사용합니다.\r\n" +
                "SSL/TLS 인증서 파일(.pfx)을 지정하거나 자체 서명 인증서를 생성합니다.");
            toolTipSecurity.SetToolTip(txtCertPath,
                "FTPS용 SSL/TLS 인증서 파일(.pfx) 경로입니다.\r\nSFTP에는 사용하지 않습니다.");
            toolTipSecurity.SetToolTip(btnSelectCert, "기존 SSL 인증서 파일(.pfx)을 선택합니다.");
            toolTipSecurity.SetToolTip(btnGenerateCert,
                "FTPS용 자체 서명 SSL 인증서(.pfx)를 새로 생성합니다.");
            toolTipSecurity.SetToolTip(txtCertPw, "인증서 파일(.pfx)을 열 때 사용하는 암호입니다.");

            toolTipSecurity.SetToolTip(lblSftpSection,
                "SFTP(SSH, 기본 포트 22)에서만 사용합니다.\r\n" +
                "FTPS용 SSL 인증서가 아니라 SSH 호스트 키(.pem)입니다.\r\n" +
                "클라이언트는 첫 접속 시 아래 SHA256 지문으로 서버를 확인합니다.");
            toolTipSecurity.SetToolTip(txtSftpHostKeyPath,
                "SFTP용 RSA 호스트 개인키(PEM) 경로입니다.\r\n서버 시작 시 없으면 자동 생성됩니다.");
            toolTipSecurity.SetToolTip(btnGenerateSftpKey,
                "SFTP용 SSH 호스트 키(RSA PEM)를 새로 생성합니다.\r\n기존 키가 있으면 덮어씁니다.");
            toolTipSecurity.SetToolTip(btnOpenSftpKeyFolder,
                "호스트 키가 저장된 폴더를 탐색기로 엽니다.");
            toolTipSecurity.SetToolTip(lblSftpFingerprint,
                "SFTP 클라이언트에 표시되는 서버 키 지문과 비교하세요.");
        }

        private void RefreshSftpHostKeyUi()
        {
            var path = string.IsNullOrWhiteSpace(txtSftpHostKeyPath.Text)
                ? Server.SftpHostKeyManager.DefaultKeyPath
                : txtSftpHostKeyPath.Text.Trim();
            txtSftpHostKeyPath.Text = path;
            lblSftpFingerprint.Text = "SHA256 지문: " + Server.SftpHostKeyManager.GetSha256Fingerprint(path);
        }

        private void btnGenerateSftpKey_Click(object? sender, EventArgs e)
        {
            var path = string.IsNullOrWhiteSpace(txtSftpHostKeyPath.Text)
                ? Server.SftpHostKeyManager.DefaultKeyPath
                : txtSftpHostKeyPath.Text.Trim();
            if (File.Exists(path))
            {
                var ans = MessageBox.Show(
                    "기존 SFTP 호스트 키를 덮어씁니다.\n이미 접속한 클라이언트는 호스트 키 변경 경고가 표시됩니다.\n계속하시겠습니까?",
                    "호스트 키 재생성",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Warning);
                if (ans != DialogResult.Yes) return;
            }

            try
            {
                Server.SftpHostKeyManager.GenerateKey(path);
                txtSftpHostKeyPath.Text = path;
                RefreshSftpHostKeyUi();
                AddLog($"SFTP 호스트 키 생성: {path}");
                MessageBox.Show(
                    $"SFTP SSH 호스트 키가 생성되었습니다.\n(FTPS용 SSL 인증서와는 별개입니다.)\n\n경로:\n{path}\n\n{lblSftpFingerprint.Text}",
                    "생성 완료",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                ErrorDialog.ShowError(this, "호스트 키 생성 오류", "SFTP 호스트 키를 생성하지 못했습니다.", ex,
                    $"경로: {path}");
            }
        }

        private void btnOpenSftpKeyFolder_Click(object? sender, EventArgs e)
        {
            var dir = Server.SftpHostKeyManager.DefaultDirectory;
            Directory.CreateDirectory(dir);
            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = dir,
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                ErrorDialog.ShowError(this, "폴더 열기 오류", "호스트 키 폴더를 열 수 없습니다.", ex, dir);
            }
        }

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
                    $"FTPS용 SSL 인증서가 생성되었습니다.\n(SFTP 호스트 키와는 별개입니다.)\n\n경로: {dlg.PfxPath}\n유효 기간: {dlg.ValidityYears}년",
                    "인증서 생성 완료", MessageBoxButtons.OK, MessageBoxIcon.Information);
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
            if (!ShowUserEditorDialog(null, out var entry))
                return;
            _users.Add(entry);
            lvUsers.Items.Add(CreateUserListItem(entry));
        }

        private bool ShowUserEditorDialog(Server.UserEntry? existing, out Server.UserEntry entry)
        {
            entry = existing != null
                ? new Server.UserEntry
                {
                    Username = existing.Username,
                    Password = existing.Password,
                    CanRead = existing.CanRead,
                    CanWrite = existing.CanWrite
                }
                : new Server.UserEntry();

            using var dlg = new Form
            {
                Text = existing == null ? "사용자 추가" : "사용자 편집",
                ClientSize = new System.Drawing.Size(360, 200),
                FormBorderStyle = FormBorderStyle.FixedDialog,
                StartPosition = FormStartPosition.CenterParent,
                MaximizeBox = false,
                MinimizeBox = false,
                Font = new System.Drawing.Font("Segoe UI", 9F)
            };
            var lblId = new Label { Text = "아이디:", Location = new System.Drawing.Point(12, 18), Size = new System.Drawing.Size(72, 27), TextAlign = System.Drawing.ContentAlignment.MiddleLeft };
            var txtId = new TextBox { Location = new System.Drawing.Point(88, 16), Size = new System.Drawing.Size(252, 27), Text = entry.Username, ReadOnly = existing != null };
            var lblPw = new Label { Text = "암호:", Location = new System.Drawing.Point(12, 52), Size = new System.Drawing.Size(72, 27), TextAlign = System.Drawing.ContentAlignment.MiddleLeft };
            var txtPw = new TextBox { Location = new System.Drawing.Point(88, 50), Size = new System.Drawing.Size(252, 27), PasswordChar = '*', Text = entry.Password };
            var chkRead = new CheckBox { Text = "읽기 (다운로드·목록)", Location = new System.Drawing.Point(88, 88), Size = new System.Drawing.Size(200, 24), Checked = entry.CanRead };
            var chkWrite = new CheckBox { Text = "쓰기 (업로드·삭제·폴더 생성)", Location = new System.Drawing.Point(88, 114), Size = new System.Drawing.Size(240, 24), Checked = entry.CanWrite };
            var lblNote = new Label
            {
                Text = "익명(anonymous)은 「익명 허용」 시 읽기만 가능합니다.",
                Location = new System.Drawing.Point(12, 142),
                Size = new System.Drawing.Size(328, 20),
                ForeColor = System.Drawing.Color.Gray
            };
            var btnOK = new Button { Text = "확인", DialogResult = DialogResult.OK, Location = new System.Drawing.Point(174, 162), Size = new System.Drawing.Size(76, 29) };
            var btnCnl = new Button { Text = "취소", DialogResult = DialogResult.Cancel, Location = new System.Drawing.Point(256, 162), Size = new System.Drawing.Size(76, 29) };
            dlg.Controls.AddRange(new Control[] { lblId, txtId, lblPw, txtPw, chkRead, chkWrite, lblNote, btnOK, btnCnl });
            dlg.AcceptButton = btnOK;
            dlg.CancelButton = btnCnl;

            if (dlg.ShowDialog(this) != DialogResult.OK)
                return false;

            var id = txtId.Text.Trim();
            if (string.IsNullOrEmpty(id))
            {
                ErrorDialog.ShowWarning(this, "입력 오류", "아이디를 입력하세요.",
                    "익명 접속은 사용자 목록이 아니라 「익명 허용」으로 설정합니다.");
                return false;
            }
            if (!chkRead.Checked && !chkWrite.Checked)
            {
                ErrorDialog.ShowWarning(this, "입력 오류", "읽기 또는 쓰기 권한을 하나 이상 선택하세요.", null);
                return false;
            }

            entry.Username = id;
            entry.Password = txtPw.Text;
            entry.CanRead = chkRead.Checked;
            entry.CanWrite = chkWrite.Checked;
            return true;
        }

        private static ListViewItem CreateUserListItem(Server.UserEntry u)
        {
            var item = new ListViewItem(u.Username);
            item.SubItems.Add(new string('*', Math.Max(u.Password.Length, 1)));
            item.SubItems.Add(new Server.SessionPermissions(u.CanRead, u.CanWrite).Summary);
            item.Tag = u;
            return item;
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
                    "FTPS를 사용하려면 SSL 인증서를 지정하세요.",
                    "「서버 설정」에서 인증서 파일(.pfx)을 선택하거나 「인증서 생성」으로 새 인증서를 만드세요.");
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
                    var hostKeyPath = string.IsNullOrWhiteSpace(txtSftpHostKeyPath.Text)
                        ? null
                        : txtSftpHostKeyPath.Text.Trim();
                    _sftpManager = new Server.SftpServerManager(vfs, (int)numSftpPort.Value)
                    {
                        AllowAnonymous = allowAnonymous,
                        Users          = users,
                        HostKeyPath    = hostKeyPath
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
            totalClientCount = 0;
            AddLog("서버 중지됨");
            uploadCount = 0; uploadBytes = 0;
            downloadCount = 0; downloadBytes = 0;
            UpdateStats();
            UpdateClientDisplay(0);
            _serverRunning = false;
            UpdateServerStatus(false);
            UpdateProtocolUiState();
        }

        private void UpdateProtocolClientCount(ref int field, int count)
        {
            var prevCurrent = _ftpClients + _ftpsClients + _sftpClients;
            field = count;
            var curCurrent = _ftpClients + _ftpsClients + _sftpClients;
            if (curCurrent > prevCurrent)
                totalClientCount += curCurrent - prevCurrent;
            UpdateClientDisplay(curCurrent);
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

            lblFtpsSection.Enabled = lblCert.Enabled = txtCertPath.Enabled = btnSelectCert.Enabled =
                btnGenerateCert.Enabled = lblCertPw.Enabled = txtCertPw.Enabled = ftps && !running;

            lblSftpSection.Enabled = lblSftpKey.Enabled = txtSftpHostKeyPath.Enabled =
                btnGenerateSftpKey.Enabled = btnOpenSftpKeyFolder.Enabled =
                lblSftpFingerprint.Enabled = sftp && !running;
        }

        private void ProtocolCheckChanged(object sender, EventArgs e)
        {
            // 프로토콜을 켤 때 표준 포트로 자동 설정
            if (sender == chkEnableFtp && chkEnableFtp.Checked)
                numFtpPort.Value = Server.ProtocolSettings.DefaultFtpPort;
            else if (sender == chkEnableFtps && chkEnableFtps.Checked)
                numFtpsPort.Value = Server.ProtocolSettings.DefaultFtpsPort;
            else if (sender == chkEnableSftp && chkEnableSftp.Checked)
            {
                numSftpPort.Value = Server.ProtocolSettings.DefaultSftpPort;
                RefreshSftpHostKeyUi();
            }

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

        private void UpdateClientDisplay(int currentCount)
        {
            if (InvokeRequired) { Invoke(new Action(() => UpdateClientDisplay(currentCount))); return; }
            lblClients.Text = $"현재 접속: {currentCount}";
            lblTotalClients.Text = $"총 접속: {totalClientCount}";
        }

        private void AddLog(string message)
        {
            if (InvokeRequired) { Invoke(new Action(() => AddLog(message))); return; }
            if (btnCopyLog.Text != "전체 복사")
                btnCopyLog.Text = "전체 복사";
            if (btnSaveLog.Text != "로그 저장")
                btnSaveLog.Text = "로그 저장";
            lstLog.Items.Add($"[{DateTime.Now:HH:mm:ss}] {message}");
            lstLog.TopIndex = lstLog.Items.Count - 1;
            logManager?.WriteLog(message);
        }

        private void SetupLogCopy()
        {
            btnSaveLog.Click += (_, _) => SaveLogToFile();
            btnCopyLog.Click += (_, _) => CopyAllLogLines();
            var menu = new ContextMenuStrip();
            menu.Items.Add("복사", null, (_, _) => CopySelectedLogLines());
            menu.Items.Add("전체 복사", null, (_, _) => CopyAllLogLines());
            menu.Items.Add("파일로 저장...", null, (_, _) => SaveLogToFile());
            lstLog.ContextMenuStrip = menu;
            lstLog.KeyDown += LstLog_KeyDown;
        }

        private void LstLog_KeyDown(object? sender, KeyEventArgs e)
        {
            if (e.Control && e.KeyCode == Keys.C)
            {
                CopySelectedLogLines();
                e.Handled = true;
            }
            else if (e.Control && e.KeyCode == Keys.A)
            {
                for (int i = 0; i < lstLog.Items.Count; i++)
                    lstLog.SetSelected(i, true);
                e.Handled = true;
            }
        }

        private void SaveLogToFile()
        {
            if (lstLog.Items.Count == 0)
            {
                ErrorDialog.ShowWarning(this, "로그 저장", "저장할 로그가 없습니다.",
                    $"화면에 표시된 로그가 없습니다.\n자동 저장 파일: {_defaultLogFilePath}");
                return;
            }

            saveLogDialog.FileName = $"FTPServerWinV10_{DateTime.Now:yyyyMMdd_HHmmss}.log";
            if (saveLogDialog.ShowDialog(this) != DialogResult.OK)
                return;

            try
            {
                var text = BuildLogText(lstLog.Items);
                File.WriteAllText(saveLogDialog.FileName, text);
                AddLog($"로그 저장됨: {saveLogDialog.FileName}");
                btnSaveLog.Text = "저장됨";
            }
            catch (Exception ex)
            {
                ErrorDialog.ShowError(this, "로그 저장 오류", "로그 파일을 저장하지 못했습니다.", ex,
                    $"경로: {saveLogDialog.FileName}");
            }
        }

        private static string BuildLogText(System.Collections.IEnumerable items) =>
            string.Join(Environment.NewLine, items.Cast<object>().Select(x => x.ToString() ?? ""));

        private void CopySelectedLogLines()
        {
            if (lstLog.SelectedItems.Count == 0)
            {
                CopyAllLogLines();
                return;
            }
            try
            {
                Clipboard.SetText(BuildLogText(lstLog.SelectedItems));
            }
            catch (Exception ex)
            {
                ErrorDialog.ShowError(this, "복사 오류", "선택한 로그를 클립보드에 복사하지 못했습니다.", ex);
            }
        }

        private void CopyAllLogLines()
        {
            if (lstLog.Items.Count == 0) return;
            try
            {
                Clipboard.SetText(BuildLogText(lstLog.Items));
                btnCopyLog.Text = "복사됨";
            }
            catch (Exception ex)
            {
                ErrorDialog.ShowError(this, "복사 오류", "로그를 클립보드에 복사하지 못했습니다.", ex);
            }
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
        /// <summary>목록 UI의 내용을 내부 모델과 동기화한 뒤 전체 설정 스냅샷을 만듭니다.</summary>
        private void SyncUiToModel()
        {
            _sharedFolders.Clear();
            foreach (ListViewItem item in lvFolders.Items)
            {
                var physical = item.SubItems.Count > 1 ? item.SubItems[1].Text : "";
                _sharedFolders.Add(new Server.SharedFolderEntry
                {
                    VirtualName = item.Text,
                    PhysicalPath = physical
                });
            }

            _users.Clear();
            foreach (ListViewItem item in lvUsers.Items)
            {
                if (item.Tag is Server.UserEntry u)
                    _users.Add(CloneUserEntry(u));
            }
        }

        private static Server.UserEntry CloneUserEntry(Server.UserEntry u) => new()
        {
            Username = u.Username,
            Password = u.Password,
            CanRead = u.CanRead,
            CanWrite = u.CanWrite
        };

        private Server.ServerSettings BuildSettings()
        {
            SyncUiToModel();
            return new Server.ServerSettings
            {
                SettingsVersion = Server.ServerSettings.CurrentSettingsVersion,
                SharedFolders = _sharedFolders.Select(f => new Server.SharedFolderEntry
                {
                    VirtualName = f.VirtualName,
                    PhysicalPath = f.PhysicalPath
                }).ToList(),
                CertPath = txtCertPath.Text.Trim(),
                CertPassword = txtCertPw.Text,
                SftpHostKeyPath = txtSftpHostKeyPath.Text.Trim(),
                AllowAnonymous = chkAnonymous.Checked,
                Users = _users.Select(CloneUserEntry).ToList(),
                BufferSizeKb = (int)numBuffer.Value,
                MaxThreads = (int)numThreads.Value,
                Protocols = new Server.ProtocolSettings
                {
                    EnableFtp = chkEnableFtp.Checked,
                    EnableFtps = chkEnableFtps.Checked,
                    EnableSftp = chkEnableSftp.Checked,
                    FtpPort = (int)numFtpPort.Value,
                    FtpsPort = (int)numFtpsPort.Value,
                    SftpPort = (int)numSftpPort.Value
                }
            };
        }

        private static string FormatProfileSaveSummary(string name, Server.ServerSettings s)
        {
            var proto = s.Protocols ?? new Server.ProtocolSettings();
            var protocols = new List<string>();
            if (proto.EnableFtp) protocols.Add($"FTP:{proto.FtpPort}");
            if (proto.EnableFtps) protocols.Add($"FTPS:{proto.FtpsPort}");
            if (proto.EnableSftp) protocols.Add($"SFTP:{proto.SftpPort}");
            return $"프로파일 '{name}' 저장 완료 — 공유 {s.SharedFolders.Count}개, 사용자 {s.Users.Count}명, " +
                   $"익명 {(s.AllowAnonymous ? "허용" : "거부")}, 프로토콜 [{string.Join(", ", protocols)}]";
        }

        private void ApplySettings(Server.ServerSettings s)
        {
            s = Server.ServerSettings.Normalize(s);
            _sharedFolders = s.SharedFolders.Select(f => new Server.SharedFolderEntry
            {
                VirtualName = f.VirtualName,
                PhysicalPath = f.PhysicalPath
            }).ToList();
            lvFolders.Items.Clear();
            foreach (var entry in _sharedFolders)
            {
                var item = new ListViewItem(entry.VirtualName);
                item.SubItems.Add(entry.PhysicalPath);
                lvFolders.Items.Add(item);
            }

            _users = s.Users.Select(CloneUserEntry).ToList();
            lvUsers.Items.Clear();
            foreach (var u in _users)
                lvUsers.Items.Add(CreateUserListItem(u));

            txtCertPath.Text         = s.CertPath;
            txtCertPw.Text           = s.CertPassword;
            txtSftpHostKeyPath.Text  = string.IsNullOrWhiteSpace(s.SftpHostKeyPath)
                ? Server.SftpHostKeyManager.DefaultKeyPath
                : s.SftpHostKeyPath;
            RefreshSftpHostKeyUi();
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
            {
                sb.AppendLine($"SFTP : 포트 {(int)numSftpPort.Value}");
                sb.AppendLine($"       호스트 키: {txtSftpHostKeyPath.Text.Trim()}");
            }
            sb.AppendLine($"익명 접속: {(chkAnonymous.Checked ? "허용" : "거부")}");
            sb.AppendLine($"사용자 수: {_users.Count}");
            sb.AppendLine();
            sb.AppendLine("── 공유 폴더 ──");
            foreach (var f in _sharedFolders)
                sb.AppendLine($"  /{f.VirtualName} → {f.PhysicalPath}");
            sb.AppendLine();
            sb.AppendLine("포트가 다른 프로그램에서 사용 중이면 시작에 실패할 수 있습니다.");
            sb.AppendLine("SFTP는 FTPS와 달리 SSH 호스트 키를 사용합니다. 서버 설정에서 키를 생성·확인하세요.");
            return sb.ToString();
        }
    }
}
