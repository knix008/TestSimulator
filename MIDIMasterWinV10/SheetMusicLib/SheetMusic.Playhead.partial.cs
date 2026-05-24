using System.Drawing;
using System.Windows.Forms;

namespace MidiSheetMusic;

public partial class SheetMusic
{
    public float ZoomLevel => zoom;

    public bool ShowPlayhead { get; set; }
    public int PlayheadX { get; set; }
    public int PlayheadY { get; set; }
    public int PlayheadH { get; set; }

    public void SetPlayhead(int x, int y, int height, bool visible)
    {
        PlayheadX = x;
        PlayheadY = y;
        PlayheadH = height;
        ShowPlayhead = visible;
    }

    private void DrawPlayheadOverlay(Graphics g)
    {
        if (!ShowPlayhead || PlayheadH <= 0) return;

        using var pen = new Pen(Color.Red, 1.5f);
        g.DrawLine(pen, PlayheadX, PlayheadY, PlayheadX, PlayheadY + PlayheadH);
    }

    public void EnableDoubleBuffering()
    {
        typeof(Control).InvokeMember("DoubleBuffered",
            System.Reflection.BindingFlags.SetProperty
            | System.Reflection.BindingFlags.Instance
            | System.Reflection.BindingFlags.NonPublic,
            null, this, [true]);
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
    }

    public bool TryGetPlayheadLocation(int pulseTime, out int x, out int y, out int staffHeight)
        => TryGetPlayheadSpan(pulseTime, out x, out y, out staffHeight);

    /// <summary>
    /// Playhead spans the active staff row; for grand-staff pairs (treble+bass
    /// stacked), includes both staves so the line covers the full system height.
    /// </summary>
    public bool TryGetPlayheadSpan(int pulseTime, out int x, out int y, out int spanHeight)
    {
        x = 0;
        y = 0;
        spanHeight = 0;

        if (staffs == null || staffs.Count == 0)
            return false;

        int ypos = 0;
        for (int i = 0; i < staffs.Count; i++)
        {
            Staff staff = staffs[i];
            bool isLast = i == staffs.Count - 1;
            if (pulseTime < staff.EndTime || isLast)
            {
                x = staff.GetXAtPulse(pulseTime);
                y = ypos;
                spanHeight = staff.Height;

                // Grand staff: merge the next staff when pulse is still within it
                if (i + 1 < staffs.Count)
                {
                    Staff next = staffs[i + 1];
                    if (pulseTime < next.EndTime)
                        spanHeight += next.Height;
                }

                return true;
            }
            ypos += staff.Height;
        }

        return false;
    }

    public void ScrollToPlayhead(int pulseTime, bool scrollGradually)
    {
        if (!TryGetPlayheadLocation(pulseTime, out int x, out int y, out _))
            return;

        int xScaled = (int)(x * zoom);
        int yScaled = (int)((y - NoteHeight) * zoom);
        ScrollToShadedNotes(xScaled, yScaled, scrollGradually);
    }
}
