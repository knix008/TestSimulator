using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

public sealed class DeferredProgressDialog : Form
{
    private readonly CancellationTokenSource _cancellation = new();
    private readonly ProgressBar _progressBar;
    private readonly Label _messageLabel;
    private readonly Label _detailLabel;
    private readonly Button _cancelButton;

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
        ClientSize = new Size(460, 148);
        TopMost = true;

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 4,
            Padding = new Padding(16, 12, 16, 12)
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 30f));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        _messageLabel = new Label
        {
            AutoSize = true,
            Dock = DockStyle.Fill,
            Margin = new Padding(0, 0, 0, 4),
            Text = "작업을 준비하는 중..."
        };

        _progressBar = new ProgressBar
        {
            Dock = DockStyle.Fill,
            Margin = new Padding(0, 4, 0, 4),
            Minimum = 0,
            Maximum = 100,
            Style = ProgressBarStyle.Continuous
        };

        _detailLabel = new Label
        {
            AutoSize = true,
            Dock = DockStyle.Fill,
            ForeColor = Color.FromArgb(90, 100, 115),
            Margin = new Padding(0, 4, 0, 8),
            Text = "0% · 경과 0초"
        };

        _cancelButton = new Button
        {
            AutoSize = true,
            Margin = new Padding(0),
            Text = "멈춤"
        };
        _cancelButton.Click += (_, _) => RequestCancel();

        var buttonPanel = new FlowLayoutPanel
        {
            AutoSize = true,
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.RightToLeft,
            Margin = new Padding(0),
            WrapContents = false
        };
        buttonPanel.Controls.Add(_cancelButton);

        layout.Controls.Add(_messageLabel, 0, 0);
        layout.Controls.Add(_progressBar, 0, 1);
        layout.Controls.Add(_detailLabel, 0, 2);
        layout.Controls.Add(buttonPanel, 0, 3);

        Controls.Add(layout);
        CancelButton = _cancelButton;

        FormClosed += (_, _) => _cancellation.Dispose();
    }

    public CancellationToken CancellationToken => _cancellation.Token;

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

    private void RequestCancel()
    {
        if (_cancellation.IsCancellationRequested)
        {
            return;
        }

        _cancelButton.Enabled = false;
        _messageLabel.Text = "작업을 중단하는 중...";
        _cancellation.Cancel();
    }
}
