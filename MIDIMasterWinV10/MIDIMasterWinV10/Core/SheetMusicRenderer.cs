using MIDIMasterWinV10.Models;

namespace MIDIMasterWinV10.Core;

/// <summary>
/// Renders a grand-staff (treble + bass) piano-roll sheet view using GDI+.
/// Notes are drawn as proper note heads with stems, positioned by pitch on the staves.
/// </summary>
public class SheetMusicRenderer
{
    // Layout
    private const int StaffLineSpacing = 12;    // pixels between staff lines
    private const int StaffTop        = 70;     // treble staff top line Y
    private const int BassStaffTop    = 210;    // bass staff top line Y
    private const int LeftMargin      = 70;
    private const int NoteHeadW       = 10;     // note head oval width
    private const int NoteHeadH       = 8;      // note head oval height
    private const int StemLength      = StaffLineSpacing * 3;

    // Pitch mapping helpers
    // Diatonic step within an octave: C=0, D=1, E=2, F=3, G=4, A=5, B=6
    private static readonly int[] ChromaticToDiatonic = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
    private static readonly bool[] IsAccidental       = [false, true, false, true, false, false, true, false, true, false, true, false];

    public Color BackgroundColor  { get; set; } = Color.White;
    public Color StaffColor       { get; set; } = Color.Black;
    public Color NoteColor        { get; set; } = Color.DarkBlue;
    public Color ActiveNoteColor  { get; set; } = Color.Crimson;
    public Color BarlineColor     { get; set; } = Color.DimGray;

    public Bitmap Render(MidiFileInfo? fileInfo, double viewStartSeconds, double viewDurationSeconds,
                         double playheadSeconds, int width, int height)
    {
        var bmp = new Bitmap(width, height);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        g.Clear(BackgroundColor);

        if (fileInfo == null || fileInfo.AllNotes.Count == 0)
        {
            DrawNoFileMessage(g, width, height);
            return bmp;
        }

        DrawStaves(g, width);
        DrawClefs(g);
        DrawBarlines(g, fileInfo, viewStartSeconds, viewDurationSeconds, width);
        DrawNotes(g, fileInfo.AllNotes, fileInfo.Tempo, viewStartSeconds, viewDurationSeconds, playheadSeconds, width);
        DrawPlayhead(g, playheadSeconds, viewStartSeconds, viewDurationSeconds, width, height);
        DrawTimeInfo(g, playheadSeconds, viewStartSeconds, viewDurationSeconds, width);

        return bmp;
    }

    private void DrawNoFileMessage(Graphics g, int width, int height)
    {
        using var font = new Font("Segoe UI", 14, FontStyle.Regular);
        string msg = "MIDI 파일을 열어주세요";
        var size = g.MeasureString(msg, font);
        g.DrawString(msg, font, Brushes.Gray, (width - size.Width) / 2, (height - size.Height) / 2);
    }

    private void DrawStaves(Graphics g, int width)
    {
        using var pen = new Pen(StaffColor, 1f);

        for (int i = 0; i < 5; i++)
            g.DrawLine(pen, LeftMargin, StaffTop + i * StaffLineSpacing, width - 10, StaffTop + i * StaffLineSpacing);

        for (int i = 0; i < 5; i++)
            g.DrawLine(pen, LeftMargin, BassStaffTop + i * StaffLineSpacing, width - 10, BassStaffTop + i * StaffLineSpacing);

        // Grand-staff bracket
        using var thick = new Pen(StaffColor, 2f);
        g.DrawLine(thick, LeftMargin, StaffTop, LeftMargin, BassStaffTop + 4 * StaffLineSpacing);
    }

    private void DrawClefs(Graphics g)
    {
        using var tf = new Font("Times New Roman", 40, FontStyle.Regular);
        g.DrawString("\U0001D11E", tf, Brushes.Black, LeftMargin + 2, StaffTop - 22);  // 𝄞 treble

        using var bf = new Font("Times New Roman", 30, FontStyle.Regular);
        g.DrawString("\U0001D122", bf, Brushes.Black, LeftMargin + 4, BassStaffTop - 10); // 𝄢 bass
    }

