namespace MyGitWinV10.App.Dialogs;

public interface IOperationProgressReporter
{
    CancellationToken CancellationToken { get; }

    void Report(OperationProgressUpdate update);

    void Report(string message, int? percent = null, string? detail = null)
    {
        Report(new OperationProgressUpdate(message, percent, detail));
    }
}
