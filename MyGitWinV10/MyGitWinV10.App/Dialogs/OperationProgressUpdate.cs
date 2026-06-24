namespace MyGitWinV10.App.Dialogs;

public readonly record struct OperationProgressUpdate(string? Message = null, int? Percent = null, string? Detail = null);
