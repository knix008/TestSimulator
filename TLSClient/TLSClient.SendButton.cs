using System.Text;

namespace TLSClient
{
    public partial class TLSClient
    {
        private async void SendButton_Click(object sender, EventArgs e)
        {
            if (!isConnected)
            {
                LogMessage("서버에 연결되어 있지 않습니다. 먼저 연결을 수행하세요.");
                return;
            }

            try
            {
                string message = MessageTextBox.Text;
                if (string.IsNullOrEmpty(message))
                {
                    LogMessage("전송할 메시지를 입력하세요.");
                    return;
                }

                byte[] messageBytes = Encoding.UTF8.GetBytes(message);
                await sslStream!.WriteAsync(messageBytes);
                await sslStream.FlushAsync();

                LogMessage($"메시지 전송 완료: {message}");
                MessageTextBox.Clear();
            }
            catch (Exception ex)
            {
                LogMessage($"메시지 전송 중 오류 발생: {ex.Message}");
                MessageBox.Show($"전송 오류: {ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                DisconnectFromServer();
            }
        }

        private async Task StartReceiving()
        {
            byte[] buffer = new byte[4096];
            try
            {
                while (isConnected)
                {
                    int bytesRead = await sslStream!.ReadAsync(buffer);
                    if (bytesRead == 0)
                    {
                        LogMessage("서버와의 연결이 종료되었습니다.");
                        DisconnectFromServer();
                        break;
                    }

                    string receivedMessage = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                    LogMessage($"수신: {receivedMessage}");
                }
            }
            catch (Exception ex)
            {
                if (isConnected)
                {
                    LogMessage($"메시지 수신 중 오류 발생: {ex.Message}");
                    DisconnectFromServer();
                }
            }
        }
    }
}