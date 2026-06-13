using System.Diagnostics;

namespace MyProject.Forms
{
    internal static class AppShutdown
    {
        private static ThreadExceptionEventHandler? _threadExceptionHandler;
        private static UnhandledExceptionEventHandler? _unhandledExceptionHandler;

        public static bool LaunchedUnderDebugger { get; private set; }
        public static bool IsShuttingDown { get; private set; }

        public static bool ShouldSuppressModalUi => IsShuttingDown;

        public static void Initialize(bool launchedUnderDebugger)
        {
            LaunchedUnderDebugger = launchedUnderDebugger;
            Application.ApplicationExit += (_, _) => BeginShutdown();
            AppDomain.CurrentDomain.ProcessExit += (_, _) => BeginShutdown();
        }

        public static void RegisterExceptionHandlers()
        {
            if (LaunchedUnderDebugger)
                return;

            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);

            _threadExceptionHandler = (_, e) =>
            {
                if (ShouldSuppressModalUi) return;
                ErrorDialog.Show(Form.ActiveForm, "Application Error", "An unexpected error occurred.", e.Exception);
            };
            _unhandledExceptionHandler = (_, e) =>
            {
                if (ShouldSuppressModalUi) return;
                if (e.ExceptionObject is Exception ex)
                    ErrorDialog.Show(null, "Fatal Error", "A fatal error occurred.", ex);
            };

            Application.ThreadException += _threadExceptionHandler;
            AppDomain.CurrentDomain.UnhandledException += _unhandledExceptionHandler;
        }

        public static void BeginShutdown()
        {
            if (IsShuttingDown)
                return;

            IsShuttingDown = true;
            UnregisterExceptionHandlers();
        }

        public static void UnregisterExceptionHandlers()
        {
            if (_threadExceptionHandler != null)
            {
                Application.ThreadException -= _threadExceptionHandler;
                _threadExceptionHandler = null;
            }

            if (_unhandledExceptionHandler != null)
            {
                AppDomain.CurrentDomain.UnhandledException -= _unhandledExceptionHandler;
                _unhandledExceptionHandler = null;
            }
        }

        public static void ExitProcessIfDebugSession()
        {
            if (!LaunchedUnderDebugger)
                return;

            Environment.Exit(0);
        }
    }
}
