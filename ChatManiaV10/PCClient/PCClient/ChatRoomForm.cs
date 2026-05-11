using Newtonsoft.Json.Linq;

namespace PCClient
{
    public partial class ChatRoomForm : Form
    {
        private ChatClient? _chatClient;
        private readonly string _serverUrl;
        private readonly string _nickname;
        private readonly string _roomId;
        private readonly string? _password;

        public ChatRoomForm(string serverUrl, string nickname, string roomId, string? password = null)
        {
            _serverUrl = serverUrl;
            _nickname = nickname;
            _roomId = roomId;
            _password = password;

            InitializeComponent();
            this.Text = $"채팅방: {roomId}";
        }

        private async void ChatRoomForm_Load(object sender, EventArgs e)
        {
            try
            {
                _chatClient = new ChatClient();

                // 이벤트 핸들러 등록
                _chatClient.MessageReceived += OnMessageReceived;
                _chatClient.SystemMessage += OnSystemMessage;
                _chatClient.ConnectionStateChanged += OnConnectionStateChanged;
                _chatClient.RoomJoined += OnRoomJoined;
                _chatClient.RoomLeft += OnRoomLeft;
                _chatClient.RoomDeleted += OnRoomDeleted;
                _chatClient.FileReceived += OnFileReceived;

                labelStatus.Text = "⌛ 연결 중...";
                labelStatus.ForeColor = Color.FromArgb(149, 165, 166);

                // 서버 연결
                await _chatClient.ConnectAsync(_serverUrl, _nickname);

                // 방 참가
                await _chatClient.JoinRoomAsync(_roomId, _password);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"채팅방 연결 실패: {ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                this.Close();
            }
        }

        // 메시지 전송 버튼 클릭
        private async void buttonSendMessage_Click(object sender, EventArgs e)
        {
            await SendMessageAsync();
        }

        // 메시지 입력란에서 Enter 키 처리
        private void textBoxMessage_KeyPress(object sender, KeyPressEventArgs e)
        {
            if (e.KeyChar == (char)Keys.Enter)
            {
                e.Handled = true;
                _ = SendMessageAsync();
            }
        }

