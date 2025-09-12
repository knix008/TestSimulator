using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;

namespace TLSServer
{
    public partial class TLSServer : Form
    {
        private TcpListener? listener;
        private bool isRunning = false;
        private X509Certificate2? serverCertificate;
        private readonly object logLock = new object();

        public TLSServer()
        {
            InitializeComponent();
            InitializeServer();
        }

        private void InitializeServer()
        {
            try
            {
                if (File.Exists("server.pfx"))
                {
                    // 기존 인증서 로드
                    serverCertificate = new X509Certificate2("server.pfx", "your-password",
                        X509KeyStorageFlags.MachineKeySet | 
                        X509KeyStorageFlags.PersistKeySet | 
                        X509KeyStorageFlags.Exportable);
                }
                else
                {
                    // 새 인증서 생성
                    serverCertificate = GenerateSelfSignedCertificate();
                }
                
                // 서버 시작
                StartServer();
            }
            catch (Exception ex)
            {
                LogMessage($"서버 초기화 오류: {ex.Message}");
            }
        }

        private async void StartServer()
        {
            try
            {
                listener = new TcpListener(IPAddress.Any, 8443);
                listener.Start();
                isRunning = true;
                LogMessage("서버가 시작되었습니다. (포트: 8443)");

                while (isRunning)
                {
                    TcpClient client = await listener.AcceptTcpClientAsync();
                    _ = HandleClientAsync(client);
                }
            }
            catch (Exception ex)
            {
                LogMessage($"서버 시작 오류: {ex.Message}");
            }
        }

        private async Task HandleClientAsync(TcpClient client)
        {
            try
            {
                using (SslStream sslStream = new SslStream(client.GetStream(), false))
                {
                    await sslStream.AuthenticateAsServerAsync(
                        serverCertificate,
                        clientCertificateRequired: false,
                        SslProtocols.Tls12 | SslProtocols.Tls13,
                        checkCertificateRevocation: true);

                    LogMessage($"클라이언트 연결됨: {client.Client.RemoteEndPoint}");

                    // 클라이언트와의 통신 처리
                    byte[] buffer = new byte[4096];
                    while (true)
                    {
                        int bytesRead = await sslStream.ReadAsync(buffer);
                        if (bytesRead == 0) break;

                        string receivedData = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                        LogMessage($"수신된 데이터: {receivedData}");

                        // 에코 응답
                        byte[] response = Encoding.UTF8.GetBytes($"서버 응답: {receivedData}");
                        await sslStream.WriteAsync(response);
                    }
                }
            }
            catch (Exception ex)
            {
                LogMessage($"클라이언트 처리 오류: {ex.Message}");
            }
            finally
            {
                client.Close();
            }
        }

        private void LogMessage(string message)
        {
            if (LogTextBox.InvokeRequired)
            {
                LogTextBox.Invoke(new Action(() => LogMessage(message)));
                return;
            }

            lock (logLock)
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}{Environment.NewLine}");
                LogTextBox.ScrollToCaret();
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            isRunning = false;
            listener?.Stop();
            base.OnFormClosing(e);
        }

        private X509Certificate2 GenerateSelfSignedCertificate()
        {
            string subjectName = "CN=localhost";
            string password = "your-password";
            
            using (RSA rsa = RSA.Create(2048))
            {
                var request = new CertificateRequest(
                    subjectName, 
                    rsa, 
                    HashAlgorithmName.SHA256, 
                    RSASignaturePadding.Pkcs1);

                request.CertificateExtensions.Add(
                    new X509BasicConstraintsExtension(false, false, 0, true));

                request.CertificateExtensions.Add(
                    new X509KeyUsageExtension(
                        X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment,
                        true));

                request.CertificateExtensions.Add(
                    new X509EnhancedKeyUsageExtension(
                        new OidCollection { new Oid("1.3.6.1.5.5.7.3.1") }, // Server Authentication
                        true));

                var sanBuilder = new SubjectAlternativeNameBuilder();
                sanBuilder.AddDnsName("localhost");
                sanBuilder.AddIpAddress(IPAddress.Loopback);
                sanBuilder.AddIpAddress(IPAddress.IPv6Loopback);
                request.CertificateExtensions.Add(sanBuilder.Build());

                // 인증서 생성
                var certificate = request.CreateSelfSigned(
                    DateTimeOffset.Now.AddDays(-1),
                    DateTimeOffset.Now.AddYears(1));

                // 영구적인 개인 키로 인증서 생성
                var certificateWithKey = new X509Certificate2(
                    certificate.Export(X509ContentType.Pfx, password),
                    password,
                    X509KeyStorageFlags.MachineKeySet | 
                    X509KeyStorageFlags.PersistKeySet | 
                    X509KeyStorageFlags.Exportable);

                // PFX 파일로 내보내기
                File.WriteAllBytes("server.pfx", 
                    certificateWithKey.Export(X509ContentType.Pfx, password));

                LogMessage("자체 서명 인증서가 생성되었습니다: server.pfx");
                return certificateWithKey;
            }
        }
    }
}
