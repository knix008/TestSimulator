using System.Net.Sockets;

namespace VNCServer.VNCServer;

/// <summary>
/// VNC 세션 재연결 관리자
/// 연결 끊김 시 자동 재연결 및 세션 복구
/// </summary>
public class SessionReconnectManager
{
    private readonly Dictionary<string, SessionState> _sessions;
    private readonly TimeSpan _sessionTimeout;
    private readonly int _maxReconnectAttempts;
    private readonly System.Threading.Timer _cleanupTimer;

    public event EventHandler<SessionEventArgs>? SessionCreated;
    public event EventHandler<SessionEventArgs>? SessionDisconnected;
    public event EventHandler<SessionEventArgs>? SessionReconnected;
    public event EventHandler<SessionEventArgs>? SessionExpired;

    public class SessionState
    {
        public string SessionId { get; set; } = string.Empty;
        public string ClientIdentifier { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public DateTime LastActivityAt { get; set; }
        public bool IsActive { get; set; }
        public int ReconnectAttempts { get; set; }
        
        // 세션 데이터
        public byte[]? LastScreenshot { get; set; }
        public Dictionary<string, object> SessionData { get; set; } = new();
        
        // 클라이언트 정보
        public string ClientIP { get; set; } = string.Empty;
        public int ClientPort { get; set; }
        public TcpClient? Connection { get; set; }
    }

    public class SessionEventArgs : EventArgs
    {
        public SessionState Session { get; set; } = new SessionState();
        public string Reason { get; set; } = string.Empty;
    }

    public SessionReconnectManager(
        TimeSpan? sessionTimeout = null, 
        int maxReconnectAttempts = 3)
    {
        _sessions = new Dictionary<string, SessionState>();
        _sessionTimeout = sessionTimeout ?? TimeSpan.FromMinutes(5);
        _maxReconnectAttempts = maxReconnectAttempts;
        
        // 만료된 세션 정리 타이머 (1분마다)
        _cleanupTimer = new System.Threading.Timer(CleanupExpiredSessions, null, 
            TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(1));
    }

    /// <summary>
    /// 새 세션 생성
    /// </summary>
    public string CreateSession(TcpClient client)
    {
        var sessionId = GenerateSessionId();
        var endpoint = client.Client.RemoteEndPoint?.ToString() ?? "unknown";
        var parts = endpoint.Split(':');
        
        var session = new SessionState
        {
            SessionId = sessionId,
            ClientIdentifier = GenerateClientIdentifier(client),
            CreatedAt = DateTime.Now,
            LastActivityAt = DateTime.Now,
            IsActive = true,
            ClientIP = parts.Length > 0 ? parts[0] : "unknown",
            ClientPort = parts.Length > 1 && int.TryParse(parts[1], out var port) ? port : 0,
            Connection = client
        };

        lock (_sessions)
        {
            _sessions[sessionId] = session;
        }

        SessionCreated?.Invoke(this, new SessionEventArgs { Session = session });
        
        Console.WriteLine($"Session created: {sessionId} from {session.ClientIP}");
        return sessionId;
    }

    /// <summary>
    /// 세션 재연결 시도
    /// </summary>
    public bool TryReconnectSession(string sessionId, TcpClient newClient)
    {
        lock (_sessions)
        {
            if (!_sessions.TryGetValue(sessionId, out var session))
            {
                Console.WriteLine($"Session not found: {sessionId}");
                return false;
            }

            if (DateTime.Now - session.LastActivityAt > _sessionTimeout)
            {
                Console.WriteLine($"Session expired: {sessionId}");
                ExpireSession(sessionId);
                return false;
            }

            if (session.ReconnectAttempts >= _maxReconnectAttempts)
            {
                Console.WriteLine($"Max reconnect attempts reached: {sessionId}");
                ExpireSession(sessionId);
                return false;
            }

            // 기존 연결 정리
            session.Connection?.Close();

            // 새 연결 설정
            session.Connection = newClient;
            session.IsActive = true;
            session.LastActivityAt = DateTime.Now;
            session.ReconnectAttempts++;

            var endpoint = newClient.Client.RemoteEndPoint?.ToString() ?? "unknown";
            var parts = endpoint.Split(':');
            session.ClientIP = parts.Length > 0 ? parts[0] : "unknown";
            session.ClientPort = parts.Length > 1 && int.TryParse(parts[1], out var port) ? port : 0;

            SessionReconnected?.Invoke(this, new SessionEventArgs 
            { 
                Session = session,
                Reason = $"Reconnect attempt {session.ReconnectAttempts}"
            });

            Console.WriteLine($"Session reconnected: {sessionId} (attempt {session.ReconnectAttempts})");
            return true;
        }
    }

