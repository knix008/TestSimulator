using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Models;

namespace MyWorkspace.Win;

internal static class PageContentCache
{
    public sealed record Draft(
        string Title,
        string Content,
        OfflinePageContext? Context,
        DateTime CachedAtUtc,
        DateTime? PrimarySyncedAtUtc = null);

    public enum ContentSource
    {
        Database,
        CachePendingFlush,
        CacheSession
    }

    public sealed record ResolvedContent(string Title, string Content, ContentSource Source);

    private static readonly object Sync = new();
    private static readonly Dictionary<int, Draft> Drafts = new();
    private static readonly HashSet<int> PendingPrimaryFlush = [];

    public static void Put(int pageId, Draft draft, bool markPendingPrimaryFlush = false)
    {
        lock (Sync)
        {
            Drafts[pageId] = draft;
            if (markPendingPrimaryFlush)
                PendingPrimaryFlush.Add(pageId);
        }
    }

    public static void CommitForPrimaryFlush(int pageId)
    {
        lock (Sync)
        {
            if (Drafts.ContainsKey(pageId))
                PendingPrimaryFlush.Add(pageId);
        }
    }

    public static Draft? TryGet(int pageId)
    {
        lock (Sync)
            return Drafts.TryGetValue(pageId, out var draft) ? draft : null;
    }

    public static bool IsPendingPrimaryFlush(int pageId)
    {
        lock (Sync)
            return PendingPrimaryFlush.Contains(pageId);
    }

    public static void MarkPrimarySynced(int pageId)
    {
        lock (Sync)
        {
            PendingPrimaryFlush.Remove(pageId);
            if (!Drafts.TryGetValue(pageId, out var draft))
                return;

            var syncedAt = DateTime.UtcNow;
            Drafts[pageId] = draft with { PrimarySyncedAtUtc = syncedAt };
        }
    }

    public static void Remove(int pageId)
    {
        lock (Sync)
        {
            Drafts.Remove(pageId);
            PendingPrimaryFlush.Remove(pageId);
        }
    }

    public static ResolvedContent Resolve(int pageId, Page dbPage)
    {
        lock (Sync)
        {
            if (!Drafts.TryGetValue(pageId, out var draft))
            {
                return new ResolvedContent(
                    dbPage.Title,
                    dbPage.Content,
                    ContentSource.Database);
            }

            if (PendingPrimaryFlush.Contains(pageId))
            {
                return new ResolvedContent(
                    draft.Title,
                    draft.Content,
                    ContentSource.CachePendingFlush);
            }

            var dbUpdatedUtc = NormalizeUtc(dbPage.UpdatedAt);
            var syncPoint = draft.PrimarySyncedAtUtc ?? draft.CachedAtUtc;

            if (dbUpdatedUtc > syncPoint.AddSeconds(1))
            {
                Drafts.Remove(pageId);
                return new ResolvedContent(
                    dbPage.Title,
                    dbPage.Content,
                    ContentSource.Database);
            }

            if (string.Equals(draft.Content, dbPage.Content, StringComparison.Ordinal)
                && string.Equals(draft.Title, dbPage.Title, StringComparison.Ordinal))
            {
                return new ResolvedContent(
                    dbPage.Title,
                    dbPage.Content,
                    ContentSource.Database);
            }

            // Session copy differs from DB without a pending flag — re-queue sync and prefer cache.
            PendingPrimaryFlush.Add(pageId);
            return new ResolvedContent(
                draft.Title,
                draft.Content,
                ContentSource.CacheSession);
        }
    }

    public static int[] GetPendingPrimaryFlushPageIds()
    {
        lock (Sync)
            return PendingPrimaryFlush.ToArray();
    }

    public static void Clear()
    {
        lock (Sync)
        {
            Drafts.Clear();
            PendingPrimaryFlush.Clear();
        }
    }

    private static DateTime NormalizeUtc(DateTime value) =>
        value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
        };
}

internal sealed class PagePrimaryFlushService
{
    private static PagePrimaryFlushService? _instance;

    public static PagePrimaryFlushService Instance => _instance ??= new PagePrimaryFlushService();

    private readonly object _sync = new();
    private readonly Dictionary<int, Task> _running = new();
    private readonly Dictionary<int, int> _retryCounts = new();

    private const int MaxRetries = 5;
    private const int RetryDelayMs = 4000;
    private bool _shutdownMode;

