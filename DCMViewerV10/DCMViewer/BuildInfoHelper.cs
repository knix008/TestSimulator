using System.Reflection;
using System.Runtime.InteropServices;

namespace DCMViewer;

internal static class BuildInfoHelper
{
    private static readonly Assembly ExecutingAssembly = Assembly.GetExecutingAssembly();

    public static string GetVersion()
    {
        var informational = ExecutingAssembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?
            .InformationalVersion;
        if (!string.IsNullOrWhiteSpace(informational))
            return informational;

        return ExecutingAssembly.GetName().Version?.ToString() ?? "unknown";
    }

    public static string GetConfiguration()
        => ExecutingAssembly.GetCustomAttribute<AssemblyConfigurationAttribute>()?.Configuration ?? "Unknown";

    public static string GetBuildTimestamp()
    {
        foreach (var metadata in ExecutingAssembly.GetCustomAttributes<AssemblyMetadataAttribute>())
        {
            if (metadata.Key == "BuildTimestamp" && !string.IsNullOrWhiteSpace(metadata.Value))
                return metadata.Value;
        }

        var assemblyPath = ExecutingAssembly.Location;
        if (!string.IsNullOrEmpty(assemblyPath) && File.Exists(assemblyPath))
            return File.GetLastWriteTime(assemblyPath).ToString("yyyy-MM-dd HH:mm:ss");

        return "Unknown";
    }

    public static string GetFrameworkDescription() => RuntimeInformation.FrameworkDescription;

    public static string GetRuntimeIdentifier()
        => string.IsNullOrWhiteSpace(RuntimeInformation.RuntimeIdentifier)
            ? RuntimeInformation.ProcessArchitecture.ToString()
            : RuntimeInformation.RuntimeIdentifier;

    public static IEnumerable<string> GetDescriptionLines()
    {
        yield return $"  • 버전: {GetVersion()}";
        yield return $"  • 구성: {GetConfiguration()}";
        yield return $"  • 빌드 일시: {GetBuildTimestamp()}";
        yield return $"  • .NET: {GetFrameworkDescription()}";
        yield return $"  • 플랫폼: {GetRuntimeIdentifier()}";
    }
}
