using LibGit2Sharp;

namespace MyGitWinV10.App.Services;

using MyGitWinV10.App.Controls;

public static class RepositoryFileTreeService
{
    private const string PlaceholderNodeText = "...";

    public static void PopulateRoot(
        TreeView treeView,
        Repository repo,
        GitFileTreeImageList? icons,
        RepositoryPathStatusIndex? statusIndex = null)
    {
        treeView.BeginUpdate();
        treeView.Nodes.Clear();

        if (repo.Head?.Tip is null)
        {
            treeView.Nodes.Add("(no commits)");
            treeView.EndUpdate();
            return;
        }

        RepositoryPathStatusIndex index = statusIndex ?? RepositoryPathStatusService.Build(repo);
        var root = CreateDirectoryNode(GetRootDisplayName(repo), string.Empty);
        RepositoryPathStatusService.ApplyToNode(root, index, icons);
        treeView.Nodes.Add(root);
        treeView.EndUpdate();
    }

    public static void LoadChildren(
        TreeNode node,
        Repository repo,
        GitFileTreeImageList? icons,
        RepositoryPathStatusIndex? statusIndex = null)
    {
        if (node.Tag is not RepositoryFileNodeTag tag || tag.IsPlaceholder || !tag.IsDirectory)
        {
            return;
        }

        if (HasOnlyPlaceholderChildren(node))
        {
            node.Nodes.Clear();
            RepositoryPathStatusIndex index = statusIndex ?? RepositoryPathStatusService.Build(repo);
            if (repo.Info.IsBare)
            {
                LoadGitTreeChildren(node, repo, tag.RelativePath, index);
            }
            else
            {
                LoadWorkingDirectoryChildren(node, repo, tag.RelativePath, index);
            }

            SortChildNodes(node);
            foreach (TreeNode child in node.Nodes)
            {
                RepositoryPathStatusService.ApplyToNode(child, index, icons);
            }
        }
    }

    public static TreeNode? FindNodeByRelativePath(TreeView treeView, string relativePath)
    {
        string normalized = PathCommitHistoryService.NormalizeGitPath(relativePath);
        foreach (TreeNode root in treeView.Nodes)
        {
            TreeNode? found = FindNodeRecursive(root, normalized);
            if (found is not null)
            {
                return found;
            }
        }

        return null;
    }

    public static void ForceReloadDirectory(
        TreeView treeView,
        Repository repo,
        string directoryRelativePath,
        GitFileTreeImageList? icons,
        RepositoryPathStatusIndex? statusIndex)
    {
        TreeNode? node = FindNodeByRelativePath(treeView, directoryRelativePath);
        if (node?.Tag is not RepositoryFileNodeTag { IsDirectory: true })
        {
            return;
        }

        node.Nodes.Clear();
        AddPlaceholderChild(node);
        LoadChildren(node, repo, icons, statusIndex);
    }

    private static TreeNode? FindNodeRecursive(TreeNode node, string relativePath)
    {
        if (node.Tag is RepositoryFileNodeTag tag
            && !tag.IsPlaceholder
            && string.Equals(PathCommitHistoryService.NormalizeGitPath(tag.RelativePath), relativePath, StringComparison.OrdinalIgnoreCase))
        {
            return node;
        }

        foreach (TreeNode child in node.Nodes)
        {
            TreeNode? found = FindNodeRecursive(child, relativePath);
            if (found is not null)
            {
                return found;
            }
        }

        return null;
    }

