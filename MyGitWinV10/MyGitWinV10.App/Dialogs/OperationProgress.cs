namespace MyGitWinV10.App.Dialogs;

/// <summary>
/// Shows one progress popup at a time. Concurrent callers wait their turn.
/// </summary>
public static class OperationProgress
{
    public const int DefaultShowDelayMs = 400;

    private static readonly SemaphoreSlim Gate = new(1, 1);

    public static Task RunAsync(
        Form owner,
        string message,
        Func<CancellationToken, Task> operation,
        int showDelayMs = DefaultShowDelayMs,
        Action? onCancelled = null)
    {
        return RunAsync(owner, message, reporter => operation(reporter.CancellationToken), showDelayMs, onCancelled);
    }

    public static Task RunAsync(
        Form owner,
        string message,
        Func<IOperationProgressReporter, Task> operation,
        int showDelayMs = DefaultShowDelayMs,
        Action? onCancelled = null,
        Action<OperationProgressUpdate>? onStatusUpdate = null)
    {
        return RunAsync(owner, message, async reporter =>
        {
            await operation(reporter).ConfigureAwait(false);
            return true;
        }, showDelayMs, onCancelled, onStatusUpdate);
    }

    public static async Task<T> RunAsync<T>(
        Form owner,
        string message,
        Func<CancellationToken, Task<T>> operation,
        int showDelayMs = DefaultShowDelayMs,
        Action? onCancelled = null)
    {
        return await RunAsync(owner, message, reporter => operation(reporter.CancellationToken), showDelayMs, onCancelled)
            .ConfigureAwait(true);
    }

    public static async Task<T> RunAsync<T>(
        Form owner,
        string message,
        Func<IOperationProgressReporter, Task<T>> operation,
        int showDelayMs = DefaultShowDelayMs,
        Action? onCancelled = null,
        Action<OperationProgressUpdate>? onStatusUpdate = null)
    {
        ArgumentNullException.ThrowIfNull(owner);
        ArgumentNullException.ThrowIfNull(operation);

        await Gate.WaitAsync().ConfigureAwait(true);
        using var scope = new ProgressScope(owner, message, showDelayMs, onCancelled, onStatusUpdate);
        try
        {
            scope.ScheduleShow();
            return await operation(scope).ConfigureAwait(true);
        }
        catch (OperationCanceledException) when (scope.CancellationToken.IsCancellationRequested)
        {
            throw;
        }
        finally
        {
            scope.Close();
            Gate.Release();
        }
    }

    private sealed class ProgressScope : IOperationProgressReporter, IDisposable
    {
        private const int DialogUpdateThrottleMs = 100;

        private readonly Form _owner;
        private readonly string _message;
        private readonly Action? _onCancelled;
        private readonly Action<OperationProgressUpdate>? _onStatusUpdate;
        private readonly CancellationTokenSource _cts = new();
        private readonly System.Windows.Forms.Timer _timer;
        private DelayedProgressForm? _form;
        private bool _closed;
        private int _lastDialogPercent = -1;
        private long _lastDialogUpdateTick;
        private OperationProgressUpdate? _latestUpdate;
        private OperationProgressUpdate? _pendingStatusUpdate;
        private OperationProgressUpdate? _pendingDialogUpdate;
        private bool _statusFlushScheduled;
        private bool _dialogFlushScheduled;

        public ProgressScope(
            Form owner,
            string message,
            int showDelayMs,
            Action? onCancelled,
            Action<OperationProgressUpdate>? onStatusUpdate)
        {
            _owner = owner;
            _message = message;
            _onCancelled = onCancelled;
            _onStatusUpdate = onStatusUpdate;
            _timer = new System.Windows.Forms.Timer { Interval = showDelayMs };
            _timer.Tick += OnTimerTick;
        }

        public CancellationToken CancellationToken => _cts.Token;

        public void Report(OperationProgressUpdate update)
        {
            if (_closed)
            {
                return;
            }

            _latestUpdate = update;
            QueueStatusUpdate(update);

            if (ShouldThrottleDialogUpdate(update))
            {
                _pendingDialogUpdate = update;
                return;
            }

            if (update.Percent is int percent)
            {
                _lastDialogPercent = percent;
                _lastDialogUpdateTick = Environment.TickCount64;
            }

            QueueDialogUpdate(update);
        }

        void IOperationProgressReporter.Report(OperationProgressUpdate update) => Report(update);

        public void ScheduleShow() => _timer.Start();

