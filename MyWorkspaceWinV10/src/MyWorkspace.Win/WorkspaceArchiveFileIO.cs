using System.IO.Compression;
using System.Text.Json;
using MyWorkspace.Core.Models;

namespace MyWorkspace.Win;

internal static class WorkspaceArchiveFileIO
{
    private const string ManifestEntry = "workspace.json";
    private const string AssetsFolder = "assets/";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    public static void Save(string filePath, WorkspaceArchiveDocument document, int sourceWorkspaceId)
    {
        if (File.Exists(filePath))
            File.Delete(filePath);

        var assetMap = BuildAssetMap(document, sourceWorkspaceId);
        RewriteContentToArchiveAssets(document.Root, assetMap);

        using var archive = ZipFile.Open(filePath, ZipArchiveMode.Create);
        WriteManifest(archive, document);
        WriteAssets(archive, assetMap);
    }

    public static (WorkspaceArchiveDocument Document, Dictionary<string, IReadOnlyDictionary<string, byte[]>> Assets) Load(string filePath)
    {
        using var archive = ZipFile.OpenRead(filePath);

        var manifestEntry = archive.GetEntry(ManifestEntry)
            ?? throw new InvalidOperationException("Workspace archive manifest not found.");

        WorkspaceArchiveDocument document;
        using (var stream = manifestEntry.Open())
            document = JsonSerializer.Deserialize<WorkspaceArchiveDocument>(stream, JsonOptions)
                ?? throw new InvalidOperationException("Workspace archive manifest is invalid.");

        if (document.FormatVersion != 1)
            throw new InvalidOperationException("Unsupported workspace archive format.");

        var assets = ReadAssets(archive);
        return (document, assets);
    }

    public static string BuildSaveFileFilter() =>
        string.Join("|",
            Localization.Get(K.WorkspaceArchiveFileFilterLabel),
            "*.wsp",
            Localization.Get(K.AllFilesFilterLabel),
            "*.*");

    private static Dictionary<string, Dictionary<string, byte[]>> BuildAssetMap(
        WorkspaceArchiveDocument document,
        int sourceWorkspaceId)
    {
        var map = new Dictionary<string, Dictionary<string, byte[]>>(StringComparer.OrdinalIgnoreCase);
        CollectPageAssets(document.Root, sourceWorkspaceId, map);
        return map;
    }

    private static void CollectPageAssets(
        WorkspaceArchiveNode node,
        int sourceWorkspaceId,
        Dictionary<string, Dictionary<string, byte[]>> map)
    {
        foreach (var page in node.Pages)
        {
            if (string.IsNullOrWhiteSpace(page.Key))
                continue;

            var assets = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);
            foreach (var uri in PageMarkdownNormalizer.EnumerateAssetUriReferences(page.Content))
            {
                if (!PageAssetStore.TryParseAssetUri(uri, out var pageId, out var fileName))
                    continue;

                if (pageId == 0 || string.IsNullOrWhiteSpace(fileName))
                    continue;

                var path = PageAssetStore.TryGetAssetPath(pageId, fileName);
                if (string.IsNullOrWhiteSpace(path))
                {
                    var bytes = PageAssetStore.TryGetAssetBytes(pageId, fileName);
                    if (bytes == null)
                        continue;

                    assets[fileName] = bytes;
                    continue;
                }

                assets[fileName] = File.ReadAllBytes(path);
            }

            if (assets.Count > 0)
                map[page.Key] = assets;
        }

        foreach (var child in node.Children)
            CollectPageAssets(child, sourceWorkspaceId, map);
    }

    private static void RewriteContentToArchiveAssets(
        WorkspaceArchiveNode node,
        IReadOnlyDictionary<string, Dictionary<string, byte[]>> assetMap)
    {
        foreach (var page in node.Pages)
        {
            if (string.IsNullOrWhiteSpace(page.Key) || !assetMap.ContainsKey(page.Key))
                continue;

            page.Content = RewritePageAssetUris(page.Content, page.Key);
        }

        foreach (var child in node.Children)
            RewriteContentToArchiveAssets(child, assetMap);
    }

    private static string RewritePageAssetUris(string content, string pageKey)
    {
        foreach (var uri in PageMarkdownNormalizer.EnumerateAssetUriReferences(content).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (!PageAssetStore.TryParseAssetUri(uri, out _, out var fileName))
                continue;

            content = content.Replace(
                uri,
                $"archive-asset:{pageKey}/{fileName}",
                StringComparison.OrdinalIgnoreCase);
        }

        return content;
    }

    private static void WriteManifest(ZipArchive archive, WorkspaceArchiveDocument document)
    {
        var entry = archive.CreateEntry(ManifestEntry, CompressionLevel.Optimal);
        using var stream = entry.Open();
        JsonSerializer.Serialize(stream, document, JsonOptions);
    }

    private static void WriteAssets(ZipArchive archive, IReadOnlyDictionary<string, Dictionary<string, byte[]>> assetMap)
    {
        foreach (var (pageKey, files) in assetMap)
        {
            foreach (var (fileName, bytes) in files)
            {
                var entry = archive.CreateEntry($"{AssetsFolder}{pageKey}/{fileName}", CompressionLevel.Optimal);
                using var stream = entry.Open();
                stream.Write(bytes, 0, bytes.Length);
            }
        }
    }

    private static Dictionary<string, IReadOnlyDictionary<string, byte[]>> ReadAssets(ZipArchive archive)
    {
        var assets = new Dictionary<string, Dictionary<string, byte[]>>(StringComparer.OrdinalIgnoreCase);

        foreach (var entry in archive.Entries)
        {
            if (!entry.FullName.StartsWith(AssetsFolder, StringComparison.OrdinalIgnoreCase))
                continue;

            var relative = entry.FullName[AssetsFolder.Length..];
            var slash = relative.IndexOf('/');
            if (slash <= 0)
                continue;

            var pageKey = relative[..slash];
            var fileName = relative[(slash + 1)..];
            if (string.IsNullOrWhiteSpace(fileName))
                continue;

            using var stream = entry.Open();
            using var memory = new MemoryStream();
            stream.CopyTo(memory);

            if (!assets.TryGetValue(pageKey, out var files))
            {
                files = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);
                assets[pageKey] = files;
            }

            files[fileName] = memory.ToArray();
        }

        return assets.ToDictionary(
            pair => pair.Key,
            pair => (IReadOnlyDictionary<string, byte[]>)pair.Value,
            StringComparer.OrdinalIgnoreCase);
    }
}
