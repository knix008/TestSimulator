namespace PDFEditor.App.Services;

public interface IErrorDialogService
{
    void Show(string title, Exception exception, string? context = null);
    void Show(string title, string message);
}
