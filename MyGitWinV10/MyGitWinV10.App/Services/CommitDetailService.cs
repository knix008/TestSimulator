using LibGit2Sharp;

namespace MyGitWinV10.App.Services;

public static class CommitDetailService
{
    public static TreeChanges GetTreeChanges(Repository repo, Commit commit)
    {
        Tree? oldTree = commit.Parents.FirstOrDefault()?.Tree;
        return repo.Diff.Compare<TreeChanges>(oldTree, commit.Tree);
    }

    public static string GetFilePatch(Repository repo, Commit commit, string path)
    {
        Tree? oldTree = commit.Parents.FirstOrDefault()?.Tree;
        Patch patch = repo.Diff.Compare<Patch>(oldTree, commit.Tree, [path]);
        foreach (var entry in patch)
        {
            if (string.Equals(entry.Path, path, StringComparison.OrdinalIgnoreCase)
                || string.Equals(entry.OldPath, path, StringComparison.OrdinalIgnoreCase))
            {
                return entry.Patch ?? string.Empty;
            }
        }

        return string.Empty;
    }

    public static Patch GetPatch(Repository repo, Commit commit)
    {
        Tree? oldTree = commit.Parents.FirstOrDefault()?.Tree;
        return repo.Diff.Compare<Patch>(oldTree, commit.Tree);
    }

    public static string FormatMetadata(Commit commit) =>
        $"{commit.Sha[..10]}   {commit.Author.Name} <{commit.Author.Email}>\n" +
        $"{commit.Author.When:yyyy-MM-dd HH:mm:ss}\n\n" +
        commit.Message.Trim();
}
