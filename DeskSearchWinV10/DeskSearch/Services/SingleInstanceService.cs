namespace DeskSearch.Services;

public sealed class SingleInstanceService : IDisposable
{
    private const string MutexName = @"Local\DeskSearch.SingleInstance";
    private const string ShowEventName = @"Local\DeskSearch.ShowWindow";

    private Mutex? _mutex;
    private EventWaitHandle? _showEvent;
    private RegisteredWaitHandle? _waitHandle;
    private bool _ownsMutex;

    public bool TryAcquire()
    {
        _mutex = new Mutex(initiallyOwned: true, MutexName, out var createdNew);

        if (createdNew)
        {
            _ownsMutex = true;
            _showEvent = CreateOrOpenShowEvent();
            return true;
        }

        try
        {
            _ownsMutex = _mutex.WaitOne(TimeSpan.Zero, exitContext: false);
            if (_ownsMutex)
            {
                // Previous process exited without releasing the mutex.
                _showEvent = CreateOrOpenShowEvent();
                return true;
            }
        }
        catch (AbandonedMutexException)
        {
            _ownsMutex = true;
            _showEvent = CreateOrOpenShowEvent();
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

        if (_ownsMutex)
        {
            try
            {
                _mutex.ReleaseMutex();
            }
            catch (ApplicationException)
            {
                // Mutex was not owned by this process.
            }
        }

        _mutex.Dispose();
        _mutex = null;
        _ownsMutex = false;
    }

    private static EventWaitHandle CreateOrOpenShowEvent()
    {
        try
        {
            return EventWaitHandle.OpenExisting(ShowEventName);
        }
        catch (WaitHandleCannotBeOpenedException)
        {
            return new EventWaitHandle(false, EventResetMode.AutoReset, ShowEventName);
        }
    }
}
