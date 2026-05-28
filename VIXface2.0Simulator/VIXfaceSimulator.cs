using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Cryptography.X509Certificates;
using System.Security.Authentication;
using System.Text;
using System.Management;
using System.Net.NetworkInformation;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace VIXfaceSimulator
{
    public partial class VIXfaceSimulator : Form
    {
        private TcpListener? _sslServer;
        private X509Certificate2? _serverCertificate;
        private bool _isServerRunning = false;
        private readonly object _logLock = new object();
        private readonly CancellationTokenSource _cancellationTokenSource = new CancellationTokenSource();
        private bool _isErrorDialogOpen = false;
        private string _deviceSerialNumber = "MYWWXXXXX"; // ?? ?ùù??? ???
        
        // ???? ???? ???? (clientEndpoint ?????? ????)
        private bool _isConnected = false;
        private bool _isTestModeEnabled = false;
        private DateTime _lastCommandTime = DateTime.Now;

        // ????? ?????
        private readonly ProcessCommand _commandProcessor;

        public VIXfaceSimulator()
        {
            InitializeComponent();
            _commandProcessor = new ProcessCommand(this);
            InitializeServer();
        }

        // ProcessCommand ????????? ?????? ?? ????? ??????? public???? ????
        public bool IsConnected => _isConnected;
        public bool IsTestModeEnabled => _isTestModeEnabled;
        public DateTime LastCommandTime => _lastCommandTime;
        public string DeviceSerialNumber => _deviceSerialNumber;

        public void SetConnected(bool connected) => _isConnected = connected;
        public void SetTestModeEnabled(bool enabled) => _isTestModeEnabled = enabled;
        public void SetDeviceSerialNumber(string serialNumber) => _deviceSerialNumber = serialNumber;
        public void UpdateLastCommandTime() => _lastCommandTime = DateTime.Now;

        private void InitializeServer()
        {
            try
            {
                // SSL ?????? ???? (????? ??? ???? ??????)
                _serverCertificate = CreateSelfSignedCertificate();
                
                // TCP ?????? ???? (??? 8443 ???)
                _sslServer = new TcpListener(IPAddress.Any, 8443);
                
                LogMessage("SSL server initialized.");
            }
            catch (Exception ex)
            {
                LogMessage($"Server initialization error: {ex.Message}");
            }
        }

        private X509Certificate2 CreateSelfSignedCertificate()
        {
            // ????? ??? ???? ?????? ????
            // ???? ???????? ????? SSL ???????? ?????? ????
            using (var rsa = System.Security.Cryptography.RSA.Create(2048))
            {
                var req = new System.Security.Cryptography.X509Certificates.CertificateRequest(
                    "CN=localhost", rsa, System.Security.Cryptography.HashAlgorithmName.SHA256,
                    System.Security.Cryptography.RSASignaturePadding.Pkcs1);

                var cert = req.CreateSelfSigned(DateTimeOffset.Now, DateTimeOffset.Now.AddYears(1));
                return new X509Certificate2(cert.Export(X509ContentType.Pfx), (string?)null, X509KeyStorageFlags.Exportable);
            }
        }

        public async Task StartServerAsync()
        {
            if (_isServerRunning || _sslServer == null || _serverCertificate == null)
            {
                LogMessage("Cannot start server. SSL server or certificate is not initialized.");
                return;
            }

            try
            {
                _sslServer.Start();
                _isServerRunning = true;
                LogMessage("SSL server started on port 8443.");

                while (_isServerRunning && !_cancellationTokenSource.Token.IsCancellationRequested)
                {
                    var tcpClient = await _sslServer.AcceptTcpClientAsync();
                    var clientEndpoint = tcpClient.Client.RemoteEndPoint?.ToString() ?? "Unknown";
                    LogMessage($"Client connected: {clientEndpoint}");

                    // ?? ????????? ???? ??????? ???
                    _ = Task.Run(() => HandleClientAsync(tcpClient, _cancellationTokenSource.Token));
                }
            }
            catch (ObjectDisposedException)
            {
                // ?????? ?????????? ????? ???
            }
            catch (Exception ex)
            {
                LogMessage($"Server error: {ex.Message}");
            }
        }

        private async Task HandleClientAsync(TcpClient tcpClient, CancellationToken cancellationToken)
        {
            SslStream? sslStream = null;
            var clientEndpoint = tcpClient.Client.RemoteEndPoint?.ToString() ?? "Unknown";
            
            try
            {
                if (cancellationToken.IsCancellationRequested)
                    return;

                // ???? ???????? null?? ??? ???
                if (_serverCertificate == null)
                {
                    LogMessage("Server certificate is not initialized.");
                    return;
                }

                sslStream = new SslStream(tcpClient.GetStream());

                // Enforce TLS 1.3 while using self-signed certificate.
                var tlsOptions = new SslServerAuthenticationOptions
                {
                    ServerCertificate = _serverCertificate,
                    EnabledSslProtocols = SslProtocols.Tls13
                };

                await sslStream.AuthenticateAsServerAsync(tlsOptions, cancellationToken);
                LogMessage("TLS 1.3 handshake complete");

                // ?????????? ????? ?????? ????
                while (!cancellationToken.IsCancellationRequested && tcpClient.Connected)
                {
                    var buffer = new byte[4096];
                    var bytesRead = await sslStream.ReadAsync(buffer, 0, buffer.Length, cancellationToken);
                    
                    if (bytesRead > 0)
                    {
                        var requestData = Encoding.UTF8.GetString(buffer, 0, bytesRead).Trim();
                        LogMessage($"[{clientEndpoint}] Request received: {requestData}");

                        string response;
                        
                        // AT ????????? JSON ??????? ????
                        if (requestData.StartsWith("AT", StringComparison.OrdinalIgnoreCase))
                        {
                            response = _commandProcessor.ProcessAtCommand(requestData);
                        }
                        else
                        {
                            // ? ?????? AT ????? ??? ????? ???? ???
                            if (!_isConnected)
                            {
                                response = "ERROR: First connection must start with an 'AT' command.\r\n";
                                LogMessage($"[{clientEndpoint}] Invalid first request: {requestData}");
                            }
                            // ???? JSON ??? ??? (???? ??? ?????? ??ùù??)
                            else if (_isTestModeEnabled)
                            {
                                response = _commandProcessor.ProcessTlsRequest(requestData);
                            }
                            else
                            {
                                response = "ERROR: Test mode is not enabled. Send 'AT+TEST=BEGIN' first.\r\n";
                            }
                        }

                        var responseBytes = Encoding.UTF8.GetBytes(response);
                        await sslStream.WriteAsync(responseBytes, 0, responseBytes.Length, cancellationToken);
                        await sslStream.FlushAsync(cancellationToken);
                        
                        LogMessage($"[{clientEndpoint}] Response sent");
                    }
                    else
                    {
                        // ????????? ?????? ?????? ???
                        break;
                    }
                }
            }
            catch (OperationCanceledException)
            {
                // ???? ??? - ???????? ????
            }
            catch (Exception ex)
            {
                LogMessage($"[{clientEndpoint}] Client handling error: {ex.Message}");
            }
            finally
            {
                sslStream?.Close();
                tcpClient.Close();
                LogMessage($"[{clientEndpoint}] Client connection closed");
            }
        }

        public void StopServer()
        {
            if (!_isServerRunning) return;

            try
            {
                _isServerRunning = false;
                _cancellationTokenSource.Cancel();
                _sslServer?.Stop();
                
                // ???? ???? ????
                _isConnected = false;
                _isTestModeEnabled = false;
                
                LogMessage("SSL server stopped.");
            }
            catch (Exception ex)
            {
                LogMessage($"Server stop error: {ex.Message}");
            }
        }

        public void LogMessage(string message)
        {
            // ???? dispose??????? ???? ???
            if (IsDisposed)
                return;

            // CancellationTokenSource?? ???ùù? ??????? ???
            try
            {
                if (_cancellationTokenSource?.Token.IsCancellationRequested == true)
                    return;
            }
            catch (ObjectDisposedException)
            {
                // CancellationTokenSource?? ??? dispose?? ??? ?ùù? ???
                return;
            }

            try
            {
                var logEntry = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}";
                
                // UI ???????? ??????? ???????
                if (LogTextBox.InvokeRequired)
                {
                    LogTextBox.Invoke(new Action(() => UpdateTextBox(logEntry)));
                }
                else
                {
                    UpdateTextBox(logEntry);
                }

                if (LooksLikeErrorMessage(message))
                {
                    ShowErrorPopup("Simulator Error", logEntry);
                }
            }
            catch (ObjectDisposedException)
            {
                // TextBox?? dispose?? ??? ????
            }
            catch (InvalidOperationException)
            {
                // Invoke ??? ?? control?? dispose?? ??? ????
            }
        }

        private static bool LooksLikeErrorMessage(string message)
        {
            if (string.IsNullOrWhiteSpace(message))
                return false;

            return message.Contains("error", StringComparison.OrdinalIgnoreCase)
                || message.Contains("fail", StringComparison.OrdinalIgnoreCase)
                || message.Contains("??", StringComparison.OrdinalIgnoreCase)
                || message.Contains("??", StringComparison.OrdinalIgnoreCase);
        }

        private void ShowErrorPopup(string title, string detail)
        {
            if (IsDisposed || Disposing)
                return;

            if (_isErrorDialogOpen)
                return;

            void ShowDialog()
            {
                if (IsDisposed || Disposing || _isErrorDialogOpen)
                    return;

                _isErrorDialogOpen = true;
                try
                {
                    using var dialog = new Form
                    {
                        Text = title,
                        StartPosition = FormStartPosition.CenterParent,
                        Width = 760,
                        Height = 420,
                        MinimizeBox = false,
                        MaximizeBox = false,
                        FormBorderStyle = FormBorderStyle.SizableToolWindow
                    };

                    var detailTextBox = new TextBox
                    {
                        Multiline = true,
                        ReadOnly = true,
                        ScrollBars = ScrollBars.Both,
                        WordWrap = false,
                        Dock = DockStyle.Fill,
                        Font = new Font("Consolas", 10F),
                        Text = detail
                    };

                    var copyButton = new Button
                    {
                        Text = "Copy",
                        Width = 100,
                        Height = 30,
                        Anchor = AnchorStyles.Right | AnchorStyles.Bottom
                    };
                    copyButton.Click += (_, __) =>
                    {
                        try
                        {
                            Clipboard.SetText(detailTextBox.Text);
                        }
                        catch
                        {
                            // Ignore clipboard access errors.
                        }
                    };

                    var closeButton = new Button
                    {
                        Text = "Close",
                        Width = 100,
                        Height = 30,
                        Anchor = AnchorStyles.Right | AnchorStyles.Bottom,
                        DialogResult = DialogResult.OK
                    };

                    var buttonPanel = new FlowLayoutPanel
                    {
                        Dock = DockStyle.Bottom,
                        Height = 45,
                        FlowDirection = FlowDirection.RightToLeft,
                        Padding = new Padding(8)
                    };
                    buttonPanel.Controls.Add(closeButton);
                    buttonPanel.Controls.Add(copyButton);

                    dialog.Controls.Add(detailTextBox);
                    dialog.Controls.Add(buttonPanel);
                    dialog.AcceptButton = closeButton;

                    dialog.ShowDialog(this);
                }
                finally
                {
                    _isErrorDialogOpen = false;
                }
            }

            if (InvokeRequired)
            {
                BeginInvoke((Action)ShowDialog);
            }
            else
            {
                ShowDialog();
            }
        }

        private void UpdateTextBox(string logEntry)
        {
            // TextBox?? dispose??????? ???
            if (LogTextBox.IsDisposed)
                return;

            lock (_logLock)
            {
                try
                {
                    LogTextBox.AppendText(logEntry + Environment.NewLine);
                    LogTextBox.SelectionStart = LogTextBox.Text.Length;
                    LogTextBox.ScrollToCaret();
                }
                catch (ObjectDisposedException)
                {
                    // TextBox?? dispose?? ??? ????
                }
            }
        }

        protected override async void OnLoad(EventArgs e)
        {
            base.OnLoad(e);
            // ???? ?ùù??? ???? ????
            await StartServerAsync();
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            StopServer();
            _serverCertificate?.Dispose();
            _cancellationTokenSource?.Dispose();
            base.OnFormClosed(e);
        }
    }
}
