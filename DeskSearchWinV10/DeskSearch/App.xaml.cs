using System.Windows;
using DeskSearch.Services;

namespace DeskSearch;

public partial class App : System.Windows.Application
{
    private SingleInstanceService? _singleInstance;

    protected override void OnStartup(StartupEventArgs e)
    {
        ShutdownMode = ShutdownMode.OnExplicitShutdown;

        _singleInstance = new SingleInstanceService();
        if (!_singleInstance.TryAcquire())
        {
            SingleInstanceService.SignalExistingInstance();
            _singleInstance.Dispose();
            _singleInstance = null;
            Shutdown();
            return;
        }

        var settings = new SettingsService();
        LocalizationService.Apply(settings.Current.Language);
        base.OnStartup(e);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _singleInstance?.Dispose();
        _singleInstance = null;
        base.OnExit(e);
    }

    public void RegisterShowWindowCallback(Action callback)
    {
        _singleInstance?.BeginListeningForShowRequests(() => Dispatcher.Invoke(callback));
    }
}
