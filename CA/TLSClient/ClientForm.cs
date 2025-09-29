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

namespace TLSClient
{
    public partial class ClientForm : Form
    {
        private TcpClient? tcpClient;
        private SslStream? sslStream;
        private bool isConnected = false;
        private X509Certificate2? clientCertificate;
        private X509Certificate2? caCertificate;
        private Thread? receiveThread;

        public ClientForm()
        {
            InitializeComponent();
            InitializeCertificates();
        }

        private void InitializeComponent()
        {
            this.btnConnectDisconnect = new Button();
            this.txtLog = new TextBox();
            this.lblStatus = new Label();
            this.txtServerIP = new TextBox();
            this.lblServerIP = new Label();
            this.txtPort = new TextBox();
            this.lblPort = new Label();
            this.btnSendMessage = new Button();
            this.txtMessage = new TextBox();
            this.lblMessage = new Label();
            this.btnRequestCert = new Button();
            this.txtCertName = new TextBox();
            this.lblCertName = new Label();
            this.SuspendLayout();

            // btnConnectDisconnect
            this.btnConnectDisconnect.Location = new Point(12, 12);
            this.btnConnectDisconnect.Name = "btnConnectDisconnect";
            this.btnConnectDisconnect.Size = new Size(100, 30);
            this.btnConnectDisconnect.Text = "연결";
            this.btnConnectDisconnect.UseVisualStyleBackColor = true;
            this.btnConnectDisconnect.Click += new EventHandler(this.btnConnectDisconnect_Click);

            // lblServerIP
            this.lblServerIP.AutoSize = true;
            this.lblServerIP.Location = new Point(130, 20);
            this.lblServerIP.Name = "lblServerIP";
            this.lblServerIP.Size = new Size(55, 15);
            this.lblServerIP.Text = "서버 IP:";

            // txtServerIP
            this.txtServerIP.Location = new Point(191, 17);
            this.txtServerIP.Name = "txtServerIP";
            this.txtServerIP.Size = new Size(100, 23);
            this.txtServerIP.Text = "127.0.0.1";

            // lblPort
            this.lblPort.AutoSize = true;
            this.lblPort.Location = new Point(300, 20);
            this.lblPort.Name = "lblPort";
            this.lblPort.Size = new Size(31, 15);
            this.lblPort.Text = "포트:";

            // txtPort
            this.txtPort.Location = new Point(337, 17);
            this.txtPort.Name = "txtPort";
            this.txtPort.Size = new Size(60, 23);
            this.txtPort.Text = "8443";

            // lblStatus
            this.lblStatus.AutoSize = true;
            this.lblStatus.Location = new Point(12, 50);
            this.lblStatus.Name = "lblStatus";
            this.lblStatus.Size = new Size(50, 15);
            this.lblStatus.Text = "상태: 연결 안됨";

            // txtLog
            this.txtLog.Location = new Point(12, 80);
            this.txtLog.Multiline = true;
            this.txtLog.Name = "txtLog";
            this.txtLog.ReadOnly = true;
            this.txtLog.ScrollBars = ScrollBars.Vertical;
            this.txtLog.Size = new Size(500, 200);
            this.txtLog.TabIndex = 0;

            // txtMessage
            this.txtMessage.Location = new Point(12, 300);
            this.txtMessage.Name = "txtMessage";
            this.txtMessage.Size = new Size(400, 23);
            this.txtMessage.TabIndex = 2;

            // lblMessage
            this.lblMessage.AutoSize = true;
            this.lblMessage.Location = new Point(12, 280);
            this.lblMessage.Name = "lblMessage";
            this.lblMessage.Size = new Size(55, 15);
            this.lblMessage.Text = "메시지:";

            // btnSendMessage
            this.btnSendMessage.Location = new Point(420, 300);
            this.btnSendMessage.Name = "btnSendMessage";
            this.btnSendMessage.Size = new Size(80, 25);
            this.btnSendMessage.Text = "전송";
            this.btnSendMessage.UseVisualStyleBackColor = true;
            this.btnSendMessage.Click += new EventHandler(this.btnSendMessage_Click);

            // lblCertName
            this.lblCertName.AutoSize = true;
            this.lblCertName.Location = new Point(12, 340);
            this.lblCertName.Name = "lblCertName";
            this.lblCertName.Size = new Size(67, 15);
            this.lblCertName.Text = "인증서명:";

            // txtCertName
            this.txtCertName.Location = new Point(85, 337);
            this.txtCertName.Name = "txtCertName";
            this.txtCertName.Size = new Size(100, 23);
            this.txtCertName.Text = "client";

            // btnRequestCert
            this.btnRequestCert.Location = new Point(200, 335);
            this.btnRequestCert.Name = "btnRequestCert";
            this.btnRequestCert.Size = new Size(100, 25);
            this.btnRequestCert.Text = "인증서 요청";
            this.btnRequestCert.UseVisualStyleBackColor = true;
            this.btnRequestCert.Click += new EventHandler(this.btnRequestCert_Click);

            // ClientForm
            this.AutoScaleDimensions = new SizeF(7F, 15F);
            this.AutoScaleMode = AutoScaleMode.Font;
            this.ClientSize = new Size(550, 380);
            this.Controls.Add(this.btnRequestCert);
            this.Controls.Add(this.lblCertName);
            this.Controls.Add(this.txtCertName);
            this.Controls.Add(this.btnSendMessage);
            this.Controls.Add(this.lblMessage);
            this.Controls.Add(this.txtMessage);
            this.Controls.Add(this.txtLog);
            this.Controls.Add(this.lblStatus);
            this.Controls.Add(this.txtPort);
            this.Controls.Add(this.lblPort);
            this.Controls.Add(this.txtServerIP);
            this.Controls.Add(this.lblServerIP);
            this.Controls.Add(this.btnConnectDisconnect);
            this.Name = "ClientForm";
            this.Text = "TLS 클라이언트 (상호 인증)";
            this.ResumeLayout(false);
            this.PerformLayout();
        }