    private void DrawBarlines(Graphics g, MidiFileInfo fileInfo, double viewStart, double viewDur, int width)
    {
        if (viewDur <= 0) return;
        double bps = 1_000_000.0 / fileInfo.Tempo;          // beats per second
        double spb = 4.0 / bps;                              // seconds per bar (4/4)
        if (spb <= 0) spb = 2.0;

        using var pen = new Pen(BarlineColor, 1f) { DashStyle = System.Drawing.Drawing2D.DashStyle.Dot };

        double firstBar = Math.Ceiling(viewStart / spb) * spb;
        for (double t = firstBar; t < viewStart + viewDur; t += spb)
        {
            int x = TimeToX(t, viewStart, viewDur, width);
            g.DrawLine(pen, x, StaffTop, x, StaffTop + 4 * StaffLineSpacing);
            g.DrawLine(pen, x, BassStaffTop, x, BassStaffTop + 4 * StaffLineSpacing);
        }
    }

    private void DrawNotes(Graphics g, List<NoteEvent> notes, int tempoMicros,
                           double viewStart, double viewDur, double playhead, int width)
    {
        if (viewDur <= 0) return;

        // Beat duration in seconds — used to decide filled vs. open note head
        double beatSeconds = tempoMicros / 1_000_000.0;

        using var accFont = new Font("Arial", 8, FontStyle.Bold);
        using var stemPen = new Pen(Color.Black, 1.2f);

        foreach (var note in notes)
        {
            double noteEnd = note.StartTimeSeconds + note.DurationSeconds;
            if (noteEnd < viewStart) continue;
            if (note.StartTimeSeconds > viewStart + viewDur) continue;
            if (note.Channel == 10) continue; // drums

            int x = TimeToX(note.StartTimeSeconds, viewStart, viewDur, width);
            (int y, bool isTreble) = NoteToY(note.NoteNumber);
            if (y == int.MinValue) continue;

            bool isActive = playhead >= note.StartTimeSeconds && playhead <= noteEnd;
            Color noteColor = isActive ? ActiveNoteColor : NoteColor;

            // Filled = quarter note or shorter; open = half note or longer
            bool filled = note.DurationSeconds < beatSeconds;

            DrawNoteHead(g, x, y, filled, noteColor, stemPen, isTreble);

            // Accidental
            if (IsAccidental[note.NoteNumber % 12])
                g.DrawString("♯", accFont, new SolidBrush(noteColor), x - 12, y - 6);

            // Ledger lines
            DrawLedgerLines(g, note.NoteNumber, x, isTreble);
        }
    }

    private void DrawNoteHead(Graphics g, int x, int y, bool filled, Color color, Pen stemPen, bool isTreble)
    {
        var rect = new Rectangle(x - NoteHeadW / 2, y - NoteHeadH / 2, NoteHeadW, NoteHeadH);

        using var brush = new SolidBrush(color);
        using var border = new Pen(color, 1.5f);

        if (filled)
            g.FillEllipse(brush, rect);
        else
        {
            g.FillEllipse(Brushes.White, rect);
            g.DrawEllipse(border, rect);
        }

        // Stem: up if note is in the lower half of the staff, down if upper half
        int staffMidY = isTreble
            ? StaffTop + 2 * StaffLineSpacing
            : BassStaffTop + 2 * StaffLineSpacing;

        if (y >= staffMidY) // note is at or below mid-staff → stem goes up
        {
            g.DrawLine(stemPen, x + NoteHeadW / 2, y, x + NoteHeadW / 2, y - StemLength);
        }
        else // note is above mid-staff → stem goes down
        {
            g.DrawLine(stemPen, x - NoteHeadW / 2, y, x - NoteHeadW / 2, y + StemLength);
        }
    }

