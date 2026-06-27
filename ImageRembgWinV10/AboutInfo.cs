using System.Reflection;

namespace ImageRembgWinV10;

internal static class AboutInfo
{
    public const string AuthorContact = "SHKWON(knix008@naver.com)";

    public static string ProductName =>
        Assembly.GetExecutingAssembly().GetCustomAttribute<AssemblyProductAttribute>()?.Product
        ?? "Image Rembg";

    public static string Version =>
        Assembly.GetExecutingAssembly().GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
        ?? Assembly.GetExecutingAssembly().GetName().Version?.ToString(3)
        ?? "1.0.0";

    public static string Copyright =>
        Assembly.GetExecutingAssembly().GetCustomAttribute<AssemblyCopyrightAttribute>()?.Copyright
        ?? "Copyright (c) ImageRembg";
}
