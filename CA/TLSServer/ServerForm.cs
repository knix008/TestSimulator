using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace TLSServer
{
    public partial class ServerForm : Form
    {
        private TcpListener? tcpListener;
        private bool isListening = false;
        private X509Certificate2? serverCertificate;
        private X509Certificate2? caCertificate;
        private List<ClientConnection> connectedClients = new List<ClientConnection>();
        private Thread? serverThread;

        public ServerForm()
        {
            InitializeComponent();
            InitializeCertificates();
        }

        private void InitializeComponent()
        {
            this.btnStartStop = new Button();
            this.txtLog = new TextBox();
            this.lblStatus = new Label();
            this.txtPort = new TextBox();
            this.lblPort = new Label();
            this.lstClients = new ListBox();
            this.lblClients = new Label();
            this.btnSendMessage = new Button();
            this.txtMessage = new TextBox();
            this.lblMessage = new Label();
            this.SuspendLayout();

            // btnStartStop
            this.btnStartStop.Location = new Point(12, 12);
            this.btnStartStop.Name = "btnStartStop";
            this.btnStartStop.Size = new Size(100, 30);
            this.btnStartStop.Text = "서버 시작";
            this.btnStartStop.UseVisualStyleBackColor = true;
            this.btnStartStop.Click += new EventHandler(this.btnStartStop_Click);

            // lblPort
            this.lblPort.AutoSize = true;
            this.lblPort.Location = new Point(130, 20);
            this.lblPort.Name = "lblPort";
            this.lblPort.Size = new Size(31, 15);
            this.lblPort.Text = "포트:";

            // txtPort
            this.txtPort.Location = new Point(167, 17);
            this.txtPort.Name = "txtPort";
            this.txtPort.Size = new Size(60, 23);
            this.txtPort.Text = "8443";

            // lblStatus
            this.lblStatus.AutoSize = true;
            this.lblStatus.Location = new Point(12, 50);
            this.lblStatus.Name = "lblStatus";
            this.lblStatus.Size = new Size(50, 15);
            this.lblStatus.Text = "상태: 중지";

            // txtLog
            this.txtLog.Location = new Point(12, 80);
            this.txtLog.Multiline = true;
            this.txtLog.Name = "txtLog";
            this.txtLog.ReadOnly = true;
            this.txtLog.ScrollBars = ScrollBars.Vertical;
            this.txtLog.Size = new Size(400, 200);
            this.txtLog.TabIndex = 0;

            // lstClients
            this.lstClients.FormattingEnabled = true;
            this.lstClients.ItemHeight = 15;
            this.lstClients.Location = new Point(430, 80);
            this.lstClients.Name = "lstClients";
            this.lstClients.Size = new Size(200, 200);
            this.lstClients.TabIndex = 1;

            // lblClients
            this.lblClients.AutoSize = true;
            this.lblClients.Location = new Point(430, 60);
            this.lblClients.Name = "lblClients";
            this.lblClients.Size = new Size(55, 15);
            this.lblClients.Text = "연결된 클라이언트";

            // txtMessage
            this.txtMessage.Location = new Point(12, 300);
            this.txtMessage.Name = "txtMessage";
            this.txtMessage.Size = new Size(300, 23);
            this.txtMessage.TabIndex = 2;

            // lblMessage
            this.lblMessage.AutoSize = true;
            this.lblMessage.Location = new Point(12, 280);
            this.lblMessage.Name = "lblMessage";
            this.lblMessage.Size = new Size(55, 15);
            this.lblMessage.Text = "메시지:";

            // btnSendMessage
            this.btnSendMessage.Location = new Point(320, 300);
            this.btnSendMessage.Name = "btnSendMessage";
            this.btnSendMessage.Size = new Size(80, 25);
            this.btnSendMessage.Text = "전송";
            this.btnSendMessage.UseVisualStyleBackColor = true;
            this.btnSendMessage.Click += new EventHandler(this.btnSendMessage_Click);

            // ServerForm
            this.AutoScaleDimensions = new SizeF(7F, 15F);
            this.AutoScaleMode = AutoScaleMode.Font;
            this.ClientSize = new Size(650, 350);
            this.Controls.Add(this.btnSendMessage);
            this.Controls.Add(this.lblMessage);
            this.Controls.Add(this.txtMessage);
            this.Controls.Add(this.lblClients);
            this.Controls.Add(this.lstClients);
            this.Controls.Add(this.txtLog);
            this.Controls.Add(this.lblStatus);
            this.Controls.Add(this.txtPort);
            this.Controls.Add(this.lblPort);
            this.Controls.Add(this.btnStartStop);
            this.Name = "ServerForm";
            this.Text = "TLS 서버 (상호 인증)";
            this.ResumeLayout(false);
            this.PerformLayout();
        }

        private Button btnStartStop = null!;
        private TextBox txtLog = null!;
        private Label lblStatus = null!;
        private TextBox txtPort = null!;
        private Label lblPort = null!;
        private ListBox lstClients = null!;
        private Label lblClients = null!;
        private Button btnSendMessage = null!;
        private TextBox txtMessage = null!;
        private Label lblMessage = null!;

        private void InitializeCertificates()
        {
            try
            {
                // 인증서 경로 설정 - 상대 경로 사용
                string certPath = Path.Combine("..", "certificates");

                // 서버 인증서 로드
                string serverCertPath = Path.Combine(certPath, "server.crt");
                string serverKeyPath = Path.Combine(certPath, "server.key");
                
                if (File.Exists(serverCertPath) && File.Exists(serverKeyPath))
                {
                    string certPem = File.ReadAllText(serverCertPath);
                    string keyPem = File.ReadAllText(serverKeyPath);
                    serverCertificate = LoadCertificateFromPem(certPem, keyPem);
                    LogMessage("Server certificate loaded successfully");
                }
                else
                {
                    LogMessage($"Server certificate not found. Path: {serverCertPath}");
                }

                // CA 인증서 로드
                string caCertPath = Path.Combine(certPath, "ca.crt");
                if (File.Exists(caCertPath))
                {
                    string caCertPem = File.ReadAllText(caCertPath);
                    caCertificate = LoadCertificateFromPem(caCertPem, null);
                    LogMessage("CA certificate loaded successfully");
                }
                else
                {
                    LogMessage($"CA certificate not found. Path: {caCertPath}");
                }
            }
            catch (Exception ex)
            {
                LogMessage($"Certificate loading error: {ex.Message}");
            }
        }

        private X509Certificate2 LoadCertificateFromPem(string certPem, string? keyPem)
        {
            // PEM 형식의 인증서를 X509Certificate2로 변환
            if (keyPem != null)
            {
                // Create certificate from PEM data
                byte[] certBytes = Encoding.UTF8.GetBytes(certPem);
#pragma warning disable SYSLIB0057
                var cert = new X509Certificate2(certBytes);
#pragma warning restore SYSLIB0057

                // Import private key
                using (var rsa = System.Security.Cryptography.RSA.Create())
                {
                    rsa.ImportFromPem(keyPem);

                    // Create new certificate with private key using CopyWithPrivateKey
                    var certWithKey = cert.CopyWithPrivateKey(rsa);

                    // Export and re-import with UserKeySet flag to avoid permission issues
#pragma warning disable SYSLIB0057
                    return new X509Certificate2(certWithKey.Export(X509ContentType.Pfx), (string?)null,
                        X509KeyStorageFlags.Exportable | X509KeyStorageFlags.UserKeySet | X509KeyStorageFlags.PersistKeySet);
#pragma warning restore SYSLIB0057
                }
            }
            else
            {
                byte[] certBytes = Encoding.UTF8.GetBytes(certPem);
#pragma warning disable SYSLIB0057
                return new X509Certificate2(certBytes);
#pragma warning restore SYSLIB0057
            }
        }

        private void btnStartStop_Click(object? sender, EventArgs e)
        {
            if (!isListening)
            {
                StartServer();
            }
            else
            {
                StopServer();
            }
        }

        private void StartServer()
        {
            try
            {
                if (serverCertificate == null)
                {
                    MessageBox.Show("서버 인증서가 없습니다. CA 서버에서 인증서를 발급받으세요.", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                int port = int.Parse(txtPort.Text);
                tcpListener = new TcpListener(IPAddress.Any, port);
                tcpListener.Start();
                isListening = true;

                btnStartStop.Text = "서버 중지";
                lblStatus.Text = "상태: 실행 중";
                txtPort.Enabled = false;

                serverThread = new Thread(ServerLoop);
                serverThread.IsBackground = true;
                serverThread.Start();

                LogMessage($"TLS server started: Port {port}");
            }
            catch (Exception ex)
            {
                LogMessage($"Server start error: {ex.Message}");
            }
        }

        private void StopServer()
        {
            try
            {
                isListening = false;
                tcpListener?.Stop();

                // 모든 클라이언트 연결 종료
                foreach (var client in connectedClients.ToList())
                {
                    client.Disconnect();
                }
                connectedClients.Clear();
                UpdateClientList();

                btnStartStop.Text = "서버 시작";
                lblStatus.Text = "상태: 중지";
                txtPort.Enabled = true;

                LogMessage("TLS server stopped");
            }
            catch (Exception ex)
            {
                LogMessage($"Server stop error: {ex.Message}");
            }
        }

        private void ServerLoop()
        {
            while (isListening)
            {
                try
                {
                    var tcpClient = tcpListener?.AcceptTcpClient();
                    if (tcpClient != null)
                    {
                        var clientConnection = new ClientConnection(tcpClient, serverCertificate!, caCertificate!);
                        clientConnection.OnMessageReceived += ClientConnection_OnMessageReceived;
                        clientConnection.OnDisconnected += ClientConnection_OnDisconnected;
                        
                        connectedClients.Add(clientConnection);
                        
                        Invoke(new Action(() => {
                            LogMessage($"Client connected: {tcpClient.Client.RemoteEndPoint}");
                            UpdateClientList();
                        }));
                        
                        Thread clientThread = new Thread(clientConnection.HandleClient);
                        clientThread.IsBackground = true;
                        clientThread.Start();
                    }
                }
                catch (Exception ex)
                {
                    if (isListening)
                    {
                        Invoke(new Action(() => LogMessage($"Client connection error: {ex.Message}")));
                    }
                }
            }
        }

        private void ClientConnection_OnMessageReceived(object? sender, string message)
        {
            Invoke(new Action(() => {
                LogMessage($"Client message: {message}");
            }));
        }

        private void ClientConnection_OnDisconnected(object? sender, EventArgs e)
        {
            if (sender is ClientConnection client)
            {
                Invoke(new Action(() => {
                    connectedClients.Remove(client);
                    LogMessage($"Client disconnected: {client.RemoteEndPoint}");
                    UpdateClientList();
                }));
            }
        }

        private void UpdateClientList()
        {
            lstClients.Items.Clear();
            foreach (var client in connectedClients)
            {
                lstClients.Items.Add(client.RemoteEndPoint?.ToString() ?? "Unknown");
            }
        }

        private void btnSendMessage_Click(object? sender, EventArgs e)
        {
            if (string.IsNullOrEmpty(txtMessage.Text))
                return;

            string message = txtMessage.Text;
            foreach (var client in connectedClients)
            {
                client.SendMessage(message);
            }
            
            LogMessage($"Server message sent: {message}");
            txtMessage.Clear();
        }

        private void LogMessage(string message)
        {
            if (txtLog.InvokeRequired)
            {
                txtLog.Invoke(new Action(() => LogMessage(message)));
                return;
            }

            string timestamp = DateTime.Now.ToString("HH:mm:ss");
            txtLog.AppendText($"[{timestamp}] {message}\r\n");
            txtLog.SelectionStart = txtLog.Text.Length;
            txtLog.ScrollToCaret();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (isListening)
            {
                StopServer();
            }
            base.OnFormClosing(e);
        }
    }

    public class ClientConnection
    {
        private TcpClient tcpClient;
        private SslStream? sslStream;
        private X509Certificate2 serverCertificate;
        private X509Certificate2 caCertificate;
        private bool isConnected = true;

        public event EventHandler<string>? OnMessageReceived;
        public event EventHandler? OnDisconnected;

        public EndPoint? RemoteEndPoint => tcpClient?.Client?.RemoteEndPoint;

        public ClientConnection(TcpClient tcpClient, X509Certificate2 serverCertificate, X509Certificate2 caCertificate)
        {
            this.tcpClient = tcpClient;
            this.serverCertificate = serverCertificate;
            this.caCertificate = caCertificate;
        }

        public void HandleClient()
        {
            try
            {
                sslStream = new SslStream(tcpClient.GetStream(), false, ValidateRemoteCertificate);

                // 서버 인증서로 SSL 핸드셰이크 (상호 인증)
                sslStream.AuthenticateAsServer(
                    serverCertificate,
                    true, // 클라이언트 인증서 요구
                    System.Security.Authentication.SslProtocols.Tls12,
                    false // 인증서 취소 목록 확인 비활성화 (테스트용)
                );

                // 클라이언트 인증서 검증은 ValidateRemoteCertificate 콜백에서 수행됨

                OnMessageReceived?.Invoke(this, "TLS 연결 성공 (상호 인증 완료)");

                // 메시지 수신 루프
                byte[] buffer = new byte[1024];
                while (isConnected)
                {
                    int bytesRead = sslStream.Read(buffer, 0, buffer.Length);
                    if (bytesRead > 0)
                    {
                        string message = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                        OnMessageReceived?.Invoke(this, message);
                    }
                }
            }
            catch (Exception ex)
            {
                OnMessageReceived?.Invoke(this, $"연결 오류: {ex.Message}");
            }
            finally
            {
                Disconnect();
            }
        }

        private bool ValidateRemoteCertificate(object sender, X509Certificate? certificate, X509Chain? chain, SslPolicyErrors sslPolicyErrors)
        {
            if (certificate == null || caCertificate == null)
            {
                return false;
            }

            try
            {
                var clientCert = new X509Certificate2(certificate);

                // 1. 인증서 유효기간 검증
                DateTime now = DateTime.Now;
                if (now < clientCert.NotBefore || now > clientCert.NotAfter)
                {
                    return false;
                }

                // 2. 인증서 체인 검증 - CA 인증서로 서명 확인
                using (var chain2 = new X509Chain())
                {
                    // 체인 정책 설정
                    chain2.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck; // 테스트 환경이므로 CRL 체크 비활성화
                    chain2.ChainPolicy.VerificationFlags = X509VerificationFlags.AllowUnknownCertificateAuthority;
                    chain2.ChainPolicy.ExtraStore.Add(caCertificate);

                    // 체인 빌드
                    if (!chain2.Build(clientCert))
                    {
                        return false;
                    }

                    // 체인의 루트가 우리 CA인지 확인
                    bool isIssuedByCA = false;
                    foreach (var element in chain2.ChainElements)
                    {
                        if (element.Certificate.Thumbprint == caCertificate.Thumbprint)
                        {
                            isIssuedByCA = true;
                            break;
                        }
                    }

                    if (!isIssuedByCA)
                    {
                        return false;
                    }
                }

                // 3. Subject와 Issuer 검증
                if (!clientCert.Issuer.Contains("Test CA"))
                {
                    return false;
                }

                // 4. 키 사용 확장 검증 (있는 경우)
                foreach (X509Extension extension in clientCert.Extensions)
                {
                    if (extension is X509KeyUsageExtension keyUsage)
                    {
                        // 디지털 서명 또는 키 합의가 있어야 함
                        if (!keyUsage.KeyUsages.HasFlag(X509KeyUsageFlags.DigitalSignature) &&
                            !keyUsage.KeyUsages.HasFlag(X509KeyUsageFlags.KeyAgreement))
                        {
                            return false;
                        }
                    }
                }

                return true;
            }
            catch
            {
                return false;
            }
        }

        public void SendMessage(string message)
        {
            try
            {
                if (sslStream != null && isConnected)
                {
                    byte[] data = Encoding.UTF8.GetBytes(message);
                    sslStream.Write(data, 0, data.Length);
                }
            }
            catch (Exception ex)
            {
                OnMessageReceived?.Invoke(this, $"메시지 전송 오류: {ex.Message}");
            }
        }

        public void Disconnect()
        {
            isConnected = false;
            sslStream?.Close();
            tcpClient?.Close();
            OnDisconnected?.Invoke(this, EventArgs.Empty);
        }
    }
}
