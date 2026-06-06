namespace FileMasterWinV10.Dialogs;

public class ProgressDialog : Form
{
    private readonly Label _titleLabel;
    private readonly Label _detailLabel;
    private readonly ProgressBar _progressBar;
    private readonly Button _cancelBtn;
    private readonly CancellationTokenSource _cts = new();

    public CancellationToken CancellationToken => _cts.Token;

    public ProgressDialog(string title)
    {
        Text = title;
        Size = new Size(460, 175);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ControlBox = false;
        StartPosition = FormStartPosition.CenterParent;
        Font = new Font("Segoe UI", 9f);

        _titleLabel = new Label
        {
            Location = new Point(14, 14),
            Size = new Size(420, 20),
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            Text = title,
        };
        _detailLabel = new Label
        {
            Location = new Point(14, 38),
            Size = new Size(420, 36),
            Text = "잠시 기다려 주세요...",
            AutoEllipsis = true,
        };
        _progressBar = new ProgressBar
        {
            Location = new Point(14, 78),
            Size = new Size(420, 18),
            Style = ProgressBarStyle.Marquee,
            MarqueeAnimationSpeed = 25,
        };
        _cancelBtn = new Button
        {
            Text = "취소",
            Location = new Point(180, 108),
            Size = new Size(90, 28),
        };
        _cancelBtn.Click += (_, _) =>
        {
            _cts.Cancel();
            _cancelBtn.Enabled = false;
            _detailLabel.Text = "취소 중입니다...";
        };

        Controls.AddRange(new Control[] { _titleLabel, _detailLabel, _progressBar, _cancelBtn });
    }

    public void UpdateDetail(string message)
    {
        if (InvokeRequired) { Invoke(() => UpdateDetail(message)); return; }
        _detailLabel.Text = message;
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        _cts.Cancel();
        base.OnFormClosed(e);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) _cts.Dispose();
        base.Dispose(disposing);
    }
}
