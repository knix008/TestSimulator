using System.Collections.Concurrent;
using System.Net;
using FxSsh;
using FxSsh.Services;

namespace FTPServerWinV10.Server
{
    /// <summary>
    /// SFTP 서버 (SSH subsystem). FTP와 동일한 <see cref="VirtualFileSystem"/> 경로를 사용합니다.
    /// </summary>
    public sealed class SftpServerManager : IDisposable
    {
        private readonly VirtualFileSystem _vfs;
        private readonly int _port;
        private SshServer? _sshServer;
        private int _clientCount;
        private readonly ConcurrentDictionary<Session, SessionPermissions> _permissionsBySession = new();

        public bool AllowAnonymous { get; set; } = true;
        public List<UserEntry> Users { get; set; } = new();
        public string? HostKeyPath { get; set; }

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
            if (!_vfs.HasMounts)
                throw new InvalidOperationException("공유 폴더가 하나 이상 필요합니다.");

            var hostKeyPem = SftpHostKeyManager.EnsureHostKey(HostKeyPath);
            var keyPath = string.IsNullOrWhiteSpace(HostKeyPath)
                ? SftpHostKeyManager.DefaultKeyPath
                : HostKeyPath.Trim();

            _sshServer = new SshServer(new StartingInfo(IPAddress.Any, _port, "SSH-2.0-FTPServerWinV10"));
            _sshServer.AddHostKey("rsa-sha2-256", hostKeyPem);
            _sshServer.AddHostKey("rsa-sha2-512", hostKeyPem);
            _sshServer.ConnectionAccepted += OnConnectionAccepted;
            _sshServer.Start();

            OnLog?.Invoke($"SFTP 서버 시작 (포트: {_port}, 호스트 키: {keyPath})");
            OnLog?.Invoke($"SFTP 호스트 키 지문: {SftpHostKeyManager.GetSha256Fingerprint(keyPath)}");
        }

        public void Stop()
        {
            if (_sshServer == null) return;
            try { _sshServer.Stop(); }
            catch (Exception ex) { OnLog?.Invoke($"SFTP 중지 오류: {ex.Message}"); }
            _sshServer = null;
            _clientCount = 0;
            OnClientCountChanged?.Invoke(0);
            OnLog?.Invoke("SFTP 서버 중지됨");
        }

        public void Dispose() => Stop();

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
            {
                auth.EnableNoneAuth = true;
                auth.UserAuth += OnUserAuth;
            }
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
                var perms = ResolveSessionPermissions(e.AttachedUserAuthArgs);

                var sftp = new SftpFxService(_vfs, perms, msg => OnLog?.Invoke(msg));
                e.Channel.DataReceived += (_, data) => sftp.OnData(data);
                e.Channel.CloseReceived += (_, _) =>
                {
                    sftp.OnClose();
                    Interlocked.Decrement(ref _clientCount);
                    OnClientCountChanged?.Invoke(_clientCount);
                    OnLog?.Invoke("SFTP 클라이언트 종료");
                };
                sftp.DataReceived += (_, data) =>
                {
                    try
                    {
                        e.Channel.SendData(data);
                    }
                    catch (Exception ex)
                    {
                        OnLog?.Invoke($"SFTP 응답 전송 오류: {ex.Message}");
                    }
                };
                return;
            }

            e.Agreed = false;
        }

        private SessionPermissions ResolveSessionPermissions(UserAuthArgs? auth)
        {
            if (auth == null)
                return SessionPermissions.DenyAll;

            if (_permissionsBySession.TryGetValue(auth.Session, out var perms))
                return perms;

            if (UserAuthHelper.TryAuthenticate(
                    auth.Username, auth.Password, AllowAnonymous, Users, out perms))
                _permissionsBySession[auth.Session] = perms;

            return perms;
        }
    }
}
