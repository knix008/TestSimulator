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
        return RunAsync(owner, message, async ct =>
        {
            await operation(ct).ConfigureAwait(false);
            return true;
        }, showDelayMs, onCancelled);
    }

    public static async Task<T> RunAsync<T>(
        Form owner,
        string message,
        Func<CancellationToken, Task<T>> operation,
        int showDelayMs = DefaultShowDelayMs,
        Action? onCancelled = null)
    {
        ArgumentNullException.ThrowIfNull(owner);
        ArgumentNullException.ThrowIfNull(operation);

        await Gate.WaitAsync().ConfigureAwait(true);
        using var scope = new ProgressScope(owner, message, showDelayMs, onCancelled);
        try
        {
            scope.ScheduleShow();
            return await operation(scope.Token).ConfigureAwait(true);
        }
        catch (OperationCanceledException) when (scope.Token.IsCancellationRequested)
        {
            throw;
        }
        finally
        {
            scope.Close();
            Gate.Release();
        }
    }

    private sealed class ProgressScope : IDisposable
    {
        private readonly Form _owner;
        private readonly string _message;
        private readonly Action? _onCancelled;
        private readonly CancellationTokenSource _cts = new();
        private readonly System.Windows.Forms.Timer _timer;
        private DelayedProgressForm? _form;
        private bool _closed;

        public ProgressScope(Form owner, string message, int showDelayMs, Action? onCancelled)
        {
            _owner = owner;
            _message = message;
            _onCancelled = onCancelled;
            _timer = new System.Windows.Forms.Timer { Interval = showDelayMs };
            _timer.Tick += OnTimerTick;
        }

        public CancellationToken Token => _cts.Token;

        public void ScheduleShow() => _timer.Start();

        private void OnTimerTick(object? sender, EventArgs e) => ShowForm();

        private void OnFormStopRequested(object? sender, EventArgs e) => RequestStop();

        private void ShowForm()
        {
            RunOnOwnerThread(() =>
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
            RunOnOwnerThread(() =>
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