        private Button btnConnectDisconnect;
        private TextBox txtLog;
        private Label lblStatus;
        private TextBox txtServerIP;
        private Label lblServerIP;
        private TextBox txtPort;
        private Label lblPort;
        private Button btnSendMessage;
        private TextBox txtMessage;
        private Label lblMessage;
        private Button btnRequestCert;
        private TextBox txtCertName;
        private Label lblCertName;

        private void InitializeCertificates()
        {
            try
            {
                // 인증서 경로 설정 - 절대 경로 사용
                string certPath = @"D:\Home\Projects\TestSimulator\CA\certificates";
                
                // 클라이언트 인증서 로드
                string clientCertPath = Path.Combine(certPath, "client.crt");
                string clientKeyPath = Path.Combine(certPath, "client.key");
                
                if (File.Exists(clientCertPath) && File.Exists(clientKeyPath))
                {
                    string certPem = File.ReadAllText(clientCertPath);
                    string keyPem = File.ReadAllText(clientKeyPath);
                    clientCertificate = LoadCertificateFromPem(certPem, keyPem);
                    LogMessage("Client certificate loaded successfully");
                }
                else
                {
                    LogMessage($"Client certificate not found. Path: {clientCertPath}");
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
            if (keyPem != null)
            {
                // Create certificate from PEM data
                byte[] certBytes = Encoding.UTF8.GetBytes(certPem);
                var cert = new X509Certificate2(certBytes);
                
                // Import private key
                using (var rsa = System.Security.Cryptography.RSA.Create())
                {
                    rsa.ImportFromPem(keyPem);
                    
                    // Create new certificate with private key using CopyWithPrivateKey
                    return cert.CopyWithPrivateKey(rsa);
                }
            }
            else
            {
                byte[] certBytes = Encoding.UTF8.GetBytes(certPem);
                return new X509Certificate2(certBytes);
            }
        }

        private void btnConnectDisconnect_Click(object sender, EventArgs e)
        {
            if (!isConnected)
            {
                ConnectToServer();
            }
            else
            {
                DisconnectFromServer();
            }
        }

        private void ConnectToServer()
        {
            try
            {
                if (clientCertificate == null)
                {
                    MessageBox.Show("클라이언트 인증서가 없습니다. CA 서버에서 인증서를 발급받으세요.", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                string serverIP = txtServerIP.Text;
                int port = int.Parse(txtPort.Text);

                tcpClient = new TcpClient();
                tcpClient.Connect(serverIP, port);

                sslStream = new SslStream(tcpClient.GetStream(), false, ValidateServerCertificate);

                // 클라이언트 인증서로 SSL 핸드셰이크 (상호 인증)
                sslStream.AuthenticateAsClient(
                    serverIP,
                    new X509CertificateCollection { clientCertificate },
                    System.Security.Authentication.SslProtocols.Tls12,
                    false
                );

                isConnected = true;
                btnConnectDisconnect.Text = "연결 해제";
                lblStatus.Text = "상태: 연결됨";
                txtServerIP.Enabled = false;
                txtPort.Enabled = false;

                // 메시지 수신 스레드 시작
                receiveThread = new Thread(ReceiveMessages);
                receiveThread.IsBackground = true;
                receiveThread.Start();

                LogMessage($"Connected to TLS server: {serverIP}:{port}");
            }
            catch (Exception ex)
            {
                LogMessage($"Connection error: {ex.Message}");
                DisconnectFromServer();
            }
        }

        private void DisconnectFromServer()
        {
            try
            {
                isConnected = false;
                sslStream?.Close();
                tcpClient?.Close();

                btnConnectDisconnect.Text = "연결";
                lblStatus.Text = "상태: 연결 안됨";
                txtServerIP.Enabled = true;
                txtPort.Enabled = true;

                LogMessage("Server disconnected");
            }
            catch (Exception ex)
            {
                LogMessage($"Disconnection error: {ex.Message}");
            }
        }

        private bool ValidateServerCertificate(object sender, X509Certificate? certificate, X509Chain? chain, SslPolicyErrors sslPolicyErrors)
        {
            if (certificate == null || caCertificate == null)
                return false;

            try
            {
                var serverCert = new X509Certificate2(certificate);
                
                // CA 인증서로 서버 인증서 검증
                using (var certChain = new X509Chain())
                {
                    certChain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
                    certChain.ChainPolicy.RevocationFlag = X509RevocationFlag.ExcludeRoot;
                    certChain.ChainPolicy.VerificationFlags = X509VerificationFlags.AllowUnknownCertificateAuthority;
                    certChain.ChainPolicy.ExtraStore.Add(caCertificate);

                    return certChain.Build(serverCert);
                }
            }
            catch
            {
                return false;
            }
        }

        private void ReceiveMessages()
        {
            byte[] buffer = new byte[1024];
            while (isConnected)
            {
                try
                {
                    int bytesRead = sslStream?.Read(buffer, 0, buffer.Length) ?? 0;
                    if (bytesRead > 0)
                    {
                        string message = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                        Invoke(new Action(() => LogMessage($"Server message: {message}")));
                    }
                }
                catch (Exception ex)
                {
                    if (isConnected)
                    {
                        Invoke(new Action(() => LogMessage($"Message receive error: {ex.Message}")));
                    }
                }
            }
        }

        private void btnSendMessage_Click(object sender, EventArgs e)
        {
            if (!isConnected || string.IsNullOrEmpty(txtMessage.Text))
                return;

            try
            {
                string message = txtMessage.Text;
                byte[] data = Encoding.UTF8.GetBytes(message);
                sslStream?.Write(data, 0, data.Length);
                
                LogMessage($"Client message: {message}");
                txtMessage.Clear();
            }
            catch (Exception ex)
            {
                LogMessage($"Message send error: {ex.Message}");
            }
        }

        private void btnRequestCert_Click(object sender, EventArgs e)
        {
            string certName = txtCertName.Text;
            if (string.IsNullOrEmpty(certName))
            {
                MessageBox.Show("인증서명을 입력하세요.", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            try
            {
                // CA 서버에 인증서 요청
                RequestCertificateFromCA(certName);
            }
            catch (Exception ex)
            {
                LogMessage($"Certificate request error: {ex.Message}");
            }
        }

        private void RequestCertificateFromCA(string certName)
        {
            try
            {
                using (var caClient = new TcpClient())
                {
                    caClient.Connect("127.0.0.1", 8888); // CA 서버 포트
                    
                    using (var stream = caClient.GetStream())
                    {
                        // 인증서 요청 JSON
                        var request = new
                        {
                            action = "issue_certificate",
                            common_name = certName,
                            type = "client"
                        };
                        
                        string jsonRequest = System.Text.Json.JsonSerializer.Serialize(request);
                        byte[] requestData = Encoding.UTF8.GetBytes(jsonRequest);
                        stream.Write(requestData, 0, requestData.Length);
                        
                        // 응답 수신
                        byte[] responseBuffer = new byte[4096];
                        int bytesRead = stream.Read(responseBuffer, 0, responseBuffer.Length);
                        string jsonResponse = Encoding.UTF8.GetString(responseBuffer, 0, bytesRead);
                        
                        var response = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, object>>(jsonResponse);
                        
                        if (response.ContainsKey("status") && response["status"].ToString() == "success")
                        {
                            // 인증서와 개인키 저장
                            string certPem = response["certificate"].ToString()!;
                            string keyPem = response["private_key"].ToString()!;
                            
                            File.WriteAllText($"../certificates/{certName}.crt", certPem);
                            File.WriteAllText($"../certificates/{certName}.key", keyPem);
                            
                            LogMessage($"Certificate issued successfully: {certName}");
                            
                            // 인증서 다시 로드
                            InitializeCertificates();
                        }
                        else
                        {
                            LogMessage($"Certificate issuance failed: {response.GetValueOrDefault("message", "Unknown error")}");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                LogMessage($"CA server connection error: {ex.Message}");
            }
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
            if (isConnected)
            {
                DisconnectFromServer();
            }
            base.OnFormClosing(e);
        }
    }
}
