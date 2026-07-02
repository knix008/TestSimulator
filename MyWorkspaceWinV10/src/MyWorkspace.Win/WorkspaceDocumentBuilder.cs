using System.Text;
using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;
using MyWorkspace.Core.Services;

namespace MyWorkspace.Win;

internal static class WorkspaceDocumentBuilder
{
    public static string BuildCombinedMarkdown(WorkspaceTreeItem workspaceNode, User user, IPageService pages)
    {
        var builder = new StringBuilder();
        AppendWorkspaceNode(builder, workspaceNode, user, pages, headingLevel: 1, includeWorkspaceHeading: true);
        return builder.ToString().Trim();
    }

    private static void AppendWorkspaceNode(
        StringBuilder builder,
        WorkspaceTreeItem node,
        User user,
        IPageService pages,
        int headingLevel,
        bool includeWorkspaceHeading)
    {
        if (includeWorkspaceHeading)
            AppendHeading(builder, headingLevel, node.Name);

        foreach (var child in node.Children)
        {
            if (child.Kind == TreeNodeKind.Page)
            {
                var page = pages.GetById(user, child.Id);
                if (page == null)
                    continue;

                AppendHeading(builder, headingLevel + 1, page.Title);
                AppendPageBody(builder, page.Content);
                continue;
            }

            if (child.Kind != TreeNodeKind.Workspace)
                continue;

            AppendHeading(builder, headingLevel + 1, child.Name);
            AppendWorkspaceNode(builder, child, user, pages, headingLevel + 1, includeWorkspaceHeading: false);
        }
    }

    private static void AppendHeading(StringBuilder builder, int level, string title)
    {
        level = Math.Clamp(level, 1, 6);
        builder.Append(new string('#', level));
        builder.Append(' ');
        builder.AppendLine(PageTitleHelper.NormalizeTitleForExport(title));
        builder.AppendLine();
    }

    private static void AppendPageBody(StringBuilder builder, string content)
    {
        var body = PageTitleHelper.StripLeadingH1(content).Trim();
        if (string.IsNullOrWhiteSpace(body))
            return;

        builder.AppendLine(body);
        builder.AppendLine();
    }
}