    private void DrawLedgerLines(Graphics g, int noteNumber, int x, bool isTreble)
    {
        using var pen = new Pen(StaffColor, 1f);
        int ledgerW = NoteHeadW + 6;

        if (isTreble)
        {
            int topLine = StaffTop;
            int bottomLine = StaffTop + 4 * StaffLineSpacing;
            (int noteY, _) = NoteToY(noteNumber);
            if (noteY == int.MinValue) return;

            // Lines above treble staff
            for (int ly = topLine - StaffLineSpacing; ly >= noteY - NoteHeadH; ly -= StaffLineSpacing)
                g.DrawLine(pen, x - ledgerW / 2, ly, x + ledgerW / 2, ly);

            // Lines below treble staff (including middle C)
            for (int ly = bottomLine + StaffLineSpacing; ly <= noteY + NoteHeadH; ly += StaffLineSpacing)
                g.DrawLine(pen, x - ledgerW / 2, ly, x + ledgerW / 2, ly);
        }
        else
        {
            int topLine = BassStaffTop;
            int bottomLine = BassStaffTop + 4 * StaffLineSpacing;
            (int noteY, _) = NoteToY(noteNumber);
            if (noteY == int.MinValue) return;

            for (int ly = topLine - StaffLineSpacing; ly >= noteY - NoteHeadH; ly -= StaffLineSpacing)
                g.DrawLine(pen, x - ledgerW / 2, ly, x + ledgerW / 2, ly);

            for (int ly = bottomLine + StaffLineSpacing; ly <= noteY + NoteHeadH; ly += StaffLineSpacing)
                g.DrawLine(pen, x - ledgerW / 2, ly, x + ledgerW / 2, ly);
        }
    }

    private void DrawPlayhead(Graphics g, double playhead, double viewStart, double viewDur, int width, int height)
    {
        if (viewDur <= 0) return;
        int x = TimeToX(playhead, viewStart, viewDur, width);
        using var pen = new Pen(Color.OrangeRed, 2f);
        g.DrawLine(pen, x, 0, x, height);
    }

    private void DrawTimeInfo(Graphics g, double playhead, double viewStart, double viewDur, int width)
    {
        using var font = new Font("Segoe UI", 9, FontStyle.Regular);
        g.DrawString(TimeSpan.FromSeconds(playhead).ToString(@"mm\:ss\.ff"),
            font, Brushes.DarkSlateGray, width - 80, 5);

        g.DrawString(TimeSpan.FromSeconds(viewStart).ToString(@"mm\:ss"),
            font, Brushes.Gray, LeftMargin, 5);
        g.DrawString(TimeSpan.FromSeconds(viewStart + viewDur).ToString(@"mm\:ss"),
            font, Brushes.Gray, width - 120, 5);
    }

    // Returns pixel Y for the note on the grand staff; int.MinValue = out of range.
    // Treble: E4(64) = bottom line; Bass: G2(43) = bottom line.
    private (int y, bool isTreble) NoteToY(int noteNumber)
    {
        bool isTreble = noteNumber >= 60;
        int staffTop = isTreble ? StaffTop : BassStaffTop;
        int refNote  = isTreble ? 64 : 43;
        int refY     = staffTop + 4 * StaffLineSpacing;

        int diaRef  = NoteToDiatonic(refNote);
        int diaCurr = NoteToDiatonic(noteNumber);
        int y = refY - (int)((diaCurr - diaRef) * StaffLineSpacing / 2.0);

        // Allow ledger lines ±5 lines beyond the staff
        int staffMid = staffTop + 2 * StaffLineSpacing;
        int limit    = StaffLineSpacing * 5;
        if (y < staffTop - limit || y > staffTop + 4 * StaffLineSpacing + limit)
            return (int.MinValue, isTreble);

        return (y, isTreble);
    }

    private static int NoteToDiatonic(int noteNumber)
    {
        int octave = noteNumber / 12;
        int pitch  = noteNumber % 12;
        return octave * 7 + ChromaticToDiatonic[pitch];
    }

    private int TimeToX(double t, double viewStart, double viewDur, int width)
    {
        double ratio = (t - viewStart) / viewDur;
        return LeftMargin + (int)(ratio * (width - LeftMargin - 10));
    }
}
