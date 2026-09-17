using System.Text;
using System.Windows;
using System.Windows.Threading;

namespace MyClockWinV10.Services;

public static class ExceptionReporter
{
    private static int _showing;

    public static void Install()
    {
        var app = Application.Current;
        if (app is null) return;

        app.DispatcherUnhandledException += OnDispatcherUnhandled;
        AppDomain.CurrentDomain.UnhandledException += OnAppDomainUnhandled;
        TaskScheduler.UnobservedTaskException += OnUnobservedTaskException;
    }

    public static void Report(Exception exception, string context)
    {
        if (exception is null) return;

        var app = Application.Current;
        if (app is null)
        {
            System.Windows.MessageBox.Show(
                FormatDetails(exception, context),
                "MyClockWinV10 오류",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            return;
        }

        if (!app.Dispatcher.CheckAccess())
        {
            app.Dispatcher.Invoke(() => Report(exception, context));
            return;
        }

        if (Interlocked.Exchange(ref _showing, 1) == 1)
            return;

        try
        {
            string summary = exception.Message;
            string details = FormatDetails(exception, context);

            var owner = app.Windows.OfType<Window>().FirstOrDefault(w => w.IsActive)
                        ?? app.MainWindow
                        ?? app.Windows.OfType<Window>().FirstOrDefault(w => w.IsVisible);

            var dlg = new ErrorReportDialog(summary, details, owner);
            dlg.ShowDialog();
        }
        finally
        {
            Interlocked.Exchange(ref _showing, 0);
        }
    }

    private static void OnDispatcherUnhandled(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        Report(e.Exception, "UI 스레드");
        e.Handled = true;
    }

    private static void OnAppDomainUnhandled(object sender, UnhandledExceptionEventArgs e)
    {
        if (e.ExceptionObject is Exception ex)
            Report(ex, e.IsTerminating ? "치명적 오류" : "백그라운드 스레드");
    }

    private static void OnUnobservedTaskException(object? sender, UnobservedTaskExceptionEventArgs e)
    {
        Report(e.Exception, "비동기 작업");
        e.SetObserved();
    }

    private static string FormatDetails(Exception exception, string context)
    {
        var sb = new StringBuilder();
        sb.AppendLine("MyClockWinV10 오류 보고");
        sb.AppendLine($"시각: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
        sb.AppendLine($"컨텍스트: {context}");
        sb.AppendLine();

        AppendException(sb, exception, isRoot: true);
        return sb.ToString().TrimEnd();
    }

    private static void AppendException(StringBuilder sb, Exception exception, bool isRoot, int depth = 0)
    {
        string prefix = depth == 0 ? "" : $"[내부 예외 {depth}] ";
        if (!isRoot)
            sb.AppendLine();

        sb.AppendLine($"{prefix}형식: {exception.GetType().FullName}");
        sb.AppendLine($"{prefix}메시지: {exception.Message}");

        if (!string.IsNullOrWhiteSpace(exception.StackTrace))
        {
            sb.AppendLine($"{prefix}스택 추적:");
            sb.AppendLine(exception.StackTrace);
        }

        if (exception is AggregateException aggregate)
        {
            int i = 0;
            foreach (var inner in aggregate.Flatten().InnerExceptions)
            {
                i++;
                AppendException(sb, inner, isRoot: false, depth: i);
            }
            return;
        }

        if (exception.InnerException is not null)
            AppendException(sb, exception.InnerException, isRoot: false, depth: depth + 1);
    }
}
