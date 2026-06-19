using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace MyGitWinV10.App.Services;

public static class RepositorySummaryPdfExporter
{
    public static void Export(RepositorySummary summary, string filePath)
    {
        Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Margin(40);
                page.DefaultTextStyle(style => style.FontSize(10));
                page.Content().Column(column =>
                {
                    column.Spacing(8);

                    column.Item().Text($"Repository Summary: {summary.RepositoryName}")
                        .Bold().FontSize(18).FontColor(Colors.Blue.Darken2);

                    column.Item().Text($"Generated: {summary.GeneratedAt:yyyy-MM-dd HH:mm:ss}");
                    column.Item().Text($"Path: {summary.RepositoryPath}");
                    column.Item().Text($"Current branch: {summary.CurrentBranch}");
                    column.Item().Text(
                        $"Local branches: {summary.LocalBranches.Count}   " +
                        $"Remote branches: {summary.RemoteBranches.Count}   " +
                        $"Tags: {summary.Tags.Count}   " +
                        $"Releases: {summary.Releases.Count}");

                    AddSection(column, "HEAD Commit", () =>
                    {
                        if (summary.HeadCommitSha is null)
                        {
                            column.Item().Text("(no commits)");
                            return;
                        }

                        column.Item().Text($"SHA: {summary.HeadCommitSha}");
                        column.Item().Text($"Author: {summary.HeadCommitAuthor}");
                        column.Item().Text($"Date: {summary.HeadCommitDate:yyyy-MM-dd HH:mm:ss}");
                        column.Item().Text($"Message: {summary.HeadCommitMessage}");
                    });

                    AddListSection(column, "Remotes", summary.Remotes);
                    AddListSection(column, "Local Branches", summary.LocalBranches);
                    AddListSection(column, "Remote Branches", summary.RemoteBranches);
                    AddListSection(column, "Tags", summary.Tags);

                    AddSection(column, "Releases", () =>
                    {
                        if (summary.Releases.Count == 0)
                        {
                            column.Item().Text("(none)");
                            return;
                        }

                        foreach (var release in summary.Releases)
                        {
                            string date = release.PublishedAt?.ToString("yyyy-MM-dd") ?? "n/a";
                            column.Item().Text($"• {release.Name} (tag: {release.TagName}, published: {date})");
                        }
                    });

                    AddSection(column, "Recent Commits", () =>
                    {
                        if (summary.RecentCommits.Count == 0)
                        {
                            column.Item().Text("(none)");
                            return;
                        }

                        foreach (var commit in summary.RecentCommits)
                        {
                            column.Item().Text($"• {commit.ShortSha}  {commit.Date:yyyy-MM-dd}  {commit.Author}  {commit.Message}");
                        }
                    });
                });
            });
        }).GeneratePdf(filePath);
    }

    private static void AddSection(ColumnDescriptor column, string title, Action content)
    {
        column.Item().PaddingTop(8).Text(title).Bold().FontSize(13).FontColor(Colors.Blue.Darken1);
        content();
    }

    private static void AddListSection(ColumnDescriptor column, string title, IReadOnlyList<string> items)
    {
        AddSection(column, title, () =>
        {
            if (items.Count == 0)
            {
                column.Item().Text("(none)");
                return;
            }

            foreach (string item in items)
            {
                column.Item().Text($"• {item}");
            }
        });
    }
}
