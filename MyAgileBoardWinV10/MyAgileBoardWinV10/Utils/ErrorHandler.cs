namespace MyAgileBoardWinV10.Utils;

public static class ErrorHandler
{
    private static bool _handlersInstalled;

    public static void InstallGlobalHandlers()
    {
        if (_handlersInstalled) return;
        _handlersInstalled = true;

        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) =>
            ShowException(e.Exception, "처리되지 않은 오류");

        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
        {
            if (e.ExceptionObject is Exception ex)
                ShowException(ex, "치명적 오류");
        };
    }

    public static void Show(string title, string summary, string details, IWin32Window? owner = null)
    {
        void ShowDialog()
        {
            using var form = new Forms.ErrorDialogForm(title, summary, details);
            if (owner != null)
                form.ShowDialog(owner);
            else
                form.ShowDialog();
        }

        var mainForm = Application.OpenForms.Count > 0 ? Application.OpenForms[0] : null;
        if (mainForm != null && mainForm.InvokeRequired)
            mainForm.Invoke(ShowDialog);
        else
            ShowDialog();
    }

    public static void ShowException(Exception ex, string title, IWin32Window? owner = null, string? context = null)
    {
        var summary = string.IsNullOrWhiteSpace(ex.Message)
            ? ex.GetType().Name
            : ex.Message;
        var details = ErrorDetailFormatter.Format(ex, context);
        Show(title, summary, details, owner);
    }

    public static bool TryExecute(Action action, string title, IWin32Window? owner = null, string? context = null)
    {
        try
        {
            action();
            return true;
        }
        catch (Exception ex)
        {
            ShowException(ex, title, owner, context);
            return false;
        }
    }

    public static T? TryExecute<T>(Func<T?> func, string title, IWin32Window? owner = null, string? context = null)
        where T : class
    {
        try
        {
            return func();
        }
        catch (Exception ex)
        {
            ShowException(ex, title, owner, context);
            return null;
        }
    }
}
