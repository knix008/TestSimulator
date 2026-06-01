using System.Text;
using System.Windows;
using System.Windows.Threading;
using MyMindWin.Views;

namespace MyMindWin.Diagnostics;

/// <summary>처리되지 않은 예외를 상세 보고서로 팝업 표시합니다.</summary>
public static class ExceptionReporter
{
    private static int _dialogDepth;

    public static void RegisterApplicationHandlers()
    {
        if (Application.Current == null)
            return;

        Application.Current.DispatcherUnhandledException -= OnDispatcherUnhandledException;
        Application.Current.DispatcherUnhandledException += OnDispatcherUnhandledException;

        AppDomain.CurrentDomain.UnhandledException -= OnDomainUnhandledException;
        AppDomain.CurrentDomain.UnhandledException += OnDomainUnhandledException;

        TaskScheduler.UnobservedTaskException -= OnUnobservedTaskException;
        TaskScheduler.UnobservedTaskException += OnUnobservedTaskException;
    }

    public static void Show(Exception exception, string? context = null)
    {
        if (exception == null)
            return;

        if (Interlocked.Increment(ref _dialogDepth) > 1)
        {
            Interlocked.Decrement(ref _dialogDepth);
            return;
        }

        try
        {
            var report = Format(exception, context);
            var title = BuildTitle(exception, context);
            ShowDialogOnUiThread(report, title);
        }
        catch (Exception dialogEx)
        {
            try
            {
                MessageBox.Show(
                    $"오류 보고 창을 표시하지 못했습니다.\n\n{dialogEx.Message}\n\n원본:\n{exception.Message}",
                    "MyMindWin — 오류",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
            }
            catch
            {
                // ignored
            }
        }
        finally
        {
            Interlocked.Decrement(ref _dialogDepth);
        }
    }

    public static string Format(Exception exception, string? context = null)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"시각: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
        if (!string.IsNullOrWhiteSpace(context))
        {
            sb.AppendLine($"작업: {context}");
            sb.AppendLine();
        }

        AppendException(sb, exception, 0);
        return sb.ToString();
    }

    private static void AppendException(StringBuilder sb, Exception ex, int depth)
    {
        var prefix = depth == 0 ? string.Empty : new string(' ', depth * 2);
        var label = depth == 0 ? "예외" : $"내부 예외 #{depth}";

        sb.AppendLine($"{prefix}[{label}] {ex.GetType().FullName}");
        sb.AppendLine($"{prefix}메시지: {ex.Message}");

        if (!string.IsNullOrWhiteSpace(ex.Source))
            sb.AppendLine($"{prefix}소스: {ex.Source}");

        if (ex.TargetSite != null)
            sb.AppendLine($"{prefix}위치: {ex.TargetSite}");

        if (!string.IsNullOrWhiteSpace(ex.StackTrace))
        {
            sb.AppendLine($"{prefix}스택 추적:");
            foreach (var line in ex.StackTrace.Split('\n', '\r'))
            {
                if (string.IsNullOrWhiteSpace(line))
                    continue;
                sb.AppendLine($"{prefix}  {line.Trim()}");
            }
        }

        if (ex.InnerException != null)
        {
            sb.AppendLine();
            AppendException(sb, ex.InnerException, depth + 1);
        }
    }

    private static string BuildTitle(Exception ex, string? context)
    {
        var typeName = ex.GetType().Name;
        return string.IsNullOrWhiteSpace(context)
            ? $"오류 — {typeName}"
            : $"오류 — {context} ({typeName})";
    }

    private static void ShowDialogOnUiThread(string report, string title)
    {
        void Show()
        {
            var win = new ErrorWindow(report, title);
            win.ShowDialog();
        }

        var app = Application.Current;
        if (app?.Dispatcher == null)
        {
            MessageBox.Show(report, title, MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }

        if (app.Dispatcher.CheckAccess())
            Show();
        else
            app.Dispatcher.Invoke(Show, DispatcherPriority.Send);
    }

    private static void OnDispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        e.Handled = true;
        Show(e.Exception, "UI 스레드 (처리되지 않은 예외)");
    }

    private static void OnDomainUnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        if (e.ExceptionObject is Exception ex)
            Show(ex, e.IsTerminating ? "앱 종료 직전 예외" : "AppDomain 예외");
    }

    private static void OnUnobservedTaskException(object? sender, UnobservedTaskExceptionEventArgs e)
    {
        e.SetObserved();
        Show(e.Exception, "백그라운드 작업 (Task)");
    }
}
