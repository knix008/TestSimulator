namespace DeskSearch.Services;

public sealed class SingleInstanceService : IDisposable
{
    private const string MutexName = @"Global\DeskSearch.SingleInstance";
    private const string ShowEventName = @"Global\DeskSearch.ShowWindow";

    private Mutex? _mutex;
    private EventWaitHandle? _showEvent;
    private RegisteredWaitHandle? _waitHandle;

    public bool TryAcquire()
    {
        _mutex = new Mutex(true, MutexName, out var createdNew);
        if (createdNew)
        {
            _showEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ShowEventName);
            return true;
        }

        _mutex.Dispose();
        _mutex = null;
        return false;
    }

    public void BeginListeningForShowRequests(Action onShowRequested)
    {
        if (_showEvent is null)
            return;

        _waitHandle?.Unregister(null);
        _waitHandle = ThreadPool.RegisterWaitForSingleObject(
            _showEvent,
            (_, _) => onShowRequested(),
            null,
            Timeout.Infinite,
            false);
    }

    public static void SignalExistingInstance()
    {
        try
        {
            using var showEvent = EventWaitHandle.OpenExisting(ShowEventName);
            showEvent.Set();
        }
        catch (WaitHandleCannotBeOpenedException)
        {
            // The first instance has not finished starting yet.
        }
    }

    public void Dispose()
    {
        _waitHandle?.Unregister(null);
        _waitHandle = null;
        _showEvent?.Dispose();
        _showEvent = null;

        if (_mutex is null)
            return;

        try
        {
            _mutex.ReleaseMutex();
        }
        catch (ApplicationException)
        {
            // Mutex was not owned by this process.
        }

        _mutex.Dispose();
        _mutex = null;
    }
}
