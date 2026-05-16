using System.Net;
using System.Text;
using System.Text.Json;
using VNCServer.Settings;

namespace VNCServer.VNCServer;

/// <summary>
/// 웹 기반 관리 인터페이스를 위한 HTTP REST API
/// </summary>
public class WebManagementAPI
{
    private HttpListener? _listener;
    private Thread? _listenerThread;
    private bool _isRunning;
    private readonly ServerSettings _settings;
    private readonly VNCServerCore? _vncServer;
    private readonly ConnectionLogger? _logger;
    private readonly int _webPort;

    public event EventHandler<string>? ApiError;
    public event EventHandler<string>? ApiRequest;

    public WebManagementAPI(ServerSettings settings, VNCServerCore? vncServer = null, 
                           ConnectionLogger? logger = null, int webPort = 8080)
    {
        _settings = settings;
        _vncServer = vncServer;
        _logger = logger;
        _webPort = webPort;
    }

    /// <summary>
    /// 웹 API 서버 시작
    /// </summary>
    public void Start()
    {
        if (_isRunning)
            return;

        try
        {
            _listener = new HttpListener();
            _listener.Prefixes.Add($"http://localhost:{_webPort}/");
            _listener.Prefixes.Add($"http://127.0.0.1:{_webPort}/");
            
            // 네트워크 접근 허용 (관리자 권한 필요)
            try
            {
                _listener.Prefixes.Add($"http://+:{_webPort}/");
            }
            catch
            {
                // 관리자 권한 없으면 localhost만 사용
            }

            _listener.Start();
            _isRunning = true;

            _listenerThread = new Thread(ListenerLoop)
            {
                IsBackground = true,
                Name = "WebAPIListenerThread"
            };
            _listenerThread.Start();

            Console.WriteLine($"Web Management API started on port {_webPort}");
            Console.WriteLine($"Access at: http://localhost:{_webPort}/");
        }
        catch (Exception ex)
        {
            ApiError?.Invoke(this, $"Failed to start Web API: {ex.Message}");
            throw;
        }
    }

    /// <summary>
    /// 웹 API 서버 중지
    /// </summary>
    public void Stop()
    {
        if (!_isRunning)
            return;

        _isRunning = false;
        _listener?.Stop();
        _listenerThread?.Join(2000);
        _listener?.Close();
    }

    private void ListenerLoop()
    {
        while (_isRunning)
        {
            try
            {
                var context = _listener?.GetContext();
                if (context != null)
                {
                    ThreadPool.QueueUserWorkItem(_ => HandleRequest(context));
                }
            }
            catch (HttpListenerException)
            {
                // 서버 종료 시 발생하는 예외 무시
                if (!_isRunning)
                    break;
            }
            catch (Exception ex)
            {
                ApiError?.Invoke(this, $"Listener error: {ex.Message}");
            }
        }
    }

    private void HandleRequest(HttpListenerContext context)
    {
        try
        {
            var request = context.Request;
            var response = context.Response;

            // CORS 헤더 추가
            response.AddHeader("Access-Control-Allow-Origin", "*");
            response.AddHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
            response.AddHeader("Access-Control-Allow-Headers", "Content-Type");

            // OPTIONS 요청 처리 (CORS preflight)
            if (request.HttpMethod == "OPTIONS")
            {
                response.StatusCode = 200;
                response.Close();
                return;
            }

            ApiRequest?.Invoke(this, $"{request.HttpMethod} {request.Url?.AbsolutePath}");

            // 라우팅
            var path = request.Url?.AbsolutePath ?? "/";
            var method = request.HttpMethod;

            object? result = null;

            switch (path)
            {
                case "/":
                case "/index.html":
                    result = GetIndexHtml();
                    SendHtmlResponse(response, result.ToString() ?? "");
                    return;

                case "/api/status":
                    result = GetServerStatus();
                    break;

                case "/api/settings":
                    if (method == "GET")
                        result = GetSettings();
                    else if (method == "PUT" || method == "POST")
                        result = UpdateSettings(request);
                    break;

                case "/api/server/start":
                    if (method == "POST")
                        result = StartVNCServer();
                    break;

                case "/api/server/stop":
                    if (method == "POST")
                        result = StopVNCServer();
                    break;

                case "/api/clients":
                    result = GetConnectedClients();
                    break;

                case "/api/statistics":
                    result = GetStatistics();
                    break;

                case "/api/logs":
                    result = GetRecentLogs();
                    break;

                default:
                    response.StatusCode = 404;
                    result = new { error = "Not found" };
                    break;
            }

            if (result != null)
            {
                SendJsonResponse(response, result);
            }
        }
        catch (Exception ex)
        {
            ApiError?.Invoke(this, $"Request error: {ex.Message}");
            
            var response = context.Response;
            response.StatusCode = 500;
            SendJsonResponse(response, new { error = ex.Message });
        }
    }

