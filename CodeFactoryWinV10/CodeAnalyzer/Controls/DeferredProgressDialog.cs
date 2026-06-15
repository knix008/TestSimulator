using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

public sealed class DeferredProgressDialog : Form
{
    private readonly ProgressBar _progressBar;
    private readonly Label _messageLabel;
    private readonly Label _detailLabel;

    public DeferredProgressDialog(string title)
    {
        Text = title;
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ControlBox = false;
        ShowInTaskbar = false;
        ShowIcon = false;
        ClientSize = new Size(460, 118);
        TopMost = true;

        _messageLabel = new Label
        {
            Dock = DockStyle.Top,
            Height = 40,
            Padding = new Padding(12, 12, 12, 0),
            Text = "작업을 준비하는 중..."
        };

        _progressBar = new ProgressBar
        {
            Dock = DockStyle.Top,
            Height = 22,
            Margin = new Padding(12, 8, 12, 0),
            Minimum = 0,
            Maximum = 100,
            Style = ProgressBarStyle.Continuous
        };

        _detailLabel = new Label
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(12, 8, 12, 12),
            ForeColor = Color.FromArgb(90, 100, 115),
            Text = "0% · 경과 0초"
        };

        Controls.Add(_detailLabel);
        Controls.Add(_progressBar);
        Controls.Add(_messageLabel);
    }

    public void UpdateProgress(AnalysisProgressReport report)
    {
        if (InvokeRequired)
        {
            BeginInvoke(() => UpdateProgress(report));
            return;
        }

        _progressBar.Value = Math.Clamp(report.Percent, 0, 100);
        _messageLabel.Text = report.Message;
        _detailLabel.Text = $"{report.Percent}% · 경과 {AnalysisProgressFormatter.FormatDuration(report.Elapsed)}";
    }
}
