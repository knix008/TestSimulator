using System.Text.RegularExpressions;

namespace MyGitWinV10.App.Services;

public static class RemoteUrlNormalizer
{
    private static readonly Regex GitHubShorthandRegex =
        new(@"^github\.com/(.+)$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static readonly Regex GitHubSshRegex =
        new(@"^git@github\.com:([^/]+)/(.+?)(\.git)?/?$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    /// <summary>
    /// Normalizes common GitHub URL forms for LibGit2Sharp (HTTPS only).
    /// </summary>
    public static string Normalize(string url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return string.Empty;
        }

        url = url.Trim().TrimEnd('/');

        if (GitHubSshRegex.IsMatch(url))
        {
            return ConvertGitHubSshToHttps(url);
        }

        if (GitHubShorthandRegex.Match(url) is { Success: true } shorthand)
        {
            return $"https://github.com/{shorthand.Groups[1].Value}";
        }

        if (url.StartsWith("www.github.com/", StringComparison.OrdinalIgnoreCase))
        {
            return "https://" + url;
        }

        return url;
    }

    /// <summary>Last path segment of the remote URL, without a trailing .git suffix.</summary>
    public static string GetRepositoryDirectoryName(string normalizedUrl)
    {
        if (string.IsNullOrWhiteSpace(normalizedUrl))
        {
            return "repository";
        }

        string trimmed = normalizedUrl.Trim().TrimEnd('/');
        if (Uri.TryCreate(trimmed, UriKind.Absolute, out Uri? uri))
        {
            string[] segments = uri.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries);
            if (segments.Length > 0)
            {
                return StripGitSuffix(segments[^1]);
            }
        }

        string fallback = trimmed.Split('/', StringSplitOptions.RemoveEmptyEntries).LastOrDefault() ?? "repository";
        return StripGitSuffix(fallback);
    }

    /// <summary>
    /// Resolves the folder LibGit2Sharp clones into. The parent folder may contain other items;
    /// only the repository-named target folder must not already exist.
    /// </summary>
    public static string ResolveCloneDestination(string destinationInput, string normalizedUrl)
    {
        if (string.IsNullOrWhiteSpace(destinationInput))
        {
            throw new InvalidOperationException(Localization.T("Clone.DestRequired"));
        }

        string repoName = GetRepositoryDirectoryName(normalizedUrl);
        string inputPath = Path.GetFullPath(destinationInput.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
        string inputName = Path.GetFileName(inputPath);

        string clonePath = string.Equals(inputName, repoName, StringComparison.OrdinalIgnoreCase)
            ? inputPath
            : Path.Combine(inputPath, repoName);

        if (!string.Equals(inputName, repoName, StringComparison.OrdinalIgnoreCase)
            && !Directory.Exists(inputPath))
        {
            throw new InvalidOperationException(Localization.T("Clone.DestParentMissing"));
        }

        if (Directory.Exists(clonePath) || File.Exists(clonePath))
        {
            throw new InvalidOperationException(Localization.Tf("Clone.DestAlreadyExists", repoName, clonePath));
        }

        return clonePath;
    }

    public static bool TryResolveCloneDestination(
        string destinationInput,
        string normalizedUrl,
        out string clonePath,
        out string? errorMessage)
    {
        try
        {
            clonePath = ResolveCloneDestination(destinationInput, normalizedUrl);
            errorMessage = null;
            return true;
        }
        catch (InvalidOperationException ex)
        {
            clonePath = string.Empty;
            errorMessage = ex.Message;
            return false;
        }
    }

    public static bool RequiresHttpsScheme(string url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return false;
        }

        url = url.Trim();
        return !url.Contains("://", StringComparison.Ordinal)
            && !url.StartsWith("git@", StringComparison.OrdinalIgnoreCase)
            && !GitHubShorthandRegex.IsMatch(url);
    }

    private static string ConvertGitHubSshToHttps(string sshUrl)
    {
        Match match = GitHubSshRegex.Match(sshUrl);
        if (!match.Success)
        {
            return sshUrl;
        }

        return $"https://github.com/{match.Groups[1].Value}/{match.Groups[2].Value}";
    }

    private static string StripGitSuffix(string name) =>
        name.EndsWith(".git", StringComparison.OrdinalIgnoreCase)
            ? name[..^4]
            : name;
}
