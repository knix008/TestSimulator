using System.Net.Security;
using System.Net.Sockets;

namespace TLSClient
{
    public partial class TLSClient : Form
    {
        private const int SERVER_PORT = 8443;
        private TcpClient? tcpClient;
        private SslStream? sslStream;
        private bool isConnected = false;

        public TLSClient()
        {
            InitializeComponent();
        }

        private void LogMessage(string message)
        {
            if (LogTextBox.InvokeRequired)
            {
                LogTextBox.Invoke(new Action(() => LogMessage(message)));
                return;
            }

            string logEntry = $"[{DateTime.Now:HH:mm:ss.fff}] {message}{Environment.NewLine}";
            LogTextBox.AppendText(logEntry);
            LogTextBox.ScrollToCaret();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            DisconnectFromServer();
            base.OnFormClosing(e);
        }
    }
}
