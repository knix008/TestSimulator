using ScreenCamWin;

Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
Application.EnableVisualStyles();
Application.SetCompatibleTextRenderingDefault(false);

// Catch any unhandled UI-thread exceptions and show them instead of crashing
Application.ThreadException += (_, args) =>
{
    MessageBox.Show(
        $"예기치 않은 오류가 발생했습니다:\n\n{args.Exception.Message}\n\n{args.Exception.StackTrace}",
        "오류",
        MessageBoxButtons.OK,
        MessageBoxIcon.Error);
};

// Catch unhandled non-UI-thread exceptions
AppDomain.CurrentDomain.UnhandledException += (_, args) =>
{
    if (args.ExceptionObject is Exception ex)
        MessageBox.Show(
            $"치명적 오류:\n\n{ex.Message}\n\n{ex.StackTrace}",
            "치명적 오류",
            MessageBoxButtons.OK,
            MessageBoxIcon.Error);
};

Application.Run(new MainForm());