    private object GetServerStatus()
    {
        return new
        {
            vncServerRunning = _vncServer?.IsRunning ?? false,
            port = _settings.Port,
            enableIPv6 = _settings.EnableIPv6,
            enableTLS = _settings.EnableTLS,
            activeConnections = _logger?.ActiveConnections ?? 0,
            uptime = _logger?.Uptime.ToString() ?? "N/A"
        };
    }

    private object GetSettings()
    {
        return new
        {
            port = _settings.Port,
            requirePassword = _settings.RequirePassword,
            enableIPv6 = _settings.EnableIPv6,
            bindAddress = _settings.BindAddress,
            viewOnlyMode = _settings.ViewOnlyMode,
            allowMouseControl = _settings.AllowMouseControl,
            allowKeyboardControl = _settings.AllowKeyboardControl,
            enableTLS = _settings.EnableTLS,
            imageQuality = _settings.ImageQuality,
            frameRate = _settings.FrameRate,
            compressionLevel = _settings.CompressionLevel,
            enableClipboardSync = _settings.EnableClipboardSync,
            enableLogging = _settings.EnableLogging
        };
    }

    private object UpdateSettings(HttpListenerRequest request)
    {
        using var reader = new StreamReader(request.InputStream, request.ContentEncoding);
        var json = reader.ReadToEnd();
        var newSettings = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json);

        if (newSettings != null)
        {
            foreach (var kvp in newSettings)
            {
                var property = typeof(ServerSettings).GetProperty(
                    char.ToUpper(kvp.Key[0]) + kvp.Key.Substring(1));
                
                if (property != null && property.CanWrite)
                {
                    var value = ConvertJsonElement(kvp.Value, property.PropertyType);
                    property.SetValue(_settings, value);
                }
            }
        }

