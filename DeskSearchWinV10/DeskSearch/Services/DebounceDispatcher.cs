using System.Windows.Threading;

namespace DeskSearch.Services;

public sealed class DebounceDispatcher
{
    private readonly Dispatcher _dispatcher;
    private readonly int _delayMs;
    private DispatcherTimer? _timer;
    private Action? _action;

    public DebounceDispatcher(Dispatcher dispatcher, int delayMs = 100)
    {
        _dispatcher = dispatcher;
        _delayMs = delayMs;
    }

    public void Debounce(Action action)
    {
        _action = action;
        _timer?.Stop();

        _timer = new DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(_delayMs)
        };

        _timer.Tick += OnTick;
        _timer.Start();
    }

    private void OnTick(object? sender, EventArgs e)
    {
        _timer!.Stop();
        _timer.Tick -= OnTick;
        _action?.Invoke();
    }
}
