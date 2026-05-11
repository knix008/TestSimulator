using System.Net.WebSockets;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace PCClient
{
    /// <summary>
    /// WebSocket 기반 채팅 클라이언트
    /// </summary>
    public class ChatClient : IDisposable
    {
        private ClientWebSocket? _webSocket;
        private CancellationTokenSource? _cancellationTokenSource;
        private string? _serverUrl;
        private string? _clientId;
        private string? _currentRoomId;
        private string? _nickname;
        private byte[]? _encryptionKey;
        private bool _isOwner;
        private string? _tempPassword; // 방 생성 시 임시 비밀번호 저장

        public event EventHandler<string>? MessageReceived;
        public event EventHandler<string>? SystemMessage;
        public event EventHandler<bool>? ConnectionStateChanged;
        public event EventHandler<JObject>? RoomListReceived;
        public event EventHandler<string>? RoomJoined;
        public event EventHandler<string>? FileReceived;

        public bool IsConnected => _webSocket?.State == WebSocketState.Open;
        public string? CurrentRoomId => _currentRoomId;
        public string? Nickname => _nickname;
        public bool IsOwner => _isOwner;

        /// <summary>
        /// 서버에 연결
        /// </summary>
        public async Task ConnectAsync(string serverUrl, string nickname)
        {
            if (IsConnected)
            {
                throw new InvalidOperationException("이미 연결되어 있습니다.");
            }

            _serverUrl = serverUrl;
            _nickname = nickname;
            _webSocket = new ClientWebSocket();
            _cancellationTokenSource = new CancellationTokenSource();

            try
            {
                await _webSocket.ConnectAsync(new Uri(serverUrl), _cancellationTokenSource.Token);
                ConnectionStateChanged?.Invoke(this, true);
                SystemMessage?.Invoke(this, "서버에 연결되었습니다.");

                // 메시지 수신 시작
                _ = Task.Run(ReceiveMessagesAsync);
            }
            catch (Exception ex)
            {
                SystemMessage?.Invoke(this, $"연결 실패: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 방 목록 요청
        /// </summary>
        public async Task RequestRoomListAsync()
        {
            await SendMessageAsync(new { type = "list-rooms" });
        }

        /// <summary>
        /// 방 생성
        /// </summary>
        public async Task CreateRoomAsync(string roomName, string? password = null, int maxPeers = 10)
        {
            // 방 생성 시에도 암호화 키 미리 생성 (방 생성 후 자동 참가)
            // roomId는 서버에서 생성되므로, 일단 임시로 방 이름 사용
            // room-created 응답에서 실제 roomId로 재생성
            _tempPassword = password ?? "";
            
            var message = new
            {
                type = "create-room",
                name = roomName,
                password = password ?? "",
                maxPeers = maxPeers
            };
            await SendMessageAsync(message);
        }

        /// <summary>
        /// 방 참가
        /// </summary>
        public async Task JoinRoomAsync(string roomId, string? password = null)
        {
            // 암호화 키 생성
            string keySource = string.IsNullOrEmpty(password) ? roomId : password;
            _encryptionKey = EncryptionHelper.DeriveKey(keySource, roomId);

            var message = new
            {
                type = "join",
                roomId = roomId,
                password = password ?? "",
                nickname = _nickname ?? "C#사용자"
            };
            await SendMessageAsync(message);
        }

        /// <summary>
        /// 방 나가기
        /// </summary>
        public async Task LeaveRoomAsync()
        {
            if (_currentRoomId != null)
            {
                await SendMessageAsync(new { type = "leave-room" });
                _currentRoomId = null;
                _encryptionKey = null;
                _isOwner = false;
            }
        }

        /// <summary>
        /// 채팅 메시지 전송 (암호화)
        /// </summary>
        public async Task SendChatMessageAsync(string text)
        {
            if (_encryptionKey == null)
            {
                throw new InvalidOperationException("암호화 키가 없습니다. 방에 먼저 참가하세요.");
            }

            // 메시지 암호화
            string encryptedText = EncryptionHelper.Encrypt(text, _encryptionKey);

            var message = new
            {
                type = "chat-message",
                text = encryptedText,
                encrypted = true,
                nickname = _nickname
            };

            await SendMessageAsync(message);
        }

        /// <summary>
        /// 파일 전송 (Base64)
        /// </summary>
        public async Task SendFileAsync(string fileName, byte[] fileData, string mimeType)
        {
            string base64Data = Convert.ToBase64String(fileData);

            var message = new
            {
                type = "chat-message",
                fileData = new
                {
                    name = fileName,
                    type = mimeType,
                    data = base64Data
                },
                nickname = _nickname
            };

            await SendMessageAsync(message);
        }

        /// <summary>
        /// 비밀번호 변경 (방장만 가능)
        /// </summary>
        public async Task ChangePasswordAsync(string newPassword)
        {
            if (!_isOwner)
            {
                throw new InvalidOperationException("방장만 비밀번호를 변경할 수 있습니다.");
            }

            await SendMessageAsync(new
            {
                type = "change-password",
                newPassword = newPassword
            });
        }

        /// <summary>
        /// 메시지 수신 루프
        /// </summary>
        private async Task ReceiveMessagesAsync()
        {
            var buffer = new byte[1024 * 64]; // 64KB 버퍼

            try
            {
                while (_webSocket != null && _webSocket.State == WebSocketState.Open)
                {
                    var result = await _webSocket.ReceiveAsync(
                        new ArraySegment<byte>(buffer),
                        _cancellationTokenSource?.Token ?? CancellationToken.None
                    );

                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                        ConnectionStateChanged?.Invoke(this, false);
                        SystemMessage?.Invoke(this, "서버 연결이 종료되었습니다.");
                        break;
                    }

                    if (result.MessageType == WebSocketMessageType.Text)
                    {
                        string jsonMessage = Encoding.UTF8.GetString(buffer, 0, result.Count);
                        _ = HandleMessageAsync(jsonMessage);
                    }
                }
            }
            catch (Exception ex)
            {
                SystemMessage?.Invoke(this, $"수신 오류: {ex.Message}");
                ConnectionStateChanged?.Invoke(this, false);
            }
        }

        /// <summary>
        /// 수신된 메시지 처리
        /// </summary>
        private async Task HandleMessageAsync(string jsonMessage)
        {
            try
            {
                var msg = JObject.Parse(jsonMessage);
                string? type = msg["type"]?.ToString();

                switch (type)
                {
                    case "room-created":
                        {
                            var room = msg["room"];
                            string? roomId = room?["id"]?.ToString();
                            
                            if (roomId != null)
                            {
                                SystemMessage?.Invoke(this, $"방이 생성되었습니다: {roomId}");
                                // 방 생성 후 자동으로 참가
                                await JoinRoomAsync(roomId, _tempPassword);
                            }
                            _tempPassword = null; // 임시 비밀번호 제거
                            break;
                        }

                    case "joined":
                        {
                            string? roomId = msg["roomId"]?.ToString();
                            _currentRoomId = roomId;
                            _isOwner = msg["isOwner"]?.ToObject<bool>() ?? false;
                            SystemMessage?.Invoke(this, $"방에 참가했습니다: {roomId}");
                            RoomJoined?.Invoke(this, roomId ?? "");
                            break;
                        }

                    case "room-list":
                        RoomListReceived?.Invoke(this, msg);
                        break;

                    case "chat-message":
                        {
                            string? nickname = msg["nickname"]?.ToString() ?? "알 수 없음";

                            // 파일 메시지
                            if (msg["fileData"] != null)
                            {
                                var fileData = msg["fileData"];
                                string fileName = fileData?["name"]?.ToString() ?? "unknown";
                                string fileType = fileData?["type"]?.ToString() ?? "";
                                
                                FileReceived?.Invoke(this, $"[{nickname}] 파일 전송: {fileName} ({fileType})");
                            }
                            // 텍스트 메시지
                            else if (msg["text"] != null)
                            {
                                string encryptedText = msg["text"]?.ToString() ?? "";
                                bool encrypted = msg["encrypted"]?.ToObject<bool>() ?? false;

                                string displayText;
                                if (encrypted && _encryptionKey != null)
                                {
                                    displayText = EncryptionHelper.Decrypt(encryptedText, _encryptionKey);
                                }
                                else
                                {
                                    displayText = encryptedText;
                                }

                                MessageReceived?.Invoke(this, $"[{nickname}] {displayText}");
                            }
                            break;
                        }

                    case "peer-joined":
                        {
                            string? joinedNickname = msg["nickname"]?.ToString() ?? "사용자";
                            SystemMessage?.Invoke(this, $"{joinedNickname}님이 입장했습니다.");
                            break;
                        }

                    case "peer-left":
                        {
                            string? leftNickname = msg["nickname"]?.ToString() ?? "사용자";
                            SystemMessage?.Invoke(this, $"{leftNickname}님이 퇴장했습니다.");
                            break;
                        }

                    case "owner-changed":
                        {
                            _isOwner = msg["isOwner"]?.ToObject<bool>() ?? false;
                            if (_isOwner)
                            {
                                SystemMessage?.Invoke(this, "당신이 방장이 되었습니다.");
                            }
                            break;
                        }

                    case "password-changed":
                        SystemMessage?.Invoke(this, "방 비밀번호가 변경되었습니다.");
                        break;

                    case "error":
                        {
                            string? errorMsg = msg["message"]?.ToString() ?? "알 수 없는 오류";
                            SystemMessage?.Invoke(this, $"오류: {errorMsg}");
                            break;
                        }
                }
            }
            catch (Exception ex)
            {
                SystemMessage?.Invoke(this, $"메시지 처리 오류: {ex.Message}");
            }
        }

        /// <summary>
        /// JSON 메시지 전송
        /// </summary>
        private async Task SendMessageAsync(object message)
        {
            if (_webSocket == null || _webSocket.State != WebSocketState.Open)
            {
                throw new InvalidOperationException("서버에 연결되어 있지 않습니다.");
            }

            string json = JsonConvert.SerializeObject(message);
            byte[] bytes = Encoding.UTF8.GetBytes(json);

            await _webSocket.SendAsync(
                new ArraySegment<byte>(bytes),
                WebSocketMessageType.Text,
                true,
                _cancellationTokenSource?.Token ?? CancellationToken.None
            );
        }

        /// <summary>
        /// 연결 종료
        /// </summary>
        public async Task DisconnectAsync()
        {
            if (_webSocket != null && _webSocket.State == WebSocketState.Open)
            {
                await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Client closing", CancellationToken.None);
            }

            _cancellationTokenSource?.Cancel();
            ConnectionStateChanged?.Invoke(this, false);
        }

        public void Dispose()
        {
            _cancellationTokenSource?.Cancel();
            _webSocket?.Dispose();
            _cancellationTokenSource?.Dispose();
        }
    }
}
