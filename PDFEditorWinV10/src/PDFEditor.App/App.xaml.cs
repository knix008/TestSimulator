using System.Windows;
using System.Windows.Threading;
using Microsoft.Extensions.DependencyInjection;
using PDFEditor.App.Services;
using PDFEditor.App.ViewModels;
using PDFEditor.Core.Services;

namespace PDFEditor.App;

public partial class App : Application
{
    private ServiceProvider? _serviceProvider;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        var services = new ServiceCollection();
        services.AddSingleton<IErrorDialogService, ErrorDialogService>();
        services.AddSingleton<IPasswordPromptService, PasswordPromptService>();
        services.AddSingleton<IPageImageExporter, PageImageExporter>();
        services.AddSingleton<IPdfDocumentService, PdfDocumentService>();
        services.AddSingleton<IPdfRenderService, PdfRenderService>();
        services.AddSingleton<MainViewModel>();
        services.AddSingleton<MainWindow>();

        _serviceProvider = services.BuildServiceProvider();

        DispatcherUnhandledException += OnDispatcherUnhandledException;
        AppDomain.CurrentDomain.UnhandledException += OnUnhandledException;

        var mainWindow = _serviceProvider.GetRequiredService<MainWindow>();
        mainWindow.Show();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        DispatcherUnhandledException -= OnDispatcherUnhandledException;
        AppDomain.CurrentDomain.UnhandledException -= OnUnhandledException;
        _serviceProvider?.Dispose();
        base.OnExit(e);
    }

    private void OnDispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        ShowUnhandledError("처리되지 않은 오류", e.Exception, "UI 스레드");
        e.Handled = true;
    }

    private void OnUnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        if (e.ExceptionObject is Exception exception)
        {
            Dispatcher.Invoke(() =>
                ShowUnhandledError("치명적 오류", exception, "애플리케이션 도메인"));
        }
    }

    private void ShowUnhandledError(string title, Exception exception, string context)
    {
        var dialogService = _serviceProvider?.GetService<IErrorDialogService>();
        if (dialogService is not null)
        {
            dialogService.Show(title, exception, context);
            return;
        }

        MessageBox.Show(
            ExceptionFormatter.Format(exception, context),
            title,
            MessageBoxButton.OK,
            MessageBoxImage.Error);
    }
}
