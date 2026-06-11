using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

public sealed class DetailedErrorDialog : Form
{
    private readonly TextBox _contentBox;

    private DetailedErrorDialog(string title, string contentText)
    {
        Text = title;
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(920, 580);
        MinimumSize = new Size(760, 420);
        FormBorderStyle = FormBorderStyle.Sizable;
        MaximizeBox = true;
        MinimizeBox = false;
        ShowInTaskbar = false;
        ShowIcon = true;
        Icon = SystemIcons.Error;

        _contentBox = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ScrollBars = ScrollBars.Both,
            ReadOnly = true,
            WordWrap = false,
            Font = new Font("Consolas", 9f),
            Text = contentText
        };

        var buttonPanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            FlowDirection = FlowDirection.LeftToRight,
            AutoSize = true,
            Padding = new Padding(8)
        };

        var copyButton = new Button
        {
            Text = "오류 내용 복사",
            AutoSize = true,
            Margin = new Padding(6)
        };
        copyButton.Click += (_, _) => CopyContentText();

        var closeButton = new Button
        {
            Text = "닫기",
            AutoSize = true,
            DialogResult = DialogResult.OK,
            Margin = new Padding(6)
        };

        buttonPanel.Controls.Add(copyButton);
        buttonPanel.Controls.Add(closeButton);

        Controls.Add(buttonPanel);
        Controls.Add(_contentBox);

        AcceptButton = closeButton;
        CancelButton = closeButton;
    }

    public static void Show(
        IWin32Window? owner,
        string title,
        Exception exception,
        string summaryMessage)
    {
        Show(owner, title, summaryMessage, ExceptionDetailFormatter.Format(exception));
    }

    public static void Show(
        IWin32Window? owner,
        string title,
        string summaryMessage,
        string detailText)
    {
        using var dialog = new DetailedErrorDialog(title, BuildDisplayText(summaryMessage, detailText));
        dialog.ShowDialog(owner);
    }

    public static void ShowIssues(
        IWin32Window? owner,
        string title,
        string summaryMessage,
        IReadOnlyList<AnalysisIssue> issues)
    {
        if (issues.Count == 0)
        {
            return;
        }

        Show(owner, title, summaryMessage, ExceptionDetailFormatter.FormatIssues(issues));
    }

    private static string BuildDisplayText(string summaryMessage, string detailText)
    {
        if (string.IsNullOrWhiteSpace(summaryMessage) || IsRedundantSummary(summaryMessage))
        {
            return detailText;
        }

        return $"{summaryMessage.TrimEnd()}{Environment.NewLine}{Environment.NewLine}{detailText}";
    }

    private static bool IsRedundantSummary(string summaryMessage)
    {
        return summaryMessage.Contains("아래 상세 내용을 확인", StringComparison.Ordinal)
            || summaryMessage.Contains("아래 상세 영역", StringComparison.Ordinal)
            || summaryMessage.Contains("전체 스택·내부 예외를 복사", StringComparison.Ordinal)
            || summaryMessage.Contains("「오류 내용 복사」로 전체", StringComparison.Ordinal);
    }

    private void CopyContentText()
    {
        try
        {
            if (!string.IsNullOrEmpty(_contentBox.Text))
            {
                Clipboard.SetText(_contentBox.Text);
            }

            MessageBox.Show(
                this,
                "오류 내용이 클립보드에 복사되었습니다.",
                "복사 완료",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                this,
                $"클립보드 복사에 실패했습니다.{Environment.NewLine}{Environment.NewLine}{ex.Message}",
                "복사 오류",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }
}
