using System.Net;
using System.Net.Sockets;
using System.Text;

namespace FTPServerWinV10.Server
{
    public class FtpServerManager
    {
        public int BufferSizeKb   { get; set; } = 64;
        public int MaxThreads     { get; set; } = 4;
        public bool AllowAnonymous { get; set; } = true;
        public List<UserEntry> Users { get; set; } = new();

        protected readonly VirtualFileSystem _vfs;
        protected int _port;
        private TcpListener? _listener;
        private CancellationTokenSource? _cts;
        private int _clientCount = 0;

        public event Action<string>?       OnLog;
        public event Action<int>?          OnClientCountChanged;
        public event Action<string, long>? OnFileUploaded;
        public event Action<string, long>? OnFileDownloaded;

        public FtpServerManager(VirtualFileSystem vfs, int port = 21)
        {
            _vfs  = vfs;
            _port = port;
        }

        public virtual void Start()
        {
            _cts = new CancellationTokenSource();
            Task.Run(() => AcceptLoop(_cts.Token));
        }

        public virtual void Stop()
        {
            _cts?.Cancel();
            _listener?.Stop();
            _clientCount = 0;
            OnClientCountChanged?.Invoke(_clientCount);
            OnLog?.Invoke("FTP 서버 중지됨");
        }

        protected virtual Stream GetClientStream(TcpClient client) => client.GetStream();

