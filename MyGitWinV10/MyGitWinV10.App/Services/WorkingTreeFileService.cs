using System.Diagnostics;
using LibGit2Sharp;

namespace MyGitWinV10.App.Services;

public static class WorkingTreeFileService
{
    public static string CreateFile(Repository repo, string parentRelativePath, string fileName)
    {
        ValidateEntryName(fileName);
        string parentFullPath = ResolveDirectoryFullPath(repo, parentRelativePath);
        string fullPath = Path.Combine(parentFullPath, fileName);
        EnsureUnderWorkingDirectory(repo, fullPath);

        if (File.Exists(fullPath) || Directory.Exists(fullPath))
        {
            throw new InvalidOperationException($"'{fileName}' already exists.");
        }

        File.WriteAllBytes(fullPath, []);
        return CombineRelativePath(parentRelativePath, fileName);
    }

    public static string CreateDirectory(Repository repo, string parentRelativePath, string folderName)
    {
        ValidateEntryName(folderName);
        string parentFullPath = ResolveDirectoryFullPath(repo, parentRelativePath);
        string fullPath = Path.Combine(parentFullPath, folderName);
        EnsureUnderWorkingDirectory(repo, fullPath);

        if (File.Exists(fullPath) || Directory.Exists(fullPath))
        {
            throw new InvalidOperationException($"'{folderName}' already exists.");
        }

        Directory.CreateDirectory(fullPath);
        return CombineRelativePath(parentRelativePath, folderName);
    }

    public static void DeletePath(Repository repo, string relativePath, bool isDirectory)
    {
        if (string.IsNullOrEmpty(relativePath))
        {
            throw new InvalidOperationException("The repository root cannot be deleted.");
        }

        string fullPath = ResolveFullPath(repo, relativePath);
        EnsureUnderWorkingDirectory(repo, fullPath);

        if (isDirectory)
        {
            if (!Directory.Exists(fullPath))
            {
                throw new InvalidOperationException("The folder no longer exists.");
            }

            Directory.Delete(fullPath, recursive: true);
            return;
        }

        if (!File.Exists(fullPath))
        {
            throw new InvalidOperationException("The file no longer exists.");
        }

        File.Delete(fullPath);
    }

    public static void OpenWithSystemDefault(Repository repo, string relativePath)
    {
        if (string.IsNullOrEmpty(relativePath))
        {
            throw new InvalidOperationException("The repository root cannot be opened as a file.");
        }

        string fullPath = ResolveFullPath(repo, relativePath);
        EnsureUnderWorkingDirectory(repo, fullPath);

        if (!File.Exists(fullPath))
        {
            throw new InvalidOperationException("The file no longer exists in the working tree.");
        }

        Process.Start(new ProcessStartInfo(fullPath)
        {
            UseShellExecute = true
        });
    }

    public static string GetCreateParentRelativePath(RepositoryFileNodeTag tag) =>
        tag.IsDirectory
            ? tag.RelativePath
            : PathCommitHistoryService.NormalizeGitPath(Path.GetDirectoryName(tag.RelativePath) ?? string.Empty);

    public static string GetDeleteParentRelativePath(RepositoryFileNodeTag tag)
    {
        if (tag.IsDirectory)
        {
            return PathCommitHistoryService.NormalizeGitPath(Path.GetDirectoryName(tag.RelativePath) ?? string.Empty);
        }

        return PathCommitHistoryService.NormalizeGitPath(Path.GetDirectoryName(tag.RelativePath) ?? string.Empty);
    }

    private static void ValidateEntryName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new InvalidOperationException("A name is required.");
        }

        name = name.Trim();
        if (name is "." or "..")
        {
            throw new InvalidOperationException("'.' and '..' are not valid names.");
        }

        if (name.Contains('/') || name.Contains('\\'))
        {
            throw new InvalidOperationException("Names cannot contain path separators.");
        }

        if (name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
        {
            throw new InvalidOperationException("The name contains invalid characters.");
        }
    }

    private static string ResolveDirectoryFullPath(Repository repo, string relativePath)
    {
        string workingDirectory = GetWorkingDirectory(repo);
        if (string.IsNullOrEmpty(relativePath))
        {
            return workingDirectory;
        }

        string fullPath = Path.Combine(
            workingDirectory,
            relativePath.Replace('/', Path.DirectorySeparatorChar));

        if (!Directory.Exists(fullPath))
        {
            throw new InvalidOperationException("The parent folder no longer exists.");
        }

        return fullPath;
    }

    private static string ResolveFullPath(Repository repo, string relativePath)
    {
        string workingDirectory = GetWorkingDirectory(repo);
        return Path.Combine(
            workingDirectory,
            relativePath.Replace('/', Path.DirectorySeparatorChar));
    }

    private static string GetWorkingDirectory(Repository repo) =>
        repo.Info.WorkingDirectory
        ?? throw new InvalidOperationException("This repository has no working directory.");

    private static void EnsureUnderWorkingDirectory(Repository repo, string fullPath)
    {
        string workingDirectory = Path.GetFullPath(GetWorkingDirectory(repo));
        string normalizedTarget = Path.GetFullPath(fullPath);
        string rootPrefix = workingDirectory.TrimEnd(Path.DirectorySeparatorChar)
            + Path.DirectorySeparatorChar;

        if (!normalizedTarget.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(normalizedTarget, workingDirectory, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("The path is outside the repository.");
        }
    }

    private static string CombineRelativePath(string parentRelativePath, string name)
    {
        string normalizedParent = PathCommitHistoryService.NormalizeGitPath(parentRelativePath);
        return string.IsNullOrEmpty(normalizedParent) ? name : $"{normalizedParent}/{name}";
    }
}
