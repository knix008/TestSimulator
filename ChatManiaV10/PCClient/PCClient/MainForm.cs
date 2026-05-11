using Newtonsoft.Json.Linq;

namespace PCClient
{
    public partial class MainForm : Form
    {
        private ChatClient? _chatClient;
        private Dictionary<string, ChatRoomForm> _openRooms = new Dictionary<string, ChatRoomForm>();

        public MainForm()
        {
            InitializeComponent();
        }

        // 연결 버튼 클릭
        private async void buttonConnect_Click(object sender, EventArgs e)
        {
            if (string.IsNullOrWhiteSpace(textBoxNickname.Text))
            {
                MessageBox.Show("닉네임을 입력하세요.", "오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            if (string.IsNullOrWhiteSpace(textBoxServerUrl.Text))
            {
                MessageBox.Show("서버 주소를 입력하세요.", "오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            try
            {
                _chatClient = new ChatClient();
                
                // 이벤트 핸들러 등록 (방 목록 관련만)
                _chatClient.SystemMessage += OnSystemMessage;
                _chatClient.ConnectionStateChanged += OnConnectionStateChanged;
                _chatClient.RoomListReceived += OnRoomListReceived;
                _chatClient.RoomCreated += OnRoomCreated;

                buttonConnect.Enabled = false;
                labelStatus.Text = "⌛ 연결 중...";
                labelStatus.ForeColor = Color.FromArgb(149, 165, 166);

                await _chatClient.ConnectAsync(textBoxServerUrl.Text, textBoxNickname.Text);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"연결 실패: {ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                buttonConnect.Enabled = true;
                labelStatus.Text = "❌ 연결되지 않음";
                labelStatus.ForeColor = Color.FromArgb(149, 165, 166);
            }
        }

        // 연결 해제 버튼 클릭
        private async void buttonDisconnect_Click(object sender, EventArgs e)
        {
            if (_chatClient != null)
            {
                await _chatClient.DisconnectAsync();
                _chatClient.Dispose();
                _chatClient = null;
            }
        }

        // 방 목록 새로고침 버튼 클릭
        private async void buttonRefreshRooms_Click(object sender, EventArgs e)
        {
            if (_chatClient != null && _chatClient.IsConnected)
            {
                await _chatClient.RequestRoomListAsync();
            }
        }

        // 방 만들기 버튼 클릭
        private async void buttonCreateRoom_Click(object sender, EventArgs e)
        {
            if (_chatClient == null || !_chatClient.IsConnected)
            {
                MessageBox.Show("서버에 먼저 연결하세요.", "오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            if (string.IsNullOrWhiteSpace(textBoxRoomName.Text))
            {
                MessageBox.Show("방 이름을 입력하세요.", "오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            try
            {
                string? password = string.IsNullOrWhiteSpace(textBoxRoomPassword.Text) 
                    ? null 
                    : textBoxRoomPassword.Text;

                int maxPeers = (int)numericUpDownMaxPeers.Value;

                await _chatClient.CreateRoomAsync(textBoxRoomName.Text, password, maxPeers);
                // 방 생성 후 OnRoomCreated 이벤트에서 자동으로 새 창 열림
            }
            catch (Exception ex)
            {
                MessageBox.Show($"방 생성 실패: {ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 방 참가 버튼 클릭
        private void buttonJoinRoom_Click(object sender, EventArgs e)
        {
            JoinSelectedRoom();
        }

        // ListView 더블클릭 이벤트
        private void listViewRooms_DoubleClick(object sender, EventArgs e)
        {
            JoinSelectedRoom();
        }

        // 선택한 방 참가 헬퍼 메서드
        private void JoinSelectedRoom()
        {
            if (_chatClient == null || !_chatClient.IsConnected)
            {
                MessageBox.Show("서버에 먼저 연결하세요.", "오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            if (listViewRooms.SelectedItems.Count == 0)
            {
                MessageBox.Show("참가할 방을 선택하세요.", "오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            try
            {
                string roomId = listViewRooms.SelectedItems[0].SubItems[1].Text;
                string isLocked = listViewRooms.SelectedItems[0].SubItems[3].Text;

                // 이미 열린 방인지 확인
                if (_openRooms.ContainsKey(roomId))
                {
                    var existingForm = _openRooms[roomId];
                    if (!existingForm.IsDisposed)
                    {
                        // 기존 창 활성화
                        existingForm.Activate();
                        existingForm.BringToFront();
                        if (existingForm.WindowState == FormWindowState.Minimized)
                        {
                            existingForm.WindowState = FormWindowState.Normal;
                        }
                        return;
                    }
                    else
                    {
                        // 창이 닫혀있으면 목록에서 제거
                        _openRooms.Remove(roomId);
                    }
                }

                string? password = null;
                if (isLocked == "🔒")
                {
                    password = PromptForPassword("비밀번호가 필요한 방입니다.");
                    if (password == null)
                    {
                        return; // 취소됨
                    }
                }

                // 새 창으로 채팅방 열기
                var chatRoomForm = new ChatRoomForm(
                    textBoxServerUrl.Text,
                    textBoxNickname.Text,
                    roomId,
                    password
                );
                
                // 창이 닫힐 때 목록에서 제거
                chatRoomForm.FormClosed += (s, e) => _openRooms.Remove(roomId);
                
                _openRooms[roomId] = chatRoomForm;
                chatRoomForm.Show();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"방 참가 실패: {ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 방 나가기 버튼 클릭 - 제거 (개별 채팅방 창에서 처리)
        // 메시지 전송 버튼 클릭 - 제거 (개별 채팅방 창에서 처리)
        // 파일 전송 버튼 클릭 - 제거 (개별 채팅방 창에서 처리)
        // 비밀번호 변경 버튼 클릭 - 제거 (개별 채팅방 창에서 처리)

        // 이벤트 핸들러: 시스템 메시지
        private void OnSystemMessage(object? sender, string message)
        {
            if (InvokeRequired)
            {
                Invoke(new Action(() => OnSystemMessage(sender, message)));
                return;
            }

            // 시스템 메시지를 상태 표시줄이나 메시지 박스로 표시 (필요한 경우)
            Console.WriteLine($"[시스템] {message}");
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
                buttonConnect.Enabled = false;
                buttonDisconnect.Enabled = true;
                buttonRefreshRooms.Enabled = true;
                buttonCreateRoom.Enabled = true;
                buttonJoinRoom.Enabled = true;
            }
            else
            {
                labelStatus.Text = "❌ 연결되지 않음";
                labelStatus.ForeColor = Color.FromArgb(149, 165, 166);
                buttonConnect.Enabled = true;
                buttonDisconnect.Enabled = false;
                buttonRefreshRooms.Enabled = false;
                buttonCreateRoom.Enabled = false;
                buttonJoinRoom.Enabled = false;
            }
        }

        // 이벤트 핸들러: 방 생성 완료
        private void OnRoomCreated(object? sender, (string roomId, string? password) data)
        {
            if (InvokeRequired)
            {
                Invoke(new Action(() => OnRoomCreated(sender, data)));
                return;
            }

            // 이미 열린 방인지 확인 (일반적으로 없겠지만 안전장치)
            if (_openRooms.ContainsKey(data.roomId))
            {
                var existingForm = _openRooms[data.roomId];
                if (!existingForm.IsDisposed)
                {
                    existingForm.Activate();
                    return;
                }
                else
                {
                    _openRooms.Remove(data.roomId);
                }
            }

            // 새 채팅방 창 열기
            var chatRoomForm = new ChatRoomForm(
                textBoxServerUrl.Text,
                textBoxNickname.Text,
                data.roomId,
                data.password
            );
            
            // 창이 닫힐 때 목록에서 제거
            chatRoomForm.FormClosed += (s, e) => _openRooms.Remove(data.roomId);
            
            _openRooms[data.roomId] = chatRoomForm;
            chatRoomForm.Show();

            // 방 목록 새로고침
            _ = _chatClient?.RequestRoomListAsync();
        }

        // 이벤트 핸들러: 방 목록 수신
        private void OnRoomListReceived(object? sender, JObject data)
        {
            if (InvokeRequired)
            {
                Invoke(new Action(() => OnRoomListReceived(sender, data)));
                return;
            }

            listViewRooms.Items.Clear();

            var rooms = data["rooms"] as JArray;
            if (rooms != null)
            {
                foreach (var room in rooms)
                {
                    string roomName = room["name"]?.ToString() ?? "알 수 없음";
                    string roomId = room["id"]?.ToString() ?? "";
                    int peerCount = room["peerCount"]?.ToObject<int>() ?? 0;
                    int maxPeers = room["maxPeers"]?.ToObject<int>() ?? 0;
                    bool hasPassword = room["hasPassword"]?.ToObject<bool>() ?? false;

                    var item = new ListViewItem(roomName);
                    item.SubItems.Add(roomId);
                    item.SubItems.Add($"{peerCount}/{maxPeers}");
                    item.SubItems.Add(hasPassword ? "🔒" : "");

                    listViewRooms.Items.Add(item);
                }
            }
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

        // 폼 닫기
        private async void MainForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            if (_chatClient != null && _chatClient.IsConnected)
            {
                await _chatClient.DisconnectAsync();
                _chatClient.Dispose();
            }
        }
    }
}
