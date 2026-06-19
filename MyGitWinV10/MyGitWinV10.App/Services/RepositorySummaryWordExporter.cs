using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

namespace MyGitWinV10.App.Services;

public static class RepositorySummaryWordExporter
{
    public static void Export(RepositorySummary summary, string filePath)
    {
        using var document = WordprocessingDocument.Create(filePath, WordprocessingDocumentType.Document);
        var mainPart = document.AddMainDocumentPart();
        mainPart.Document = new Document(new Body());
        var body = mainPart.Document.Body!;

        AddTitle(body, $"Repository Summary: {summary.RepositoryName}");
        AddParagraph(body, $"Generated: {summary.GeneratedAt:yyyy-MM-dd HH:mm:ss}");
        AddParagraph(body, $"Path: {summary.RepositoryPath}");
        AddParagraph(body, $"Current branch: {summary.CurrentBranch}");
        AddParagraph(body, $"Local branches: {summary.LocalBranches.Count}  |  Remote branches: {summary.RemoteBranches.Count}  |  Tags: {summary.Tags.Count}  |  Releases: {summary.Releases.Count}");
        AddSpacer(body);

        AddHeading(body, "HEAD Commit");
        if (summary.HeadCommitSha is null)
        {
            AddParagraph(body, "(no commits)");
        }
        else
        {
            AddParagraph(body, $"SHA: {summary.HeadCommitSha}");
            AddParagraph(body, $"Author: {summary.HeadCommitAuthor}");
            AddParagraph(body, $"Date: {summary.HeadCommitDate:yyyy-MM-dd HH:mm:ss}");
            AddParagraph(body, $"Message: {summary.HeadCommitMessage}");
        }

        AddBulletSection(body, "Remotes", summary.Remotes);
        AddBulletSection(body, "Local Branches", summary.LocalBranches);
        AddBulletSection(body, "Remote Branches", summary.RemoteBranches);
        AddBulletSection(body, "Tags", summary.Tags);

        AddHeading(body, "Releases");
        if (summary.Releases.Count == 0)
        {
            AddParagraph(body, "(none)");
        }
        else
        {
            foreach (var release in summary.Releases)
            {
                string date = release.PublishedAt?.ToString("yyyy-MM-dd") ?? "n/a";
                AddBullet(body, $"{release.Name} (tag: {release.TagName}, published: {date})");
            }
        }

        AddHeading(body, "Recent Commits");
        if (summary.RecentCommits.Count == 0)
        {
            AddParagraph(body, "(none)");
        }
        else
        {
            foreach (var commit in summary.RecentCommits)
            {
                AddBullet(body, $"{commit.ShortSha}  {commit.Date:yyyy-MM-dd}  {commit.Author}  {commit.Message}");
            }
        }

        mainPart.Document.Save();
    }

    private static void AddTitle(Body body, string text) =>
        body.AppendChild(new Paragraph(new Run(new RunProperties(new Bold()), new Text(text))));

    private static void AddHeading(Body body, string text) =>
        body.AppendChild(new Paragraph(new Run(new RunProperties(new Bold(), new FontSize { Val = "28" }), new Text(text))));

    private static void AddParagraph(Body body, string text) =>
        body.AppendChild(new Paragraph(new Run(new Text(text) { Space = SpaceProcessingModeValues.Preserve })));

    private static void AddBullet(Body body, string text) =>
        body.AppendChild(new Paragraph(new Run(new Text($"• {text}") { Space = SpaceProcessingModeValues.Preserve })));

    private static void AddBulletSection(Body body, string title, IReadOnlyList<string> items)
    {
        AddHeading(body, title);
        if (items.Count == 0)
        {
            AddParagraph(body, "(none)");
            return;
        }

        foreach (string item in items)
        {
            AddBullet(body, item);
        }
    }

    private static void AddSpacer(Body body) => body.AppendChild(new Paragraph());
}
