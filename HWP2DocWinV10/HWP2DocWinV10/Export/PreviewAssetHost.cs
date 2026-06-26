using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace HWP2DocWinV10.Export;

/// <summary>
/// WebView2 NavigateToString 환경에서 로컬 이미지를 표시하기 위한 가상 호스트 매핑입니다.
/// </summary>
internal static class PreviewAssetHost
{
    public const string HostName = "hwp2doc.preview.assets";

    public static void Configure(WebView2 webView, string? assetDirectory)
    {
        if (webView.CoreWebView2 == null)
            return;

        webView.CoreWebView2.ClearVirtualHostNameToFolderMapping(HostName);

        if (string.IsNullOrWhiteSpace(assetDirectory) || !Directory.Exists(assetDirectory))
            return;

        string fullPath = Path.GetFullPath(assetDirectory);
        webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
            HostName,
            fullPath,
            CoreWebView2HostResourceAccessKind.DenyCors);
    }

    public static string ToVirtualAssetUrl(string relativePath)
    {
        string normalized = relativePath.Replace('\\', '/').TrimStart('/');
        string[] segments = normalized.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length == 0)
            return $"https://{HostName}/";

        return $"https://{HostName}/{string.Join("/", segments.Select(Uri.EscapeDataString))}";
    }
}
