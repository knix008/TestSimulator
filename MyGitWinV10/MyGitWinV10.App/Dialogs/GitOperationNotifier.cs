namespace MyGitWinV10.App.Dialogs;

public static class GitOperationNotifier
{
    public static void ShowSuccess(
        IWin32Window? owner,
        string title,
        string summary,
        params OperationDetail[] details)
    {
        OperationCompleteDialog.Show(owner, title, summary, details);
    }

    public static void ShowFailure(IWin32Window? owner, string title, Exception exception)
    {
        ErrorDetailDialog.Show(owner, title, exception);
    }

    public static void ShowCancelled(IWin32Window? owner, string operationName)
    {
        MessageBox.Show(
            owner,
            "The operation was cancelled.",
            $"{operationName} Cancelled",
            MessageBoxButtons.OK,
            MessageBoxIcon.Warning);
    }

    public static void ShowInfo(IWin32Window? owner, string title, string message)
    {
        MessageBox.Show(
            owner,
            message,
            title,
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
    }
}
