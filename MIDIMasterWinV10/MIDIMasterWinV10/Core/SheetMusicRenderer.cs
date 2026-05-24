using MIDIMasterWinV10.Models;
using System.Drawing.Drawing2D;

namespace MIDIMasterWinV10.Core;

/// <summary>
/// Renders MIDI notes as a piano-roll overlaid on grand staff lines.
/// Each system (row) shows a fixed time window.  Notes are horizontal bars
/// whose X = start time, width = duration, Y = diatonic pitch on the staff.
/// No stems, beams, or accidental symbols — MIDI data is too dense for those.
/// The background bitmap is pre-rendered on file load; the playhead is drawn
/// separately on each timer tick via the PictureBox.Paint event.
/// </summary>
public class SheetMusicRenderer
{
    // ── Layout constants ──────────────────────────────────────────────────────
    public const  int SystemHeight    = 280;   // total px per system row (including margins)
    private const int TrebleRelTop    = 55;    // treble staff top-line Y, relative to system top
    private const int BassRelTop      = 185;   // bass staff top-line Y, relative to system top
    private const int StaffLineSpacing = 14;   // px between adjacent staff lines
    private const int BarsPerSystem   = 4;     // bars shown per row (assumes 4/4 time)
    private const int LeftMargin      = 80;    // space reserved for clef + bracket
    private const int RightMargin     = 20;
    private const int NoteBarH        = 7;     // note bar height (fills a staff space neatly)
    private const int MinNoteW        = 4;     // minimum bar width in pixels

