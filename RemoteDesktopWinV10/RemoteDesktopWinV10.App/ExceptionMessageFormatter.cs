using System.Net.Sockets;
using System.Text;

namespace RemoteDesktopWinV10.App;

/// <summary>사용자에게 보여 줄 예외 메시지를 한 번에 정리합니다.</summary>
internal static class ExceptionMessageFormatter
{
    public static string Format(Exception ex, string? headline = null)
    {
        var sb = new StringBuilder();
        if (!string.IsNullOrWhiteSpace(headline))
        {
            sb.AppendLine(headline.Trim());
            sb.AppendLine();
        }

        AppendChain(sb, ex);
        return sb.ToString().TrimEnd();
    }

    private static void AppendChain(StringBuilder sb, Exception? ex)
    {
        var depth = 0;
        while (ex != null)
        {
            if (depth > 0)
            {
                sb.AppendLine();
                sb.AppendLine("--- 내부 예외 ---");
            }

            sb.AppendLine("유형: " + ex.GetType().FullName);
            sb.AppendLine("메시지: " + ex.Message);

            if (ex.HResult != 0)
            {
                sb.AppendLine("HRESULT: 0x" + ((uint)ex.HResult).ToString("X8") + " (" + ex.HResult + ")");
            }

            if (ex is SocketException sock)
            {
                sb.AppendLine("SocketError: " + sock.SocketErrorCode + " (" + (int)sock.SocketErrorCode + ")");
                sb.AppendLine("NativeErrorCode: " + sock.NativeErrorCode);
            }

            depth++;
            ex = ex.InnerException;
        }
    }
}