    private static string GetRootDisplayName(Repository repo)
    {
        if (repo.Info.IsBare)
        {
            return repo.Head?.FriendlyName ?? "HEAD";
        }

        string? workingDirectory = repo.Info.WorkingDirectory;
        if (string.IsNullOrWhiteSpace(workingDirectory))
        {
            return repo.Head?.FriendlyName ?? "Repository";
        }

        return Path.GetFileName(workingDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar))
            ?? workingDirectory;
    }

    private static void LoadWorkingDirectoryChildren(
        TreeNode parent,
        Repository repo,
        string relativePath,
        RepositoryPathStatusIndex statusIndex)
    {
        string? workingDirectory = repo.Info.WorkingDirectory;
        if (string.IsNullOrWhiteSpace(workingDirectory))
        {
            return;
        }

        string fullPath = string.IsNullOrEmpty(relativePath)
            ? workingDirectory
            : Path.Combine(workingDirectory, relativePath.Replace('/', Path.DirectorySeparatorChar));

        if (!Directory.Exists(fullPath))
        {
            return;
        }

        var childPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var directory in Directory.EnumerateDirectories(fullPath).OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase))
        {
            string name = Path.GetFileName(directory);
            if (string.Equals(name, ".git", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            string childPath = CombineRelativePath(relativePath, name);
            childPaths.Add(childPath);
            parent.Nodes.Add(CreateDirectoryNode(name, childPath));
        }

        foreach (var file in Directory.EnumerateFiles(fullPath).OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase))
        {
            string name = Path.GetFileName(file);
            string childPath = CombineRelativePath(relativePath, name);
            childPaths.Add(childPath);
            parent.Nodes.Add(CreateFileNode(name, childPath));
        }

        AddStatusOnlyChildren(parent, relativePath, statusIndex, childPaths);
    }

    private static void LoadGitTreeChildren(
        TreeNode parent,
        Repository repo,
        string relativePath,
        RepositoryPathStatusIndex statusIndex)
    {
        Tree? tree = ResolveTree(repo, relativePath);
        if (tree is null)
        {
            return;
        }

        var childPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var entry in tree.OrderBy(entry => entry.Name, StringComparer.OrdinalIgnoreCase))
        {
            string childPath = CombineRelativePath(relativePath, entry.Name);
            childPaths.Add(childPath);
            if (entry.TargetType == TreeEntryTargetType.Tree)
            {
                parent.Nodes.Add(CreateDirectoryNode(entry.Name, childPath));
            }
            else if (entry.TargetType == TreeEntryTargetType.Blob)
            {
                parent.Nodes.Add(CreateFileNode(entry.Name, childPath));
            }
        }

        AddStatusOnlyChildren(parent, relativePath, statusIndex, childPaths);
    }

    private static void AddStatusOnlyChildren(
        TreeNode parent,
        string relativePath,
        RepositoryPathStatusIndex statusIndex,
        ISet<string> existingChildPaths)
    {
        foreach (string childPath in statusIndex.GetDirectChildFilePaths(relativePath))
        {
            if (existingChildPaths.Contains(childPath))
            {
                continue;
            }

            string name = Path.GetFileName(childPath.Replace('/', Path.DirectorySeparatorChar));
            parent.Nodes.Add(CreateFileNode(name, childPath, isMissingFromWorkTree: true));
        }
    }

    private static Tree? ResolveTree(Repository repo, string relativePath)
    {
        Tree? tree = repo.Head?.Tip?.Tree;
        if (tree is null)
        {
            return null;
        }

        if (string.IsNullOrEmpty(relativePath))
        {
            return tree;
        }

        return tree[relativePath]?.Target as Tree;
    }

    private static TreeNode CreateDirectoryNode(string name, string relativePath)
    {
        var node = new TreeNode(name)
        {
            Tag = new RepositoryFileNodeTag
            {
                RelativePath = relativePath,
                DisplayName = name,
                IsDirectory = true
            }
        };
        AddPlaceholderChild(node);
        return node;
    }

    private static TreeNode CreateFileNode(
        string name,
        string relativePath,
        bool isMissingFromWorkTree = false) =>
        new(name)
        {
            Tag = new RepositoryFileNodeTag
            {
                RelativePath = relativePath,
                DisplayName = name,
                IsDirectory = false,
                IsMissingFromWorkTree = isMissingFromWorkTree
            }
        };

    private static bool HasOnlyPlaceholderChildren(TreeNode node)
    {
        if (node.Nodes.Count == 0)
        {
            return false;
        }

        foreach (TreeNode child in node.Nodes)
        {
            if (child.Tag is not RepositoryFileNodeTag tag || !tag.IsPlaceholder)
            {
                return false;
            }
        }

        return true;
    }

    private static void AddPlaceholderChild(TreeNode node) =>
        node.Nodes.Add(new TreeNode(PlaceholderNodeText)
        {
            Tag = RepositoryFileNodeTag.Placeholder
        });

    private static void SortChildNodes(TreeNode parent)
    {
        var children = parent.Nodes.Cast<TreeNode>()
            .OrderBy(node => node.Tag is RepositoryFileNodeTag tag ? tag.DisplayName : node.Text, StringComparer.OrdinalIgnoreCase)
            .ToList();

        parent.Nodes.Clear();
        foreach (TreeNode child in children)
        {
            parent.Nodes.Add(child);
        }
    }

    private static string CombineRelativePath(string parentPath, string name) =>
        string.IsNullOrEmpty(parentPath) ? name : $"{parentPath}/{name}";
}
