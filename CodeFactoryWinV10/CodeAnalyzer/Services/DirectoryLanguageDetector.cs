namespace CodeAnalyzer.Services;

/// <summary>선택된 디렉터리 범위에서 사용 중인 프로그래밍 언어를 감지합니다.</summary>
public static class DirectoryLanguageDetector
{
    public static HashSet<string> DetectLanguageIds(
        string rootPath,
        IReadOnlyList<string> includedDirectories,
        CancellationToken cancellationToken = default)
    {
        var foundIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (!Directory.Exists(rootPath) || includedDirectories.Count == 0)
        {
            return foundIds;
        }

        var extensions = LanguageRegistry.GetAllExtensions();
        foreach (var file in DirectoryScanService.GetSourceFiles(
                     rootPath,
                     includedDirectories,
                     extensions,
                     cancellationToken))
        {
            cancellationToken.ThrowIfCancellationRequested();
            var language = LanguageRegistry.FindByExtension(Path.GetExtension(file));
            if (language is not null)
            {
                foundIds.Add(language.Id);
            }
        }

        return foundIds;
    }
}
