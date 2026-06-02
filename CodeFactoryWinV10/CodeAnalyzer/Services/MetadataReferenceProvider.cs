using System.Collections.Immutable;
using Microsoft.CodeAnalysis;

namespace CodeAnalyzer.Services;

internal static class MetadataReferenceProvider
{
    public static ImmutableArray<PortableExecutableReference> CreateReferences()
    {
        var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        AddTrustedPlatformAssemblies(paths);
        AddDotNetRefPackAssemblies(paths);
        AddLoadedAssemblies(paths);

        return paths
            .Where(File.Exists)
            .Select(path => MetadataReference.CreateFromFile(path))
            .ToImmutableArray();
    }

    private static void AddTrustedPlatformAssemblies(HashSet<string> paths)
    {
        if (AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES") is not string trusted)
        {
            return;
        }

        foreach (var path in trusted.Split(Path.PathSeparator))
        {
            if (!string.IsNullOrWhiteSpace(path))
            {
                paths.Add(path);
            }
        }
    }

    private static void AddDotNetRefPackAssemblies(HashSet<string> paths)
    {
        var dotnetRoot = Environment.GetEnvironmentVariable("DOTNET_ROOT");
        if (string.IsNullOrWhiteSpace(dotnetRoot))
        {
            dotnetRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "dotnet");
        }

        var packsRoot = Path.Combine(dotnetRoot, "packs");
        if (!Directory.Exists(packsRoot))
        {
            return;
        }

        foreach (var refPack in Directory.EnumerateDirectories(packsRoot, "*.Ref"))
        {
            foreach (var refDirectory in Directory.EnumerateDirectories(refPack, "ref", SearchOption.AllDirectories))
            {
                foreach (var assemblyPath in Directory.EnumerateFiles(refDirectory, "*.dll"))
                {
                    paths.Add(assemblyPath);
                }
            }
        }
    }

    private static void AddLoadedAssemblies(HashSet<string> paths)
    {
        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            if (assembly.IsDynamic || string.IsNullOrWhiteSpace(assembly.Location))
            {
                continue;
            }

            paths.Add(assembly.Location);
        }
    }
}
