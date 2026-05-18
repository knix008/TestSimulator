using ScreenCamWin;
using ScreenCamWin.UI;

Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
Application.EnableVisualStyles();
Application.SetCompatibleTextRenderingDefault(false);

// Catch any unhandled UI-thread exceptions and show them instead of crashing
Application.ThreadException += (_, args) =>
{
    CopyableDialog.ShowError(null, args.Exception, "오류");
};

// Catch unhandled non-UI-thread exceptions
AppDomain.CurrentDomain.UnhandledException += (_, args) =>
{
    if (args.ExceptionObject is Exception ex)
        CopyableDialog.ShowError(null, ex, "치명적 오류");
};

Application.Run(new MainForm());
