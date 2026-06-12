namespace SVGEditorWinV10.Ui;

public static class EditorOperationResultDialog
{
    public static void ShowSuccess(IWin32Window? owner, string title, string message, string path)
    {
        MessageBox.Show(
            owner,
            FormatMessage(message, path),
            title,
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
    }

    public static void ShowFailure(IWin32Window? owner, string title, string message, string path, Exception exception)
    {
        MessageBox.Show(
            owner,
            $"{FormatMessage(message, path)}{Environment.NewLine}{Environment.NewLine}{exception.Message}",
            title,
            MessageBoxButtons.OK,
            MessageBoxIcon.Error);
    }

    private static string FormatMessage(string message, string path) =>
        string.IsNullOrWhiteSpace(path)
            ? message
            : $"{message}{Environment.NewLine}{Environment.NewLine}{path}";
}