    // Diatonic step index for each chromatic pitch class (C=0 … B=6 within octave)
    private static readonly int[] ChromaticToDiatonic
        = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];

    // True when a chromatic pitch class is a black key (sharp/flat)
    private static readonly bool[] IsBlackKey
        = [false, true, false, true, false, false, true, false, true, false, true, false];

    // ── Colours ───────────────────────────────────────────────────────────────
    public Color BackgroundColor { get; set; } = Color.White;
    public Color StaffColor      { get; set; } = Color.FromArgb(80, 80, 80);
    public Color BarlineColor    { get; set; } = Color.FromArgb(150, 150, 165);

    // Note-bar colours per staff
    private static readonly Color TrebleNote  = Color.FromArgb(200,  30,  70, 160);  // semi-transparent navy
    private static readonly Color BassNote    = Color.FromArgb(200,  20, 120,  60);  // semi-transparent teal
    private static readonly Color BlackKeyBg  = Color.FromArgb(18, 0, 0, 0);         // very faint black-key tint

    // ── State ─────────────────────────────────────────────────────────────────
    public double SecondsPerSystem { get; private set; }

    // ── Public API ────────────────────────────────────────────────────────────

    /// <summary>
    /// Renders the entire piece as a tall multi-row bitmap (no playhead).
    /// Cache and reuse; only call again when the panel width changes.
    /// </summary>
    public Bitmap RenderBackground(MidiFileInfo? fileInfo, int width)
    {
        if (fileInfo == null || fileInfo.AllNotes.Count == 0)
        {
            SecondsPerSystem = 8.0;
            var empty = new Bitmap(Math.Max(1, width), SystemHeight);
            using var eg = Graphics.FromImage(empty);
            eg.Clear(BackgroundColor);
            DrawNoFileMessage(eg, width, SystemHeight);
            return empty;
        }

        // 4 bars at the piece's main tempo
        double beatsPerSec = 1_000_000.0 / fileInfo.Tempo;
        SecondsPerSystem = BarsPerSystem * 4.0 / beatsPerSec;
        if (SecondsPerSystem <= 0) SecondsPerSystem = 8.0;

        int systemCount  = (int)Math.Ceiling(fileInfo.TotalSeconds / SecondsPerSystem) + 1;
        int totalHeight  = Math.Max(SystemHeight, systemCount * SystemHeight);

        var bmp = new Bitmap(Math.Max(1, width), totalHeight);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(BackgroundColor);

        for (int s = 0; s < systemCount; s++)
            DrawSystem(g, fileInfo, s * SystemHeight, s * SecondsPerSystem, width);

        return bmp;
    }

    /// <summary>
    /// Draws the orange playhead bar for the current second.
    /// Call from the PictureBox.Paint event — draws on top of the cached Image.
    /// </summary>
    public void DrawPlayhead(Graphics g, double currentSeconds, int width)
    {
        if (SecondsPerSystem <= 0) return;

        int sysIndex   = (int)(currentSeconds / SecondsPerSystem);
        double within  = currentSeconds - sysIndex * SecondsPerSystem;
        int x          = NoteX(within, SecondsPerSystem, width);
        int sysTop     = sysIndex * SystemHeight;
        int trebleTop  = sysTop + TrebleRelTop;
        int bassBot    = sysTop + BassRelTop + 4 * StaffLineSpacing;

        using var pen = new Pen(Color.OrangeRed, 2.5f);
        pen.DashStyle = DashStyle.Solid;
        g.DrawLine(pen, x, trebleTop - 6, x, bassBot + 6);

        // Small triangle marker at the top
        var pts = new PointF[]
        {
            new(x - 5, trebleTop - 12),
            new(x + 5, trebleTop - 12),
            new(x,     trebleTop - 5)
        };
        g.FillPolygon(Brushes.OrangeRed, pts);
    }

    // ── System drawing ────────────────────────────────────────────────────────

    private void DrawSystem(Graphics g, MidiFileInfo fi, int sysY, double sysStart, int w)
    {
        DrawSystemBackground(g, sysY, w);
        DrawStaves(g, sysY, w);
        DrawClef(g, sysY);
        DrawBarlines(g, fi, sysY, sysStart, w);
        DrawMiddleCLedger(g, sysY, w);      // only the middle-C ledger line
        DrawTimeLabel(g, sysY, sysStart, w);
        DrawNotes(g, fi, sysY, sysStart, w);
    }

    private void DrawSystemBackground(Graphics g, int sysY, int w)
    {
        // Faint alternating bands for black-key pitch rows to aid pitch reading.
        // We shade each black-key diatonic half-space inside the treble and bass staves.
        // Simpler: shade the area between staves and around the staves.
        using var sep = new Pen(Color.FromArgb(60, 200, 200, 220), 1f);
        g.DrawLine(sep, 0, sysY + SystemHeight - 1, w, sysY + SystemHeight - 1);
    }

    private void DrawStaves(Graphics g, int sysY, int w)
    {
        using var pen = new Pen(StaffColor, 1.2f);
        int trebleTop = sysY + TrebleRelTop;
        int bassTop   = sysY + BassRelTop;

        for (int i = 0; i < 5; i++)
        {
            g.DrawLine(pen, LeftMargin, trebleTop + i * StaffLineSpacing,
                            w - RightMargin, trebleTop + i * StaffLineSpacing);
            g.DrawLine(pen, LeftMargin, bassTop + i * StaffLineSpacing,
                            w - RightMargin, bassTop + i * StaffLineSpacing);
        }

        // Grand-staff bracket
        using var thick = new Pen(StaffColor, 2.5f);
        g.DrawLine(thick, LeftMargin, trebleTop, LeftMargin, bassTop + 4 * StaffLineSpacing);
    }

    private void DrawClef(Graphics g, int sysY)
    {
        int trebleTop = sysY + TrebleRelTop;
        int bassTop   = sysY + BassRelTop;

        // Use Segoe UI Symbol (always present on Win10/11) for reliable glyph rendering.
        try
        {
            using var tf = new Font("Segoe UI Symbol", 34, FontStyle.Regular, GraphicsUnit.Point);
            g.DrawString("𝄞", tf, Brushes.Black, LeftMargin + 3, trebleTop - 16);

            using var bf = new Font("Segoe UI Symbol", 26, FontStyle.Regular, GraphicsUnit.Point);
            g.DrawString("𝄢", bf, Brushes.Black, LeftMargin + 5, bassTop - 6);
        }
        catch
        {
            // Fallback: plain-text labels if font is unavailable
            using var lf = new Font("Segoe UI", 9, FontStyle.Bold);
            g.DrawString("Treble", lf, Brushes.DimGray, 2, trebleTop + StaffLineSpacing);
            g.DrawString("Bass",   lf, Brushes.DimGray, 2, bassTop   + StaffLineSpacing);
        }
    }

    private void DrawBarlines(Graphics g, MidiFileInfo fi, int sysY, double sysStart, int w)
    {
        double bps = 1_000_000.0 / fi.Tempo;
        double spb = 4.0 / bps;            // seconds per bar (4/4 assumed)
        if (spb <= 0) spb = 2.0;

        int trebleTop = sysY + TrebleRelTop;
        int bassBot   = sysY + BassRelTop + 4 * StaffLineSpacing;

        using var pen = new Pen(BarlineColor, 1f);

        double firstBar = Math.Ceiling(sysStart / spb) * spb;
        for (double t = firstBar; t <= sysStart + SecondsPerSystem + 0.001; t += spb)
        {
            double ratio = (t - sysStart) / SecondsPerSystem;
            if (ratio < 0 || ratio > 1.001) continue;
            int x = NoteX(t - sysStart, SecondsPerSystem, w);
            g.DrawLine(pen, x, trebleTop, x, trebleTop + 4 * StaffLineSpacing);
            g.DrawLine(pen, x, sysY + BassRelTop, x, bassBot);
        }
    }

    private void DrawMiddleCLedger(Graphics g, int sysY, int w)
    {
        // Middle C (MIDI 60) sits on a ledger line between treble and bass staves.
        // Draw a faint horizontal line across the note area at that pitch.
        (int relY, _) = NoteToRelY(60);
        if (relY == int.MinValue) return;
        int y = sysY + relY;
        using var pen = new Pen(Color.FromArgb(100, 120, 120, 140), 1f) { DashStyle = DashStyle.Dot };
        g.DrawLine(pen, LeftMargin, y, w - RightMargin, y);
    }

    private void DrawTimeLabel(Graphics g, int sysY, double sysStart, int w)
    {
        using var font = new Font("Segoe UI", 8, FontStyle.Regular);
        g.DrawString(TimeSpan.FromSeconds(sysStart).ToString(@"mm\:ss"),
            font, Brushes.Gray, LeftMargin, sysY + 6);
        string endStr = TimeSpan.FromSeconds(sysStart + SecondsPerSystem).ToString(@"mm\:ss");
        var sz = g.MeasureString(endStr, font);
        g.DrawString(endStr, font, Brushes.Gray, w - RightMargin - sz.Width, sysY + 6);
    }

    private void DrawNotes(Graphics g, MidiFileInfo fi, int sysY, double sysStart, int w)
    {
        double sysEnd    = sysStart + SecondsPerSystem;
        double noteAreaW = w - LeftMargin - RightMargin;

        foreach (var note in fi.AllNotes)
        {
            double ns = note.StartTimeSeconds;
            double ne = ns + note.DurationSeconds;
            if (ne <= sysStart) continue;
            if (ns >= sysEnd)   break;     // sorted by start time
            if (note.Channel == 10) continue; // drums

            (int relY, bool isTreble) = NoteToRelY(note.NoteNumber);
            if (relY == int.MinValue) continue;

            // Clamp note to system boundaries
            double drawStart = Math.Max(ns, sysStart);
            double drawEnd   = Math.Min(ne, sysEnd);

            int x  = NoteX(drawStart - sysStart, SecondsPerSystem, w);
            int x2 = NoteX(drawEnd   - sysStart, SecondsPerSystem, w);
            int nw = Math.Max(MinNoteW, x2 - x);
            int y  = sysY + relY - NoteBarH / 2;

            Color baseColor = isTreble ? TrebleNote : BassNote;

            // Black-key notes get a slightly different shade for readability
            if (IsBlackKey[note.NoteNumber % 12])
                baseColor = Color.FromArgb(baseColor.A,
                    Math.Max(0, baseColor.R - 20),
                    Math.Max(0, baseColor.G - 20),
                    Math.Min(255, baseColor.B + 20));

            using var brush = new SolidBrush(baseColor);
            var rect = new Rectangle(x, y, nw, NoteBarH);
            g.FillRectangle(brush, rect);

            // Thin outline for separation
            using var border = new Pen(Color.FromArgb(80, 0, 0, 0), 0.5f);
            g.DrawRectangle(border, rect);
        }
    }

    private void DrawNoFileMessage(Graphics g, int w, int h)
    {
        using var font = new Font("Segoe UI", 14);
        string msg = "MIDI 파일을 열어주세요 (파일 > 열기)";
        var sz = g.MeasureString(msg, font);
        g.DrawString(msg, font, Brushes.Gray, (w - sz.Width) / 2f, (h - sz.Height) / 2f);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    // Returns X pixel for a time offset within the current system.
    private int NoteX(double timeOffset, double sysDur, int w)
    {
        double ratio = timeOffset / sysDur;
        return LeftMargin + (int)(ratio * (w - LeftMargin - RightMargin));
    }

    // Maps a MIDI note number to a Y position RELATIVE to the system top.
    // Treble staff: E4 (MIDI 64) = bottom line.
    // Bass staff:   G2 (MIDI 43) = bottom line.
    // Returns int.MinValue for notes too far outside the staff to show.
    private (int relY, bool isTreble) NoteToRelY(int noteNumber)
    {
        bool isTreble   = noteNumber >= 60;
        int staffRelTop = isTreble ? TrebleRelTop : BassRelTop;
        int refNote     = isTreble ? 64 : 43;
        int refRelY     = staffRelTop + 4 * StaffLineSpacing;  // bottom staff line

        int diaRef  = ToDiatonic(refNote);
        int diaCurr = ToDiatonic(noteNumber);
        // Each diatonic step = half a staff-line spacing
        int relY    = refRelY - (int)Math.Round((diaCurr - diaRef) * StaffLineSpacing / 2.0);

        // Allow 4 ledger lines above and below each staff
        int limit = 4 * StaffLineSpacing;
        if (relY < staffRelTop - limit || relY > staffRelTop + 4 * StaffLineSpacing + limit)
            return (int.MinValue, isTreble);

        return (relY, isTreble);
    }

    private static int ToDiatonic(int midi)
        => (midi / 12) * 7 + ChromaticToDiatonic[midi % 12];
}
