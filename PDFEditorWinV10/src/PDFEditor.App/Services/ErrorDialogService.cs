using System.Windows;
using PDFEditor.App.Dialogs;

namespace PDFEditor.App.Services;

public sealed class ErrorDialogService : IErrorDialogService
{
    public void Show(string title, Exception exception, string? context = null)
    {
        var details = ExceptionFormatter.Format(exception, context);
        ShowDialog(title, details);
    }

    public void Show(string title, string message)
    {
        ShowDialog(title, message);
    }

    private static void ShowDialog(string title, string details)
    {
        var owner = Application.Current?.Windows.OfType<Window>().FirstOrDefault(w => w.IsActive)
                    ?? Application.Current?.MainWindow;

        var dialog = new ErrorDialogWindow(title, details)
        {
            Owner = owner
        };

        dialog.ShowDialog();
    }
}
