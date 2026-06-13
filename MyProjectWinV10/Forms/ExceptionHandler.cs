using System.Diagnostics;
using System.Text;

namespace MyProject.Forms
{
    public static class ExceptionHandler
    {
        private static readonly object ShowLock = new();
        private static int _activeDialogs;
        private static volatile bool _isShuttingDown;

        public static void NotifyShutdown()
        {
            _isShuttingDown = true;
            Application.ThreadException -= OnThreadException;
            AppDomain.CurrentDomain.UnhandledException -= OnUnhandledException;
        }

        public static bool IsShuttingDown => _isShuttingDown;

        public static void Register()
        {
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += OnThreadException;
            AppDomain.CurrentDomain.UnhandledException += OnUnhandledException;
        }

        public static void Run(IWin32Window? owner, string title, string summary, Action action)
        {
            try
            {
                action();
            }
            catch (Exception ex) when (ShowError(owner, title, summary, ex))
            {
            }
        }

        public static T? Run<T>(IWin32Window? owner, string title, string summary, Func<T> func)
        {
            try
            {
                return func();
            }
            catch (Exception ex) when (ShowError(owner, title, summary, ex))
            {
                return default;
            }
        }

        [DebuggerHidden]
        public static void Show(IWin32Window? owner, string title, string summary, Exception exception)
        {
            ShowError(owner, title, summary, exception);
        }

        [DebuggerHidden]
        public static void ShowInfo(IWin32Window? owner, string title, string summary, string details)
        {
            QueueOnUiThread(owner, () => ShowInfoCore(owner, title, summary, details));
        }

        private static void OnThreadException(object sender, ThreadExceptionEventArgs e)
        {
            try
            {
                if (_isShuttingDown)
                    return;

                if (ShouldSuppressDisplay(e.Exception))
                {
                    LogAsync(e.Exception, "Suppressed UI exception");
                    return;
                }

                if (Debugger.IsAttached)
                {
                    LogAsync(e.Exception, "Suppressed UI exception (debugger attached)");
                    return;
                }

                var owner = GetActiveOwner();
                if (IsOwnerUnavailable(owner))
                {
                    LogAsync(e.Exception, "Suppressed UI exception (owner unavailable)");
                    return;
                }

                QueueShow(owner, "Application Error",
                    $"An unexpected error occurred in {GetExceptionSource(e.Exception)}.",
                    e.Exception);
            }
            catch
            {
                // Never throw from the global UI exception handler.
            }
        }

        private static void OnUnhandledException(object sender, UnhandledExceptionEventArgs e)
        {
            try
            {
                if (e.ExceptionObject is not Exception ex) return;
                if (_isShuttingDown || ShouldSuppressDisplay(ex))
                {
                    LogAsync(ex, "Suppressed fatal exception");
                    return;
                }

                if (Debugger.IsAttached)
                {
                    LogAsync(ex, "Suppressed fatal exception (debugger attached)");
                    return;
                }

                var owner = GetActiveOwner();
                if (IsOwnerUnavailable(owner))
                {
                    LogAsync(ex, "Suppressed fatal exception (owner unavailable)");
                    return;
                }

                QueueShow(owner, "Fatal Error", "A fatal error occurred.", ex);
            }
            catch
            {
                // Never throw from the global exception handler.
            }
        }

        private static bool ShowError(IWin32Window? owner, string title, string summary, Exception exception)
        {
            if (_isShuttingDown)
            {
                LogAsync(exception, $"{title}: {summary} (shutdown)");
                return true;
            }

            if (ShouldSuppressDisplay(exception))
            {
                LogAsync(exception, $"{title}: {summary} (suppressed)");
                return true;
            }

            QueueShow(owner, title, summary, exception);
            return true;
        }

        private static void QueueShow(IWin32Window? owner, string title, string summary, Exception exception)
        {
            if (_isShuttingDown || IsOwnerUnavailable(owner))
            {
                LogAsync(exception, $"{title}: {summary} (shutdown)");
                return;
            }

            LogAsync(exception, $"{title}: {summary}");
            var message = GetPrimaryMessage(exception);
            var details = ErrorDialog.FormatException(exception);

            QueueOnUiThread(owner, () => ShowErrorCore(owner, title, summary, message, details));
        }

