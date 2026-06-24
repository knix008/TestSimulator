using System.Collections.Concurrent;

namespace DeskSearch.Services;

/// <summary>
/// Runs all indexing work on a single dedicated background thread so the UI thread
/// and thread pool only handle search reads and presentation.
/// </summary>
internal sealed class IndexBackgroundWorker : IDisposable
{
    private readonly BlockingCollection<Action> _queue = new();
    private readonly Thread _thread;
    private readonly CancellationTokenSource _shutdown = new();
    private readonly object _cancelLock = new();
    private CancellationTokenSource? _exclusiveWorkCts;
    private bool _disposed;

    public IndexBackgroundWorker()
    {
        _thread = new Thread(WorkerMain)
        {
            IsBackground = true,
            Name = "DeskSearch.Indexer",
            Priority = ThreadPriority.BelowNormal
        };
        _thread.Start();
    }

    public bool IsIndexerThread => Thread.CurrentThread == _thread;

    public void Enqueue(Action work)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        _queue.Add(work);
    }

    public void EnqueueExclusive(Action<CancellationToken> work)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        CancellationToken token;
        lock (_cancelLock)
        {
            _exclusiveWorkCts?.Cancel();
            _exclusiveWorkCts?.Dispose();
            _exclusiveWorkCts = CancellationTokenSource.CreateLinkedTokenSource(_shutdown.Token);
            token = _exclusiveWorkCts.Token;
        }

        _queue.Add(() =>
        {
            try
            {
                work(token);
            }
            catch (OperationCanceledException) when (token.IsCancellationRequested)
            {
                // superseded by a newer full scan
            }
        });
    }

    public void Dispose()
    {
        if (_disposed)
            return;

        _disposed = true;
        _shutdown.Cancel();

        lock (_cancelLock)
        {
            _exclusiveWorkCts?.Cancel();
            _exclusiveWorkCts?.Dispose();
            _exclusiveWorkCts = null;
        }

        _queue.CompleteAdding();
        _thread.Join(TimeSpan.FromSeconds(10));
        _queue.Dispose();
        _shutdown.Dispose();
    }

    private void WorkerMain()
    {
        try
        {
            foreach (var work in _queue.GetConsumingEnumerable(_shutdown.Token))
            {
                try
                {
                    work();
                }
                catch (OperationCanceledException) when (_shutdown.Token.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception)
                {
                    // indexing failures are reported by the caller where needed
                }
            }
        }
        catch (OperationCanceledException) when (_shutdown.Token.IsCancellationRequested)
        {
            // worker shutting down
        }
    }
}
