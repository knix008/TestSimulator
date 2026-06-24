using System.Windows;
using DeskSearch.Helpers;

namespace DeskSearch.Services;

public static class ErrorDialogService
{
    public static void Show(string summary, Exception? exception = null, string? details = null)
    {
        var detailText = details
            ?? (exception is null ? summary : ExceptionFormatter.Format(exception, summary));

        RunOnUiThread(() =>
        {
            var dialog = new ErrorDialog(summary, detailText)
            {
                Owner = GetActiveOwner()
            };
            dialog.ShowDialog();
        });
    }

    private static Window? GetActiveOwner()
    {
        if (System.Windows.Application.Current?.MainWindow is { IsVisible: true } mainWindow)
            return mainWindow;

        return System.Windows.Application.Current?.Windows
            .OfType<Window>()
            .FirstOrDefault(window => window.IsActive);
    }

    private static void RunOnUiThread(Action action)
    {
        var dispatcher = System.Windows.Application.Current?.Dispatcher;
        if (dispatcher is null)
            return;

        if (dispatcher.CheckAccess())
            action();
        else
            dispatcher.Invoke(action);
    }
}
