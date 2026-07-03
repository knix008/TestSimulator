using System.Windows;
using PDFEditor.App.Dialogs;

namespace PDFEditor.App.Services;

public sealed class PasswordPromptService : IPasswordPromptService
{
    public string? Prompt(string fileName, bool invalidPassword = false)
    {
        var owner = Application.Current?.Windows.OfType<Window>().FirstOrDefault(w => w.IsActive)
                    ?? Application.Current?.MainWindow;

        var dialog = new PasswordDialogWindow(fileName, invalidPassword)
        {
            Owner = owner
        };

        return dialog.ShowDialog() == true ? dialog.EnteredPassword : null;
    }
}
