using LibGit2Sharp;

namespace MyGitWinV10.App.Services;

public static class RepositoryFileTreeService
{
    private const string PlaceholderNodeText = "...";

    public static void PopulateRoot(TreeView treeView, Repository repo)
    {
        treeView.BeginUpdate();
        treeView.Nodes.Clear();

        if (repo.Head?.Tip is null)
        {
            treeView.Nodes.Add("(no commits)");
            treeView.EndUpdate();
            return;
        }

        var root = new TreeNode(GetRootDisplayName(repo))
        {
            Tag = new RepositoryFileNodeTag
            {
                RelativePath = string.Empty,
                IsDirectory = true
            }
        };
        AddPlaceholderChild(root);
        treeView.Nodes.Add(root);
        treeView.EndUpdate();
    }

    public static void LoadChildren(TreeNode node, Repository repo)
    {
        if (node.Tag is not RepositoryFileNodeTag tag || tag.IsPlaceholder || !tag.IsDirectory)
        {
            return;
        }

        if (node.Nodes.Count == 1 && node.Nodes[0].Tag is RepositoryFileNodeTag placeholder && placeholder.IsPlaceholder)
        {
            node.Nodes.Clear();
            if (repo.Info.IsBare)
            {
                LoadGitTreeChildren(node, repo, tag.RelativePath);
            }
            else
            {
                LoadWorkingDirectoryChildren(node, repo, tag.RelativePath);
            }
        }
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

    private static void LoadWorkingDirectoryChildren(TreeNode parent, Repository repo, string relativePath)
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

        foreach (var directory in Directory.EnumerateDirectories(fullPath).OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase))
        {
            string name = Path.GetFileName(directory);
            if (string.Equals(name, ".git", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            string childPath = CombineRelativePath(relativePath, name);
            parent.Nodes.Add(CreateDirectoryNode(name, childPath));
        }

        foreach (var file in Directory.EnumerateFiles(fullPath).OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase))
        {
            string name = Path.GetFileName(file);
            string childPath = CombineRelativePath(relativePath, name);
            parent.Nodes.Add(CreateFileNode(name, childPath));
        }
    }

    private static void LoadGitTreeChildren(TreeNode parent, Repository repo, string relativePath)
    {
        Tree? tree = ResolveTree(repo, relativePath);
        if (tree is null)
        {
            return;
        }

        foreach (var entry in tree.OrderBy(entry => entry.Name, StringComparer.OrdinalIgnoreCase))
        {
            string childPath = CombineRelativePath(relativePath, entry.Name);
            if (entry.TargetType == TreeEntryTargetType.Tree)
            {
                parent.Nodes.Add(CreateDirectoryNode(entry.Name, childPath));
            }
            else if (entry.TargetType == TreeEntryTargetType.Blob)
            {
                parent.Nodes.Add(CreateFileNode(entry.Name, childPath));
            }
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
                IsDirectory = true
            }
        };
        AddPlaceholderChild(node);
        return node;
    }

    private static TreeNode CreateFileNode(string name, string relativePath) =>
        new(name)
        {
            Tag = new RepositoryFileNodeTag
            {
                RelativePath = relativePath,
                IsDirectory = false
            }
        };

    private static void AddPlaceholderChild(TreeNode node) =>
        node.Nodes.Add(new TreeNode(PlaceholderNodeText)
        {
            Tag = RepositoryFileNodeTag.Placeholder
        });

    private static string CombineRelativePath(string parentPath, string name) =>
        string.IsNullOrEmpty(parentPath) ? name : $"{parentPath}/{name}";
}