        private static void ShowErrorCore(IWin32Window? owner, string title, string summary, string message, string details)
        {
            if (_isShuttingDown || IsOwnerUnavailable(owner))
                return;

            if (!TryEnterDialog()) return;

            try
            {
                ErrorDialog.Show(owner, title, summary, message, details);
            }
            catch (Exception dialogEx)
            {
                try
                {
                    MessageBox.Show(owner,
                        $"{summary}\n\n{message}\n\n{details}\n\n[Error dialog failed: {dialogEx.Message}]",
                        title,
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                }
                catch
                {
                    // Ignore secondary UI failures.
                }
            }
            finally
            {
                ExitDialog();
            }
        }

        private static void ShowInfoCore(IWin32Window? owner, string title, string summary, string details)
        {
            if (_isShuttingDown || IsOwnerUnavailable(owner))
                return;

            if (!TryEnterDialog()) return;

            try
            {
                ErrorDialog.Show(owner, title, summary, details);
            }
            catch (Exception dialogEx)
            {
                try
                {
                    MessageBox.Show(owner,
                        $"{summary}\n\n{details}\n\n[Error dialog failed: {dialogEx.Message}]",
                        title,
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                }
                catch
                {
                    // Ignore secondary UI failures.
                }
            }
            finally
            {
                ExitDialog();
            }
        }

        private static bool TryEnterDialog()
        {
            lock (ShowLock)
            {
                if (_activeDialogs > 0)
                    return false;

                _activeDialogs++;
                return true;
            }
        }

        private static void ExitDialog()
        {
            lock (ShowLock)
            {
                if (_activeDialogs > 0)
                    _activeDialogs--;
            }
        }

        private static void QueueOnUiThread(IWin32Window? owner, Action action)
        {
            if (_isShuttingDown)
                return;

            Control? host = owner as Control;
            if (host == null || host.IsDisposed || !host.IsHandleCreated)
                host = Application.OpenForms.Count > 0 ? Application.OpenForms[0] : null;

            if (host != null && !host.IsDisposed && host.IsHandleCreated)
            {
                try
                {
                    host.BeginInvoke(action);
                    return;
                }
                catch (ObjectDisposedException)
                {
                }
                catch (InvalidOperationException)
                {
                }
            }

            try
            {
                action();
            }
            catch
            {
                // Ignore queue failures.
            }
        }

        private static bool IsOwnerUnavailable(IWin32Window? owner)
        {
            if (owner is not Control control)
                return Application.OpenForms.Count == 0;

            if (control.IsDisposed || control.Disposing)
                return true;

            var form = control.FindForm();
            return form == null || form.IsDisposed || form.Disposing;
        }

        private static bool ShouldSuppressDisplay(Exception exception)
        {
            for (var ex = exception; ex != null; ex = ex.InnerException)
            {
                if (ex is ObjectDisposedException)
                    return true;

                if (ex is InvalidOperationException ioe &&
                    ioe.Message.Contains("disposed", StringComparison.OrdinalIgnoreCase))
                    return true;
            }

            return false;
        }

        private static string GetPrimaryMessage(Exception exception)
        {
            if (!string.IsNullOrWhiteSpace(exception.Message))
                return exception.Message;

            return exception.GetType().Name;
        }

        private static void LogAsync(Exception exception, string context)
        {
            try
            {
                var copy = ErrorDialog.FormatException(exception);
                ThreadPool.QueueUserWorkItem(_ => Log(copy, context));
            }
            catch
            {
                // Ignore logging failures.
            }
        }

        private static void Log(string formattedException, string context)
        {
            try
            {
                var logDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "MyProject",
                    "logs");
                Directory.CreateDirectory(logDir);

                var logPath = Path.Combine(logDir, $"error_{DateTime.Now:yyyyMMdd}.log");
                var entry = new StringBuilder()
                    .AppendLine($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {context}")
                    .AppendLine(formattedException)
                    .AppendLine()
                    .ToString();

                File.AppendAllText(logPath, entry, Encoding.UTF8);
            }
            catch
            {
                // Ignore logging failures.
            }
        }

        private static IWin32Window? GetActiveOwner()
        {
            try
            {
                var active = Form.ActiveForm;
                if (active != null && !active.IsDisposed)
                    return active;

                return Application.OpenForms.Count > 0 ? Application.OpenForms[0] : null;
            }
            catch
            {
                return null;
            }
        }

        private static string GetExceptionSource(Exception exception)
        {
            var trace = exception.StackTrace;
            if (string.IsNullOrWhiteSpace(trace))
                return "the application";

            var firstLine = trace.Split('\n', '\r')[0].Trim();
            return string.IsNullOrWhiteSpace(firstLine) ? "the application" : firstLine;
        }
    }
}
