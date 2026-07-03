namespace PDFEditor.App.Services;

public interface IPasswordPromptService
{
    string? Prompt(string fileName, bool invalidPassword = false);
}
