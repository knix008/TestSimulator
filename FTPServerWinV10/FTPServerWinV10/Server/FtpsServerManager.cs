using System.IO;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Cryptography.X509Certificates;

namespace FTPServerWinV10.Server
{
    public class FtpsServerManager : FtpServerManager
    {
        private readonly string _certPath;
        private readonly string _certPassword;
        private X509Certificate2? _certificate;

        public FtpsServerManager(VirtualFileSystem vfs, string certPath, string certPassword, int port = 990)
            : base(vfs, port)
        {
            _certPath = certPath;
            _certPassword = certPassword;
        }

        public override void Start()
        {
            if (!string.IsNullOrEmpty(_certPath))
                _certificate = new X509Certificate2(_certPath, _certPassword);
            base.Start();
        }

        protected override Stream GetClientStream(TcpClient client)
        {
            if (_certificate == null)
                return client.GetStream();
            var sslStream = new SslStream(client.GetStream(), false);
            sslStream.AuthenticateAsServer(_certificate, false, false);
            return sslStream;
        }
    }
}
