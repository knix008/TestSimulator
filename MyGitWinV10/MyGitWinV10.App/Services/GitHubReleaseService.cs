using System.Text.RegularExpressions;
using Octokit;

namespace MyGitWinV10.App.Services;

public static class GitHubReleaseService
{
    public static (string Owner, string Repo)? ParseGitHubRemote(string? remoteUrl)
    {
        if (string.IsNullOrWhiteSpace(remoteUrl))
        {
            return null;
        }

        var match = Regex.Match(remoteUrl, @"github\.com[/:]([^/]+)/([^/\.]+?)(\.git)?/?$");
        return match.Success ? (match.Groups[1].Value, match.Groups[2].Value) : null;
    }

    public static async Task<IReadOnlyList<Release>> GetReleasesAsync(string owner, string repo)
    {
        var client = new GitHubClient(new ProductHeaderValue("MyGitWinV10"));
        return await client.Repository.Release.GetAll(owner, repo);
    }
}
