using System.Net;
using System.Net.Sockets;
using VNCServer.Settings;

namespace VNCServer.VNCServer;

public class VNCServerCore
{
    private TcpListener? _listener;
    private List<VNCClient> _clients = new List<VNCClient>();
    private ServerSettings _settings;
    private bool _isRunning;
    private Thread? _serverThread;
    private readonly object _lock = new object();

    public event EventHandler<string>? StatusChanged;
    public event EventHandler<string>? ClientConnected;
    public event EventHandler<string>? ClientDisconnected;
    public event EventHandler<Exception>? ErrorOccurred;

    public bool IsRunning => _isRunning;
    public int ConnectedClients => _clients.Count;

    public VNCServerCore(ServerSettings settings)
    {
        _settings = settings;
    }

    public void UpdateSettings(ServerSettings settings)
    {
        _settings = settings;
    }

    public void Start()
    {
        if (_isRunning)
        {
            return;
        }

        try
        {
            // IPv6 지원
            IPAddress bindAddress;
            if (_settings.EnableIPv6)
            {
                bindAddress = IPAddress.IPv6Any;
            }
            else
            {
                if (!string.IsNullOrEmpty(_settings.BindAddress) && 
                    IPAddress.TryParse(_settings.BindAddress, out var parsed))
                {
                    bindAddress = parsed;
                }
                else
                {
                    bindAddress = IPAddress.Any;
                }
            }

            _listener = new TcpListener(bindAddress, _settings.Port);
            
            // IPv6와 IPv4 모두 허용 (DualMode)
            if (_settings.EnableIPv6 && _listener.Server.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6)
            {
                _listener.Server.DualMode = true;
            }
            
            _listener.Start();
            _isRunning = true;

            _serverThread = new Thread(AcceptClients)
            {
                IsBackground = true
            };
            _serverThread.Start();

            string addressType = _settings.EnableIPv6 ? "IPv4/IPv6 (DualMode)" : "IPv4";
            OnStatusChanged($"VNC Server started on {addressType} port {_settings.Port}");
        }
        catch (Exception ex)
        {
            OnErrorOccurred(ex);
            throw;
        }
    }

    public void Stop()
    {
        if (!_isRunning)
        {
            return;
        }

        _isRunning = false;

        try
        {
            _listener?.Stop();
            _listener = null;

            lock (_lock)
            {
                foreach (var client in _clients.ToList())
                {
                    client.Disconnect();
                }
                _clients.Clear();
            }

            OnStatusChanged("VNC Server stopped");
        }
        catch (Exception ex)
        {
            OnErrorOccurred(ex);
        }
    }

    private void AcceptClients()
    {
        while (_isRunning)
        {
            try
            {
                if (_listener != null && _listener.Server.IsBound)
                {
                    var tcpClient = _listener.AcceptTcpClient();
                    
                    if (!_settings.AllowMultipleConnections && _clients.Count > 0)
                    {
                        tcpClient.Close();
                        continue;
                    }

                    var client = new VNCClient(tcpClient, _settings);
                    
                    lock (_lock)
                    {
                        _clients.Add(client);
                    }

                    client.Disconnected += (s, e) =>
                    {
                        lock (_lock)
                        {
                            _clients.Remove(client);
                        }
                        OnClientDisconnected(e);
                    };

                    client.Start();
                    OnClientConnected(((IPEndPoint)tcpClient.Client.RemoteEndPoint!).Address.ToString());
                }
            }
            catch (SocketException)
            {
                // Expected when stopping the server
                if (_isRunning)
                {
                    Thread.Sleep(100);
                }
            }
            catch (Exception ex)
            {
                if (_isRunning)
                {
                    OnErrorOccurred(ex);
                    Thread.Sleep(1000);
                }
            }
        }
    }

    protected virtual void OnStatusChanged(string status)
    {
        StatusChanged?.Invoke(this, status);
    }

    protected virtual void OnClientConnected(string clientInfo)
    {
        ClientConnected?.Invoke(this, clientInfo);
    }

    protected virtual void OnClientDisconnected(string clientInfo)
    {
        ClientDisconnected?.Invoke(this, clientInfo);
    }

    protected virtual void OnErrorOccurred(Exception ex)
    {
        ErrorOccurred?.Invoke(this, ex);
    }
}
