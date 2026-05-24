using MIDIMasterWinV10.Models;
using System.Drawing.Drawing2D;

namespace MIDIMasterWinV10.Core;

/// <summary>
/// Renders MIDI as engraved-style grand-staff sheet music.
/// Each system row shows a fixed number of 4/4 measures; note X follows beat
/// position inside the measure (not proportional wall-clock time).
/// </summary>
public class SheetMusicRenderer
{
    // ── Layout ─────────────────────────────────────────────────────────────────
    public const int SystemHeight      = 300;
    private const int TrebleRelTop     = 62;
    private const int BassRelTop       = 192;
    private const int StaffLineSpacing = 14;
    private const int BarsPerSystem    = 4;
    private const int LeftMargin       = 108;   // clef + time signature + first barline
    private const int RightMargin      = 16;
    private const int NoteHeadW        = 11;
    private const int NoteHeadH        = 8;
    private const int StemLength       = StaffLineSpacing * 3;
    private const int DrumChannel      = 10;
    private const int PlayheadMargin   = 6;
    private const int PlayheadMarkerH  = 10;
    private const int NoteHeadTiltDeg  = -22;
    private const int QuantizeDivisions = 16;   // sixteenth-note grid

    private static readonly int[] ChromaticToDiatonic
        = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];

    private static readonly bool[] IsAccidental
        = [false, true, false, true, false, false, true, false, true, false, true, false];

    // ── Colours (traditional engraving: black on white) ───────────────────────
    public Color BackgroundColor { get; set; } = Color.White;
    public Color StaffColor      { get; set; } = Color.Black;
    public Color BarlineColor    { get; set; } = Color.Black;
    public Color NoteColor       { get; set; } = Color.Black;

    public double SecondsPerSystem { get; private set; }

    // ── Public API ────────────────────────────────────────────────────────────

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

        double barSeconds = SecondsPerBar(fileInfo.Tempo);
        SecondsPerSystem = BarsPerSystem * barSeconds;
        if (SecondsPerSystem <= 0) SecondsPerSystem = 8.0;

        int systemCount = (int)Math.Ceiling(fileInfo.TotalSeconds / SecondsPerSystem) + 1;
        int totalHeight = Math.Max(SystemHeight, systemCount * SystemHeight);

        var bmp = new Bitmap(Math.Max(1, width), totalHeight);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAlias;
        g.Clear(BackgroundColor);

        for (int s = 0; s < systemCount; s++)
            DrawSystem(g, fileInfo, s * SystemHeight, s * SecondsPerSystem, width);

        return bmp;
    }

    public void DrawPlayhead(Graphics g, double currentSeconds, int width, int tempoMicros = 500_000)
    {
        if (SecondsPerSystem <= 0) return;

        int sysIndex = (int)(currentSeconds / SecondsPerSystem);
        double sysStart = sysIndex * SecondsPerSystem;
        int x = TimeToX(currentSeconds, sysStart, width, tempoMicros);
        int sysTop = sysIndex * SystemHeight;
        int yTop = sysTop + PlayheadMargin;
        int yBottom = sysTop + SystemHeight - PlayheadMargin;

        using var pen = new Pen(Color.OrangeRed, 2.5f);
        g.DrawLine(pen, x, yTop, x, yBottom);

        var pts = new PointF[]
        {
            new(x - 6, yTop - PlayheadMarkerH),
            new(x + 6, yTop - PlayheadMarkerH),
            new(x, yTop - 1)
        };
        g.FillPolygon(Brushes.OrangeRed, pts);
    }

    // ── System ────────────────────────────────────────────────────────────────

    private void DrawSystem(Graphics g, MidiFileInfo fi, int sysY, double sysStart, int w)
    {
        DrawSystemSeparator(g, sysY, w);
        DrawStaves(g, sysY, w);
        DrawClefAndTimeSignature(g, sysY);
        DrawMeasureNumbers(g, fi, sysY, sysStart, w);
        DrawBarlines(g, sysY, w);
        DrawNotes(g, fi, sysY, sysStart, w);
    }

    private void DrawSystemSeparator(Graphics g, int sysY, int w)
    {
        using var pen = new Pen(Color.FromArgb(220, 220, 225), 1f);
        g.DrawLine(pen, 0, sysY + SystemHeight - 1, w, sysY + SystemHeight - 1);
    }

    private void DrawStaves(Graphics g, int sysY, int w)
    {
        using var pen = new Pen(StaffColor, 1f);
        int trebleTop = sysY + TrebleRelTop;
        int bassTop   = sysY + BassRelTop;

        for (int i = 0; i < 5; i++)
        {
            g.DrawLine(pen, LeftMargin, trebleTop + i * StaffLineSpacing,
                w - RightMargin, trebleTop + i * StaffLineSpacing);
            g.DrawLine(pen, LeftMargin, bassTop + i * StaffLineSpacing,
                w - RightMargin, bassTop + i * StaffLineSpacing);
        }

        using var bracket = new Pen(StaffColor, 2f);
        g.DrawLine(bracket, LeftMargin, trebleTop, LeftMargin, bassTop + 4 * StaffLineSpacing);
    }

    private void DrawClefAndTimeSignature(Graphics g, int sysY)
    {
        int trebleTop = sysY + TrebleRelTop;
        int bassTop   = sysY + BassRelTop;

        using var clefFont = new Font("Times New Roman", 44, FontStyle.Regular, GraphicsUnit.Pixel);
        using var bassFont = new Font("Times New Roman", 34, FontStyle.Regular, GraphicsUnit.Pixel);
        using var sigFont  = new Font("Times New Roman", 22, FontStyle.Bold, GraphicsUnit.Pixel);

        g.DrawString("\U0001D11E", clefFont, Brushes.Black, 10, trebleTop - 26);
        g.DrawString("\U0001D122", bassFont, Brushes.Black, 12, bassTop - 14);

        // 4/4 time signature
        float sigX = 62;
        g.DrawString("4", sigFont, Brushes.Black, sigX, trebleTop + StaffLineSpacing - 2);
        g.DrawString("4", sigFont, Brushes.Black, sigX, trebleTop + 3 * StaffLineSpacing - 2);
    }

    private void DrawMeasureNumbers(Graphics g, MidiFileInfo fi, int sysY, double sysStart, int w)
    {
        double barSeconds = SecondsPerBar(fi.Tempo);
        int firstMeasure  = (int)Math.Floor(sysStart / barSeconds) + 1;

        using var font = new Font("Times New Roman", 9, FontStyle.Italic);
        double measureWidth = MeasureWidth(w);

        for (int i = 0; i < BarsPerSystem; i++)
        {
            int measureNum = firstMeasure + i;
            if (measureNum < 1) continue;
            int x = LeftMargin + (int)(i * measureWidth) + 4;
            g.DrawString(measureNum.ToString(), font, Brushes.Gray, x, sysY + 8);
        }
    }

    private void DrawBarlines(Graphics g, int sysY, int w)
    {
        int trebleTop = sysY + TrebleRelTop;
        int bassTop   = sysY + BassRelTop;
        int bassBot   = bassTop + 4 * StaffLineSpacing;
        double measureWidth = MeasureWidth(w);

        using var thin = new Pen(BarlineColor, 1f);
        using var heavy = new Pen(BarlineColor, 1.8f);

        for (int i = 0; i <= BarsPerSystem; i++)
        {
            int x = LeftMargin + (int)Math.Round(i * measureWidth);
            var pen = i == 0 ? heavy : thin;
            g.DrawLine(pen, x, trebleTop, x, trebleTop + 4 * StaffLineSpacing);
            g.DrawLine(pen, x, bassTop, x, bassBot);
        }
    }

    private void DrawNotes(Graphics g, MidiFileInfo fi, int sysY, double sysStart, int w)
    {
        double sysEnd       = sysStart + SecondsPerSystem;
        double beatSeconds  = fi.Tempo / 1_000_000.0;
        if (beatSeconds <= 0) beatSeconds = 0.5;

        using var accFont = new Font("Times New Roman", 11, FontStyle.Regular);
        using var stemPen = new Pen(NoteColor, 1.3f);

        var slotCounts = new Dictionary<string, int>();
        var beamGroups = new List<BeamNote>();

        foreach (var note in fi.AllNotes)
        {
            double ns = note.StartTimeSeconds;
            double ne = ns + note.DurationSeconds;
            if (ne <= sysStart) continue;
            if (ns >= sysEnd) break;
            if (note.Channel == DrumChannel) continue;

            (int relY, bool isTreble) = NoteToRelY(note.NoteNumber);
            if (relY == int.MinValue) continue;

            double drawStart = Math.Max(ns, sysStart);
            int x = TimeToX(drawStart, sysStart, w, fi.Tempo, quantize: true);

            double relBars = (drawStart - sysStart) / SecondsPerBar(fi.Tempo);
            int barInSys = (int)Math.Floor(relBars);
            double beatInBar = Math.Round(((relBars - barInSys) * 4.0) * QuantizeDivisions) / QuantizeDivisions;
            string slot = $"{barInSys}:{beatInBar:F2}:{isTreble}";
            int stagger = slotCounts.GetValueOrDefault(slot);
            slotCounts[slot] = stagger + 1;
            x += stagger * 5;

            int y = sysY + relY;
            bool filled = note.DurationSeconds < beatSeconds * 0.95;
            bool stemUp = ShouldStemUp(y, sysY, isTreble);

            DrawNoteHead(g, x, y, filled, stemPen, stemUp);
            DrawLedgerLines(g, note.NoteNumber, x, sysY, isTreble);

            if (IsAccidental[note.NoteNumber % 12])
                g.DrawString("\u266F", accFont, Brushes.Black, x - 14, y - 8);

            if (filled && note.DurationSeconds <= beatSeconds * 0.55)
                beamGroups.Add(new BeamNote(x, y, stemUp, isTreble));
        }

        DrawBeams(g, beamGroups, stemPen);
    }

    private void DrawNoteHead(Graphics g, int x, int y, bool filled, Pen stemPen, bool stemUp)
    {
        var state = g.Save();
        g.TranslateTransform(x, y);
        g.RotateTransform(NoteHeadTiltDeg);

        var rect = new Rectangle(-NoteHeadW / 2, -NoteHeadH / 2, NoteHeadW, NoteHeadH);
        if (filled)
            g.FillEllipse(Brushes.Black, rect);
        else
        {
            g.FillEllipse(Brushes.White, rect);
            g.DrawEllipse(stemPen, rect);
        }

        g.Restore(state);

        int stemX = stemUp ? x + NoteHeadW / 2 - 1 : x - NoteHeadW / 2 + 1;
        int stemY2 = stemUp ? y - StemLength : y + StemLength;
        g.DrawLine(stemPen, stemX, y, stemX, stemY2);
    }

    private void DrawBeams(Graphics g, List<BeamNote> notes, Pen pen)
    {
        if (notes.Count < 2) return;

        var grouped = notes
            .GroupBy(n => (n.IsTreble, n.StemUp, n.X / 12))
            .Where(grp => grp.Count() >= 2);

        foreach (var grp in grouped)
        {
            var list = grp.OrderBy(n => n.X).ToList();
            bool stemUp = list[0].StemUp;
            int beamY = stemUp
                ? list.Min(n => n.Y) - StemLength
                : list.Max(n => n.Y) + StemLength;

            int x1 = list.First().X + (stemUp ? 4 : -4);
            int x2 = list.Last().X + (stemUp ? 4 : -4);
            pen.Width = 2.5f;
            g.DrawLine(pen, x1, beamY, x2, beamY);
            pen.Width = 1.3f;
        }
    }

    private void DrawLedgerLines(Graphics g, int noteNumber, int x, int sysY, bool isTreble)
    {
        using var pen = new Pen(StaffColor, 1f);
        int ledgerW = NoteHeadW + 8;

        int staffRelTop = isTreble ? TrebleRelTop : BassRelTop;
        int topLine     = sysY + staffRelTop;
        int bottomLine  = topLine + 4 * StaffLineSpacing;

        (int noteY, _) = NoteToRelY(noteNumber);
        if (noteY == int.MinValue) return;
        noteY += sysY;

        for (int ly = topLine - StaffLineSpacing; ly >= noteY - NoteHeadH; ly -= StaffLineSpacing)
            g.DrawLine(pen, x - ledgerW / 2, ly, x + ledgerW / 2, ly);

        for (int ly = bottomLine + StaffLineSpacing; ly <= noteY + NoteHeadH; ly += StaffLineSpacing)
            g.DrawLine(pen, x - ledgerW / 2, ly, x + ledgerW / 2, ly);
    }

    private void DrawNoFileMessage(Graphics g, int w, int h)
    {
        using var font = new Font("Segoe UI", 14);
        string msg = "MIDI 파일을 열어주세요 (파일 > 열기)";
        var sz = g.MeasureString(msg, font);
        g.DrawString(msg, font, Brushes.Gray, (w - sz.Width) / 2f, (h - sz.Height) / 2f);
    }

    // ── Layout helpers ─────────────────────────────────────────────────────────

    private static double BeatsPerSecond(int tempoMicros) => 1_000_000.0 / tempoMicros;

    private static double SecondsPerBar(int tempoMicros) => 4.0 / BeatsPerSecond(tempoMicros);

    private static double MeasureWidth(int w) => (w - LeftMargin - RightMargin) / (double)BarsPerSystem;

    private static int TimeToX(double timeSec, double sysStartSec, int w, int tempoMicros, bool quantize = false)
    {
        double barSeconds = SecondsPerBar(tempoMicros);
        double relSec = timeSec - sysStartSec;
        if (relSec < 0) relSec = 0;

        double relBars = relSec / barSeconds;
        if (quantize)
        {
            double beatInBar = (relBars - Math.Floor(relBars)) * 4.0;
            beatInBar = Math.Round(beatInBar * QuantizeDivisions) / QuantizeDivisions;
            relBars = Math.Floor(relBars) + beatInBar / 4.0;
        }

        return LeftMargin + (int)Math.Round(relBars * MeasureWidth(w));
    }

    private static bool ShouldStemUp(int noteY, int sysY, bool isTreble)
    {
        int staffRelTop = isTreble ? TrebleRelTop : BassRelTop;
        int staffMidY   = sysY + staffRelTop + 2 * StaffLineSpacing;
        return noteY >= staffMidY;
    }

    private (int relY, bool isTreble) NoteToRelY(int noteNumber)
    {
        bool isTreble   = noteNumber >= 60;
        int staffRelTop = isTreble ? TrebleRelTop : BassRelTop;
        int refNote     = isTreble ? 64 : 43;
        int refRelY     = staffRelTop + 4 * StaffLineSpacing;

        int diaRef  = ToDiatonic(refNote);
        int diaCurr = ToDiatonic(noteNumber);
        int relY    = refRelY - (int)Math.Round((diaCurr - diaRef) * StaffLineSpacing / 2.0);

        int limit = 5 * StaffLineSpacing;
        if (relY < staffRelTop - limit || relY > staffRelTop + 4 * StaffLineSpacing + limit)
            return (int.MinValue, isTreble);

        return (relY, isTreble);
    }

    private static int ToDiatonic(int midi)
        => (midi / 12) * 7 + ChromaticToDiatonic[midi % 12];

    private readonly record struct BeamNote(int X, int Y, bool StemUp, bool IsTreble);
}
