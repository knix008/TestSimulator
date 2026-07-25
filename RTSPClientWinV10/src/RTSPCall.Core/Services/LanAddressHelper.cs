using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace RTSPCall.Core.Services;

public static class LanAddressHelper
{
    public static string GetPreferredIPv4(bool preferLoopback = false)
    {
        if (preferLoopback)
            return "127.0.0.1";

        foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (nic.OperationalStatus != OperationalStatus.Up)
                continue;
            if (nic.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel)
                continue;

            var props = nic.GetIPProperties();
            foreach (var addr in props.UnicastAddresses)
            {
                if (addr.Address.AddressFamily != AddressFamily.InterNetwork)
                    continue;
                if (IPAddress.IsLoopback(addr.Address))
                    continue;

                var bytes = addr.Address.GetAddressBytes();
                if (bytes[0] == 10 ||
                    (bytes[0] == 192 && bytes[1] == 168) ||
                    (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31))
                {
                    return addr.Address.ToString();
                }
            }
        }

        var host = Dns.GetHostEntry(Dns.GetHostName());
        var ipv4 = host.AddressList.FirstOrDefault(a =>
            a.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(a));
        return ipv4?.ToString() ?? "127.0.0.1";
    }
}
