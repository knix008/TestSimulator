using System.Text;
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
        var message = new StringBuilder();
        bool hasDetails = false;

        foreach (var detail in details)
        {
            if (string.IsNullOrWhiteSpace(detail.Value))
            {
                continue;
            }

            hasDetails = true;
            if (message.Length > 0)
            {
                message.AppendLine();
            }

            message.AppendLine($"{detail.Label}:");
            message.Append(detail.Value);
        }

        if (hasDetails)
        {
            using var dialog = new OperationCompleteDetailDialog(title, summary, message.ToString().TrimEnd());
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
