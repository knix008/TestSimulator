using System.Diagnostics;
using System.Windows;
using System.Windows.Threading;
using DeskSearch.Services;

namespace DeskSearch;

public partial class App : System.Windows.Application
{
    private SingleInstanceService? _singleInstance;
    private bool _exceptionHandlersRegistered;

    public SettingsService Settings { get; } = new();

    protected override void OnStartup(StartupEventArgs e)
    {
        AppContext.SetSwitch("Switch.System.IO.UseLegacyPathHandling", false);

        ShutdownMode = ShutdownMode.OnExplicitShutdown;

        _singleInstance = new SingleInstanceService();
        if (!_singleInstance.TryAcquire())
        {
            SingleInstanceService.SignalExistingInstance();
            _singleInstance.Dispose();
            _singleInstance = null;
            Environment.Exit(0);
            return;
        }

        LocalizationService.Apply(Settings.Current.Language);
        RegisterExceptionHandlers();
        base.OnStartup(e);

        var mainWindow = new MainWindow(Settings);
        MainWindow = mainWindow;
        mainWindow.Show();
    }

    private void RegisterExceptionHandlers()
    {
        if (_exceptionHandlersRegistered)
            return;

        _exceptionHandlersRegistered = true;
        DispatcherUnhandledException += OnDispatcherUnhandledException;
        TaskScheduler.UnobservedTaskException += OnUnobservedTaskException;
        AppDomain.CurrentDomain.UnhandledException += OnAppDomainUnhandledException;
    }

    private void OnDispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        if (IsBenignWpfPopupException(e.Exception))
        {
            Trace.WriteLine($"DeskSearch: suppressed WPF popup exception: {e.Exception}");
            e.Handled = true;
            return;
        }

        ErrorDialogService.Show(LocalizationService.T("Error_Unhandled"), e.Exception);
        e.Handled = true;
    }

    private void OnUnobservedTaskException(object? sender, UnobservedTaskExceptionEventArgs e)
    {
        e.SetObserved();
        ErrorDialogService.Show(LocalizationService.T("Error_Unhandled"), e.Exception);
    }

    private void OnAppDomainUnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        if (e.ExceptionObject is Exception exception)
            ErrorDialogService.Show(LocalizationService.T("Error_Unhandled"), exception);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _singleInstance?.Dispose();
        _singleInstance = null;
        base.OnExit(e);
    }

    private static bool IsBenignWpfPopupException(Exception ex)
    {
        for (var current = ex; current is not null; current = current.InnerException)
        {
            if (current is not FileNotFoundException)
                continue;

            var trace = current.StackTrace;
            if (trace is null)
                continue;

            if (trace.Contains("PopupSecurityHelper", StringComparison.Ordinal)
                || trace.Contains("Popup.CreateWindow", StringComparison.Ordinal))
                return true;
        }

        return false;
    }

    public void RegisterShowWindowCallback(Action callback)
    {
        _singleInstance?.BeginListeningForShowRequests(() =>
        {
            if (Dispatcher.CheckAccess())
                callback();
            else
                Dispatcher.BeginInvoke(callback);
        });
    }
}