    public void BeginShutdown() => _shutdownMode = true;

    public void Schedule(int pageId, Func<int, Task<PageSaveResult>> flushAsync, Action? onCompleted = null)
    {
        if (_shutdownMode)
            return;

        lock (_sync)
        {
            if (_running.TryGetValue(pageId, out var existing))
            {
                _running[pageId] = ChainFlush(existing, pageId, flushAsync, onCompleted);
                return;
            }

            _running[pageId] = RunFlushAsync(pageId, flushAsync, onCompleted);
        }
    }

    public async Task FlushNowAsync(int pageId, Func<int, Task<PageSaveResult>> flushAsync)
    {
        Task flushTask;
        lock (_sync)
        {
            if (_running.TryGetValue(pageId, out var existing))
            {
                flushTask = existing;
            }
            else
            {
                flushTask = RunFlushAsync(pageId, flushAsync, null);
                _running[pageId] = flushTask;
            }
        }

        await flushTask.ConfigureAwait(false);
    }

    public async Task FlushAllPendingAsync(Func<int, Task<PageSaveResult>> flushAsync)
    {
        var pageIds = PageContentCache.GetPendingPrimaryFlushPageIds();
        foreach (var pageId in pageIds)
            await FlushNowAsync(pageId, flushAsync).ConfigureAwait(false);
    }

    private static Task ChainFlush(
        Task previous,
        int pageId,
        Func<int, Task<PageSaveResult>> flushAsync,
        Action? onCompleted)
    {
        return previous.ContinueWith(
            _ => RunFlushAsync(pageId, flushAsync, onCompleted),
            CancellationToken.None,
            TaskContinuationOptions.RunContinuationsAsynchronously,
            TaskScheduler.Default).Unwrap();
    }

    private static async Task RunFlushAsync(
        int pageId,
        Func<int, Task<PageSaveResult>> flushAsync,
        Action? onCompleted)
    {
        try
        {
            if (!PageContentCache.IsPendingPrimaryFlush(pageId))
                return;

            var result = await flushAsync(pageId).ConfigureAwait(false);
            if (result is PageSaveResult.Primary or PageSaveResult.OfflineFallback)
            {
                lock (Instance._sync)
                    Instance._retryCounts.Remove(pageId);

                PageContentCache.MarkPrimarySynced(pageId);
                onCompleted?.Invoke();
                return;
            }

            ScheduleRetry(pageId, flushAsync, onCompleted);
        }
        catch
        {
            ScheduleRetry(pageId, flushAsync, onCompleted);
        }
        finally
        {
            lock (Instance._sync)
                Instance._running.Remove(pageId);
        }
    }

    public async Task<bool> FlushAllPendingForShutdownAsync(Func<int, Task<PageSaveResult>> flushAsync)
    {
        BeginShutdown();

        while (true)
        {
            var pageIds = PageContentCache.GetPendingPrimaryFlushPageIds();
            if (pageIds.Length == 0)
                return true;

            foreach (var pageId in pageIds)
            {
                if (!PageContentCache.IsPendingPrimaryFlush(pageId))
                    continue;

                await FlushNowAsync(pageId, flushAsync).ConfigureAwait(true);

                if (!PageContentCache.IsPendingPrimaryFlush(pageId))
                    continue;

                PageSaveResult result;
                try
                {
                    result = await flushAsync(pageId).ConfigureAwait(true);
                }
                catch
                {
                    return false;
                }

                if (result is PageSaveResult.Primary or PageSaveResult.OfflineFallback)
                    PageContentCache.MarkPrimarySynced(pageId);
                else
                    return false;
            }
        }
    }

    private static void ScheduleRetry(
        int pageId,
        Func<int, Task<PageSaveResult>> flushAsync,
        Action? onCompleted)
    {
        if (Instance._shutdownMode)
            return;

        int attempt;
        lock (Instance._sync)
        {
            Instance._retryCounts.TryGetValue(pageId, out attempt);
            attempt++;
            if (attempt > MaxRetries)
            {
                Instance._retryCounts.Remove(pageId);
                return;
            }

            Instance._retryCounts[pageId] = attempt;
        }

        _ = Task.Run(async () =>
        {
            await Task.Delay(RetryDelayMs).ConfigureAwait(false);
            if (!PageContentCache.IsPendingPrimaryFlush(pageId))
                return;

            Instance.Schedule(pageId, flushAsync, onCompleted);
        });
    }
}
