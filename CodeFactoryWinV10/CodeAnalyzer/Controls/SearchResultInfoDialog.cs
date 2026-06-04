using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

public sealed class SearchResultInfoDialog : Form
{
    private readonly TextBox _detailBox;

    private SearchResultInfoDialog(SearchResultItem item, string detailText)
    {
        Text = $"검색 결과 — {item.KindLabel}";
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(640, 360);
        MinimumSize = new Size(480, 260);
        FormBorderStyle = FormBorderStyle.Sizable;
        MaximizeBox = true;
        MinimizeBox = false;
        ShowInTaskbar = false;
        ShowIcon = true;

        var summaryLabel = new Label
        {
            Dock = DockStyle.Top,
            Height = 48,
            Padding = new Padding(12, 12, 12, 8),
            AutoEllipsis = true,
            Text = item.Title
        };

        _detailBox = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ScrollBars = ScrollBars.Both,
            ReadOnly = true,
            WordWrap = true,
            Font = new Font("Segoe UI", 9f),
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
            Text = "정보 복사",
            AutoSize = true,
            Margin = new Padding(6)
        };
        copyButton.Click += (_, _) =>
        {
            try
            {
                Clipboard.SetText(_detailBox.Text);
            }
            catch
            {
                // ignore clipboard failures
            }
        };

        buttonPanel.Controls.Add(closeButton);
        buttonPanel.Controls.Add(copyButton);

        Controls.Add(_detailBox);
        Controls.Add(summaryLabel);
        Controls.Add(buttonPanel);

        AcceptButton = closeButton;
        CancelButton = closeButton;
    }

    public static void ShowForItem(IWin32Window? owner, AnalysisResult? analysis, SearchResultItem item)
    {
        var detailText = SearchResultDetailBuilder.BuildDetailText(analysis, item);
        using var dialog = new SearchResultInfoDialog(item, detailText);
        dialog.ShowDialog(owner);
    }
}
