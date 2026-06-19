using System.Text;

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
        var message = new StringBuilder();
        message.AppendLine(summary);

        foreach (var detail in details)
        {
            if (string.IsNullOrWhiteSpace(detail.Value))
            {
                continue;
            }

            message.AppendLine();
            message.AppendLine($"{detail.Label}:");
            message.Append(detail.Value);
        }

        MessageBox.Show(
            owner,
            message.ToString().TrimEnd(),
            title,
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
    }
}