        private async Task AcceptLoop(CancellationToken token)
        {
            try
            {
                _listener = new TcpListener(IPAddress.Any, _port);
                _listener.Start();
                OnLog?.Invoke($"FTP 서버 시작 (포트: {_port}, 마운트: {string.Join(", ", _vfs.VirtualNames)})");
                while (!token.IsCancellationRequested)
                {
                    var client = await _listener.AcceptTcpClientAsync(token);
                    _ = HandleClientAsync(client, token);
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception ex) { OnLog?.Invoke($"서버 오류: {ex.Message}"); }
        }

        private async Task HandleClientAsync(TcpClient client, CancellationToken token)
        {
            Interlocked.Increment(ref _clientCount);
            OnClientCountChanged?.Invoke(_clientCount);
            var endpoint = client.Client.RemoteEndPoint?.ToString() ?? "unknown";
            OnLog?.Invoke($"클라이언트 접속: {endpoint}");
            try
            {
                var localIp = ((IPEndPoint)client.Client.LocalEndPoint!).Address.ToString();
                var stream = GetClientStream(client);
                using var session = new FtpSession(stream, _vfs, AllowAnonymous, Users, BufferSizeKb, localIp);
                session.OnLog          += msg       => OnLog?.Invoke(msg);
                session.OnFileUploaded += (f, s)    => OnFileUploaded?.Invoke(f, s);
                session.OnFileDownloaded += (f, s)  => OnFileDownloaded?.Invoke(f, s);
                await session.ProcessAsync(token);
            }
            catch (Exception ex) { OnLog?.Invoke($"클라이언트 오류 [{endpoint}]: {ex.Message}"); }
            finally
            {
                Interlocked.Decrement(ref _clientCount);
                OnClientCountChanged?.Invoke(_clientCount);
                OnLog?.Invoke($"클라이언트 종료: {endpoint}");
                client.Close();
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    internal sealed class FtpSession : IDisposable
    {
        private readonly StreamReader _reader;
        private readonly StreamWriter _writer;
        private readonly VirtualFileSystem _vfs;
        private readonly bool _allowAnonymous;
        private readonly IReadOnlyList<UserEntry> _users;
        private readonly int    _bufferSizeKb;
        private readonly string _localIp;
        private string  _currentPath = "/";
        private bool    _authenticated;
        private string? _pendingUser;
        private TcpListener? _pasvListener;

        public event Action<string>?       OnLog;
        public event Action<string, long>? OnFileUploaded;
        public event Action<string, long>? OnFileDownloaded;

        public FtpSession(Stream stream, VirtualFileSystem vfs,
            bool allowAnonymous, IReadOnlyList<UserEntry> users,
            int bufferSizeKb, string localIp = "127.0.0.1")
        {
            _vfs            = vfs;
            _allowAnonymous = allowAnonymous;
            _users          = users;
            _bufferSizeKb   = bufferSizeKb;
            _localIp        = localIp;
            _reader = new StreamReader(stream, Encoding.ASCII, leaveOpen: true);
            _writer = new StreamWriter(stream, Encoding.ASCII, leaveOpen: true) { AutoFlush = true, NewLine = "\r\n" };
        }

        public async Task ProcessAsync(CancellationToken token)
        {
            Send("220 FTPServerWinV10 FTP Server Ready");
            while (!token.IsCancellationRequested)
            {
                var line = await _reader.ReadLineAsync(token);
                if (line == null) break;
                await HandleCommandAsync(line, token);
            }
        }

        private async Task HandleCommandAsync(string line, CancellationToken token)
        {
            var idx = line.IndexOf(' ');
            var cmd = (idx < 0 ? line : line[..idx]).ToUpperInvariant();
            var arg = idx < 0 ? "" : line[(idx + 1)..].Trim();

            switch (cmd)
            {
                case "USER": _pendingUser = arg; Send("331 Password required"); break;
                case "PASS":
                    if (_pendingUser?.ToLowerInvariant() == "anonymous" && _allowAnonymous)
                        { _authenticated = true; Send("230 Anonymous user logged in"); }
                    else if (_users.Any(u => u.Username == _pendingUser && u.Password == arg))
                        { _authenticated = true; Send("230 User logged in"); }
                    else
                        Send("530 Login incorrect");
                    break;
                case "SYST": Send("215 UNIX Type: L8"); break;
                case "FEAT":
                    Send("211-Features:"); Send(" PASV"); Send(" SIZE"); Send("211 End"); break;
                case "TYPE": Send("200 Type set"); break;
                case "NOOP": Send("200 OK"); break;
                case "QUIT": Send("221 Goodbye"); break;
                case "PWD":
                    if (!_authenticated) { Send("530 Not logged in"); break; }
                    Send($"257 \"{_currentPath}\" is current directory");
                    break;
                case "CWD":
                    if (!_authenticated) { Send("530 Not logged in"); break; }
                    HandleCwd(arg); break;
                case "CDUP":
                    if (!_authenticated) { Send("530 Not logged in"); break; }
                    HandleCwd(".."); break;
                case "PASV":
                    if (!_authenticated) { Send("530 Not logged in"); break; }
                    HandlePasv(); break;
                case "LIST":
                case "NLST":
                    if (!_authenticated) { Send("530 Not logged in"); break; }
                    await HandleListAsync(token); break;
                case "RETR":
                    if (!_authenticated) { Send("530 Not logged in"); break; }
                    await HandleRetrAsync(arg, token); break;
                case "STOR":
                    if (!_authenticated) { Send("530 Not logged in"); break; }
                    await HandleStorAsync(arg, token); break;
                case "SIZE":
                    if (!_authenticated) { Send("530 Not logged in"); break; }
                    HandleSize(arg); break;
                case "DELE":
                    if (!_authenticated) { Send("530 Not logged in"); break; }
                    HandleDele(arg); break;
                case "MKD":
                    if (!_authenticated) { Send("530 Not logged in"); break; }
                    HandleMkd(arg); break;
                case "RMD":
                    if (!_authenticated) { Send("530 Not logged in"); break; }
                    HandleRmd(arg); break;
                default:
                    Send($"502 Command '{cmd}' not implemented"); break;
            }
        }

        // ── Path helpers ──────────────────────────────────────────────────────────

        private string AbsoluteFtpPath(string arg)
        {
            if (string.IsNullOrEmpty(arg) || arg == ".")
                return _currentPath;
            return arg.StartsWith('/')
                ? VirtualFileSystem.NormalizePath(arg)
                : VirtualFileSystem.NormalizePath(_currentPath + "/" + arg);
        }

        private string? ResolveToPhysical(string arg) =>
            _vfs.Resolve(AbsoluteFtpPath(arg));

        // ── Command handlers ──────────────────────────────────────────────────────

        private void HandleCwd(string path)
        {
            var newPath = AbsoluteFtpPath(path);
            if (_vfs.DirectoryExists(newPath))
            {
                _currentPath = newPath;
                Send($"250 Directory changed to {_currentPath}");
            }
            else
            {
                Send("550 Directory not found");
            }
        }

        private void HandlePasv()
        {
            _pasvListener?.Stop();
            _pasvListener = new TcpListener(IPAddress.Any, 0);
            _pasvListener.Start();
            var port = ((IPEndPoint)_pasvListener.LocalEndpoint).Port;
            var ip = _localIp.Replace('.', ',');
            Send($"227 Entering Passive Mode ({ip},{port / 256},{port % 256})");
        }

        private async Task<TcpClient?> AcceptDataAsync(CancellationToken token)
        {
            if (_pasvListener == null) return null;
            try   { return await _pasvListener.AcceptTcpClientAsync(token); }
            finally { _pasvListener.Stop(); _pasvListener = null; }
        }

        private async Task HandleListAsync(CancellationToken token)
        {
            Send("150 Opening data connection");
            var dataClient = await AcceptDataAsync(token);
            if (dataClient == null) { Send("425 Can't open data connection"); return; }
            try
            {
                using var dw = new StreamWriter(dataClient.GetStream(), Encoding.ASCII)
                    { NewLine = "\r\n", AutoFlush = true };

                if (_currentPath == "/")
                {
                    // Virtual root: list all mount points as directories
                    foreach (var name in _vfs.VirtualNames)
                        dw.WriteLine($"drwxr-xr-x 2 ftp ftp 0 Jan 01 00:00 {name}");
                }
                else
                {
                    var physical = _vfs.Resolve(_currentPath);
                    if (physical != null && Directory.Exists(physical))
                    {
                        foreach (var dir in Directory.GetDirectories(physical))
                        {
                            var di = new DirectoryInfo(dir);
                            dw.WriteLine($"drwxr-xr-x 2 ftp ftp 0 {di.LastWriteTime:MMM dd HH:mm} {di.Name}");
                        }
                        foreach (var file in Directory.GetFiles(physical))
                        {
                            var fi = new FileInfo(file);
                            dw.WriteLine($"-rw-r--r-- 1 ftp ftp {fi.Length} {fi.LastWriteTime:MMM dd HH:mm} {fi.Name}");
                        }
                    }
                }
            }
            finally { dataClient.Close(); }
            Send("226 Transfer complete");
        }

        private async Task HandleRetrAsync(string fileName, CancellationToken token)
        {
            var localPath = ResolveToPhysical(fileName);
            if (localPath == null || !File.Exists(localPath)) { Send("550 File not found"); return; }
            Send("150 Opening data connection");
            var dataClient = await AcceptDataAsync(token);
            if (dataClient == null) { Send("425 Can't open data connection"); return; }
            try
            {
                long size = 0;
                using var ds = dataClient.GetStream();
                using var fs = File.OpenRead(localPath);
                var buf = new byte[_bufferSizeKb * 1024];
                int read;
                while ((read = await fs.ReadAsync(buf, 0, buf.Length, token)) > 0)
                {
                    await ds.WriteAsync(buf.AsMemory(0, read), token);
                    size += read;
                }
                OnFileDownloaded?.Invoke(Path.GetFileName(localPath), size);
            }
            finally { dataClient.Close(); }
            Send("226 Transfer complete");
        }

        private async Task HandleStorAsync(string fileName, CancellationToken token)
        {
            var localPath = ResolveToPhysical(fileName);
            if (localPath == null) { Send("553 Permission denied"); return; }
            Send("150 Opening data connection");
            var dataClient = await AcceptDataAsync(token);
            if (dataClient == null) { Send("425 Can't open data connection"); return; }
            try
            {
                long size = 0;
                using var ds = dataClient.GetStream();
                using var fs = File.Create(localPath);
                var buf = new byte[_bufferSizeKb * 1024];
                int read;
                while ((read = await ds.ReadAsync(buf, 0, buf.Length, token)) > 0)
                {
                    await fs.WriteAsync(buf.AsMemory(0, read), token);
                    size += read;
                }
                OnFileUploaded?.Invoke(Path.GetFileName(localPath), size);
            }
            finally { dataClient.Close(); }
            Send("226 Transfer complete");
        }

        private void HandleSize(string fileName)
        {
            var p = ResolveToPhysical(fileName);
            if (p != null && File.Exists(p)) Send($"213 {new FileInfo(p).Length}");
            else Send("550 File not found");
        }

        private void HandleDele(string fileName)
        {
            var p = ResolveToPhysical(fileName);
            if (p != null && File.Exists(p)) { File.Delete(p); Send("250 File deleted"); }
            else Send("550 File not found");
        }

        private void HandleMkd(string dirName)
        {
            var p = ResolveToPhysical(dirName);
            if (p != null) { Directory.CreateDirectory(p); Send($"257 \"{dirName}\" directory created"); }
            else Send("553 Permission denied");
        }

        private void HandleRmd(string dirName)
        {
            var p = ResolveToPhysical(dirName);
            if (p != null && Directory.Exists(p)) { Directory.Delete(p, true); Send("250 Directory deleted"); }
            else Send("550 Directory not found");
        }

        private void Send(string response)
        {
            OnLog?.Invoke(response);
            _writer.WriteLine(response);
        }

        public void Dispose()
        {
            _pasvListener?.Stop();
            _reader?.Dispose();
            _writer?.Dispose();
        }
    }
}
