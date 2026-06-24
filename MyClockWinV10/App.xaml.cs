using System.Windows;
using MyClockWinV10.Models;
using MyClockWinV10.Screensaver;
using MyClockWinV10.Services;

namespace MyClockWinV10;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        ExceptionReporter.Install();

        var launch = ScreensaverCommandLine.Parse(e.Args);
        switch (launch.Mode)
        {
            case ScreensaverLaunchMode.Fullscreen:
                ScreensaverRunner.RunFullscreen();
                return;

            case ScreensaverLaunchMode.Configure:
                ScreensaverRunner.ShowConfigureDialog();
                Shutdown();
                return;

            case ScreensaverLaunchMode.Preview:
                ScreensaverRunner.RunPreview(launch.PreviewWindowHandle);
                return;

            default:
                new MainWindow().Show();
                return;
        }
    }
}