        // 파일 전송 버튼 클릭
        private async void buttonSendFile_Click(object sender, EventArgs e)
        {
            if (_chatClient == null || !_chatClient.IsConnected || _chatClient.CurrentRoomId == null)
            {
                MessageBox.Show("채팅방에 연결되지 않았습니다.", "오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            using var openFileDialog = new OpenFileDialog
            {
                Title = "전송할 파일 선택",
                Filter = "이미지 파일|*.jpg;*.jpeg;*.png;*.gif;*.webp;*.bmp|" +
                         "동영상 파일|*.mp4;*.webm;*.mov;*.avi|" +
                         "압축 파일|*.zip;*.rar;*.7z|" +
                         "모든 파일|*.*",
                FilterIndex = 4
            };

            if (openFileDialog.ShowDialog() == DialogResult.OK)
            {
                try
                {
                    FileInfo fileInfo = new FileInfo(openFileDialog.FileName);

                    // 10MB 제한
                    if (fileInfo.Length > 10 * 1024 * 1024)
                    {
                        MessageBox.Show("파일 크기는 10MB를 초과할 수 없습니다.", "오류",
                            MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }

                    byte[] fileData = File.ReadAllBytes(openFileDialog.FileName);
                    string mimeType = GetMimeType(fileInfo.Extension);

                    await _chatClient.SendFileAsync(fileInfo.Name, fileData, mimeType);

                    AppendChatMessage($"[나] 파일 전송: {fileInfo.Name}", Color.Green);
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"파일 전송 실패: {ex.Message}", "오류",
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }

        // 비밀번호 변경 버튼 클릭
        private async void buttonChangePassword_Click(object sender, EventArgs e)
        {
            if (_chatClient == null || !_chatClient.IsOwner)
            {
                MessageBox.Show("방장만 비밀번호를 변경할 수 있습니다.", "오류",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            string? newPassword = PromptForPassword("새 비밀번호를 입력하세요 (빈 칸으로 비밀번호 제거):");
            if (newPassword != null)
            {
                try
                {
                    await _chatClient.ChangePasswordAsync(newPassword);
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"비밀번호 변경 실패: {ex.Message}", "오류",
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }

        // 방 나가기 버튼 클릭
        private async void buttonLeaveRoom_Click(object sender, EventArgs e)
        {
            if (_chatClient != null && _chatClient.IsConnected)
            {
                await _chatClient.LeaveRoomAsync();
            }
            this.Close();
        }

        // 메시지 전송 헬퍼
        private async Task SendMessageAsync()
        {
            if (_chatClient == null || !_chatClient.IsConnected || _chatClient.CurrentRoomId == null)
            {
                return;
            }

            if (string.IsNullOrWhiteSpace(textBoxMessage.Text))
            {
                return;
            }

            try
            {
                string message = textBoxMessage.Text.Trim();
                await _chatClient.SendChatMessageAsync(message);

                // 내가 보낸 메시지 표시
                AppendChatMessage($"[나] {message}", Color.Blue);
                textBoxMessage.Clear();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"메시지 전송 실패: {ex.Message}", "오류",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 이벤트 핸들러: 메시지 수신
        private void OnMessageReceived(object? sender, string message)
        {
            if (InvokeRequired)
            {
                Invoke(new Action(() => OnMessageReceived(sender, message)));
                return;
            }

            AppendChatMessage(message, Color.Black);
        }

        // 이벤트 핸들러: 시스템 메시지
        private void OnSystemMessage(object? sender, string message)
        {
            if (InvokeRequired)
            {
                Invoke(new Action(() => OnSystemMessage(sender, message)));
                return;
            }

            AppendChatMessage($"[시스템] {message}", Color.Gray);
        }

        // 이벤트 핸들러: 파일 수신
        private void OnFileReceived(object? sender, string message)
        {
            if (InvokeRequired)
            {
                Invoke(new Action(() => OnFileReceived(sender, message)));
                return;
            }

            AppendChatMessage(message, Color.DarkGreen);
        }

        // 이벤트 핸들러: 연결 상태 변경
        private void OnConnectionStateChanged(object? sender, bool isConnected)
        {
            if (InvokeRequired)
            {
                Invoke(new Action(() => OnConnectionStateChanged(sender, isConnected)));
                return;
            }

            if (isConnected)
            {
                labelStatus.Text = "✅ 연결됨 🔒";
                labelStatus.ForeColor = Color.FromArgb(84, 110, 122);
            }
            else
            {
                labelStatus.Text = "❌ 연결 끊김";
                labelStatus.ForeColor = Color.FromArgb(231, 76, 60);
                MessageBox.Show("서버 연결이 끊어졌습니다.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
                this.Close();
            }
        }

        // 이벤트 핸들러: 방 참가 완료
        private void OnRoomJoined(object? sender, string roomId)
        {
            if (InvokeRequired)
            {
                Invoke(new Action(() => OnRoomJoined(sender, roomId)));
                return;
            }

            labelCurrentRoom.Text = $"현재 방: {roomId}";
            richTextBoxChatHistory.Clear();
            AppendChatMessage($"[시스템] 방 {roomId}에 입장했습니다. 🔒 암호화 활성화", Color.Blue);

            // 방장이면 비밀번호 변경 버튼 활성화
            if (_chatClient?.IsOwner == true)
            {
                buttonChangePassword.Enabled = true;
            }

            // UI 활성화
            textBoxMessage.Enabled = true;
            buttonSendMessage.Enabled = true;
            buttonSendFile.Enabled = true;
            buttonLeaveRoom.Enabled = true;
        }

        // 이벤트 핸들러: 방 나가기
        private void OnRoomLeft(object? sender, string roomId)
        {
            if (InvokeRequired)
            {
                Invoke(new Action(() => OnRoomLeft(sender, roomId)));
                return;
            }

            AppendChatMessage($"[시스템] 방 {roomId}에서 나갔습니다.", Color.Red);
        }

        // 이벤트 핸들러: 방 삭제됨
        private void OnRoomDeleted(object? sender, string roomId)
        {
            if (InvokeRequired)
            {
                Invoke(new Action(() => OnRoomDeleted(sender, roomId)));
                return;
            }

            MessageBox.Show("방이 삭제되어 채팅방을 나갑니다.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
            this.Close();
        }

        // 채팅 내역에 메시지 추가
        private void AppendChatMessage(string message, Color color)
        {
            richTextBoxChatHistory.SelectionStart = richTextBoxChatHistory.TextLength;
            richTextBoxChatHistory.SelectionLength = 0;
            richTextBoxChatHistory.SelectionColor = color;
            richTextBoxChatHistory.AppendText($"{DateTime.Now:HH:mm:ss} {message}\n");
            richTextBoxChatHistory.SelectionColor = richTextBoxChatHistory.ForeColor;
            richTextBoxChatHistory.ScrollToCaret();
        }

        // 비밀번호 입력 프롬프트
        private string? PromptForPassword(string message)
        {
            using var form = new Form
            {
                Text = "비밀번호",
                Width = 400,
                Height = 150,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                StartPosition = FormStartPosition.CenterParent,
                MaximizeBox = false,
                MinimizeBox = false
            };

            var label = new Label
            {
                Text = message,
                Left = 20,
                Top = 20,
                Width = 350
            };

            var textBox = new TextBox
            {
                Left = 20,
                Top = 50,
                Width = 340,
                PasswordChar = '*'
            };

            var buttonOk = new Button
            {
                Text = "확인",
                Left = 200,
                Top = 80,
                Width = 75,
                DialogResult = DialogResult.OK
            };

            var buttonCancel = new Button
            {
                Text = "취소",
                Left = 285,
                Top = 80,
                Width = 75,
                DialogResult = DialogResult.Cancel
            };

            form.Controls.Add(label);
            form.Controls.Add(textBox);
            form.Controls.Add(buttonOk);
            form.Controls.Add(buttonCancel);
            form.AcceptButton = buttonOk;
            form.CancelButton = buttonCancel;

            return form.ShowDialog() == DialogResult.OK ? textBox.Text : null;
        }

        // MIME 타입 결정
        private string GetMimeType(string extension)
        {
            return extension.ToLower() switch
            {
                ".jpg" or ".jpeg" => "image/jpeg",
                ".png" => "image/png",
                ".gif" => "image/gif",
                ".webp" => "image/webp",
                ".bmp" => "image/bmp",
                ".mp4" => "video/mp4",
                ".webm" => "video/webm",
                ".mov" => "video/quicktime",
                ".avi" => "video/x-msvideo",
                ".zip" => "application/zip",
                ".rar" => "application/x-rar-compressed",
                ".7z" => "application/x-7z-compressed",
                _ => "application/octet-stream"
            };
        }

        // 폼 닫기
        private async void ChatRoomForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            if (_chatClient != null && _chatClient.IsConnected)
            {
                try
                {
                    await _chatClient.LeaveRoomAsync();
                    await _chatClient.DisconnectAsync();
                }
                catch
                {
                    // 이미 연결이 끊긴 경우 무시
                }
                finally
                {
                    _chatClient.Dispose();
                }
            }
        }
    }
}