    /// <summary>
    /// 세션 연결 끊김 처리
    /// </summary>
    public void HandleDisconnect(string sessionId, string reason = "")
    {
        lock (_sessions)
        {
            if (!_sessions.TryGetValue(sessionId, out var session))
                return;

            session.IsActive = false;
            session.LastActivityAt = DateTime.Now;

            SessionDisconnected?.Invoke(this, new SessionEventArgs 
            { 
                Session = session,
                Reason = reason
            });

            Console.WriteLine($"Session disconnected: {sessionId} - {reason}");
        }
    }

    /// <summary>
    /// 세션 활동 업데이트
    /// </summary>
    public void UpdateSessionActivity(string sessionId)
    {
        lock (_sessions)
        {
            if (_sessions.TryGetValue(sessionId, out var session))
            {
                session.LastActivityAt = DateTime.Now;
            }
        }
    }

    /// <summary>
    /// 세션 데이터 저장
    /// </summary>
    public void SaveSessionData(string sessionId, string key, object value)
    {
        lock (_sessions)
        {
            if (_sessions.TryGetValue(sessionId, out var session))
            {
                session.SessionData[key] = value;
            }
        }
    }

    /// <summary>
    /// 세션 데이터 가져오기
    /// </summary>
    public object? GetSessionData(string sessionId, string key)
    {
        lock (_sessions)
        {
            if (_sessions.TryGetValue(sessionId, out var session) &&
                session.SessionData.TryGetValue(key, out var value))
            {
                return value;
            }
        }
        return null;
    }

    /// <summary>
    /// 마지막 스크린샷 저장
    /// </summary>
    public void SaveLastScreenshot(string sessionId, byte[] screenshot)
    {
        lock (_sessions)
        {
            if (_sessions.TryGetValue(sessionId, out var session))
            {
                session.LastScreenshot = screenshot;
            }
        }
    }

    /// <summary>
    /// 세션 정보 가져오기
    /// </summary>
    public SessionState? GetSession(string sessionId)
    {
        lock (_sessions)
        {
            return _sessions.TryGetValue(sessionId, out var session) ? session : null;
        }
    }

    /// <summary>
    /// 모든 활성 세션
    /// </summary>
    public List<SessionState> GetActiveSessions()
    {
        lock (_sessions)
        {
            return _sessions.Values.Where(s => s.IsActive).ToList();
        }
    }

    /// <summary>
    /// 세션 종료
    /// </summary>
    public void CloseSession(string sessionId)
    {
        lock (_sessions)
        {
            if (_sessions.TryGetValue(sessionId, out var session))
            {
                session.Connection?.Close();
                _sessions.Remove(sessionId);
                
                Console.WriteLine($"Session closed: {sessionId}");
            }
        }
    }

    /// <summary>
    /// 만료된 세션 정리
    /// </summary>
    private void CleanupExpiredSessions(object? state)
    {
        var now = DateTime.Now;
        var expiredSessions = new List<string>();

        lock (_sessions)
        {
            foreach (var kvp in _sessions)
            {
                var session = kvp.Value;
                if (!session.IsActive && (now - session.LastActivityAt) > _sessionTimeout)
                {
                    expiredSessions.Add(kvp.Key);
                }
            }

            foreach (var sessionId in expiredSessions)
            {
                ExpireSession(sessionId);
            }
        }

        if (expiredSessions.Count > 0)
        {
            Console.WriteLine($"Cleaned up {expiredSessions.Count} expired sessions");
        }
    }

    /// <summary>
    /// 세션 만료 처리
    /// </summary>
    private void ExpireSession(string sessionId)
    {
        if (_sessions.TryGetValue(sessionId, out var session))
        {
            session.Connection?.Close();
            _sessions.Remove(sessionId);

            SessionExpired?.Invoke(this, new SessionEventArgs 
            { 
                Session = session,
                Reason = "Timeout"
            });

            Console.WriteLine($"Session expired: {sessionId}");
        }
    }

