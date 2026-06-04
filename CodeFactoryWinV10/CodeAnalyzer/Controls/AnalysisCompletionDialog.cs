using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

public sealed class AnalysisCompletionDialog : Form
{
    private readonly TextBox _detailBox;

    private AnalysisCompletionDialog(string summaryMessage, string detailText, bool hasIssues)
    {
        Text = "분석 완료";
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(640, 520);
        MinimumSize = new Size(520, 400);
        FormBorderStyle = FormBorderStyle.Sizable;
        MaximizeBox = true;
        MinimizeBox = false;
        ShowInTaskbar = false;
        ShowIcon = true;
        Icon = hasIssues ? SystemIcons.Warning : SystemIcons.Information;

        var summaryBox = new TextBox
        {
            Dock = DockStyle.Top,
            Height = 110,
            Multiline = true,
            ReadOnly = true,
            BorderStyle = BorderStyle.None,
            BackColor = SystemColors.Control,
            TabStop = false,
            ScrollBars = ScrollBars.Vertical,
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
            Text = "확인",
            AutoSize = true,
            DialogResult = DialogResult.OK,
            Margin = new Padding(6)
        };

        var copyButton = new Button
        {
            Text = "요약 복사",
            AutoSize = true,
            Margin = new Padding(6)
        };
        copyButton.Click += (_, _) => CopySummaryText(summaryMessage, detailText);

        buttonPanel.Controls.Add(closeButton);
        buttonPanel.Controls.Add(copyButton);

        Controls.Add(_detailBox);
        Controls.Add(summaryBox);
        Controls.Add(buttonPanel);

        AcceptButton = closeButton;
        CancelButton = closeButton;
    }

    public static void Show(
        IWin32Window? owner,
        AnalysisResult result,
        int directoryCount,
        int fileCount,
        TimeSpan elapsed,
        string? rootDirectory = null)
    {
        var built = AnalysisCompletionSummaryBuilder.Build(
            result,
            directoryCount,
            fileCount,
            elapsed,
            rootDirectory);

        using var dialog = new AnalysisCompletionDialog(
            built.SummaryMessage,
            built.DetailText,
            result.Issues.Count > 0);
        dialog.ShowDialog(owner);
    }

    private void CopySummaryText(string summaryMessage, string detailText)
    {
        try
        {
            var text = $"{summaryMessage}{Environment.NewLine}{Environment.NewLine}{detailText}";
            if (!string.IsNullOrEmpty(text))
            {
                Clipboard.SetText(text);
            }

            MessageBox.Show(
                this,
                "분석 요약이 클립보드에 복사되었습니다.",
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
