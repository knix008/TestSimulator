using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Xml.Linq;

namespace VNCServer.VNCServer;

/// <summary>
/// UPnP (Universal Plug and Play) 자동 포트 포워딩
/// NAT 라우터에서 자동으로 포트를 열어줍니다
/// </summary>
public class UPnPPortMapper
{
    private string? _gatewayAddress;
    private string? _serviceUrl;
    private readonly int _discoveryTimeout = 3000; // 3초

    public event EventHandler<string>? StatusChanged;
    public event EventHandler<string>? ErrorOccurred;

    public class PortMapping
    {
        public int ExternalPort { get; set; }
        public int InternalPort { get; set; }
        public string Protocol { get; set; } = "TCP";
        public string Description { get; set; } = "VNC Server";
        public int LeaseDuration { get; set; } = 0;  // 0 = 무제한
    }

    /// <summary>
    /// UPnP 게이트웨이 검색
    /// </summary>
    public async Task<bool> DiscoverGatewayAsync()
    {
        try
        {
            StatusChanged?.Invoke(this, "UPnP 게이트웨이 검색 중...");

            // SSDP (Simple Service Discovery Protocol) 메시지
            var searchMessage = 
                "M-SEARCH * HTTP/1.1\r\n" +
                "HOST: 239.255.255.250:1900\r\n" +
                "ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n" +
                "MAN: \"ssdp:discover\"\r\n" +
                "MX: 3\r\n" +
                "\r\n";

            var searchBytes = Encoding.ASCII.GetBytes(searchMessage);
            var multicastEndpoint = new IPEndPoint(IPAddress.Parse("239.255.255.250"), 1900);

            using var client = new UdpClient();
            client.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
            client.Client.Bind(new IPEndPoint(IPAddress.Any, 0));

            await client.SendAsync(searchBytes, searchBytes.Length, multicastEndpoint);

            // 응답 대기
            var receiveTask = client.ReceiveAsync();
            var timeoutTask = Task.Delay(_discoveryTimeout);

            var completedTask = await Task.WhenAny(receiveTask, timeoutTask);

            if (completedTask == timeoutTask)
            {
                ErrorOccurred?.Invoke(this, "UPnP 게이트웨이를 찾을 수 없습니다 (타임아웃)");
                return false;
            }

            var result = await receiveTask;
            var response = Encoding.ASCII.GetString(result.Buffer);

            // LOCATION 헤더에서 디바이스 설명 URL 추출
            var locationMatch = System.Text.RegularExpressions.Regex.Match(
                response, @"LOCATION:\s*(.+)", 
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);

            if (!locationMatch.Success)
            {
                ErrorOccurred?.Invoke(this, "게이트웨이 주소를 찾을 수 없습니다");
                return false;
            }

            var locationUrl = locationMatch.Groups[1].Value.Trim();
            
            // 서비스 URL 가져오기
            return await GetServiceUrlAsync(locationUrl);
        }
        catch (Exception ex)
        {
            ErrorOccurred?.Invoke(this, $"게이트웨이 검색 오류: {ex.Message}");
            return false;
        }
    }

