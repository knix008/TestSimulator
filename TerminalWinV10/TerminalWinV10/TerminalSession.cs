using System;
using System.Diagnostics;
using System.IO;
using System.IO.Ports;
using System.Net.Security;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;

namespace TerminalWinV10
{
    public sealed class TerminalSession : IDisposable
    {
        private SerialPort? _serialPort;
        private TcpClient? _tcpClient;
        private NetworkStream? _tcpStream;
        private SslStream? _sslStream;
        private Process? _shellProcess;
        private ConPtyHost? _conPty;
        private bool _useSsl;
        private bool _disposed;

        public bool IsConnected { get; private set; }
        public TerminalConnectionSettings Settings { get; private set; } = new();

        public event Action<string>? OutputReceived;
        public event Action<string>? StatusChanged;

        public void Connect(TerminalConnectionSettings settings)
        {
            if (IsConnected)
                Disconnect();

            Settings = settings.Clone() ?? new TerminalConnectionSettings();

            switch (Settings.ConnectionType)
            {
                case ConnectionTypes.Serial:
                    ConnectSerial();
                    break;
                case ConnectionTypes.TcpIp:
                    ConnectTcp();
                    break;
                case ConnectionTypes.Local:
                    ConnectLocal();
                    break;
                default:
                    throw new InvalidOperationException($"Unknown connection type: {Settings.ConnectionType}");
            }

            IsConnected = true;
        }

        public void Disconnect()
        {
            if (!IsConnected && _serialPort == null && _tcpClient == null && _shellProcess == null && _conPty == null)
                return;

            try
            {
                if (_serialPort?.IsOpen == true)
                {
                    _serialPort.DataReceived -= SerialPort_DataReceived;
                    _serialPort.Close();
                }
            }
            catch { /* ignore */ }
            _serialPort = null;

            try
            {
                _sslStream?.Close();
                _tcpStream?.Close();
                _tcpClient?.Close();
            }
            catch { /* ignore */ }
            _sslStream = null;
            _tcpStream = null;
            _tcpClient = null;

            if (_conPty != null)
            {
                _conPty.OutputReceived -= OnConPtyOutput;
                _conPty.SessionEnded -= OnConPtySessionEnded;
                try { _conPty.Stop(); } catch { /* ignore */ }
                try { _conPty.Dispose(); } catch { /* ignore */ }
                _conPty = null;
            }

            try
            {
                if (_shellProcess != null && !_shellProcess.HasExited)
                {
                    try { _shellProcess.StandardInput.WriteLine("exit"); } catch { /* ignore */ }
                    if (!_shellProcess.WaitForExit(500))
                        _shellProcess.Kill(entireProcessTree: true);
                }
            }
            catch { /* ignore */ }
            _shellProcess?.Dispose();
            _shellProcess = null;

            IsConnected = false;
        }

        public void SendInput(string text)
        {
            if (!IsConnected || string.IsNullOrEmpty(text))
                return;

            switch (Settings.ConnectionType)
            {
                case ConnectionTypes.Serial:
                    if (_serialPort?.IsOpen == true)
                        _serialPort.Write(text);
                    break;
                case ConnectionTypes.TcpIp:
                    var bytes = Encoding.UTF8.GetBytes(text);
                    if (_useSsl && _sslStream != null)
                        _sslStream.Write(bytes, 0, bytes.Length);
                    else
                        _tcpStream?.Write(bytes, 0, bytes.Length);
                    break;
                case ConnectionTypes.Local:
                    if (_conPty != null && _conPty.IsRunning)
                        _conPty.WriteInput(text);
                    else if (_shellProcess?.HasExited == false)
                        _shellProcess.StandardInput.Write(text);
                    break;
            }
        }

        private void ConnectSerial()
        {
            var baud = int.Parse(Settings.Baud);
            _serialPort = new SerialPort(Settings.SerialPort, baud);
            _serialPort.DataReceived += SerialPort_DataReceived;
            _serialPort.Open();
            RaiseStatus($"[Serial] Connected to {Settings.SerialPort} @ {Settings.Baud}");
        }

