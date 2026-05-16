using System.Text;

namespace VNCServer.VNCServer;

/// <summary>
/// 연결 로그 및 통계를 기록하는 클래스
/// </summary>
public class ConnectionLogger
{
    private readonly string _logFilePath;
    private readonly bool _enabled;
    private readonly object _lock = new object();

    // 통계 정보
    private int _totalConnections;
    private int _activeConnections;
    private DateTime? _serverStartTime;
    private long _totalBytesSent;
    private long _totalBytesReceived;
    private List<ConnectionLog> _recentLogs = new List<ConnectionLog>();

    public int TotalConnections => _totalConnections;
    public int ActiveConnections => _activeConnections;
    public long TotalBytesSent => _totalBytesSent;
    public long TotalBytesReceived => _totalBytesReceived;
    public TimeSpan Uptime => _serverStartTime.HasValue 
        ? DateTime.Now - _serverStartTime.Value 
        : TimeSpan.Zero;

    public class ConnectionLog
    {
        public DateTime Timestamp { get; set; }
        public string ClientIP { get; set; } = string.Empty;
        public string Event { get; set; } = string.Empty;
        public string? Details { get; set; }
    }

    public ConnectionLogger(bool enabled = true, string? logFilePath = null)
    {
        _enabled = enabled;
        _logFilePath = logFilePath ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "VNCServer", "vnc-server.log");

        if (_enabled)
        {
            EnsureLogDirectory();
        }
    }

    private void EnsureLogDirectory()
    {
        var directory = Path.GetDirectoryName(_logFilePath);
        if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
        {
            Directory.CreateDirectory(directory);
        }
    }

    public void ServerStarted(int port)
    {
        _serverStartTime = DateTime.Now;
        LogEvent("SERVER", $"Server started on port {port}");
    }

    public void ServerStopped()
    {
        LogEvent("SERVER", $"Server stopped. Uptime: {Uptime}");
        _serverStartTime = null;
    }

    public void ClientConnected(string clientIP)
    {
        lock (_lock)
        {
            _totalConnections++;
            _activeConnections++;
        }
        LogEvent(clientIP, "Connected");
    }

    public void ClientDisconnected(string clientIP, string? reason = null)
    {
        lock (_lock)
        {
            _activeConnections = Math.Max(0, _activeConnections - 1);
        }
        LogEvent(clientIP, "Disconnected", reason);
    }

    public void ClientAuthenticationFailed(string clientIP)
    {
        LogEvent(clientIP, "Authentication failed");
    }

    public void Error(string source, string message, Exception? ex = null)
    {
        string details = ex != null ? $"{message}: {ex.Message}" : message;
        LogEvent(source, "ERROR", details);
    }

    public void DataTransferred(long bytesSent, long bytesReceived)
    {
        lock (_lock)
        {
            _totalBytesSent += bytesSent;
            _totalBytesReceived += bytesReceived;
        }
    }

    private void LogEvent(string source, string eventType, string? details = null)
    {
        if (!_enabled)
            return;

        var log = new ConnectionLog
        {
            Timestamp = DateTime.Now,
            ClientIP = source,
            Event = eventType,
            Details = details
        };

        lock (_lock)
        {
            _recentLogs.Add(log);
            if (_recentLogs.Count > 1000)
            {
                _recentLogs.RemoveAt(0);
            }
        }

        WriteToFile(log);
    }

    private void WriteToFile(ConnectionLog log)
    {
        try
        {
            lock (_lock)
            {
                var logLine = $"[{log.Timestamp:yyyy-MM-dd HH:mm:ss}] [{log.ClientIP}] {log.Event}";
                if (!string.IsNullOrEmpty(log.Details))
                {
                    logLine += $" - {log.Details}";
                }
                logLine += Environment.NewLine;

                File.AppendAllText(_logFilePath, logLine);
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Failed to write log: {ex.Message}");
        }
    }

    public List<ConnectionLog> GetRecentLogs(int count = 100)
    {
        lock (_lock)
        {
            return _recentLogs.TakeLast(count).ToList();
        }
    }

    public string GetStatistics()
    {
        var sb = new StringBuilder();
        sb.AppendLine($"=== VNC Server Statistics ===");
        sb.AppendLine($"Uptime: {Uptime}");
        sb.AppendLine($"Total Connections: {_totalConnections}");
        sb.AppendLine($"Active Connections: {_activeConnections}");
        sb.AppendLine($"Total Data Sent: {FormatBytes(_totalBytesSent)}");
        sb.AppendLine($"Total Data Received: {FormatBytes(_totalBytesReceived)}");
        sb.AppendLine($"Log File: {_logFilePath}");
        return sb.ToString();
    }

    private static string FormatBytes(long bytes)
    {
        string[] sizes = { "B", "KB", "MB", "GB", "TB" };
        double len = bytes;
        int order = 0;
        while (len >= 1024 && order < sizes.Length - 1)
        {
            order++;
            len /= 1024;
        }
        return $"{len:0.##} {sizes[order]}";
    }

    public void ClearLogs()
    {
        lock (_lock)
        {
            _recentLogs.Clear();
            if (File.Exists(_logFilePath))
            {
                File.Delete(_logFilePath);
            }
        }
    }
}