    /// <summary>
    /// 세션 ID 생성
    /// </summary>
    private string GenerateSessionId()
    {
        return $"session_{Guid.NewGuid():N}";
    }

    /// <summary>
    /// 클라이언트 식별자 생성 (IP + 기타 정보)
    /// </summary>
    private string GenerateClientIdentifier(TcpClient client)
    {
        var endpoint = client.Client.RemoteEndPoint?.ToString() ?? "unknown";
        return $"{endpoint}_{DateTime.Now.Ticks}";
    }

    /// <summary>
    /// 통계 정보
    /// </summary>
    public SessionManagerStats GetStats()
    {
        lock (_sessions)
        {
            return new SessionManagerStats
            {
                TotalSessions = _sessions.Count,
                ActiveSessions = _sessions.Values.Count(s => s.IsActive),
                InactiveSessions = _sessions.Values.Count(s => !s.IsActive),
                AverageReconnectAttempts = _sessions.Values.Count > 0 
                    ? _sessions.Values.Average(s => s.ReconnectAttempts) 
                    : 0
            };
        }
    }

    public void Dispose()
    {
        _cleanupTimer?.Dispose();
        
        lock (_sessions)
        {
            foreach (var session in _sessions.Values)
            {
                session.Connection?.Close();
            }
            _sessions.Clear();
        }
    }
}

public class SessionManagerStats
{
    public int TotalSessions { get; set; }
    public int ActiveSessions { get; set; }
    public int InactiveSessions { get; set; }
    public double AverageReconnectAttempts { get; set; }
}

/// <summary>
/// 클라이언트 측 재연결 헬퍼
/// </summary>
public class ClientReconnectHelper
{
    private readonly string _serverAddress;
    private readonly int _serverPort;
    private readonly int _maxRetries;
    private readonly TimeSpan _retryDelay;
    private string? _sessionId;

    public event EventHandler<string>? ReconnectAttempt;
    public event EventHandler? ReconnectSuccess;
    public event EventHandler<string>? ReconnectFailed;

    public ClientReconnectHelper(
        string serverAddress, 
        int serverPort, 
        int maxRetries = 3, 
        TimeSpan? retryDelay = null)
    {
        _serverAddress = serverAddress;
        _serverPort = serverPort;
        _maxRetries = maxRetries;
        _retryDelay = retryDelay ?? TimeSpan.FromSeconds(2);
    }

    /// <summary>
    /// 세션 ID 저장
    /// </summary>
    public void SaveSessionId(string sessionId)
    {
        _sessionId = sessionId;
    }

    /// <summary>
    /// 자동 재연결 시도
    /// </summary>
    public async Task<TcpClient?> TryReconnectAsync()
    {
        if (string.IsNullOrEmpty(_sessionId))
        {
            ReconnectFailed?.Invoke(this, "No session ID available");
            return null;
        }

        for (int attempt = 1; attempt <= _maxRetries; attempt++)
        {
            try
            {
                ReconnectAttempt?.Invoke(this, $"Attempt {attempt}/{_maxRetries}");

                var client = new TcpClient();
                await client.ConnectAsync(_serverAddress, _serverPort);

                // 세션 ID를 서버에 전송하여 재연결 요청
                var stream = client.GetStream();
                var sessionBytes = System.Text.Encoding.UTF8.GetBytes($"RECONNECT:{_sessionId}\n");
                await stream.WriteAsync(sessionBytes, 0, sessionBytes.Length);

                // 서버 응답 대기
                var buffer = new byte[1024];
                var bytesRead = await stream.ReadAsync(buffer, 0, buffer.Length);
                var response = System.Text.Encoding.UTF8.GetString(buffer, 0, bytesRead);

                if (response.StartsWith("OK"))
                {
                    ReconnectSuccess?.Invoke(this, EventArgs.Empty);
                    return client;
                }

                client.Close();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Reconnect attempt {attempt} failed: {ex.Message}");
            }

            if (attempt < _maxRetries)
            {
                await Task.Delay(_retryDelay);
            }
        }

        ReconnectFailed?.Invoke(this, $"All {_maxRetries} attempts failed");
        return null;
    }
}
