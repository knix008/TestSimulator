using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace FTPServerWinV10.Server
{
    public class FtpServerManager
    {
        public int BufferSizeKb { get; set; } = 64;
        public int MaxThreads { get; set; } = 4;
        public bool AllowAnonymous { get; set; } = true;
        public string UserId { get; set; } = "";
        public string UserPassword { get; set; } = "";

        protected string _rootPath;
        protected int _port;
        private TcpListener? _listener;
        private CancellationTokenSource? _cts;
        private int _clientCount = 0;

        public event Action<string>? OnLog;
        public event Action<int>? OnClientCountChanged;
        public event Action<string, long>? OnFileUploaded;
        public event Action<string, long>? OnFileDownloaded;

        public FtpServerManager(string rootPath, int port = 21)
        {
            _rootPath = rootPath;
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
                OnLog?.Invoke($"FTP 서버 시작 (포트: {_port}, 폴더: {_rootPath})");
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
                var localIp = ((System.Net.IPEndPoint)client.Client.LocalEndPoint!).Address.ToString();
                var stream = GetClientStream(client);
                using var session = new FtpSession(stream, _rootPath, AllowAnonymous, UserId, UserPassword, BufferSizeKb, localIp);
                session.OnLog += msg => OnLog?.Invoke(msg);
                session.OnFileUploaded += (f, s) => OnFileUploaded?.Invoke(f, s);
                session.OnFileDownloaded += (f, s) => OnFileDownloaded?.Invoke(f, s);
                await session.ProcessAsync(token);
            }
            catch (Exception ex)
            {
                OnLog?.Invoke($"클라이언트 오류 [{endpoint}]: {ex.Message}");
            }
            finally
            {
                Interlocked.Decrement(ref _clientCount);
                OnClientCountChanged?.Invoke(_clientCount);
                OnLog?.Invoke($"클라이언트 종료: {endpoint}");
                client.Close();
            }
        }
    }

    internal sealed class FtpSession : IDisposable
    {
        private readonly StreamReader _reader;
        private readonly StreamWriter _writer;
        private readonly string _rootPath;
        private readonly bool _allowAnonymous;
        private readonly string _userId;
        private readonly string _userPassword;
        private readonly int _bufferSizeKb;
        private readonly string _localIp;
        private string _currentPath = "/";
        private bool _authenticated;
        private string? _pendingUser;
        private TcpListener? _pasvListener;

        public event Action<string>? OnLog;
        public event Action<string, long>? OnFileUploaded;
        public event Action<string, long>? OnFileDownloaded;

        public FtpSession(Stream stream, string rootPath, bool allowAnonymous, string userId, string userPassword, int bufferSizeKb, string localIp = "127.0.0.1")
        {
            _rootPath = rootPath;
            _allowAnonymous = allowAnonymous;
            _userId = userId;
            _userPassword = userPassword;
            _bufferSizeKb = bufferSizeKb;
            _localIp = localIp;
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
            var spaceIdx = line.IndexOf(' ');
            var cmd = (spaceIdx < 0 ? line : line[..spaceIdx]).ToUpperInvariant();
            var arg = spaceIdx < 0 ? "" : line[(spaceIdx + 1)..].Trim();

            switch (cmd)
            {
                case "USER":
                    _pendingUser = arg;
                    Send("331 Password required");
                    break;
                case "PASS":
                    if (_pendingUser?.ToLowerInvariant() == "anonymous" && _allowAnonymous)
                    {
                        _authenticated = true;
                        Send("230 Anonymous user logged in");
                    }
                    else if (_pendingUser == _userId && arg == _userPassword)
                    {
                        _authenticated = true;
                        Send("230 User logged in");
                    }
                    else
                    {
                        Send("530 Login incorrect");
                    }
                    break;
                case "SYST": Send("215 UNIX Type: L8"); break;
                case "FEAT":
                    Send("211-Features:");
                    Send(" PASV");
                    Send(" SIZE");
                    Send("211 End");
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
                    HandleCwd(arg);
                    break;
                case "PASV":
                    if (!_authenticated) { Send("530 Not logged in"); break; }
                    HandlePasv();
                    break;
                case "LIST":
                case "NLST":
                    if (!_authenticated) { Send("530 Not logged in"); break; }
                    await HandleListAsync(token);
                    break;
                case "RETR":
                    if (!_authenticated) { Send("530 Not logged in"); break; }
                    await HandleRetrAsync(arg, token);
                    break;
                case "STOR":
                    if (!_authenticated) { Send("530 Not logged in"); break; }
                    await HandleStorAsync(arg, token);
                    break;
                case "SIZE":
                    if (!_authenticated) { Send("530 Not logged in"); break; }
                    HandleSize(arg);
                    break;
                case "DELE":
                    if (!_authenticated) { Send("530 Not logged in"); break; }
                    HandleDele(arg);
                    break;
                case "MKD":
                    if (!_authenticated) { Send("530 Not logged in"); break; }
                    HandleMkd(arg);
                    break;
                case "RMD":
                    if (!_authenticated) { Send("530 Not logged in"); break; }
                    HandleRmd(arg);
                    break;
                default:
                    Send($"502 Command '{cmd}' not implemented");
                    break;
            }
        }

        private string? GetLocalPath(string ftpPath)
        {
            string fullFtpPath = string.IsNullOrEmpty(ftpPath) || ftpPath == "."
                ? _currentPath
                : ftpPath.StartsWith('/') ? ftpPath : _currentPath.TrimEnd('/') + "/" + ftpPath;

            var localPath = Path.GetFullPath(Path.Combine(_rootPath, fullFtpPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar)));
            return localPath.StartsWith(_rootPath, StringComparison.OrdinalIgnoreCase) ? localPath : null;
        }

        private void HandleCwd(string path)
        {
            var localPath = GetLocalPath(path);
            if (localPath != null && Directory.Exists(localPath))
            {
                _currentPath = path.StartsWith('/') ? path : (_currentPath.TrimEnd('/') + "/" + path);
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
            try { return await _pasvListener.AcceptTcpClientAsync(token); }
            finally { _pasvListener.Stop(); _pasvListener = null; }
        }

        private async Task HandleListAsync(CancellationToken token)
        {
            Send("150 Opening data connection");
            var dataClient = await AcceptDataAsync(token);
            if (dataClient == null) { Send("425 Can't open data connection"); return; }
            try
            {
                using var dataWriter = new StreamWriter(dataClient.GetStream(), Encoding.ASCII) { NewLine = "\r\n", AutoFlush = true };
                var dirPath = GetLocalPath("");
                if (dirPath != null && Directory.Exists(dirPath))
                {
                    foreach (var dir in Directory.GetDirectories(dirPath))
                    {
                        var info = new DirectoryInfo(dir);
                        dataWriter.WriteLine($"drwxr-xr-x 2 ftp ftp 0 {info.LastWriteTime:MMM dd HH:mm} {info.Name}");
                    }
                    foreach (var file in Directory.GetFiles(dirPath))
                    {
                        var info = new FileInfo(file);
                        dataWriter.WriteLine($"-rw-r--r-- 1 ftp ftp {info.Length} {info.LastWriteTime:MMM dd HH:mm} {info.Name}");
                    }
                }
            }
            finally { dataClient.Close(); }
            Send("226 Transfer complete");
        }

        private async Task HandleRetrAsync(string fileName, CancellationToken token)
        {
            var localPath = GetLocalPath(fileName);
            if (localPath == null || !File.Exists(localPath)) { Send("550 File not found"); return; }
            Send("150 Opening data connection");
            var dataClient = await AcceptDataAsync(token);
            if (dataClient == null) { Send("425 Can't open data connection"); return; }
            try
            {
                long size = 0;
                using var dataStream = dataClient.GetStream();
                using var fileStream = File.OpenRead(localPath);
                var buffer = new byte[_bufferSizeKb * 1024];
                int read;
                while ((read = await fileStream.ReadAsync(buffer, 0, buffer.Length, token)) > 0)
                {
                    await dataStream.WriteAsync(buffer.AsMemory(0, read), token);
                    size += read;
                }
                OnFileDownloaded?.Invoke(Path.GetFileName(localPath), size);
            }
            finally { dataClient.Close(); }
            Send("226 Transfer complete");
        }

        private async Task HandleStorAsync(string fileName, CancellationToken token)
        {
            var localPath = GetLocalPath(fileName);
            if (localPath == null) { Send("553 Permission denied"); return; }
            Send("150 Opening data connection");
            var dataClient = await AcceptDataAsync(token);
            if (dataClient == null) { Send("425 Can't open data connection"); return; }
            try
            {
                long size = 0;
                using var dataStream = dataClient.GetStream();
                using var fileStream = File.Create(localPath);
                var buffer = new byte[_bufferSizeKb * 1024];
                int read;
                while ((read = await dataStream.ReadAsync(buffer, 0, buffer.Length, token)) > 0)
                {
                    await fileStream.WriteAsync(buffer.AsMemory(0, read), token);
                    size += read;
                }
                OnFileUploaded?.Invoke(Path.GetFileName(localPath), size);
            }
            finally { dataClient.Close(); }
            Send("226 Transfer complete");
        }

        private void HandleSize(string fileName)
        {
            var localPath = GetLocalPath(fileName);
            if (localPath != null && File.Exists(localPath))
                Send($"213 {new FileInfo(localPath).Length}");
            else
                Send("550 File not found");
        }

        private void HandleDele(string fileName)
        {
            var localPath = GetLocalPath(fileName);
            if (localPath != null && File.Exists(localPath)) { File.Delete(localPath); Send("250 File deleted"); }
            else Send("550 File not found");
        }

        private void HandleMkd(string dirName)
        {
            var localPath = GetLocalPath(dirName);
            if (localPath != null) { Directory.CreateDirectory(localPath); Send($"257 \"{dirName}\" directory created"); }
            else Send("553 Permission denied");
        }

        private void HandleRmd(string dirName)
        {
            var localPath = GetLocalPath(dirName);
            if (localPath != null && Directory.Exists(localPath)) { Directory.Delete(localPath, true); Send("250 Directory deleted"); }
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
