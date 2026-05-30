using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;

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
        public event Action<string, Exception?>? OnError;
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
            catch (Exception ex)
            {
                OnLog?.Invoke($"서버 오류: {ex.Message}");
                OnError?.Invoke($"FTP 수신 루프 오류 (포트 {_port})", ex);
            }
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
        private SessionPermissions _permissions = SessionPermissions.DenyAll;
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
                    if (UserAuthHelper.TryAuthenticate(_pendingUser ?? "", arg, _allowAnonymous, _users, out var perms))
                    {
                        _authenticated = true;
                        _permissions = perms;
                        var who = _pendingUser ?? "";
                        Send(who.Equals("anonymous", StringComparison.OrdinalIgnoreCase)
                            ? $"230 Anonymous logged in ({perms.Summary})"
                            : $"230 User logged in ({perms.Summary})");
                    }
                    else
                        Send("530 Login incorrect");
                    break;
                case "SYST": Send("215 UNIX Type: L8"); break;
                case "FEAT":
                    Send("211-Features:");
                    Send(" MLST type*;size*;modify*;");
                    Send(" MLSD");
                    Send(" PASV");
                    Send(" SIZE");
                    Send(" UTF8");
                    Send("211 End");
                    break;
                case "OPTS":
                    if (arg.StartsWith("UTF8", StringComparison.OrdinalIgnoreCase))
                        Send("200 UTF8 mode enabled");
                    else
                        Send("200 OK");
                    break;
                case "AUTH":
                    Send("502 AUTH TLS not supported (use plain FTP or enable FTPS on port 990)");
                    break;
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
                    await HandleListAsync(arg, cmd == "NLST", token); break;
                case "MLSD":
                    if (!_authenticated) { Send("530 Not logged in"); break; }
                    await HandleMlsdAsync(arg, token); break;
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

        private static string UnquotePath(string path)
        {
            path = path.Trim();
            if (path.Length >= 2 && path[0] == '"' && path[^1] == '"')
                return path[1..^1].Trim();
            return path;
        }

        private static string StripListOptions(string arg)
        {
            arg = arg.Trim();
            while (arg.StartsWith('-'))
            {
                var sp = arg.IndexOf(' ');
                if (sp < 0) return "";
                arg = arg[(sp + 1)..].Trim();
            }
            return arg;
        }

        private string AbsoluteFtpPath(string arg)
        {
            arg = UnquotePath(arg);
            if (string.IsNullOrEmpty(arg) || arg == ".")
                return _currentPath;
            arg = arg.Replace('\\', '/');
            return arg.StartsWith('/')
                ? VirtualFileSystem.NormalizePath(arg)
                : VirtualFileSystem.NormalizePath(_currentPath + "/" + arg);
        }

        private string ResolveListPath(string listArg)
        {
            listArg = StripListOptions(UnquotePath(listArg));
            return string.IsNullOrWhiteSpace(listArg) ? _currentPath : AbsoluteFtpPath(listArg);
        }

        private string? ResolveToPhysical(string arg) =>
            _vfs.Resolve(AbsoluteFtpPath(arg));

        private string? ResolveToPhysicalFile(string arg)
        {
            arg = NormalizeFileNameArg(arg);
            if (string.IsNullOrWhiteSpace(arg))
                return null;

            foreach (var candidate in GetFilePathCandidates(arg))
            {
                var physical = _vfs.Resolve(candidate);
                if (physical != null && File.Exists(physical))
                    return physical;
            }

            return null;
        }

        private IEnumerable<string> GetFilePathCandidates(string arg)
        {
            yield return AbsoluteFtpPath(arg);

            if (arg.Replace('\\', '/').StartsWith('/'))
                yield return VirtualFileSystem.NormalizePath(arg.Replace('\\', '/'));

            var baseName = Path.GetFileName(arg);
            if (!string.IsNullOrEmpty(baseName) && baseName != arg)
                yield return AbsoluteFtpPath(baseName);
        }

        private static string NormalizeFileNameArg(string arg)
        {
            arg = UnquotePath(arg).Trim();
            var tab = arg.LastIndexOf('\t');
            if (tab >= 0)
                return arg[(tab + 1)..].Trim();
            if (arg.StartsWith('-') || arg.StartsWith('d'))
                return ExtractUnixListFilename(arg);

            var fromListTail = TryExtractFilenameAfterListTimestamp(arg);
            if (fromListTail != null)
                return fromListTail;

            return arg;
        }

        private static string ExtractUnixListFilename(string line)
        {
            var tab = line.LastIndexOf('\t');
            if (tab >= 0)
                return line[(tab + 1)..].Trim();
            var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 9)
                return string.Join(' ', parts, 8, parts.Length - 8);
            return TryExtractFilenameAfterListTimestamp(line) ?? line;
        }

        private static string? TryExtractFilenameAfterListTimestamp(string arg)
        {
            var m = Regex.Match(arg, @"\d{1,2}:\d{2}\s+(.+)$");
            if (m.Success) return m.Groups[1].Value.Trim();
            m = Regex.Match(arg, @"\d{4}\s+(.+)$");
            return m.Success ? m.Groups[1].Value.Trim() : null;
        }

        private bool DenyRead() { if (_permissions.CanRead) return false; Send("550 Permission denied. Read not allowed."); return true; }
        private bool DenyWrite() { if (_permissions.CanWrite) return false; Send("550 Permission denied. Write not allowed."); return true; }

        // ── Command handlers ──────────────────────────────────────────────────────

        private void HandleCwd(string path)
        {
            if (DenyRead()) return;
            var newPath = AbsoluteFtpPath(UnquotePath(path));
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

        private async Task HandleListAsync(string listArg, bool namesOnly, CancellationToken token)
        {
            if (DenyRead()) return;
            var listPath = ResolveListPath(listArg);
            Send("150 Opening data connection");
            var dataClient = await AcceptDataAsync(token);
            if (dataClient == null) { Send("425 Can't open data connection"); return; }
            try
            {
                using var dw = new StreamWriter(dataClient.GetStream(), Encoding.ASCII)
                    { NewLine = "\r\n", AutoFlush = true };
                WriteListingEntries(dw, listPath, namesOnly, unixListFormat: true);
            }
            finally { dataClient.Close(); }
            Send("226 Transfer complete");
        }

        private async Task HandleMlsdAsync(string listArg, CancellationToken token)
        {
            if (DenyRead()) return;
            var listPath = ResolveListPath(listArg);
            Send("150 Opening data connection");
            var dataClient = await AcceptDataAsync(token);
            if (dataClient == null) { Send("425 Can't open data connection"); return; }
            try
            {
                using var dw = new StreamWriter(dataClient.GetStream(), new UTF8Encoding(false), leaveOpen: true)
                    { NewLine = "\r\n", AutoFlush = true };
                WriteListingEntries(dw, listPath, namesOnly: false, unixListFormat: false);
            }
            finally { dataClient.Close(); }
            Send("226 Transfer complete");
        }

        private void WriteListingEntries(StreamWriter dw, string listPath, bool namesOnly, bool unixListFormat)
        {
            // Root "/" always lists virtual folder names so clients see the configured shares.
            if (listPath == "/")
            {
                foreach (var name in _vfs.VirtualNames)
                {
                    if (namesOnly)
                    {
                        dw.WriteLine(name);
                        continue;
                    }
                    if (unixListFormat)
                    {
                        dw.WriteLine(string.Format(CultureInfo.InvariantCulture,
                            "drwxr-xr-x 1 ftp ftp {0,12} {1} {2}",
                            0, FormatListTimestamp(DateTime.Now), name));
                    }
                    else
                    {
                        dw.WriteLine($"Type=dir;Modify={FormatMlsdModify(DateTime.UtcNow)} {name}");
                    }
                }
                return;
            }

            var physical = _vfs.Resolve(listPath);
            if (physical != null && File.Exists(physical))
            {
                WriteEntry(dw, new FileInfo(physical), namesOnly, unixListFormat);
                return;
            }

            if (physical != null && Directory.Exists(physical))
            {
                foreach (var dir in Directory.GetDirectories(physical))
                    WriteEntry(dw, new DirectoryInfo(dir), namesOnly, unixListFormat);
                foreach (var file in Directory.GetFiles(physical))
                    WriteEntry(dw, new FileInfo(file), namesOnly, unixListFormat);
            }
        }

        private static void WriteEntry(StreamWriter dw, FileSystemInfo info, bool namesOnly, bool unixListFormat)
        {
            if (namesOnly)
            {
                dw.WriteLine(info.Name);
                return;
            }

            if (unixListFormat)
            {
                var isDir = info is DirectoryInfo;
                var size = isDir ? 0L : ((FileInfo)info).Length;
                dw.WriteLine(FormatUnixListLine(info, isDir, size, info.LastWriteTime, info.Name));
            }
            else if (info is DirectoryInfo di)
            {
                dw.WriteLine($"Type=dir;Modify={FormatMlsdModify(di.LastWriteTimeUtc)} {di.Name}");
            }
            else
            {
                var fi = (FileInfo)info;
                dw.WriteLine($"Type=file;Size={fi.Length};Modify={FormatMlsdModify(fi.LastWriteTimeUtc)} {fi.Name}");
            }
        }

        /// <summary>
        /// Unix LIST line: fixed-width metadata + TAB + filename (클라이언트가 파일명만 정확히 읽도록).
        /// </summary>
        private static string FormatUnixListLine(FileSystemInfo info, bool isDirectory, long size, DateTime mtime, string displayName)
        {
            var perm = isDirectory ? "drwxr-xr-x" : "-rw-r--r--";
            return string.Format(CultureInfo.InvariantCulture,
                "{0} 1 ftp ftp {1,12} {2} {3}",
                perm, size, FormatListTimestamp(mtime), displayName);
        }

        private static string FormatListTimestamp(DateTime dt)
        {
            var culture = CultureInfo.InvariantCulture;
            var ts = (DateTime.UtcNow - dt.ToUniversalTime()).TotalDays > 180
                ? dt.ToString("MMM dd  yyyy", culture)
                : dt.ToString("MMM dd HH:mm", culture);
            return ts.PadRight(12);
        }

        private static string FormatMlsdModify(DateTime utc) =>
            utc.ToUniversalTime().ToString("yyyyMMddHHmmss", CultureInfo.InvariantCulture);

        private async Task HandleRetrAsync(string fileName, CancellationToken token)
        {
            if (DenyRead()) return;
            var normalized = NormalizeFileNameArg(fileName);
            var ftpPath = AbsoluteFtpPath(normalized);
            var localPath = ResolveToPhysicalFile(fileName);
            if (localPath == null)
            {
                OnLog?.Invoke($"550 File not found: FTP '{ftpPath}' (cwd: {_currentPath}, arg: '{UnquotePath(fileName)}', normalized: '{normalized}')");
                Send("550 File not found");
                return;
            }
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
            if (DenyWrite()) return;
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
            if (DenyRead()) return;
            var p = ResolveToPhysicalFile(NormalizeFileNameArg(fileName));
            if (p != null) Send($"213 {new FileInfo(p).Length}");
            else Send("550 File not found");
        }

        private void HandleDele(string fileName)
        {
            if (DenyWrite()) return;
            var p = ResolveToPhysicalFile(fileName);
            if (p != null) { File.Delete(p); Send("250 File deleted"); }
            else Send("550 File not found");
        }

        private void HandleMkd(string dirName)
        {
            if (DenyWrite()) return;
            var p = ResolveToPhysical(dirName);
            if (p != null) { Directory.CreateDirectory(p); Send($"257 \"{dirName}\" directory created"); }
            else Send("553 Permission denied");
        }

        private void HandleRmd(string dirName)
        {
            if (DenyWrite()) return;
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
