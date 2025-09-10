using System.Net.Security;
using System.Net.Sockets;
using System.Security.Cryptography.X509Certificates;

namespace TLSClient
{
    public partial class TLSClient
    {
        private async void ConnectButton_Click(object sender, EventArgs e)
        {
            if (!isConnected)
            {
                ConnectButton.Enabled = false;
                await ConnectToServer();
                ConnectButton.Enabled = true;
            }
            else
            {
                DisconnectFromServer();
            }
        }

        private async Task ConnectToServer()
        {
            try
            {
                string serverAddress = ServerAddressTextBox.Text;
                LogMessage($"서버 연결 시도 중... (주소: {serverAddress}:{SERVER_PORT})");

                tcpClient = new TcpClient();
                await tcpClient.ConnectAsync(serverAddress, SERVER_PORT);
                LogMessage("TCP 연결 성공");

                sslStream = new SslStream(
                    tcpClient.GetStream(),
                    false,
                    new RemoteCertificateValidationCallback(ValidateServerCertificate),
                    null
                );

                LogMessage("TLS 인증 시작...");
                await sslStream.AuthenticateAsClientAsync(new SslClientAuthenticationOptions
                {
                    TargetHost = serverAddress,
                    EnabledSslProtocols = System.Security.Authentication.SslProtocols.Tls12 | 
                                        System.Security.Authentication.SslProtocols.Tls13,
                    RemoteCertificateValidationCallback = ValidateServerCertificate
                });
                
                LogMessage("TLS 인증 완료");
                ConnectButton.Text = "Disconnect...";
                isConnected = true;
                ServerAddressTextBox.Enabled = false;
            }
            catch (Exception ex)
            {
                LogMessage($"오류 발생: {ex.Message}");
                MessageBox.Show($"연결 오류: {ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                DisconnectFromServer();
            }
        }

        private void DisconnectFromServer()
        {
            LogMessage("서버와 연결 종료 중...");
            sslStream?.Dispose();
            tcpClient?.Dispose();
            sslStream = null;
            tcpClient = null;
            isConnected = false;

            ConnectButton.Text = "Connect...";
            ServerAddressTextBox.Enabled = true;
            LogMessage("연결이 종료되었습니다.");
        }

        private bool ValidateServerCertificate(
            object sender,
            X509Certificate? certificate,
            X509Chain? chain,
            SslPolicyErrors sslPolicyErrors)
        {
            if (certificate == null)
            {
                LogMessage("경고: 서버가 인증서를 제공하지 않았습니다.");
                return false;
            }

            LogMessage($"서버 인증서 검증: {sslPolicyErrors}");
            LogMessage($"인증서 정보: {certificate.Subject}");

            // 로컬 발행 인증서의 경우 RemoteCertificateChainErrors 오류가 발생할 수 있음
            if (sslPolicyErrors == SslPolicyErrors.RemoteCertificateChainErrors)
            {
                var cert2 = certificate as X509Certificate2 ?? new X509Certificate2(certificate);
                LogMessage($"로컬 발행 인증서 감지: {cert2.GetNameInfo(X509NameType.SimpleName, false)}");
                return true;
            }

            // 로컬호스트 접속 시 인증서 이름 불일치 허용
            if (sslPolicyErrors == SslPolicyErrors.RemoteCertificateNameMismatch && 
                ServerAddressTextBox.Text.ToLower() == "localhost")
            {
                LogMessage("로컬호스트 접속: 인증서 이름 불일치 허용");
                return true;
            }

            if (sslPolicyErrors == SslPolicyErrors.None)
            {
                LogMessage("인증서 검증 성공");
                return true;
            }

            LogMessage($"경고: 알 수 없는 인증서 오류 - {sslPolicyErrors}");
            return false;
        }
    }
}