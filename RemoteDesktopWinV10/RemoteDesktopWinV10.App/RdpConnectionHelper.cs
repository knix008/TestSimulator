using System.Net;
using System.Net.Sockets;
using Microsoft.Win32;

namespace RemoteDesktopWinV10.App;

internal static class RdpConnectionHelper
{
    /// <summary>연결 대상 호스트를 RDP/TCP 검사에 맞게 정규화합니다.</summary>
    public static string NormalizeConnectHost(string host)
    {
        var h = host.Trim();
        if (h.Equals("localhost", StringComparison.OrdinalIgnoreCase))
        {
            return "127.0.0.1";
        }

        return h;
    }

    public static bool IsLoopbackHost(string host)
    {
        var h = host.Trim();
        if (h.Equals("localhost", StringComparison.OrdinalIgnoreCase)
            || h.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase)
            || h == "::1")
        {
            return true;
        }

        return IPAddress.TryParse(h, out var ip) && IPAddress.IsLoopback(ip);
    }

    /// <summary>TCP로 RDP 포트에 도달 가능한지 확인합니다. localhost는 IPv4(127.0.0.1)를 우선 시도합니다.</summary>
    public static bool TryReachPort(string host, int port, int timeoutMs, out string? failureMessage)
    {
        failureMessage = null;
        var candidates = GetTcpProbeAddresses(host);
        var errors = new List<string>();

        foreach (var address in candidates)
        {
            if (TryConnectToAddress(address, port, timeoutMs, out var error))
            {
                return true;
            }

            if (!string.IsNullOrEmpty(error))
            {
                errors.Add(error);
            }
        }

        failureMessage = BuildTcpFailureMessage(host, port, timeoutMs, errors);
        return false;
    }

    private static IEnumerable<string> GetTcpProbeAddresses(string host)
    {
        var h = host.Trim();
        if (h.Length == 0)
        {
            yield break;
        }

        if (h.Equals("localhost", StringComparison.OrdinalIgnoreCase))
        {
            yield return "127.0.0.1";
            yield break;
        }

        if (IPAddress.TryParse(h, out var ip))
        {
            if (ip.AddressFamily == AddressFamily.InterNetworkV6)
            {
                yield return ip.ToString();
                if (IPAddress.IsLoopback(ip))
                {
                    yield return "127.0.0.1";
                }
            }
            else
            {
                yield return ip.ToString();
            }

            yield break;
        }

        yield return h;

        IPAddress[] addresses;
        try
        {
            addresses = Dns.GetHostAddresses(h);
        }
        catch
        {
            yield break;
        }

        foreach (var addr in addresses)
        {
            if (addr.AddressFamily == AddressFamily.InterNetwork)
            {
                yield return addr.ToString();
            }
        }
    }

    private static bool TryConnectToAddress(string host, int port, int timeoutMs, out string? error)
    {
        error = null;
        try
        {
            using var client = new TcpClient(AddressFamily.InterNetwork);
            var connectTask = client.ConnectAsync(host, port);
            if (!connectTask.Wait(timeoutMs))
            {
                error = $"{host}:{port} — {timeoutMs / 1000}초 시간 초과";
                return false;
            }

            return client.Connected;
        }
        catch (Exception ex)
        {
            error = $"{host}:{port} — {ex.Message}";
            return false;
        }
    }

    private static string BuildTcpFailureMessage(string host, int port, int timeoutMs, List<string> errors)
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"서버 {host}:{port} 에(에) TCP로 연결되지 않았습니다 ({timeoutMs / 1000}초 이내).");
        sb.AppendLine("이 PC(또는 대상 서버)에서 RDP가 3389 포트로 **수신 대기(listen)** 하고 있지 않습니다.");
        sb.AppendLine();

        if (errors.Count > 0)
        {
            sb.AppendLine("[시도한 주소]");
            foreach (var e in errors.Distinct())
            {
                sb.AppendLine("• " + e);
            }
            sb.AppendLine();
        }

        if (IsLoopbackHost(host))
        {
            sb.AppendLine(GetLocalMachineRdpHint());
        }
        else
        {
            sb.AppendLine("• 원격 PC 전원·네트워크·방화벽(3389 허용)");
            sb.AppendLine("• Windows: 설정 → 시스템 → 원격 데스크톱 → 사용");
            sb.AppendLine("• 호스트 이름·포트(기본 3389) 확인");
            sb.AppendLine();
            sb.AppendLine("같은 PC를 보려면 호스트에 localhost 대신 이 PC의 컴퓨터 이름 또는 LAN IP를 써 보세요.");
        }

        sb.AppendLine();
        sb.AppendLine("TCP가 막혀 있어도 RDP 클라이언트만 연결되는 경우는 드뭅니다. 아래 [그래도 연결 시도]로 한 번 더 시도할 수 있습니다.");

        return sb.ToString().TrimEnd();
    }

    /// <summary>이 PC의 RDP 수신 설정에 대한 짧은 진단(레지스트리·에디션).</summary>
    public static string GetLocalMachineRdpHint()
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine("[이 PC(localhost)에서 RDP 받기]");

        var listenerUp = IsRdpPortListening(3389);

        try
        {
            var edition = Registry.GetValue(
                @"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion",
                "EditionID",
                null) as string;
            if (!string.IsNullOrEmpty(edition))
            {
                sb.AppendLine("• Windows 에디션: " + edition
                    + (edition.Contains("Home", StringComparison.OrdinalIgnoreCase)
                        ? " — Home 은 원격 접속을 받을 수 없습니다(Pro 이상 필요)."
                        : ""));
            }
        }
        catch { }

        try
        {
            var deny = Registry.GetValue(
                @"HKEY_LOCAL_MACHINE\System\CurrentControlSet\Control\Terminal Server",
                "fDenyTSConnections",
                null);
            if (deny is int denyInt)
            {
                if (denyInt == 0 && !listenerUp)
                {
                    sb.AppendLine("• 설정은 ‘사용’(fDenyTSConnections=0)인데 **3389 포트가 수신 대기 중이 아닙니다**.");
                    sb.AppendLine("  → UI만 켜진 상태이고, RDP **리스너가 실제로 뜨지 않은 것**입니다. (이 앱·mstsc 모두 실패)");
                    sb.AppendLine("• 이벤트 로그에 0x80070005(액세스 거부)로 리스너 시작 실패가 있으면:");
                    sb.AppendLine("  관리자 PowerShell에서 TermService·SessionEnv 재시작, PC 재부팅,");
                    sb.AppendLine("  보안/백신이 termsrv·레지스트리를 막는지 확인, sfc /scannow 검토.");
                }
                else if (denyInt == 0)
                {
                    sb.AppendLine("• 레지스트리: 원격 데스크톱 허용, 3389 수신 대기 중.");
                }
                else
                {
                    sb.AppendLine("• 레지스트리: 원격 데스크톱 비활성(fDenyTSConnections=1).");
                }
            }
        }
        catch { }

        if (!listenerUp)
        {
            sb.AppendLine("• 확인: 관리자 CMD에서  netstat -an | findstr 3389");
            sb.AppendLine("  LISTENING 이 없으면 Windows RDP 서버가 아직 동작하지 않는 것입니다.");
        }

        sb.AppendLine("• 설정 → 시스템 → 원격 데스크톱 → 사용 후 **재부팅**.");
        sb.AppendLine("• 관리자 PowerShell:");
        sb.AppendLine("  Enable-NetFirewallRule -DisplayGroup 'Remote Desktop'");
        sb.AppendLine("  Restart-Service TermService -Force");
        sb.AppendLine("• mstsc.exe 로 이 PC에 연결해 보세요. 실패하면 앱도 동일합니다.");

        return sb.ToString().TrimEnd();
    }

    private static bool IsRdpPortListening(int port)
    {
        try
        {
            using var client = new TcpClient(AddressFamily.InterNetwork);
            var task = client.ConnectAsync("127.0.0.1", port);
            if (!task.Wait(1500))
            {
                return false;
            }

            return client.Connected;
        }
        catch
        {
            return false;
        }
    }
}
