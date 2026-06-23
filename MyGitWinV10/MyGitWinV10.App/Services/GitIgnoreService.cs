using LibGit2Sharp;

namespace MyGitWinV10.App.Services;

public static class GitIgnoreService
{
    public static bool IsIgnored(Repository repo, string relativePath, bool isDirectory)
    {
        if (repo.Info.IsBare || string.IsNullOrWhiteSpace(repo.Info.WorkingDirectory))
        {
            return false;
        }

        string normalized = PathCommitHistoryService.NormalizeGitPath(relativePath);
        if (string.IsNullOrEmpty(normalized))
        {
            return false;
        }

        if (IsPathIgnored(repo, normalized))
        {
            return true;
        }

        if (isDirectory)
        {
            string withSlash = normalized.EndsWith('/') ? normalized : normalized + "/";
            return IsPathIgnored(repo, withSlash);
        }

        return false;
    }

    public static string AddToGitIgnore(Repository repo, string relativePath, bool isDirectory)
    {
        string workingDirectory = repo.Info.WorkingDirectory
            ?? throw new InvalidOperationException("The repository has no working directory.");

        string pattern = FormatGitIgnorePattern(relativePath, isDirectory);
        string gitIgnorePath = Path.Combine(workingDirectory, ".gitignore");

        if (File.Exists(gitIgnorePath))
        {
            string[] existingLines = File.ReadAllLines(gitIgnorePath);
            if (existingLines.Any(line => MatchesRemovablePattern(line.Trim(), relativePath, isDirectory)))
            {
                return pattern;
            }

            bool needsLeadingNewline = existingLines.Length > 0 && !string.IsNullOrEmpty(existingLines[^1]);
            File.AppendAllText(gitIgnorePath, (needsLeadingNewline ? Environment.NewLine : string.Empty) + pattern + Environment.NewLine);
        }
        else
        {
            File.WriteAllText(gitIgnorePath, pattern + Environment.NewLine);
        }

        return pattern;
    }

    public static bool HasRemovablePattern(Repository repo, string relativePath, bool isDirectory)
    {
        string? gitIgnorePath = GetGitIgnorePath(repo);
        if (gitIgnorePath is null || !File.Exists(gitIgnorePath))
        {
            return false;
        }

        return File.ReadAllLines(gitIgnorePath)
            .Select(line => line.Trim())
            .Any(line => MatchesRemovablePattern(line, relativePath, isDirectory));
    }

    public static IReadOnlyList<string> RemoveFromGitIgnore(Repository repo, string relativePath, bool isDirectory)
    {
        string workingDirectory = repo.Info.WorkingDirectory
            ?? throw new InvalidOperationException("The repository has no working directory.");

        string gitIgnorePath = Path.Combine(workingDirectory, ".gitignore");
        if (!File.Exists(gitIgnorePath))
        {
            return [];
        }

        var removedPatterns = new List<string>();
        var keptLines = new List<string>();

        foreach (string line in File.ReadAllLines(gitIgnorePath))
        {
            string trimmed = line.Trim();
            if (!string.IsNullOrEmpty(trimmed) && MatchesRemovablePattern(trimmed, relativePath, isDirectory))
            {
                if (!removedPatterns.Contains(trimmed, StringComparer.Ordinal))
                {
                    removedPatterns.Add(trimmed);
                }

                continue;
            }

            keptLines.Add(line);
        }

        if (removedPatterns.Count == 0)
        {
            return [];
        }

        if (keptLines.Count == 0 || keptLines.All(string.IsNullOrWhiteSpace))
        {
            File.Delete(gitIgnorePath);
        }
        else
        {
            while (keptLines.Count > 0 && string.IsNullOrWhiteSpace(keptLines[^1]))
            {
                keptLines.RemoveAt(keptLines.Count - 1);
            }

            File.WriteAllLines(gitIgnorePath, keptLines);
        }

        return removedPatterns;
    }

    public static IEnumerable<string> GetRemovablePatternCandidates(string relativePath, bool isDirectory)
    {
        string normalized = PathCommitHistoryService.NormalizeGitPath(relativePath);
        yield return FormatGitIgnorePattern(relativePath, isDirectory);

        if (isDirectory)
        {
            yield return normalized;
        }
    }

    private static bool MatchesRemovablePattern(string line, string relativePath, bool isDirectory)
    {
        if (string.IsNullOrEmpty(line) || line.StartsWith('#'))
        {
            return false;
        }

        return GetRemovablePatternCandidates(relativePath, isDirectory)
            .Any(candidate => string.Equals(line, candidate, StringComparison.Ordinal));
    }

    private static string? GetGitIgnorePath(Repository repo)
    {
        if (repo.Info.IsBare || string.IsNullOrWhiteSpace(repo.Info.WorkingDirectory))
        {
            return null;
        }

        return Path.Combine(repo.Info.WorkingDirectory, ".gitignore");
    }

    public static string FormatGitIgnorePattern(string relativePath, bool isDirectory)
    {
        string normalized = PathCommitHistoryService.NormalizeGitPath(relativePath);
        if (isDirectory)
        {
            normalized = normalized.TrimEnd('/');
            return normalized + "/";
        }

        return normalized;
    }

    private static bool IsPathIgnored(Repository repo, string path)
    {
        try
        {
            return repo.Ignore.IsPathIgnored(path);
        }
        catch (LibGit2SharpException)
        {
            return false;
        }
    }
}
