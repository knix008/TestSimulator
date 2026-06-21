using System.Text;

namespace MyGitWinV10.App.Services;

internal static class RepositorySummaryContent
{
    public static string ToMarkdown(RepositorySummary summary, string chartsRelativeFolder) =>
        ToMarkdown(summary, chartsRelativeFolder, includeChartSection: summary.Charts.Count > 0);

    public static string ToMarkdown(RepositorySummary summary) =>
        ToMarkdown(summary, chartsRelativeFolder: string.Empty, includeChartSection: false);

    private static string ToMarkdown(RepositorySummary summary, string chartsRelativeFolder, bool includeChartSection)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"# Repository Summary: {summary.RepositoryName}");
        sb.AppendLine();
        sb.AppendLine($"- **Generated:** {summary.GeneratedAt:yyyy-MM-dd HH:mm:ss}");
        sb.AppendLine($"- **Path:** `{summary.RepositoryPath}`");
        sb.AppendLine($"- **Current branch:** {summary.CurrentBranch}");
        sb.AppendLine($"- **Local branches:** {summary.LocalBranches.Count}");
        sb.AppendLine($"- **Remote branches:** {summary.RemoteBranches.Count}");
        sb.AppendLine($"- **Tags:** {summary.Tags.Count}");
        sb.AppendLine($"- **Releases:** {summary.Releases.Count}");
        sb.AppendLine();

        if (includeChartSection)
        {
            AppendChartsMarkdown(sb, summary, chartsRelativeFolder);
        }

        AppendHeadCommitMarkdown(sb, summary);
        AppendSectionMarkdown(sb, "Remotes", summary.Remotes);
        AppendSectionMarkdown(sb, "Local Branches", summary.LocalBranches);
        AppendSectionMarkdown(sb, "Remote Branches", summary.RemoteBranches);
        AppendSectionMarkdown(sb, "Tags", summary.Tags);
        AppendReleasesMarkdown(sb, summary);
        AppendRecentCommitsMarkdown(sb, summary);

        return sb.ToString();
    }

    private static void AppendChartsMarkdown(StringBuilder sb, RepositorySummary summary, string chartsRelativeFolder)
    {
        sb.AppendLine("## Charts");
        sb.AppendLine();

        foreach (var chart in summary.Charts)
        {
            sb.AppendLine($"### {chart.Title}");
            sb.AppendLine();
            sb.AppendLine($"![{chart.Title}]({chartsRelativeFolder}/{chart.FileName})");
            sb.AppendLine();
        }
    }

    private static void AppendHeadCommitMarkdown(StringBuilder sb, RepositorySummary summary)
    {
        sb.AppendLine("## HEAD Commit");
        sb.AppendLine();
        if (summary.HeadCommitSha is null)
        {
            sb.AppendLine("(no commits)");
            sb.AppendLine();
            return;
        }

        sb.AppendLine($"- **SHA:** `{summary.HeadCommitSha}`");
        sb.AppendLine($"- **Author:** {summary.HeadCommitAuthor}");
        sb.AppendLine($"- **Date:** {summary.HeadCommitDate:yyyy-MM-dd HH:mm:ss}");
        sb.AppendLine($"- **Message:** {summary.HeadCommitMessage}");
        sb.AppendLine();
    }

    private static void AppendSectionMarkdown(StringBuilder sb, string title, IReadOnlyList<string> items)
    {
        sb.AppendLine($"## {title}");
        sb.AppendLine();
        if (items.Count == 0)
        {
            sb.AppendLine("(none)");
        }
        else
        {
            foreach (string item in items)
            {
                sb.AppendLine($"- {item}");
            }
        }

        sb.AppendLine();
    }

    private static void AppendReleasesMarkdown(StringBuilder sb, RepositorySummary summary)
    {
        sb.AppendLine("## Releases");
        sb.AppendLine();
        if (summary.Releases.Count == 0)
        {
            sb.AppendLine("(none)");
            sb.AppendLine();
            return;
        }

        foreach (var release in summary.Releases)
        {
            string date = release.PublishedAt?.ToString("yyyy-MM-dd") ?? "n/a";
            sb.AppendLine($"- **{release.Name}** (tag: `{release.TagName}`, published: {date})");
        }

        sb.AppendLine();
    }

    private static void AppendRecentCommitsMarkdown(StringBuilder sb, RepositorySummary summary)
    {
        sb.AppendLine("## Recent Commits");
        sb.AppendLine();
        if (summary.RecentCommits.Count == 0)
        {
            sb.AppendLine("(none)");
            sb.AppendLine();
            return;
        }

        sb.AppendLine("| SHA | Date | Author | Message |");
        sb.AppendLine("| --- | --- | --- | --- |");
        foreach (var commit in summary.RecentCommits)
        {
            sb.AppendLine($"| `{commit.ShortSha}` | {commit.Date:yyyy-MM-dd} | {EscapeMarkdownCell(commit.Author)} | {EscapeMarkdownCell(commit.Message)} |");
        }

        sb.AppendLine();
    }

    private static string EscapeMarkdownCell(string value) =>
        value.Replace('|', '/').Replace("\r", string.Empty).Replace('\n', ' ');
}
