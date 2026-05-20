using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
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
        // ── Transfer buttons drag state ──────────────────────────────────────
        private bool    _isResizing;
        private int     _dragStartX;
        private int     _dragStartServerWidth;
        private Bitmap? _bmpArrowUp;
        private Bitmap? _bmpArrowDown;
        private bool    _loadingPath;

        private static readonly Bitmap _errorIconBmp = SystemIcons.Error.ToBitmap();

        // ── Connection state ─────────────────────────────────────────────────
        private AsyncFtpClient? _ftp;
        private SftpClient?     _sftp;
        private bool            _isConnected;
        private string          _serverPath = "/";
        private string          _localPath;
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
            splitMain.Panel1MinSize = 150;
            splitMain.Panel2MinSize = 90;
            splitMain.SplitterDistance = Math.Max(150, (int)(ClientSize.Height * 0.65));
            // 서버/로컬 패널 동일 너비로 초기화
            panelServer.Width = Math.Max(100, (panelFilesContainer.Width - 60) / 2);

            // 디자이너 재생성 시 SelectedIndex가 초기화될 수 있으므로 보호
            if (comboProtocol.SelectedIndex < 0)
                comboProtocol.SelectedIndex = 0;

            UpdateConnectButton(false);
            LoadFileIcons();
            SetupContextMenus();
            SetupTransferButtons();

            treeViewServer.NodeMouseDoubleClick += TreeViewServer_DoubleClick;
            treeViewLocal.NodeMouseDoubleClick  += TreeViewLocal_DoubleClick;
            treeViewServer.MouseDown  += TreeView_MouseDown;
            treeViewLocal.MouseDown   += TreeView_MouseDown;
            treeViewLocal.BeforeExpand  += TreeViewLocal_BeforeExpand;
            treeViewServer.AfterSelect  += TreeViewServer_AfterSelect;
            treeViewLocal.AfterSelect   += TreeViewLocal_AfterSelect;

            InitLocalTree();
            SetStatus("준비됨");
            AppendLog("준비됨.");
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            base.OnFormClosing(e);
            _settings.Save();           // 마지막 로컬 경로 저장
            _bmpArrowUp?.Dispose();     // GDI 비트맵 해제
            _bmpArrowDown?.Dispose();
            var ftp  = _ftp;
            var sftp = _sftp;
            _ftp  = null;
            _sftp = null;
            Task.Run(() =>
            {
                try { ftp?.Dispose(); }  catch { }
                try { sftp?.Dispose(); } catch { }
            });
        }

        // ── Shell file icons ─────────────────────────────────────────────────
        private void LoadFileIcons()
        {
            TryAddIcon("folder", "",     isFolder: true);
            TryAddIcon("file",   "",     isFolder: false);
            foreach (var ext in new[] { ".txt", ".jpg", ".zip", ".exe", ".cs", ".xml", ".pdf", ".mp3", ".mp4" })
                TryAddIcon(ext, ext, isFolder: false);

            // 드라이브별 실제 아이콘 (C:\, D:\, 네트워크 드라이브 등)
            foreach (var drive in DriveInfo.GetDrives().Where(d => d.IsReady))
                EnsureDriveIcon(drive);
        }

        private void TryAddIcon(string key, string ext, bool isFolder)
        {
            try
            {
                using var bmp = NativeMethods.GetShellIcon(ext, isFolder);
                imageListFiles.Images.Add(key, bmp);   // ImageList가 내부 복사본 생성
            }
            catch { }
        }

        private string EnsureDriveIcon(DriveInfo drive)
        {
            var key = $"drive_{drive.Name[0]}";
            if (!imageListFiles.Images.ContainsKey(key))
            {
                try
                {
                    using var bmp = NativeMethods.GetShellIconForPath(drive.RootDirectory.FullName);
                    imageListFiles.Images.Add(key, bmp);
                }
                catch { return "folder"; }
            }
            return key;
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
            var ctxServer = new ContextMenuStrip(components); // components 등록 → 폼 Dispose 시 자동 해제
            ctxServer.Items.Add("다운로드",   null, async (_, _) => await DownloadSelectedAsync());
            ctxServer.Items.Add(new ToolStripSeparator());
            ctxServer.Items.Add("새로 고침", null, async (_, _) => await RefreshServerNodeAsync());
            treeViewServer.ContextMenuStrip = ctxServer;

            var ctxLocal = new ContextMenuStrip(components);
            ctxLocal.Items.Add("업로드",          null, async (_, _) => await UploadSelectedAsync());
            ctxLocal.Items.Add(new ToolStripSeparator());
            ctxLocal.Items.Add("새로 고침",       null, (_, _) => RefreshLocalNode());
            ctxLocal.Items.Add("탐색기에서 열기", null, (_, _) => System.Diagnostics.Process.Start("explorer.exe", _localPath));
            treeViewLocal.ContextMenuStrip = ctxLocal;
        }

        // ── Transfer buttons (panelSplitterBar에 직접 배치, 수직 중앙) ───────
        private void SetupTransferButtons()
        {
            var tip = new ToolTip(components); // components 등록 → 폼 Dispose 시 자동 해제
            int bw = btnTransferUp.Width, bh = btnTransferUp.Height;

            // ← 업로드 버튼 아이콘 (필드에 저장 → OnFormClosing에서 Dispose)
            _bmpArrowUp              = MakeArrowBitmap(bw - 6, bh - 4, left: true,
                                           Color.FromArgb(25, 90, 25));
            btnTransferUp.Image      = _bmpArrowUp;
            btnTransferUp.ImageAlign = ContentAlignment.MiddleCenter;
            btnTransferUp.BackColor  = Color.FromArgb(210, 238, 210);
            btnTransferUp.FlatAppearance.BorderColor        = Color.FromArgb(130, 190, 130);
            btnTransferUp.FlatAppearance.MouseOverBackColor = Color.FromArgb(155, 215, 155);
            tip.SetToolTip(btnTransferUp, "업로드  ←  로컬 → 서버");

            // → 다운로드 버튼 아이콘
            _bmpArrowDown              = MakeArrowBitmap(bw - 6, bh - 4, left: false,
                                             Color.FromArgb(20, 45, 120));
            btnTransferDown.Image      = _bmpArrowDown;
            btnTransferDown.ImageAlign = ContentAlignment.MiddleCenter;
            btnTransferDown.BackColor  = Color.FromArgb(210, 225, 248);
            btnTransferDown.FlatAppearance.BorderColor        = Color.FromArgb(130, 160, 215);
            btnTransferDown.FlatAppearance.MouseOverBackColor = Color.FromArgb(160, 190, 235);
            tip.SetToolTip(btnTransferDown, "다운로드  →  서버 → 로컬");

            // 초기 위치 + 창 크기 변경 시 재배치
            CenterTransferButtons();
            panelSplitterBar.SizeChanged += (_, _) => CenterTransferButtons();

            // panelSplitterBar 드래그 리사이즈
            panelSplitterBar.MouseDown += (_, e) =>
            {
                if (e.Button != MouseButtons.Left) return;
                _isResizing           = true;
                _dragStartX           = Cursor.Position.X;
                _dragStartServerWidth = panelServer.Width;
            };
            panelSplitterBar.MouseMove += (_, _) =>
            {
                if (!_isResizing) return;
                var delta = Cursor.Position.X - _dragStartX;
                var maxW  = panelFilesContainer.Width - panelSplitterBar.Width - 80;
                panelServer.Width = Math.Max(80, Math.Min(maxW, _dragStartServerWidth + delta));
            };
            panelSplitterBar.MouseUp    += (_, _) => _isResizing = false;
            panelSplitterBar.MouseLeave += (_, _) => _isResizing = false;
        }

        private void CenterTransferButtons()
        {
            int bw    = btnTransferUp.Width;
            int bh    = btnTransferUp.Height;
            int gap   = 4;
            int total = bh * 2 + gap;
            int startY = Math.Max(2, (panelSplitterBar.Height - total) / 2);
            int x      = (panelSplitterBar.Width - bw) / 2;
            btnTransferUp.Location   = new Point(x, startY);
            btnTransferDown.Location = new Point(x, startY + bh + gap);
        }

        private async void BtnTransferUp_Click(object? sender, EventArgs e)   => await UploadSelectedAsync();
        private async void BtnTransferDown_Click(object? sender, EventArgs e) => await DownloadSelectedAsync();

        // GDI+로 화살표 비트맵 생성
        private static Bitmap MakeArrowBitmap(int w, int h, bool left, Color color)
        {
            var bmp = new Bitmap(w, h, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
            using var g = Graphics.FromImage(bmp);
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);
            int cx = w / 2, cy = h / 2;
            int ax = w / 2 - 1, ay = h / 2 - 1, ty = h / 5;
            Point[] pts = left
                ? new[] { new Point(cx-ax,cy), new Point(cx,cy-ay), new Point(cx,cy-ty),
                           new Point(cx+ax,cy-ty), new Point(cx+ax,cy+ty),
                           new Point(cx,cy+ty), new Point(cx,cy+ay) }
                : new[] { new Point(cx+ax,cy), new Point(cx,cy-ay), new Point(cx,cy-ty),
                           new Point(cx-ax,cy-ty), new Point(cx-ax,cy+ty),
                           new Point(cx,cy+ty), new Point(cx,cy+ay) };
            using var brush = new SolidBrush(color);
            g.FillPolygon(brush, pts);
            return bmp;
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

            btnConnect.Enabled     = false;
            statusProgress.Visible = true;
            SetStatus($"연결 중... {protocol}://{host}:{port}");
            AppendLog($"{protocol} 연결 시도 중...  host={host}  port={port}  user={user}");

            // 30초 전체 타임아웃 (소켓 레벨은 각 라이브러리에서 별도 설정)
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));

            try
            {
                await ConnectInternalAsync(protocol, host, port, user, pass, cts.Token)
                      .ConfigureAwait(true); // UI 스레드로 복귀

                _isConnected = true;
                UpdateConnectButton(true);
                PlaySuccessSound();
                SetStatus($"연결됨 — {protocol}://{host}:{port}");
                AppendLog($"연결 성공: {protocol}://{host}:{port}");

                MessageBox.Show(
                    $"연결이 완료되었습니다.\n\n프로토콜: {protocol}\n호스트: {host}\n포트: {port}\n사용자: {user}",
                    "연결 성공", MessageBoxButtons.OK, MessageBoxIcon.Information);

                InitServerTree();
            }
            catch (OperationCanceledException)
            {
                DisposeClients();
                PlayErrorSound();
                SetStatus("연결 시간 초과");
                AppendLog("연결 시간 초과 (30초)");
                ShowErrorDialog("연결 시간 초과", "30초 이내에 서버에 연결하지 못했습니다.\n호스트 주소와 포트를 확인하세요.");
            }
            catch (Exception ex)
            {
                DisposeClients();
                PlayErrorSound();
                SetStatus("연결 실패");
                AppendLog($"연결 실패: {ex.Message}");
                ShowErrorDialog("연결 오류", ex.Message);
            }
            finally
            {
                btnConnect.Enabled     = true;
                statusProgress.Visible = false;
            }
        }

        // 연결 로직을 별도 메서드로 분리 — UI 스레드에서 호출되지 않음
        private async Task ConnectInternalAsync(
            string protocol, string host, int port,
            string user, string pass, CancellationToken token)
        {
            if (protocol == "SFTP")
            {
                await Task.Run(() =>
                {
                    var sftp = new SftpClient(host, port, user, pass);
                    sftp.ConnectionInfo.Timeout = TimeSpan.FromSeconds(20);
                    // SSH.NET 기본 버퍼 32KB → 1MB: SFTP 전송속도 ~30배 향상
                    sftp.BufferSize = 1024 * 1024;
                    sftp.Connect();
                    _sftp = sftp;
                }).WaitAsync(token).ConfigureAwait(false);
            }
            else
            {
                var cfg = new FtpConfig
                {
                    EncryptionMode               = protocol == "FTPS"
                                                   ? FtpEncryptionMode.Explicit
                                                   : FtpEncryptionMode.None,
                    ValidateAnyCertificate       = true,
                    ConnectTimeout               = 20_000,
                    ReadTimeout                  = 20_000,
                    DataConnectionConnectTimeout  = 20_000,
                    // ── 전송 속도 최적화 ────────────────────────────────
                    UploadDataType               = FtpDataType.Binary,
                    DownloadDataType             = FtpDataType.Binary,
                    // 로컬 I/O 버퍼: 4KB → 4MB (디스크 읽기/쓰기 횟수 감소)
                    LocalFileBufferSize          = 4 * 1024 * 1024,
                    // 전송 청크: 64KB → 1MB (TCP 왕복 횟수 ~16배 감소, 대용량 파일 최적화)
                    TransferChunkSize            = 1 * 1024 * 1024,
                    // 연결 유지 (긴 전송 중 서버 타임아웃 방지)
                    SocketKeepAlive              = true,
                    // 전송 중 NOOP 없음 (순수 데이터 전송에 집중)
                    NoopInterval                 = 0,
                    // NAT/방화벽 친화적 수동 모드 우선
                    DataConnectionType           = FtpDataConnectionType.AutoPassive,
                    // 속도 제한 없음
                    UploadRateLimit              = 0,
                    DownloadRateLimit            = 0,
                };
                var ftp = new AsyncFtpClient(host, user, pass, port, cfg);
                await ftp.Connect(token).ConfigureAwait(false);
                _ftp = ftp;
            }
        }

        private void DisposeClients()
        {
            try { _ftp?.Dispose(); }  catch { }
            try { _sftp?.Dispose(); } catch { }
            _ftp  = null;
            _sftp = null;
        }

        private async Task DisconnectAsync()
        {
            try
            {
                if (_ftp  != null) await _ftp.Disconnect().ConfigureAwait(true);
                if (_sftp != null) await Task.Run(() => _sftp.Disconnect()).ConfigureAwait(true);
            }
            catch { }
            DisposeClients();

            _isConnected = false;
            UpdateConnectButton(false);
            treeViewServer.Nodes.Clear();
            _serverPath = "/";
            UpdateServerLabel();
            SetStatus("연결 해제됨");
            AppendLog("연결 해제됨.");
        }

        // ── Server tree (현재 디렉토리 평면 목록) ───────────────────────────

        private void InitServerTree()
        {
            _serverPath = "/";
            _ = LoadServerDirectoryAsync("/");
        }

        // 서버의 현재 경로 내용을 평면 목록으로 표시
        private async Task LoadServerDirectoryAsync(string path)
        {
            if (!_isConnected) return;

            SetStatus($"서버 로드 중: {path}");
            AppendLog($"서버 디렉토리: {path}");

            RemoteItem[] items;
            try
            {
                if (_ftp != null)
                {
                    var list = await _ftp.GetListing(path).ConfigureAwait(true);
                    items = list.Select(i => new RemoteItem(
                        i.Name, i.FullName,
                        i.Type == FtpObjectType.Directory ||
                        (i.Type == FtpObjectType.Link && i.LinkObject?.Type == FtpObjectType.Directory)))
                        .ToArray();
                }
                else if (_sftp != null)
                {
                    var list = await Task.Run(() =>
                        _sftp.ListDirectory(path)
                             .Where(f => f.Name != "." && f.Name != "..")
                             .ToArray()).ConfigureAwait(true);
                    items = list.Select(f => new RemoteItem(f.Name, f.FullName, f.IsDirectory)).ToArray();
                }
                else return;
            }
            catch (Exception ex)
            {
                AppendLog($"서버 목록 오류: {ex.Message}");
                ShowErrorDialog("디렉토리 조회 오류", ex.Message);
                SetStatus("서버 목록 조회 실패");
                return;
            }

            _serverPath = path;
            UpdateServerLabel();

            treeViewServer.BeginUpdate();
            treeViewServer.Nodes.Clear();
            try
            {
                // 상위 폴더 이동 노드
                if (path != "/" && path.Length > 0)
                    treeViewServer.Nodes.Add(MakeNode("[..]", GetServerParent(path), true, isParent: true));

                foreach (var item in items
                    .OrderBy(i => i.IsDirectory ? 0 : 1)
                    .ThenBy(i => i.Name, StringComparer.OrdinalIgnoreCase))
                    treeViewServer.Nodes.Add(MakeNode(item.Name, item.FullPath, item.IsDirectory));
            }
            finally { treeViewServer.EndUpdate(); }

            SetStatus($"서버: {path}  ({items.Length}개 항목)");
        }

        private async Task RefreshServerNodeAsync() =>
            await LoadServerDirectoryAsync(_serverPath).ConfigureAwait(true);

        private void TreeViewServer_AfterSelect(object? sender, TreeViewEventArgs e)
        {
            if (e.Node?.Tag is not NodeInfo info) return;
            if (info.IsDirectory && !info.IsParent)
                _serverPath = info.Path;
            UpdateServerLabel();
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

        // ── Local tree (hierarchical with drives) ────────────────────────────

        private void InitLocalTree()
        {
            treeViewLocal.BeginUpdate();
            treeViewLocal.Nodes.Clear();

            foreach (var drive in DriveInfo.GetDrives().Where(d => d.IsReady))
            {
                var iconKey = EnsureDriveIcon(drive);
                var label   = string.IsNullOrEmpty(drive.VolumeLabel)
                    ? drive.Name
                    : $"{drive.VolumeLabel} ({drive.Name.TrimEnd('\\')})";

                var node = new TreeNode(label)
                {
                    Tag              = new NodeInfo(drive.RootDirectory.FullName, true),
                    ImageKey         = iconKey,
                    SelectedImageKey = iconKey
                };
                node.Nodes.Add(Placeholder());
                treeViewLocal.Nodes.Add(node);
            }

            treeViewLocal.EndUpdate();
            ExpandToLocalPath(_localPath);
        }

        private void ExpandToLocalPath(string targetPath)
        {
            if (!Directory.Exists(targetPath)) return;

            var root = Path.GetPathRoot(targetPath) ?? "";
            var driveNode = treeViewLocal.Nodes.Cast<TreeNode>()
                .FirstOrDefault(n => n.Tag is NodeInfo ni &&
                                     ni.Path.TrimEnd('\\').Equals(root.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase));
            if (driveNode == null) return;

            // _loadingPath = true → BeforeExpand이 동기 로드 사용
            // (초기 경로 복원 시에만 — 사용자가 트리를 보기 전이므로 동기 OK)
            _loadingPath = true;
            try
            {
                driveNode.Expand();

                var parts   = targetPath.Split(Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries);
                var cur     = driveNode;
                var curPath = root;

                for (int i = 1; i < parts.Length; i++)
                {
                    curPath = Path.Combine(curPath, parts[i]);
                    var child = cur.Nodes.Cast<TreeNode>()
                        .FirstOrDefault(n => n.Tag is NodeInfo ni && ni.IsDirectory &&
                                             ni.Path.TrimEnd('\\').Equals(curPath.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase));
                    if (child == null) break;
                    child.Expand();
                    cur = child;
                }

                treeViewLocal.SelectedNode = cur;
                cur.EnsureVisible();
            }
            finally { _loadingPath = false; }
        }

        private void TreeViewLocal_BeforeExpand(object? sender, TreeViewCancelEventArgs e)
        {
            var node = e.Node;
            if (node?.Tag is not NodeInfo info || !info.IsDirectory) return;
            if (!HasPlaceholder(node)) return;

            node.Nodes.Clear();
            if (_loadingPath)
                LoadLocalChildNodes(node, info.Path);   // 경로 복원 시 동기 (UI 미표시 상태)
            else
                LoadLocalChildNodesAsync(node, info.Path); // 사용자 확장 시 비동기
        }

        // 경로 복원(ExpandToLocalPath) 전용 동기 버전 — UI 스레드에서 호출되지만
        // _loadingPath=true 구간은 폼 최초 표시 직후이므로 수십ms 허용 범위
        private void LoadLocalChildNodes(TreeNode parent, string path)
        {
            parent.TreeView?.BeginUpdate();
            try
            {
                foreach (var dir in Directory.GetDirectories(path)
                    .OrderBy(d => Path.GetFileName(d), StringComparer.OrdinalIgnoreCase))
                {
                    var node = MakeNode(Path.GetFileName(dir), dir, true);
                    node.Nodes.Add(Placeholder());
                    parent.Nodes.Add(node);
                }
                foreach (var file in Directory.GetFiles(path)
                    .OrderBy(f => Path.GetFileName(f), StringComparer.OrdinalIgnoreCase))
                    parent.Nodes.Add(MakeNode(Path.GetFileName(file), file, false));
            }
            catch (UnauthorizedAccessException)
            {
                parent.Nodes.Add(new TreeNode("[접근 거부]") { ForeColor = Color.Gray });
            }
            catch { }
            finally { parent.TreeView?.EndUpdate(); }
        }

        // 사용자 트리 확장/새로 고침 전용 비동기 버전 — UI 스레드 블로킹 없음
        private void LoadLocalChildNodesAsync(TreeNode node, string path)
        {
            node.Nodes.Add(new TreeNode("로딩 중...") { ForeColor = Color.Gray });

            Task.Run(() =>
            {
                try
                {
                    var dirs  = Directory.GetDirectories(path)
                                         .OrderBy(d => Path.GetFileName(d), StringComparer.OrdinalIgnoreCase)
                                         .ToArray();
                    var files = Directory.GetFiles(path)
                                         .OrderBy(f => Path.GetFileName(f), StringComparer.OrdinalIgnoreCase)
                                         .ToArray();
                    return (dirs, files, (string?)null);
                }
                catch (UnauthorizedAccessException) { return (Array.Empty<string>(), Array.Empty<string>(), "접근 거부"); }
                catch (Exception ex)                { return (Array.Empty<string>(), Array.Empty<string>(), ex.Message); }
            }).ContinueWith(t =>
            {
                if (IsDisposed || node.TreeView == null) return;
                BeginInvoke(() =>
                {
                    node.TreeView?.BeginUpdate();
                    node.Nodes.Clear();
                    var (dirs, files, error) = t.Result;
                    if (error != null)
                    {
                        node.Nodes.Add(new TreeNode($"[{error}]") { ForeColor = Color.Gray });
                    }
                    else
                    {
                        foreach (var dir in dirs)
                        {
                            var child = MakeNode(Path.GetFileName(dir), dir, true);
                            child.Nodes.Add(Placeholder());
                            node.Nodes.Add(child);
                        }
                        foreach (var file in files)
                            node.Nodes.Add(MakeNode(Path.GetFileName(file), file, false));
                    }
                    node.TreeView?.EndUpdate();
                });
            });
        }

        // 컨텍스트 메뉴 "새로 고침" — 선택된 노드 갱신
        private void RefreshLocalNode()
        {
            var node = treeViewLocal.SelectedNode;
            if (node?.Tag is not NodeInfo info || !info.IsDirectory) return;
            RefreshLocalNodeInternal(node, info.Path);
        }

        // 다운로드 완료 후 저장 경로를 갱신 — 선택 여부와 무관하게 동작
        private void RefreshLocalPath(string targetPath)
        {
            var node = FindLocalNode(treeViewLocal.Nodes, targetPath);
            if (node == null) return;
            if (node.Tag is not NodeInfo info) return;
            RefreshLocalNodeInternal(node, info.Path);
        }

        private void RefreshLocalNodeInternal(TreeNode node, string path)
        {
            if (HasPlaceholder(node)) return; // 아직 한 번도 펼치지 않은 노드는 건너뜀

            var wasExpanded = node.IsExpanded;
            node.Nodes.Clear();
            if (wasExpanded)
            {
                LoadLocalChildNodesAsync(node, path);
                node.Expand();
            }
            else
            {
                node.Nodes.Add(Placeholder());
            }
        }

        // 트리에서 경로가 일치하는 노드를 찾음 (펼쳐진 노드만 탐색)
        private static TreeNode? FindLocalNode(TreeNodeCollection nodes, string path)
        {
            var target = path.TrimEnd('\\');
            foreach (TreeNode node in nodes)
            {
                if (node.Tag is NodeInfo info && info.IsDirectory &&
                    info.Path.TrimEnd('\\').Equals(target, StringComparison.OrdinalIgnoreCase))
                    return node;

                if (node.IsExpanded)
                {
                    var found = FindLocalNode(node.Nodes, path);
                    if (found != null) return found;
                }
            }
            return null;
        }

        private void TreeViewLocal_AfterSelect(object? sender, TreeViewEventArgs e)
        {
            if (e.Node?.Tag is not NodeInfo info) return;
            var newPath = info.IsDirectory
                ? info.Path
                : Path.GetDirectoryName(info.Path) ?? _localPath;

            if (Directory.Exists(newPath) && newPath != _localPath)
            {
                _localPath              = newPath;
                _settings.LastLocalPath = newPath;
                // Save()는 OnFormClosing에서 한 번만 — 클릭마다 파일 쓰기 방지
                lblLocal.Text = $"로컬 (Local)  │  {newPath}";
                SetStatus($"로컬: {newPath}");
            }
        }

        // ── Placeholder helpers ───────────────────────────────────────────────

        private static TreeNode Placeholder() => new("...");
        private static bool HasPlaceholder(TreeNode n) =>
            n.Nodes.Count == 1 && n.Nodes[0].Text == "...";

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
                await LoadServerDirectoryAsync(info.Path);   // 폴더 → 이동
            else
                await DownloadAsync(info.Path, isDirectory: false);  // 파일 → 다운로드
        }

        private async void TreeViewLocal_DoubleClick(object? sender, TreeNodeMouseClickEventArgs e)
        {
            if (e.Node?.Tag is not NodeInfo info || info.IsDirectory) return;
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
            ShowTransferProgress(0);

            var progress = ThrottledFtpProgress("다운로드", name);

            try
            {
                if (_ftp != null)
                {
                    if (isDirectory)
                        await _ftp.DownloadDirectory(localDest, serverPath,
                            FtpFolderSyncMode.Update, FtpLocalExists.Overwrite,
                            FtpVerify.None, null, progress);
                    else
                        await _ftp.DownloadFile(localDest, serverPath,
                            FtpLocalExists.Overwrite, FtpVerify.None, progress);
                }
                else if (_sftp != null)
                {
                    if (isDirectory)
                        await Task.Run(() => SftpDownloadDirectory(_sftp, serverPath, localDest)).ConfigureAwait(true);
                    else
                    {
                        var fileSize = await Task.Run(() => _sftp.GetAttributes(serverPath).Size).ConfigureAwait(true);
                        long sftpTick = 0;
                        await Task.Run(() =>
                        {
                            using var fs = File.Create(localDest, 4 * 1024 * 1024);
                            _sftp.DownloadFile(serverPath, fs, bytesDownloaded =>
                            {
                                long now = Environment.TickCount64;
                                if (now - sftpTick < 100) return;
                                sftpTick = now;
                                int pct = fileSize > 0 ? (int)((long)bytesDownloaded * 100 / fileSize) : 0;
                                BeginInvoke(() =>
                                {
                                    ShowTransferProgress(pct);
                                    SetStatus($"다운로드: {name}  {pct}%  ({bytesDownloaded / 1024} KB)");
                                });
                            });
                        }).ConfigureAwait(true);
                    }
                }

                ShowTransferProgress(100);
                PlaySuccessSound();
                AppendLog($"다운로드 완료: {name}");
                SetStatus($"다운로드 완료: {name}");
                RefreshLocalPath(_localPath); // 다운로드 저장 경로를 정확히 갱신
            }
            catch (Exception ex)
            {
                PlayErrorSound();
                AppendLog($"다운로드 실패: {ex.Message}");
                SetStatus("다운로드 실패");
                ShowErrorDialog("다운로드 오류", ex.Message);
            }
            finally
            {
                HideTransferProgress();
            }
        }

        private void SftpDownloadDirectory(SftpClient sftp, string remotePath, string localPath)
        {
            Directory.CreateDirectory(localPath);
            foreach (var entry in sftp.ListDirectory(remotePath)
                         .Where(f => f.Name != "." && f.Name != ".."))
            {
                var localItem = Path.Combine(localPath, entry.Name);
                if (entry.IsDirectory)
                    SftpDownloadDirectory(sftp, entry.FullName, localItem);
                else
                {
                    BeginInvoke(() => SetStatus($"다운로드: {entry.Name}"));
                    using var fs = File.Create(localItem, 4 * 1024 * 1024);
                    sftp.DownloadFile(entry.FullName, fs);
                }
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
            ShowTransferProgress(0);

            var progress = ThrottledFtpProgress("업로드", name);

            try
            {
                if (_ftp != null)
                {
                    if (isDirectory)
                        await _ftp.UploadDirectory(localPath, serverDest,
                            FtpFolderSyncMode.Update, FtpRemoteExists.Overwrite,
                            FtpVerify.None, null, progress);
                    else
                        await _ftp.UploadFile(localPath, serverDest,
                            FtpRemoteExists.Overwrite, false, FtpVerify.None, progress);
                }
                else if (_sftp != null)
                {
                    if (isDirectory)
                        await Task.Run(() => SftpUploadDirectory(_sftp, localPath, serverDest)).ConfigureAwait(true);
                    else
                    {
                        var fileSize = new FileInfo(localPath).Length;
                        long sftpTick = 0;
                        await Task.Run(() =>
                        {
                            using var fs = new FileStream(localPath, FileMode.Open, FileAccess.Read,
                                FileShare.Read, 4 * 1024 * 1024, FileOptions.SequentialScan);
                            _sftp.UploadFile(fs, serverDest, true, bytesUploaded =>
                            {
                                long now = Environment.TickCount64;
                                if (now - sftpTick < 100) return;
                                sftpTick = now;
                                int pct = fileSize > 0 ? (int)(bytesUploaded * 100 / (ulong)fileSize) : 0;
                                BeginInvoke(() =>
                                {
                                    ShowTransferProgress(pct);
                                    SetStatus($"업로드: {name}  {pct}%  ({bytesUploaded / 1024} KB)");
                                });
                            });
                        }).ConfigureAwait(true);
                    }
                }

                ShowTransferProgress(100);
                PlaySuccessSound();
                AppendLog($"업로드 완료: {name}");
                SetStatus($"업로드 완료: {name}");
                await RefreshServerNodeAsync();
            }
            catch (Exception ex)
            {
                PlayErrorSound();
                AppendLog($"업로드 실패: {ex.Message}");
                SetStatus("업로드 실패");
                ShowErrorDialog("업로드 오류", ex.Message);
            }
            finally
            {
                HideTransferProgress();
            }
        }

        private void SftpUploadDirectory(SftpClient sftp, string localPath, string remotePath)
        {
            if (!sftp.Exists(remotePath))
                sftp.CreateDirectory(remotePath);

            foreach (var file in Directory.GetFiles(localPath))
            {
                var remoteFile = remotePath + "/" + Path.GetFileName(file);
                BeginInvoke(() => SetStatus($"업로드: {Path.GetFileName(file)}"));
                using var fs = new FileStream(file, FileMode.Open, FileAccess.Read,
                    FileShare.Read, 4 * 1024 * 1024, FileOptions.SequentialScan);
                sftp.UploadFile(fs, remoteFile, true);
            }

            foreach (var dir in Directory.GetDirectories(localPath))
                SftpUploadDirectory(sftp, dir, remotePath + "/" + Path.GetFileName(dir));
        }

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
            if (profiles.Count == 0)
            {
                MessageBox.Show("저장된 프로파일이 없습니다.", "알림",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            // 전체 프로파일 목록을 보여주고 선택해서 삭제
            using var dlg = new Form
            {
                Text            = "프로파일 삭제",
                Width           = 360,
                Height          = 280,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                StartPosition   = FormStartPosition.CenterParent,
                MaximizeBox     = false,
                MinimizeBox     = false,
                Font            = Font
            };

            var lbl = new Label { Left = 12, Top = 10, Width = 320, Text = "삭제할 프로파일을 선택하세요:", AutoSize = true };
            var list = new ListBox
            {
                Left = 12, Top = 32, Width = 318, Height = 160,
                SelectionMode = SelectionMode.MultiExtended
            };
            foreach (var p in profiles)
                list.Items.Add(p.Name);

            var btnDel    = new Button { Text = "삭제",  Left = 155, Top = 204, Width = 80, Height = 28, DialogResult = DialogResult.OK };
            var btnCancel = new Button { Text = "취소", Left = 245, Top = 204, Width = 80, Height = 28, DialogResult = DialogResult.Cancel };

            dlg.Controls.AddRange(new Control[] { lbl, list, btnDel, btnCancel });
            dlg.AcceptButton = btnDel;
            dlg.CancelButton = btnCancel;

            if (dlg.ShowDialog(this) != DialogResult.OK || list.SelectedIndices.Count == 0)
                return;

            var selectedNames = list.SelectedItems.Cast<string>().ToList();
            if (MessageBox.Show(
                    $"선택한 {selectedNames.Count}개 프로파일을 삭제하시겠습니까?\n\n" +
                    string.Join("\n", selectedNames.Select(n => $"  • {n}")),
                    "삭제 확인", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
                return;

            profiles.RemoveAll(p => selectedNames.Contains(p.Name));
            SaveProfilesFile();
            comboProfile.SelectedIndex = -1;
            RefreshProfileCombo();
            AppendLog($"프로파일 삭제: {string.Join(", ", selectedNames)}");
        }

        // ── Transfer progress bar ────────────────────────────────────────────
        private void ShowTransferProgress(int pct)
        {
            statusProgress.Style   = ProgressBarStyle.Blocks;
            statusProgress.Value   = Math.Clamp(pct, 0, 100);
            statusProgress.Visible = true;
        }

        private void HideTransferProgress()
        {
            statusProgress.Visible = false;
            statusProgress.Style   = ProgressBarStyle.Marquee; // 다음 연결 시 복원
        }

        // ── Throttled progress ───────────────────────────────────────────────
        // Progress<T> 콜백은 UI 스레드에서 순차 실행되므로 lastTick 은 동기화 불필요.
        // 100ms 미만 간격 업데이트는 무시해 UI 오버헤드 제거 → 실제 전송에 CPU 집중.
        private IProgress<FtpProgress> ThrottledFtpProgress(string label, string name)
        {
            long lastTick = 0;
            return new Progress<FtpProgress>(p =>
            {
                long now = Environment.TickCount64;
                if (now - lastTick < 100) return;
                lastTick = now;
                int pct = (int)Math.Round(p.Progress);
                ShowTransferProgress(pct);
                SetStatus($"{label}: {name}  {pct}%  {FormatSpeed(p.TransferSpeed)}");
            });
        }

        // ── Sound helpers ─────────────────────────────────────────────────────
        // Console.Beep는 Windows 오디오 API를 직접 사용하므로
        // 사운드 스킴이 "(없음)"이어도 볼륨이 켜져 있으면 항상 소리가 남.
        private static void PlaySuccessSound() =>
            Task.Run(() => { try { Console.Beep(880, 120); Console.Beep(1100, 150); } catch { } });

        private static void PlayErrorSound() =>
            Task.Run(() => { try { Console.Beep(440, 350); } catch { } });

        // ── Speed helper ─────────────────────────────────────────────────────
        private static string FormatSpeed(double bytesPerSec)
        {
            if (bytesPerSec >= 1024 * 1024)
                return $"{bytesPerSec / 1024 / 1024:F1} MB/s";
            if (bytesPerSec >= 1024)
                return $"{bytesPerSec / 1024:F0} KB/s";
            return $"{bytesPerSec:F0} B/s";
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
            var icon = new PictureBox { Image = _errorIconBmp, SizeMode = PictureBoxSizeMode.StretchImage, Location = new Point(12, 14), Size = new Size(32, 32) };
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
