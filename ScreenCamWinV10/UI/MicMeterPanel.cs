namespace ScreenCamWin.UI;

/// <summary>Segmented VU meter (small bars) with live input level.</summary>
public sealed class MicMeterPanel : Panel
{
    const int SegmentCount = 24;

    private float _displayLevel;
    private readonly System.Windows.Forms.Timer _decayTimer;

    public MicMeterPanel()
    {
        DoubleBuffered = true;
        BackColor = Theme.BgCard;
        Height = 28;
        MinimumSize = new Size(120, 28);

        _decayTimer = new System.Windows.Forms.Timer { Interval = 33 };
        _decayTimer.Tick += (_, _) =>
        {
            if (_displayLevel > 0.01f)
            {
                _displayLevel *= 0.88f;
                Invalidate();
            }
        };
    }

    public void SetLevel(float peak0to1)
    {
        float v = Math.Clamp(peak0to1, 0f, 1f);
        _displayLevel = Math.Max(_displayLevel * 0.4f, v);
        _decayTimer.Start();
        Invalidate();
    }

    public void ResetLevel()
    {
        _displayLevel = 0f;
        _decayTimer.Stop();
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        var g = e.Graphics;
        var rc = ClientRectangle;
        if (rc.Width < SegmentCount * 2) return;

        int pad = 2;
        int gap = 2;
        int totalGap = gap * (SegmentCount - 1);
        int segW = Math.Max(3, (rc.Width - pad * 2 - totalGap) / SegmentCount);
        int segH = rc.Height - pad * 2;
        int y = pad;

        int litSegments = (int)Math.Round(_displayLevel * SegmentCount);
        litSegments = Math.Clamp(litSegments, 0, SegmentCount);

        for (int i = 0; i < SegmentCount; i++)
        {
            int x = pad + i * (segW + gap);
            var seg = new Rectangle(x, y, segW, segH);

            bool lit = i < litSegments;
            float pos = (i + 0.5f) / SegmentCount;
            Color off = Color.FromArgb(40, 45, 70);
            Color on = pos switch
            {
                < 0.55f => Theme.Success,
                < 0.8f  => Theme.Warning,
                _       => Theme.Danger,
            };

            using var brush = new SolidBrush(lit ? on : off);
            g.FillRectangle(brush, seg);
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
            _decayTimer.Dispose();
        base.Dispose(disposing);
    }
}