    /// <summary>
    /// 디바이스 설명에서 서비스 URL 추출
    /// </summary>
    private async Task<bool> GetServiceUrlAsync(string deviceUrl)
    {
        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(5);
            
            var xml = await httpClient.GetStringAsync(deviceUrl);
            var doc = XDocument.Parse(xml);

            // WANIPConnection 또는 WANPPPConnection 서비스 찾기
            var ns = doc.Root?.GetDefaultNamespace() ?? XNamespace.None;
            
            var serviceElement = doc.Descendants(ns + "service")
                .FirstOrDefault(s => 
                    s.Element(ns + "serviceType")?.Value.Contains("WANIPConnection") == true ||
                    s.Element(ns + "serviceType")?.Value.Contains("WANPPPConnection") == true);

            if (serviceElement == null)
            {
                ErrorOccurred?.Invoke(this, "포트 포워딩 서비스를 찾을 수 없습니다");
                return false;
            }

            var controlUrl = serviceElement.Element(ns + "controlURL")?.Value;
            if (string.IsNullOrEmpty(controlUrl))
            {
                ErrorOccurred?.Invoke(this, "제어 URL을 찾을 수 없습니다");
                return false;
            }

            // 절대 URL 생성
            var baseUri = new Uri(deviceUrl);
            _serviceUrl = new Uri(baseUri, controlUrl).ToString();
            _gatewayAddress = baseUri.Host;

            StatusChanged?.Invoke(this, $"게이트웨이 발견: {_gatewayAddress}");
            return true;
        }
        catch (Exception ex)
        {
            ErrorOccurred?.Invoke(this, $"서비스 URL 가져오기 오류: {ex.Message}");
            return false;
        }
    }

    /// <summary>
    /// 포트 포워딩 추가
    /// </summary>
    public async Task<bool> AddPortMappingAsync(PortMapping mapping)
    {
        if (string.IsNullOrEmpty(_serviceUrl))
        {
            ErrorOccurred?.Invoke(this, "게이트웨이가 검색되지 않았습니다");
            return false;
        }

        try
        {
            var localIP = GetLocalIPAddress();
            
            StatusChanged?.Invoke(this, $"포트 매핑 추가 중: {mapping.ExternalPort} -> {localIP}:{mapping.InternalPort}");

            var soapAction = "\"urn:schemas-upnp-org:service:WANIPConnection:1#AddPortMapping\"";
            var soapBody = $@"<?xml version=""1.0""?>
<s:Envelope xmlns:s=""http://schemas.xmlsoap.org/soap/envelope/"" s:encodingStyle=""http://schemas.xmlsoap.org/soap/encoding/"">
<s:Body>
<u:AddPortMapping xmlns:u=""urn:schemas-upnp-org:service:WANIPConnection:1"">
<NewRemoteHost></NewRemoteHost>
<NewExternalPort>{mapping.ExternalPort}</NewExternalPort>
<NewProtocol>{mapping.Protocol}</NewProtocol>
<NewInternalPort>{mapping.InternalPort}</NewInternalPort>
<NewInternalClient>{localIP}</NewInternalClient>
<NewEnabled>1</NewEnabled>
<NewPortMappingDescription>{mapping.Description}</NewPortMappingDescription>
<NewLeaseDuration>{mapping.LeaseDuration}</NewLeaseDuration>
</u:AddPortMapping>
</s:Body>
</s:Envelope>";

            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(5);

            var content = new StringContent(soapBody, Encoding.UTF8, "text/xml");
            content.Headers.Add("SOAPAction", soapAction);

            var response = await httpClient.PostAsync(_serviceUrl, content);
            var responseText = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                ErrorOccurred?.Invoke(this, $"포트 매핑 실패: {response.StatusCode}");
                return false;
            }

            StatusChanged?.Invoke(this, $"포트 매핑 성공: {mapping.ExternalPort}");
            return true;
        }
        catch (Exception ex)
        {
            ErrorOccurred?.Invoke(this, $"포트 매핑 오류: {ex.Message}");
            return false;
        }
    }

    /// <summary>
    /// 포트 포워딩 제거
    /// </summary>
    public async Task<bool> RemovePortMappingAsync(int externalPort, string protocol = "TCP")
    {
        if (string.IsNullOrEmpty(_serviceUrl))
        {
            ErrorOccurred?.Invoke(this, "게이트웨이가 검색되지 않았습니다");
            return false;
        }

        try
        {
            StatusChanged?.Invoke(this, $"포트 매핑 제거 중: {externalPort}");

            var soapAction = "\"urn:schemas-upnp-org:service:WANIPConnection:1#DeletePortMapping\"";
            var soapBody = $@"<?xml version=""1.0""?>
<s:Envelope xmlns:s=""http://schemas.xmlsoap.org/soap/envelope/"" s:encodingStyle=""http://schemas.xmlsoap.org/soap/encoding/"">
<s:Body>
<u:DeletePortMapping xmlns:u=""urn:schemas-upnp-org:service:WANIPConnection:1"">
<NewRemoteHost></NewRemoteHost>
<NewExternalPort>{externalPort}</NewExternalPort>
<NewProtocol>{protocol}</NewProtocol>
</u:DeletePortMapping>
</s:Body>
</s:Envelope>";

            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(5);

            var content = new StringContent(soapBody, Encoding.UTF8, "text/xml");
            content.Headers.Add("SOAPAction", soapAction);

            var response = await httpClient.PostAsync(_serviceUrl, content);

            if (!response.IsSuccessStatusCode)
            {
                ErrorOccurred?.Invoke(this, $"포트 매핑 제거 실패: {response.StatusCode}");
                return false;
            }

            StatusChanged?.Invoke(this, $"포트 매핑 제거 성공: {externalPort}");
            return true;
        }
        catch (Exception ex)
        {
            ErrorOccurred?.Invoke(this, $"포트 매핑 제거 오류: {ex.Message}");
            return false;
        }
    }

    /// <summary>
    /// 외부 IP 주소 가져오기
    /// </summary>
    public async Task<string?> GetExternalIPAddressAsync()
    {
        if (string.IsNullOrEmpty(_serviceUrl))
            return null;

        try
        {
            var soapAction = "\"urn:schemas-upnp-org:service:WANIPConnection:1#GetExternalIPAddress\"";
            var soapBody = @"<?xml version=""1.0""?>
<s:Envelope xmlns:s=""http://schemas.xmlsoap.org/soap/envelope/"" s:encodingStyle=""http://schemas.xmlsoap.org/soap/encoding/"">
<s:Body>
<u:GetExternalIPAddress xmlns:u=""urn:schemas-upnp-org:service:WANIPConnection:1"">
</u:GetExternalIPAddress>
</s:Body>
</s:Envelope>";

            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(5);

            var content = new StringContent(soapBody, Encoding.UTF8, "text/xml");
            content.Headers.Add("SOAPAction", soapAction);

            var response = await httpClient.PostAsync(_serviceUrl, content);
            var responseText = await response.Content.ReadAsStringAsync();

            var doc = XDocument.Parse(responseText);
            var ns = doc.Root?.GetDefaultNamespace() ?? XNamespace.None;
            
            var ipElement = doc.Descendants().FirstOrDefault(e => e.Name.LocalName == "NewExternalIPAddress");
            return ipElement?.Value;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// 로컬 IP 주소 가져오기
    /// </summary>
    private string GetLocalIPAddress()
    {
        var host = Dns.GetHostEntry(Dns.GetHostName());
        foreach (var ip in host.AddressList)
        {
            if (ip.AddressFamily == AddressFamily.InterNetwork)
            {
                return ip.ToString();
            }
        }
        return "127.0.0.1";
    }

    /// <summary>
    /// UPnP 지원 여부 확인
    /// </summary>
    public bool IsAvailable => !string.IsNullOrEmpty(_serviceUrl);

    /// <summary>
    /// 게이트웨이 주소
    /// </summary>
    public string? GatewayAddress => _gatewayAddress;
}

/// <summary>
/// UPnP 자동 포트 포워딩 관리자
/// </summary>
public class AutoPortForwardingManager
{
    private readonly UPnPPortMapper _upnp;
    private readonly List<UPnPPortMapper.PortMapping> _activeMappings;

    public event EventHandler<string>? StatusChanged;
    public event EventHandler<string>? ErrorOccurred;

    public AutoPortForwardingManager()
    {
        _upnp = new UPnPPortMapper();
        _activeMappings = new List<UPnPPortMapper.PortMapping>();

        _upnp.StatusChanged += (s, msg) => StatusChanged?.Invoke(this, msg);
        _upnp.ErrorOccurred += (s, msg) => ErrorOccurred?.Invoke(this, msg);
    }

    /// <summary>
    /// 초기화 및 게이트웨이 검색
    /// </summary>
    public async Task<bool> InitializeAsync()
    {
        return await _upnp.DiscoverGatewayAsync();
    }

    /// <summary>
    /// VNC 포트 자동 포워딩
    /// </summary>
    public async Task<bool> EnablePortForwardingAsync(int vncPort)
    {
        var mapping = new UPnPPortMapper.PortMapping
        {
            ExternalPort = vncPort,
            InternalPort = vncPort,
            Protocol = "TCP",
            Description = $"VNC Server Port {vncPort}",
            LeaseDuration = 0  // 무제한
        };

        var success = await _upnp.AddPortMappingAsync(mapping);
        
        if (success)
        {
            _activeMappings.Add(mapping);
            
            // 외부 IP 표시
            var externalIP = await _upnp.GetExternalIPAddressAsync();
            if (!string.IsNullOrEmpty(externalIP))
            {
                StatusChanged?.Invoke(this, 
                    $"외부 접속 주소: {externalIP}:{vncPort}");
            }
        }

        return success;
    }

    /// <summary>
    /// 포트 포워딩 비활성화
    /// </summary>
    public async Task<bool> DisablePortForwardingAsync(int vncPort)
    {
        var success = await _upnp.RemovePortMappingAsync(vncPort);
        
        if (success)
        {
            _activeMappings.RemoveAll(m => m.ExternalPort == vncPort);
        }

        return success;
    }

    /// <summary>
    /// 모든 포트 포워딩 제거
    /// </summary>
    public async Task DisableAllAsync()
    {
        var mappings = new List<UPnPPortMapper.PortMapping>(_activeMappings);
        
        foreach (var mapping in mappings)
        {
            await _upnp.RemovePortMappingAsync(mapping.ExternalPort, mapping.Protocol);
        }

        _activeMappings.Clear();
    }

    /// <summary>
    /// 외부 IP 주소
    /// </summary>
    public async Task<string?> GetExternalIPAsync()
    {
        return await _upnp.GetExternalIPAddressAsync();
    }

    /// <summary>
    /// UPnP 사용 가능 여부
    /// </summary>
    public bool IsAvailable => _upnp.IsAvailable;

    /// <summary>
    /// 활성 매핑 수
    /// </summary>
    public int ActiveMappingsCount => _activeMappings.Count;
}
