namespace MyProject.Forms
{
    public static class ExceptionHandler
    {
        public static void Register()
        {
            // CatchException must NOT be set when a debugger is attached.
            // Setting it while debugging prevents VS from cleanly detaching on stop.
            if (!System.Diagnostics.Debugger.IsAttached)
                Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);

            Application.ThreadException += (_, e) =>
                ErrorDialog.Show(Form.ActiveForm, "Application Error", e.Exception);
            AppDomain.CurrentDomain.UnhandledException += (_, e) =>
            {
                if (e.ExceptionObject is Exception ex)
                    ErrorDialog.Show(null, "Fatal Error", ex);
            };
        }
    }
}
