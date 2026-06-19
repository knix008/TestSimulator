using LibGit2Sharp;

namespace MyGitWinV10.App.Services;

public static class BranchTagTreePopulator
{
    public static TreeNode? FindSectionNode(TreeView treeView, string sectionKey)
    {
        foreach (TreeNode node in treeView.Nodes)
        {
            if (Equals(node.Tag, sectionKey))
            {
                return node;
            }
        }

        return null;
    }

    public static void Populate(TreeView treeView, Repository repo)
    {
        treeView.BeginUpdate();
        treeView.Nodes.Clear();

        var sectionFont = new Font(treeView.Font, FontStyle.Bold);

        var localBranches = repo.Branches.Where(b => !b.IsRemote).OrderBy(b => b.FriendlyName).ToList();
        var localBranchesNode = CreateSectionNode(
            sectionFont,
            RepoTreeSections.LocalBranches,
            "Local Branches",
            localBranches.Count);

        foreach (var branch in localBranches)
        {
            var node = CreateBranchNode(branch, branch.FriendlyName);
            if (branch.IsCurrentRepositoryHead)
            {
                node.NodeFont = new Font(treeView.Font, FontStyle.Bold);
            }
            localBranchesNode.Nodes.Add(node);
        }

        AddEmptyPlaceholder(localBranchesNode, localBranches.Count);

        var remoteBranches = repo.Branches.Where(b => b.IsRemote).OrderBy(b => b.FriendlyName).ToList();
        var remotesNode = CreateSectionNode(
            sectionFont,
            RepoTreeSections.Remotes,
            "Remotes",
            remoteBranches.Count);

        foreach (var group in remoteBranches.GroupBy(GetRemoteName).OrderBy(g => g.Key))
        {
            var remoteNode = new TreeNode($"{group.Key} ({group.Count()})")
            {
                Tag = $"{RepoTreeSections.Remotes}/{group.Key}",
                ToolTipText = $"Remote: {group.Key}"
            };

            foreach (var branch in group)
            {
                remoteNode.Nodes.Add(CreateBranchNode(branch, GetShortRemoteBranchName(branch)));
            }

            remotesNode.Nodes.Add(remoteNode);
        }

        AddEmptyPlaceholder(remotesNode, remoteBranches.Count);

        var tags = repo.Tags.OrderBy(t => t.FriendlyName).ToList();
        var tagsNode = CreateSectionNode(sectionFont, RepoTreeSections.Tags, "Tags", tags.Count);

        foreach (var tag in tags)
        {
            var tip = tag.PeeledTarget is Commit commit
                ? $"{tag.FriendlyName}\n{commit.Sha[..10]}  {commit.MessageShort}"
                : tag.FriendlyName;
            tagsNode.Nodes.Add(new TreeNode(tag.FriendlyName) { Tag = tag, ToolTipText = tip });
        }

        AddEmptyPlaceholder(tagsNode, tags.Count);

        var releasesNode = CreateSectionNode(sectionFont, RepoTreeSections.Releases, "Releases", 0);
        releasesNode.Nodes.Add(CreatePlaceholderNode("Loading releases..."));

        treeView.Nodes.Add(localBranchesNode);
        treeView.Nodes.Add(remotesNode);
        treeView.Nodes.Add(tagsNode);
        treeView.Nodes.Add(releasesNode);

        localBranchesNode.Expand();
        if (remoteBranches.Count > 0)
        {
            remotesNode.Expand();
        }

        treeView.EndUpdate();
    }

    public static void SetReleaseNodes(TreeNode releasesNode, IEnumerable<(string Label, object? Tag, string? ToolTip)> items)
    {
        releasesNode.Nodes.Clear();
        var list = items.ToList();
        releasesNode.Text = FormatSectionTitle("Releases", list.Count(n => n.Tag is not null));

        if (list.Count == 0)
        {
            releasesNode.Nodes.Add(CreatePlaceholderNode("(no releases)"));
            return;
        }

        foreach (var item in list)
        {
            releasesNode.Nodes.Add(new TreeNode(item.Label)
            {
                Tag = item.Tag,
                ToolTipText = item.ToolTip
            });
        }
    }

    private static TreeNode CreateSectionNode(Font font, string sectionKey, string title, int count)
    {
        return new TreeNode(FormatSectionTitle(title, count))
        {
            Tag = sectionKey,
            NodeFont = font,
            ToolTipText = title
        };
    }

    private static string FormatSectionTitle(string title, int count) => $"{title} ({count})";

    private static TreeNode CreateBranchNode(Branch branch, string displayName)
    {
        return new TreeNode(displayName)
        {
            Tag = branch,
            ToolTipText = BranchToolTip(branch)
        };
    }

    private static TreeNode CreatePlaceholderNode(string text) =>
        new(text) { ForeColor = Color.FromArgb(140, 140, 150) };

    private static void AddEmptyPlaceholder(TreeNode sectionNode, int itemCount)
    {
        if (itemCount == 0)
        {
            sectionNode.Nodes.Add(CreatePlaceholderNode("(none)"));
        }
    }

    private static string GetRemoteName(Branch branch)
    {
        int slash = branch.FriendlyName.IndexOf('/');
        return slash > 0 ? branch.FriendlyName[..slash] : branch.RemoteName ?? "remote";
    }

    private static string GetShortRemoteBranchName(Branch branch)
    {
        int slash = branch.FriendlyName.IndexOf('/');
        return slash >= 0 && slash < branch.FriendlyName.Length - 1
            ? branch.FriendlyName[(slash + 1)..]
            : branch.FriendlyName;
    }

    private static string BranchToolTip(Branch branch)
    {
        if (branch.Tip is null)
        {
            return branch.FriendlyName;
        }

        return $"{branch.FriendlyName}\n{branch.Tip.Sha[..10]}  {branch.Tip.Author.Name}\n{branch.Tip.MessageShort}";
    }
}
