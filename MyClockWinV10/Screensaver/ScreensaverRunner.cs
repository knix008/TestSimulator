using System.Windows;
using System.Windows.Forms;
using MyClockWinV10.Models;

namespace MyClockWinV10.Screensaver;

public static class ScreensaverRunner
{
    public static void RunFullscreen()
    {
        var settings = ScreensaverSettingsManager.Resolve(ScreensaverSettingsManager.Load());
        foreach (var screen in Screen.AllScreens)
            new ScreensaverWindow(settings, screen).Show();
    }

    public static void RunPreview(IntPtr previewHwnd)
    {
        var settings = ScreensaverSettingsManager.Resolve(ScreensaverSettingsManager.Load());
        new ScreensaverPreviewWindow(previewHwnd, settings).Show();
    }

    public static void ShowConfigureDialog()
    {
        var dlg = new ScreensaverConfigWindow();
        dlg.ShowDialog();
    }
}
