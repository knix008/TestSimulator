using System.Collections.Concurrent;
using System.Net;
using FxSsh;
using FxSsh.Services;

namespace FTPServerWinV10.Server
{
    /// <summary>
    /// SFTP 서버 (SSH subsystem). 공유 폴더는 시작 시 junction 루트로 노출합니다.
    /// </summary>
    public sealed class SftpServerManager : IDisposable
    {
        private readonly VirtualFileSystem _vfs;
        private readonly int _port;
        private SshServer? _sshServer;
        private string? _sftpRoot;
        private int _clientCount;
        private readonly ConcurrentDictionary<Session, SessionPermissions> _permissionsBySession = new();

        public bool AllowAnonymous { get; set; } = true;
        public List<UserEntry> Users { get; set; } = new();

        public event Action<string>? OnLog;
        public event Action<int>? OnClientCountChanged;

        public SftpServerManager(VirtualFileSystem vfs, int port = 22)
        {
            _vfs = vfs;
            _port = port;
        }

        public void Start()
        {
            if (_sshServer != null) return;

            _sftpRoot = BuildSftpRoot();
            var hostKeyPem = EnsureHostKey();

            _sshServer = new SshServer(new StartingInfo(IPAddress.Any, _port, "SSH-2.0-FTPServerWinV10"));
            _sshServer.AddHostKey("rsa-sha2-256", hostKeyPem);
            _sshServer.AddHostKey("rsa-sha2-512", hostKeyPem);
            _sshServer.ConnectionAccepted += OnConnectionAccepted;
            _sshServer.Start();

            OnLog?.Invoke($"SFTP 서버 시작 (포트: {_port}, 루트: {_sftpRoot})");
        }

        public void Stop()
        {
            if (_sshServer == null) return;
            try { _sshServer.Stop(); }
            catch (Exception ex) { OnLog?.Invoke($"SFTP 중지 오류: {ex.Message}"); }
            _sshServer = null;
            _clientCount = 0;
            OnClientCountChanged?.Invoke(0);
            CleanupSftpRoot();
            OnLog?.Invoke("SFTP 서버 중지됨");
        }

        public void Dispose() => Stop();

        private string BuildSftpRoot()
        {
            if (_vfs.IsSingleMount)
            {
                var only = _vfs.Resolve("/");
                if (only != null) return only;
            }

            var root = Path.Combine(
                Path.GetTempPath(),
                "FTPServerWinV10_sftp_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(root);

            foreach (var name in _vfs.VirtualNames)
            {
                var physical = _vfs.Resolve("/" + name);
                if (physical == null || !Directory.Exists(physical)) continue;
                var linkPath = Path.Combine(root, name);
                SftpRootHelper.CreateDirectoryJunction(linkPath, physical);
            }
            return root;
        }

        private void CleanupSftpRoot()
        {
            if (string.IsNullOrEmpty(_sftpRoot)) return;
            SftpRootHelper.TryCleanupJunctionRoot(_sftpRoot);
            _sftpRoot = null;
        }

        private static string EnsureHostKey()
        {
            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "FTPServerWinV10");
            Directory.CreateDirectory(dir);
            var path = Path.Combine(dir, "ssh_host_rsa.pem");
            if (!File.Exists(path))
                File.WriteAllText(path, KeyGenerator.GenerateRsaKeyPem(2048));
            return File.ReadAllText(path);
        }

        private void OnConnectionAccepted(object? sender, Session session)
        {
            Interlocked.Increment(ref _clientCount);
            OnClientCountChanged?.Invoke(_clientCount);
            OnLog?.Invoke("SFTP 클라이언트 접속");

            session.ServiceRegistered += (_, service) => OnServiceRegistered(service);
        }

        private void OnServiceRegistered(SshService service)
        {
            if (service is UserAuthService auth)
                auth.UserAuth += OnUserAuth;
            else if (service is ConnectionService conn)
                conn.CommandOpened += (_, e) => OnCommandOpened(e);
        }

        private void OnUserAuth(object? sender, UserAuthArgs e)
        {
            e.Result = UserAuthHelper.TryAuthenticate(
                e.Username, e.Password, AllowAnonymous, Users, out var perms);
            if (e.Result)
                _permissionsBySession[e.Session] = perms;
        }

        private void OnCommandOpened(CommandRequestedArgs e)
        {
            if (e.ShellType == "subsystem" &&
                e.CommandText.Equals("sftp", StringComparison.OrdinalIgnoreCase))
            {
                e.Agreed = true;
                if (_sftpRoot == null) return;

                var perms = SessionPermissions.DenyAll;
                if (e.AttachedUserAuthArgs?.Session != null)
                    _permissionsBySession.TryGetValue(e.AttachedUserAuthArgs.Session, out perms);

                var sftp = new SftpFxService(_sftpRoot, perms);
                e.Channel.DataReceived += (_, data) => sftp.OnData(data);
                e.Channel.CloseReceived += (_, _) =>
                {
                    sftp.OnClose();
                    Interlocked.Decrement(ref _clientCount);
                    OnClientCountChanged?.Invoke(_clientCount);
                    OnLog?.Invoke("SFTP 클라이언트 종료");
                };
                sftp.DataReceived += (_, data) => e.Channel.SendData(data);
                return;
            }

            // shell / exec 등은 허용하지 않음
            e.Agreed = false;
        }
    }

    internal static class SftpRootHelper
    {
        internal static void CreateDirectoryJunction(string junctionPath, string targetPath)
        {
            if (Directory.Exists(junctionPath)) return;
            var psi = new System.Diagnostics.ProcessStartInfo("cmd.exe",
                $"/c mklink /J \"{junctionPath}\" \"{targetPath}\"")
            {
                CreateNoWindow = true,
                UseShellExecute = false
            };
            using var proc = System.Diagnostics.Process.Start(psi)
                ?? throw new InvalidOperationException("junction 프로세스를 시작할 수 없습니다.");
            proc.WaitForExit(5000);
            if (!Directory.Exists(junctionPath))
                throw new InvalidOperationException(
                    $"SFTP junction 생성 실패 ({junctionPath}). 관리자 권한이 필요할 수 있습니다.");
        }

        internal static void TryCleanupJunctionRoot(string root)
        {
            if (!Directory.Exists(root)) return;
            try
            {
                foreach (var dir in Directory.GetDirectories(root))
                {
                    try { Directory.Delete(dir); } catch { }
                }
                Directory.Delete(root, false);
            }
            catch { }
        }
    }
}