        private void QueueStatusUpdate(OperationProgressUpdate update)
        {
            if (_onStatusUpdate is null)
            {
                return;
            }

            _pendingStatusUpdate = update;
            if (_statusFlushScheduled)
            {
                return;
            }

            _statusFlushScheduled = true;
            BeginOnOwnerThread(FlushStatusUpdate);
        }

        private void FlushStatusUpdate()
        {
            _statusFlushScheduled = false;
            if (_closed || _onStatusUpdate is null || _pendingStatusUpdate is not OperationProgressUpdate update)
            {
                return;
            }

            _pendingStatusUpdate = null;
            _onStatusUpdate(update);

            if (!_closed && _pendingStatusUpdate is OperationProgressUpdate pending)
            {
                QueueStatusUpdate(pending);
            }
        }

        private void QueueDialogUpdate(OperationProgressUpdate update)
        {
            _pendingDialogUpdate = update;
            if (_dialogFlushScheduled)
            {
                return;
            }

            _dialogFlushScheduled = true;
            BeginOnOwnerThread(FlushDialogUpdate);
        }

        private void FlushDialogUpdate()
        {
            _dialogFlushScheduled = false;
            if (_closed || _pendingDialogUpdate is not OperationProgressUpdate update)
            {
                return;
            }

            _pendingDialogUpdate = null;

            if (_form is { IsDisposed: false })
            {
                string dialogMessage = update.Message ?? _message;
                _form.SetProgress(update.Percent, dialogMessage, update.Detail);
            }

            if (!_closed && _pendingDialogUpdate is OperationProgressUpdate pending)
            {
                QueueDialogUpdate(pending);
            }
        }

        private bool ShouldThrottleDialogUpdate(OperationProgressUpdate update)
        {
            if (update.Percent is not int percent)
            {
                return false;
            }

            if (percent is 0 or 100)
            {
                return false;
            }

            long now = Environment.TickCount64;
            return percent == _lastDialogPercent && now - _lastDialogUpdateTick < DialogUpdateThrottleMs;
        }

        private void OnTimerTick(object? sender, EventArgs e) => ShowForm();

        private void OnFormStopRequested(object? sender, EventArgs e) => RequestStop();

        private void ShowForm()
        {
            BeginOnOwnerThread(() =>
            {
                _timer.Stop();
                if (_closed || _owner.IsDisposed)
                {
                    return;
                }

                if (_form is { IsDisposed: false })
                {
                    _form.SetMessage(_message);
                    return;
                }

                _form = new DelayedProgressForm(_message)
                {
                    TopMost = true
                };
                _form.StopRequested += OnFormStopRequested;
                _form.Show(_owner);

                if (_latestUpdate is OperationProgressUpdate latest)
                {
                    string dialogMessage = latest.Message ?? _message;
                    _form.SetProgress(latest.Percent, dialogMessage, latest.Detail);
                }
            });
        }

        private void RequestStop()
        {
            if (_cts.IsCancellationRequested)
            {
                return;
            }

            _onCancelled?.Invoke();
            _cts.Cancel();
            BeginOnOwnerThread(() =>
            {
                if (_form is { IsDisposed: false })
                {
                    _form.SetMessage("Stopping...");
                    _form.SetStopEnabled(false);
                }
            });
        }

        public void Close()
        {
            if (_closed)
            {
                return;
            }

            _closed = true;
            _pendingStatusUpdate = null;
            _pendingDialogUpdate = null;
            RunOnOwnerThread(CloseForm);
            _cts.Dispose();
        }

        public void Dispose() => Close();

        private void CloseForm()
        {
            _timer.Stop();
            _timer.Dispose();

            if (_form is { IsDisposed: false })
            {
                _form.StopRequested -= OnFormStopRequested;
                _form.Close();
                _form.Dispose();
            }

            _form = null;
        }

        private void BeginOnOwnerThread(Action action)
        {
            if (_owner.IsDisposed)
            {
                return;
            }

            if (_owner.InvokeRequired)
            {
                try
                {
                    _owner.BeginInvoke(action);
                }
                catch (ObjectDisposedException)
                {
                }

                return;
            }

            action();
        }

        private void RunOnOwnerThread(Action action)
        {
            if (_owner.IsDisposed)
            {
                return;
            }

            if (_owner.InvokeRequired)
            {
                try
                {
                    _owner.Invoke(action);
                }
                catch (ObjectDisposedException)
                {
                }

                return;
            }

            action();
        }
    }
}
