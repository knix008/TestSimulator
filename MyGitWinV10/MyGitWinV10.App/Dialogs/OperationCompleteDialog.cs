using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public readonly record struct OperationDetail(string Label, string Value);

public static class OperationCompleteDialog
{
    public static void Show(
        IWin32Window? owner,
        string title,
        string summary,
        params OperationDetail[] details)
    {
        Show(owner, title, summary, (IEnumerable<OperationDetail>)details);
    }

    public static void Show(
        IWin32Window? owner,
        string title,
        string summary,
        IEnumerable<OperationDetail> details)
    {
        Show(owner, title, summary, details.Select(detail => new GitOperationDetailItem(detail.Label, detail.Value)));
    }

    public static void Show(
        IWin32Window? owner,
        string title,
        string summary,
        IEnumerable<GitOperationDetailItem> details)
    {
        var detailItems = details
            .Where(detail => !string.IsNullOrWhiteSpace(detail.Value))
            .ToList();

        if (detailItems.Count > 0)
        {
            using var dialog = new OperationCompleteDetailDialog(title, summary, detailItems);
            dialog.ShowDialog(owner);
            return;
        }

        MessageBox.Show(
            owner,
            summary,
            title,
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
    }
}
