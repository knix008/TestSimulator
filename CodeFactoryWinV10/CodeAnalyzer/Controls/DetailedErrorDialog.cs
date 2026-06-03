using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

public sealed class DetailedErrorDialog : Form
{
    private readonly TextBox _detailBox;

    private DetailedErrorDialog(string title, string summaryMessage, string detailText)
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

        var summaryLabel = new Label
        {
            Dock = DockStyle.Top,
            Height = 64,
            Padding = new Padding(12, 12, 12, 8),
            AutoEllipsis = true,
            Text = summaryMessage
        };

        _detailBox = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ScrollBars = ScrollBars.Both,
            ReadOnly = true,
            WordWrap = false,
            Font = new Font("Consolas", 9f),
            Text = detailText
        };

        var buttonPanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            FlowDirection = FlowDirection.RightToLeft,
            AutoSize = true,
            Padding = new Padding(8)
        };

        var closeButton = new Button
        {
            Text = "닫기",
            AutoSize = true,
            DialogResult = DialogResult.OK,
            Margin = new Padding(6)
        };

        var copyButton = new Button
        {
            Text = "오류 내용 복사",
            AutoSize = true,
            Margin = new Padding(6)
        };
        copyButton.Click += (_, _) => CopyDetailText();

        buttonPanel.Controls.Add(closeButton);
        buttonPanel.Controls.Add(copyButton);

        Controls.Add(_detailBox);
        Controls.Add(summaryLabel);
        Controls.Add(buttonPanel);

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
        using var dialog = new DetailedErrorDialog(title, summaryMessage, detailText);
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

    private void CopyDetailText()
    {
        try
        {
            if (!string.IsNullOrEmpty(_detailBox.Text))
            {
                Clipboard.SetText(_detailBox.Text);
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