        return new { success = true, message = "Settings updated" };
    }

    private object? ConvertJsonElement(JsonElement element, Type targetType)
    {
        if (targetType == typeof(int))
            return element.GetInt32();
        if (targetType == typeof(bool))
            return element.GetBoolean();
        if (targetType == typeof(string))
            return element.GetString();
        return null;
    }

    private object StartVNCServer()
    {
        if (_vncServer == null)
            return new { success = false, message = "VNC Server not available" };

        try
        {
            _vncServer.Start();
            return new { success = true, message = "VNC Server started" };
        }
        catch (Exception ex)
        {
            return new { success = false, message = ex.Message };
        }
    }

    private object StopVNCServer()
    {
        if (_vncServer == null)
            return new { success = false, message = "VNC Server not available" };

        try
        {
            _vncServer.Stop();
            return new { success = true, message = "VNC Server stopped" };
        }
        catch (Exception ex)
        {
            return new { success = false, message = ex.Message };
        }
    }

    private object GetConnectedClients()
    {
        // TODO: VNCServerCore에서 실제 클라이언트 목록 가져오기
        return new
        {
            clients = new[]
            {
                new { id = 1, ip = "192.168.1.100", connectedAt = DateTime.Now.AddMinutes(-10) }
            }
        };
    }

    private object GetStatistics()
    {
        if (_logger == null)
            return new { error = "Logger not available" };

        return new
        {
            uptime = _logger.Uptime.ToString(),
            totalConnections = _logger.TotalConnections,
            activeConnections = _logger.ActiveConnections,
            bytesSent = _logger.TotalBytesSent,
            bytesReceived = _logger.TotalBytesReceived
        };
    }

    private object GetRecentLogs()
    {
        if (_logger == null)
            return new { error = "Logger not available" };

        // 최근 로그를 문자열로 반환
        var logs = new List<string>();
        logs.Add("Recent activity logs:");
        logs.Add(_logger.GetStatistics());
        
        return new { logs = logs };
    }

    private void SendJsonResponse(HttpListenerResponse response, object data)
    {
        response.ContentType = "application/json";
        response.ContentEncoding = Encoding.UTF8;

        var json = JsonSerializer.Serialize(data, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = true
        });

        var buffer = Encoding.UTF8.GetBytes(json);
        response.ContentLength64 = buffer.Length;
        response.OutputStream.Write(buffer, 0, buffer.Length);
        response.Close();
    }

    private void SendHtmlResponse(HttpListenerResponse response, string html)
    {
        response.ContentType = "text/html";
        response.ContentEncoding = Encoding.UTF8;

        var buffer = Encoding.UTF8.GetBytes(html);
        response.ContentLength64 = buffer.Length;
        response.OutputStream.Write(buffer, 0, buffer.Length);
        response.Close();
    }

    private string GetIndexHtml()
    {
        return @"<!DOCTYPE html>
<html lang=""ko"">
<head>
    <meta charset=""UTF-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
    <title>VNC Server Management</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .card { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .status { display: inline-block; padding: 5px 15px; border-radius: 20px; font-weight: bold; }
        .status.running { background: #2ecc71; color: white; }
        .status.stopped { background: #e74c3c; color: white; }
        button { padding: 10px 20px; margin: 5px; border: none; border-radius: 5px; cursor: pointer; font-size: 14px; }
        .btn-start { background: #27ae60; color: white; }
        .btn-stop { background: #c0392b; color: white; }
        .btn-refresh { background: #3498db; color: white; }
        button:hover { opacity: 0.9; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #34495e; color: white; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
        .stat-box { background: #3498db; color: white; padding: 15px; border-radius: 8px; }
        .stat-value { font-size: 24px; font-weight: bold; }
        .stat-label { font-size: 14px; opacity: 0.9; }
    </style>
</head>
<body>
    <div class=""container"">
        <div class=""header"">
            <h1>🖥️ VNC Server Management</h1>
            <p>웹 기반 원격 관리 인터페이스</p>
        </div>

        <div class=""card"">
            <h2>서버 상태</h2>
            <p>VNC Server: <span class=""status"" id=""serverStatus"">Loading...</span></p>
            <p>Port: <span id=""serverPort"">-</span></p>
            <p>Uptime: <span id=""serverUptime"">-</span></p>
            <div style=""margin-top: 15px;"">
                <button class=""btn-start"" onclick=""startServer()"">▶ 시작</button>
                <button class=""btn-stop"" onclick=""stopServer()"">⏹ 중지</button>
                <button class=""btn-refresh"" onclick=""loadStatus()"">🔄 새로고침</button>
            </div>
        </div>

        <div class=""card"">
            <h2>통계</h2>
            <div class=""stats-grid"" id=""statsGrid"">
                <div class=""stat-box"">
                    <div class=""stat-value"" id=""totalConnections"">-</div>
                    <div class=""stat-label"">총 연결 수</div>
                </div>
                <div class=""stat-box"">
                    <div class=""stat-value"" id=""activeConnections"">-</div>
                    <div class=""stat-label"">활성 연결</div>
                </div>
                <div class=""stat-box"">
                    <div class=""stat-value"" id=""bytesSent"">-</div>
                    <div class=""stat-label"">전송 (MB)</div>
                </div>
                <div class=""stat-box"">
                    <div class=""stat-value"" id=""bytesReceived"">-</div>
                    <div class=""stat-label"">수신 (MB)</div>
                </div>
            </div>
        </div>

        <div class=""card"">
            <h2>연결된 클라이언트</h2>
            <table id=""clientsTable"">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>IP 주소</th>
                        <th>연결 시간</th>
                    </tr>
                </thead>
                <tbody id=""clientsBody"">
                    <tr><td colspan=""3"" style=""text-align:center;"">Loading...</td></tr>
                </tbody>
            </table>
        </div>
    </div>

    <script>
        async function loadStatus() {
            const response = await fetch('/api/status');
            const data = await response.json();
            
            document.getElementById('serverStatus').textContent = data.vncServerRunning ? 'Running' : 'Stopped';
            document.getElementById('serverStatus').className = 'status ' + (data.vncServerRunning ? 'running' : 'stopped');
            document.getElementById('serverPort').textContent = data.port;
            document.getElementById('serverUptime').textContent = data.uptime;
        }

        async function loadStatistics() {
            const response = await fetch('/api/statistics');
            const data = await response.json();
            
            document.getElementById('totalConnections').textContent = data.totalConnections;
            document.getElementById('activeConnections').textContent = data.activeConnections;
            document.getElementById('bytesSent').textContent = (data.bytesSent / 1024 / 1024).toFixed(2);
            document.getElementById('bytesReceived').textContent = (data.bytesReceived / 1024 / 1024).toFixed(2);
        }

        async function loadClients() {
            const response = await fetch('/api/clients');
            const data = await response.json();
            
            const tbody = document.getElementById('clientsBody');
            if (data.clients.length === 0) {
                tbody.innerHTML = '<tr><td colspan=""3"" style=""text-align:center;"">연결된 클라이언트 없음</td></tr>';
            } else {
                tbody.innerHTML = data.clients.map(c => 
                    '<tr>' +
                        '<td>' + c.id + '</td>' +
                        '<td>' + c.ip + '</td>' +
                        '<td>' + new Date(c.connectedAt).toLocaleString() + '</td>' +
                    '</tr>'
                ).join('');
            }
        }

        async function startServer() {
            const response = await fetch('/api/server/start', { method: 'POST' });
            const data = await response.json();
            alert(data.message);
            loadStatus();
        }

        async function stopServer() {
            const response = await fetch('/api/server/stop', { method: 'POST' });
            const data = await response.json();
            alert(data.message);
            loadStatus();
        }

        // 초기 로드
        loadStatus();
        loadStatistics();
        loadClients();

        // 5초마다 자동 새로고침
        setInterval(() => {
            loadStatus();
            loadStatistics();
            loadClients();
        }, 5000);
    </script>
</body>
</html>";
    }
}
