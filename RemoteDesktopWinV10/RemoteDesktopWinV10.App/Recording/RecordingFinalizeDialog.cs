using System.Drawing;

namespace RemoteDesktopWinV10.App.Recording;

/// <summary>녹화 파일 마무리(MP4 인덱스 기록) 중 진행률을 표시하는 모달리스 다이얼로그.</summary>
internal sealed class RecordingFinalizeDialog : Form
{
    private readonly Label _infoLabel;
    private readonly System.Windows.Forms.Timer _dotTimer;
    private int _dotCount;

    public RecordingFinalizeDialog(long framesWritten, TimeSpan elapsed)
    {
        SuspendLayout();

        Text = "녹화 저장 중";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        ControlBox = false;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(380, 130);
        Font = UiTheme.UiFont;
        BackColor = UiTheme.BgApp;

        var titleLabel = new Label
        {
            Text = "동영상 파일을 마무리하고 있습니다",
            Font = new Font(UiTheme.UiFont.FontFamily, 10f, FontStyle.Bold),
            ForeColor = UiTheme.TextPrimary,
            AutoSize = false,
            TextAlign = ContentAlignment.MiddleLeft,
            Location = new Point(16, 16),
            Size = new Size(348, 24),
        };

        var bar = new ProgressBar
        {
            Style = ProgressBarStyle.Marquee,
            MarqueeAnimationSpeed = 30,
            Location = new Point(16, 50),
            Size = new Size(348, 20),
        };

        var timeText = elapsed.TotalSeconds >= 1
            ? $"{(int)elapsed.TotalSeconds}초 · "
            : "";
        _infoLabel = new Label
        {
            Text = $"{timeText}저장된 프레임: {framesWritten}개",
            ForeColor = UiTheme.TextMuted,
            AutoSize = false,
            TextAlign = ContentAlignment.MiddleLeft,
            Location = new Point(16, 82),
            Size = new Size(348, 32),
        };

        Controls.Add(titleLabel);
        Controls.Add(bar);
        Controls.Add(_infoLabel);

        ResumeLayout(false);

        // 점(...) 애니메이션으로 저장 중임을 표시
        _dotTimer = new System.Windows.Forms.Timer { Interval = 500 };
        _dotTimer.Tick += (_, _) =>
        {
            _dotCount = (_dotCount + 1) % 4;
            titleLabel.Text = "동영상 파일을 마무리하고 있습니다" + new string('.', _dotCount);
        };
        _dotTimer.Start();
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        _dotTimer.Stop();
        _dotTimer.Dispose();
        base.OnFormClosed(e);
    }

    // 사용자가 Alt+F4 등으로 닫는 것을 차단
    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
        }

        base.OnFormClosing(e);
    }
}
