using System.Diagnostics;
using System.Text.RegularExpressions;

namespace CodeAnalyzer.Services.Metrics;

internal static class GitHotspotAnalyzer
{
    private static readonly Regex NumStatLineRegex = new(
        @"^(\d+)\s+(\d+)\s+(.+)$",
        RegexOptions.Compiled);

    public static IReadOnlyDictionary<string, int>? TryLoadChangeLinesByFile(string projectRoot)
    {
        var gitDir = FindGitRoot(projectRoot);
        if (gitDir is null)
        {
            return null;
        }

        try
        {
            var output = RunGit(gitDir, "log --since=6.months.ago --pretty=format: --numstat");
            if (string.IsNullOrWhiteSpace(output))
            {
                return null;
            }

            var changes = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            foreach (var line in output.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                var match = NumStatLineRegex.Match(line);
                if (!match.Success)
                {
                    continue;
                }

                var added = int.TryParse(match.Groups[1].Value, out var a) ? a : 0;
                var deleted = int.TryParse(match.Groups[2].Value, out var d) ? d : 0;
                var relativePath = match.Groups[3].Value.Replace('/', Path.DirectorySeparatorChar);
                var fullPath = Path.GetFullPath(Path.Combine(gitDir, relativePath));
                changes[fullPath] = changes.GetValueOrDefault(fullPath) + added + deleted;
            }

            return changes;
        }
        catch
        {
            return null;
        }
    }

    private static string? FindGitRoot(string startPath)
    {
        var current = new DirectoryInfo(Path.GetFullPath(startPath));
        while (current is not null)
        {
            if (Directory.Exists(Path.Combine(current.FullName, ".git")))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        return null;
    }

    private static string RunGit(string workingDirectory, string arguments)
    {
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "git",
                Arguments = arguments,
                WorkingDirectory = workingDirectory,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            }
        };

        process.Start();
        var output = process.StandardOutput.ReadToEnd();
        process.WaitForExit(15_000);
        return process.ExitCode == 0 ? output : string.Empty;
    }
}
