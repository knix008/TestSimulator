using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

public sealed class AnalysisCompletionDialog : Form
{
    private readonly TextBox _contentBox;

    private AnalysisCompletionDialog(string displayText, bool hasIssues)
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
        copyButton.Click += (_, _) => CopySummaryText(displayText);

        buttonPanel.Controls.Add(closeButton);
        buttonPanel.Controls.Add(copyButton);

        _contentBox = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ScrollBars = ScrollBars.Vertical,
            ReadOnly = true,
            WordWrap = true,
            BorderStyle = BorderStyle.None,
            BackColor = SystemColors.Window,
            Font = new Font("Segoe UI", 9.5f),
            TabStop = false,
            Text = displayText
        };

        Controls.Add(_contentBox);
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

        using var dialog = new AnalysisCompletionDialog(built.DisplayText, result.Issues.Count > 0);
        dialog.ShowDialog(owner);
    }

    private void CopySummaryText(string displayText)
    {
        try
        {
            if (!string.IsNullOrEmpty(displayText))
            {
                Clipboard.SetText(displayText);
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
