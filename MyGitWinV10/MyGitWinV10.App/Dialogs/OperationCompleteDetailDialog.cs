using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public partial class OperationCompleteDetailDialog : Form
{
    private static readonly Color CardBorderColor = Color.FromArgb(203, 213, 225);
    private static readonly Color CaptionColor = Color.FromArgb(100, 116, 139);
    private static readonly Color ValueColor = Color.FromArgb(51, 65, 85);

    private readonly string _detailsText;
    private readonly List<DetailCard> _detailCards = [];

    public OperationCompleteDetailDialog(string title, string summary, IReadOnlyList<GitOperationDetailItem> details)
    {
        InitializeComponent();
        Text = title;
        summaryLabel.Text = summary;
        _detailsText = BuildDetailsText(details);
        DialogIcons.ApplySuccess(iconPictureBox);
        BuildDetailCards(details);
        detailsPanel.Resize += (_, _) => LayoutDetailCards();
        LayoutDetailCards();
    }

    private void BuildDetailCards(IReadOnlyList<GitOperationDetailItem> details)
    {
        detailsFlowPanel.Controls.Clear();
        _detailCards.Clear();

        foreach (var detail in details)
        {
            _detailCards.Add(CreateDetailCard(detail.Label, detail.Value));
        }

        foreach (var card in _detailCards)
        {
            detailsFlowPanel.Controls.Add(card.Panel);
        }
    }

    private DetailCard CreateDetailCard(string labelText, string valueText)
    {
        var captionLabel = new Label
        {
            AutoSize = true,
            Font = new Font(Font, FontStyle.Bold),
            ForeColor = CaptionColor,
            Text = labelText,
            UseMnemonic = false,
        };

        var valueLabel = new Label
        {
            AutoSize = true,
            ForeColor = ValueColor,
            Text = valueText,
            UseMnemonic = false,
        };

        var panel = new Panel
        {
            BackColor = Color.White,
            Margin = new Padding(0, 0, 0, 8),
            Padding = new Padding(10, 8, 10, 8),
        };
        panel.Paint += PaintDetailCardBorder;
        captionLabel.Location = new Point(panel.Padding.Left, panel.Padding.Top);
        valueLabel.Location = new Point(panel.Padding.Left, captionLabel.Bottom + 4);
        panel.Controls.Add(captionLabel);
        panel.Controls.Add(valueLabel);

        return new DetailCard(panel, captionLabel, valueLabel);
    }

    private void LayoutDetailCards()
    {
        int scrollBarWidth = detailsPanel.VerticalScroll.Visible ? SystemInformation.VerticalScrollBarWidth : 0;
        int width = Math.Max(120, detailsPanel.ClientSize.Width - detailsPanel.Padding.Horizontal - scrollBarWidth);
        detailsFlowPanel.Width = width;

        foreach (var card in _detailCards)
        {
            int innerWidth = width - card.Panel.Padding.Horizontal;
            card.CaptionLabel.MaximumSize = new Size(innerWidth, 0);
            card.ValueLabel.MaximumSize = new Size(innerWidth, 0);
            card.ValueLabel.Location = new Point(card.Panel.Padding.Left, card.CaptionLabel.Bottom + 4);
            card.Panel.Width = width;
            card.Panel.Height = card.ValueLabel.Bottom + card.Panel.Padding.Bottom;
        }

        detailsFlowPanel.PerformLayout();
    }

    private static void PaintDetailCardBorder(object? sender, PaintEventArgs e)
    {
        if (sender is not Panel panel)
        {
            return;
        }

        var rect = panel.ClientRectangle;
        rect.Width -= 1;
        rect.Height -= 1;
        using var pen = new Pen(CardBorderColor);
        e.Graphics.DrawRectangle(pen, rect);
    }

    private static string BuildDetailsText(IReadOnlyList<GitOperationDetailItem> details) =>
        string.Join(
            Environment.NewLine + Environment.NewLine,
            details.Select(detail => $"{detail.Label}: {detail.Value}"));

    private void CopyButton_Click(object? sender, EventArgs e)
    {
        Clipboard.SetText(_detailsText);
        copyButton.Text = "Copied";
    }

    private sealed record DetailCard(Panel Panel, Label CaptionLabel, Label ValueLabel);
}
