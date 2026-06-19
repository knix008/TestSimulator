using LibGit2Sharp;

namespace MyGitWinV10.App.Services;

public static class CommitDetailService
{
    public static Patch GetPatch(Repository repo, Commit commit)
    {
        var oldTree = commit.Parents.FirstOrDefault()?.Tree;
        return repo.Diff.Compare<Patch>(oldTree, commit.Tree);
    }

    public static string FormatMetadata(Commit commit) =>
        $"{commit.Sha[..10]}   {commit.Author.Name} <{commit.Author.Email}>\n" +
        $"{commit.Author.When:yyyy-MM-dd HH:mm:ss}\n\n" +
        commit.Message.Trim();
}