        private void ConnectTcp()
        {
            var port = int.Parse(Settings.TcpPort);
            _tcpClient = new TcpClient(Settings.Ip, port);
            _tcpStream = _tcpClient.GetStream();
            _useSsl = Settings.UseSsl;

            if (_useSsl)
            {
                _sslStream = new SslStream(_tcpStream, false, (_, _, _, _) => true);
                _sslStream.AuthenticateAsClient(Settings.Ip);
                BeginReadTcp(true);
                RaiseStatus($"[TCP/IP:SSL] Connected to {Settings.Ip}:{Settings.TcpPort}");
            }
            else
            {
                BeginReadTcp(false);
                RaiseStatus($"[TCP/IP] Connected to {Settings.Ip}:{Settings.TcpPort}");
            }
        }

        private void ConnectLocal()
        {
            var shell = LocalShellResolver.Resolve(Settings.LocalShell);
            var workDir = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            var name = LocalShellResolver.GetDisplayName(shell);
            var arguments = GetLocalShellArguments(shell, useConPty: true);

            if (ConPtyHost.IsSupported)
            {
                _conPty = new ConPtyHost();
                _conPty.OutputReceived += OnConPtyOutput;
                _conPty.SessionEnded += OnConPtySessionEnded;
                _conPty.Start(shell, arguments, workDir);
                RaiseStatus($"[Local] Started {name} (ConPTY)");
                return;
            }

            ConnectLocalFallback(shell, workDir, name);
        }

        private static string GetLocalShellArguments(string shellPath, bool useConPty)
        {
            var file = Path.GetFileName(shellPath).ToLowerInvariant();
            if (file == "powershell.exe" || file == "pwsh.exe")
                return "-NoLogo -NoExit";
            if (!useConPty && (file == "cmd.exe" || file == "command.com"))
                return "/Q";
            return "";
        }

        private void ConnectLocalFallback(string shell, string workDir, string name)
        {
            var psi = new ProcessStartInfo
            {
                FileName = shell,
                Arguments = GetLocalShellArguments(shell, useConPty: false),
                WorkingDirectory = workDir,
                UseShellExecute = false,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                StandardOutputEncoding = Console.OutputEncoding,
                StandardErrorEncoding = Console.OutputEncoding
            };

            _shellProcess = new Process { StartInfo = psi, EnableRaisingEvents = true };
            _shellProcess.Exited += (_, _) =>
            {
                RaiseStatus($"[Local] Process exited (code {_shellProcess?.ExitCode})");
                IsConnected = false;
            };

            if (!_shellProcess.Start())
                throw new InvalidOperationException("Failed to start local shell.");

            _ = Task.Run(() => ReadStreamLoopAsync(_shellProcess.StandardOutput));
            _ = Task.Run(() => ReadStreamLoopAsync(_shellProcess.StandardError));

            RaiseStatus($"[Local] Started {name}");
        }

        private async Task ReadStreamLoopAsync(StreamReader reader)
        {
            var buf = new char[1024];
            try
            {
                while (IsConnected && _shellProcess != null && !_shellProcess.HasExited)
                {
                    int n = await reader.ReadAsync(buf, 0, buf.Length).ConfigureAwait(false);
                    if (n <= 0) break;
                    RaiseOutput(new string(buf, 0, n));
                }
            }
            catch { /* stream closed */ }
        }

        private void SerialPort_DataReceived(object sender, SerialDataReceivedEventArgs e)
        {
            try
            {
                var data = _serialPort?.ReadExisting();
                if (!string.IsNullOrEmpty(data))
                    RaiseOutput(data);
            }
            catch { /* port closed */ }
        }

        private void BeginReadTcp(bool useSsl)
        {
            var buffer = new byte[4096];
            var stream = useSsl ? (Stream)_sslStream! : _tcpStream!;

            stream.BeginRead(buffer, 0, buffer.Length, ar =>
            {
                try
                {
                    if (!IsConnected)
                        return;

                    var bytesRead = stream.EndRead(ar);
                    if (bytesRead > 0)
                    {
                        var data = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                        RaiseOutput(data);
                        BeginReadTcp(useSsl);
                    }
                }
                catch
                {
                    RaiseStatus("[TCP/IP] Connection closed");
                    IsConnected = false;
                }
            }, null);
        }

        private void OnConPtyOutput(string text) => RaiseOutput(text);

        private void OnConPtySessionEnded()
        {
            IsConnected = false;
            RaiseStatus("[Local] Session ended");
        }

        private void RaiseOutput(string text) => OutputReceived?.Invoke(text);
        private void RaiseStatus(string text) => StatusChanged?.Invoke(text);

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            Disconnect();
        }
    }
}
