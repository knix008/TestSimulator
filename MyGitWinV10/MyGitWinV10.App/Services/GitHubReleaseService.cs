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

    public static async Task<IReadOnlyList<Release>> GetReleasesAsync(string owner, string repo, string? token = null)
    {
        var client = new GitHubClient(new ProductHeaderValue("MyGitWinV10"));
        if (!string.IsNullOrWhiteSpace(token))
        {
            // GitHub's anonymous API quota is 60 requests/hour per IP and is easily
            // exhausted (returns 403), so an authenticated PAT must be attached here too —
            // the PAT entered for git-over-HTTPS auth is otherwise never reused for this call.
            client.Credentials = new Octokit.Credentials(token);
        }

        return await client.Repository.Release.GetAll(owner, repo);
    }
}
