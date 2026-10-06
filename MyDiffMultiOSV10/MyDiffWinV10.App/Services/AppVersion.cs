using System.Reflection;

namespace MyDiffWinV10.App.Services;

public static class AppVersion
{
    private static string? _version;
    private static string? _build;

    public static string Version => _version ??= ResolveVersion();

    public static string Build => _build ??= ResolveBuild();

    private static string ResolveVersion()
    {
        var assembly = Assembly.GetExecutingAssembly();

        if (TryParseInformationalVersion(
                assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion,
                out string version,
                out _))
        {
            return version;
        }

        string? productVersion = Application.ProductVersion;
        if (!string.IsNullOrWhiteSpace(productVersion)
            && TryParseInformationalVersion(productVersion, out version, out _))
        {
            return version;
        }

        var assemblyVersion = assembly.GetName().Version;
        if (assemblyVersion != null)
        {
            return assemblyVersion.Revision > 0
                ? assemblyVersion.ToString(4)
                : assemblyVersion.ToString(3);
        }

        return "1.0.0";
    }

    private static string ResolveBuild()
    {
        var assembly = Assembly.GetExecutingAssembly();

        foreach (var metadata in assembly.GetCustomAttributes<AssemblyMetadataAttribute>())
        {
            if (metadata.Key is "Build" or "BuildId" && !string.IsNullOrWhiteSpace(metadata.Value))
            {
                return metadata.Value.Trim();
            }
        }

        if (TryParseInformationalVersion(
                assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion,
                out _,
                out string buildFromInformational)
            && !string.IsNullOrWhiteSpace(buildFromInformational))
        {
            return buildFromInformational;
        }

        string? fileVersionText = assembly.GetCustomAttribute<AssemblyFileVersionAttribute>()?.Version;
        if (System.Version.TryParse(fileVersionText, out var fileVersion) && fileVersion.Revision > 0)
        {
            return fileVersion.Revision.ToString();
        }

        var assemblyVersion = assembly.GetName().Version;
        if (assemblyVersion?.Revision > 0)
        {
            return assemblyVersion.Revision.ToString();
        }

        return "0";
    }

    private static bool TryParseInformationalVersion(string? value, out string version, out string build)
    {
        version = string.Empty;
        build = string.Empty;

        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        value = value.Trim();
        int plusIndex = value.IndexOf('+');
        string versionPart = plusIndex >= 0 ? value[..plusIndex] : value;
        if (plusIndex >= 0 && plusIndex < value.Length - 1)
        {
            build = value[(plusIndex + 1)..].Trim();
        }

        if (string.IsNullOrWhiteSpace(versionPart)
            || versionPart is "0.0.0" or "0.0.0.0")
        {
            return false;
        }

        version = versionPart;
        return true;
    }
}
