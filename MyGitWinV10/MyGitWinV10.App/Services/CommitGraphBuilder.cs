using LibGit2Sharp;

namespace MyGitWinV10.App.Services;

public sealed record CommitRow(
    Commit Commit,
    int Lane,
    IReadOnlyList<int> PassThroughLanes,
    IReadOnlyList<int> ForkLanes,
    IReadOnlyList<int> MergeLanes,
    bool ContinuesDown);

public static class CommitGraphBuilder
{
    public static List<CommitRow> Build(IEnumerable<Commit> commits)
    {
        var rows = new List<CommitRow>();
        var activeLanes = new List<string?>();

        foreach (var commit in commits)
        {
            int lane = FindLaneForCommit(activeLanes, commit.Sha);
            CollapseDuplicateLanes(activeLanes, commit.Sha, lane);

            var parents = commit.Parents.ToList();
            var forkLanes = new List<int>();
            var mergeLanes = new List<int>();

            if (parents.Count > 1)
            {
                for (int p = 1; p < parents.Count; p++)
                {
                    int parentLane = activeLanes.FindIndex(w => w == parents[p].Sha);
                    if (parentLane >= 0 && parentLane != lane)
                    {
                        mergeLanes.Add(parentLane);
                    }
                }
            }

            var passThrough = new List<int>();
            for (int l = 0; l < activeLanes.Count; l++)
            {
                if (l != lane && activeLanes[l] is not null)
                {
                    passThrough.Add(l);
                }
            }

            if (parents.Count > 0)
            {
                activeLanes[lane] = parents[0].Sha;
                for (int p = 1; p < parents.Count; p++)
                {
                    string parentSha = parents[p].Sha;
                    int parentLane = activeLanes.FindIndex(w => w == parentSha);
                    if (parentLane < 0)
                    {
                        parentLane = activeLanes.FindIndex(w => w is null);
                        if (parentLane < 0)
                        {
                            parentLane = activeLanes.Count;
                            activeLanes.Add(null);
                        }

                        forkLanes.Add(parentLane);
                    }

                    activeLanes[parentLane] = parentSha;
                }
            }
            else
            {
                activeLanes[lane] = null;
            }

            TrimTrailingEmptyLanes(activeLanes);

            rows.Add(new CommitRow(commit, lane, passThrough, forkLanes, mergeLanes, parents.Count > 0));
        }

        return rows;
    }

    private static int FindLaneForCommit(List<string?> activeLanes, string commitSha)
    {
        int lane = activeLanes.FindIndex(w => w == commitSha);
        if (lane >= 0)
        {
            return lane;
        }

        lane = activeLanes.FindIndex(w => w is null);
        if (lane >= 0)
        {
            return lane;
        }

        lane = activeLanes.Count;
        activeLanes.Add(null);
        return lane;
    }

    private static void CollapseDuplicateLanes(List<string?> activeLanes, string commitSha, int lane)
    {
        for (int l = 0; l < activeLanes.Count; l++)
        {
            if (l != lane && activeLanes[l] == commitSha)
            {
                activeLanes[l] = null;
            }
        }
    }

    private static void TrimTrailingEmptyLanes(List<string?> activeLanes)
    {
        while (activeLanes.Count > 0 && activeLanes[^1] is null)
        {
            activeLanes.RemoveAt(activeLanes.Count - 1);
        }
    }
}
