using System.Net;
using System.Net.Sockets;

namespace RemoteDesktopWinV10.App;

/// <summary>localhost 루프백 접속 감지 및 LAN IP 우회.</summary>
internal static class VncLoopbackHelper
{
    public static bool IsLoopbackHost(string host)
    {
        if (string.IsNullOrWhiteSpace(host))
        {
            return false;
        }

        var trimmed = host.Trim();
        if (trimmed.Equals("localhost", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (IPAddress.TryParse(trimmed, out var ip))
        {
            return IPAddress.IsLoopback(ip);
        }

        try
        {
            var addresses = Dns.GetHostAddresses(trimmed);
            return addresses.Length > 0 && addresses.All(IPAddress.IsLoopback);
        }
        catch
        {
            var localName = Environment.MachineName;
            return trimmed.Equals(localName, StringComparison.OrdinalIgnoreCase);
        }
    }

    public static bool IsLoopbackConnectionError(string? message) =>
        !string.IsNullOrEmpty(message)
        && message.Contains("loopback", StringComparison.OrdinalIgnoreCase);

    /// <summary>같은 PC에서 VNC 서버에 붙을 때 쓸 수 있는 비루프백 IPv4(없으면 null).</summary>
    public static string? TryGetLocalLanIpv4()
    {
        try
        {
            foreach (var nic in System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces())
            {
                if (nic.OperationalStatus != System.Net.NetworkInformation.OperationalStatus.Up)
                {
                    continue;
                }

                if (nic.NetworkInterfaceType is System.Net.NetworkInformation.NetworkInterfaceType.Loopback
                    or System.Net.NetworkInformation.NetworkInterfaceType.Tunnel)
                {
                    continue;
                }

                foreach (var addr in nic.GetIPProperties().UnicastAddresses)
                {
                    if (addr.Address.AddressFamily != AddressFamily.InterNetwork)
                    {
                        continue;
                    }

                    var ip = addr.Address.ToString();
                    if (IPAddress.IsLoopback(addr.Address))
                    {
                        continue;
                    }

                    if (ip.StartsWith("169.254.", StringComparison.Ordinal))
                    {
                        continue;
                    }

                    return ip;
                }
            }
        }
        catch
        {
            // ignore
        }

        return null;
    }

    public static string BuildPreConnectLoopbackMessage(string host, string lanIp) =>
        "서버 주소가 이 PC 자신(localhost·127.0.0.1 등)으로 보입니다.\r\n\r\n"
        + "TightVNC·UltraVNC 등은 기본적으로 ‘루프백 연결’을 막아, 지금처럼\r\n"
        + "「Sorry, loopback connections are not enabled」 오류가 날 수 있습니다.\r\n\r\n"
        + $"• 권장: LAN IP 「{lanIp}」 로 연결 (서버 설정 변경 없이 시도)\r\n"
        + "• 또는 VNC 서버에서 ‘Allow loopback connections’ 를 켠 뒤 「" + host + "」 로 연결\r\n\r\n"
        + "「LAN IP로 연결」을 누르면 주소를 바꿔 연결합니다.";

    public static string BuildRetryLoopbackMessage(string lanIp) =>
        "VNC 서버가 localhost(루프백) 접속을 거부했습니다.\r\n\r\n"
        + $"LAN IP 「{lanIp}」 로 다시 연결해 보시겠습니까?\r\n"
        + "(서버에서 루프백 허용을 켜도 localhost 접속이 가능합니다.)";
}
