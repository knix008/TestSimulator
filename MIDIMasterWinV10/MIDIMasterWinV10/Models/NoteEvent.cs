namespace MIDIMasterWinV10.Models;

public class NoteEvent
{
    public int NoteNumber { get; set; }       // MIDI note number (0-127)
    public int Velocity { get; set; }         // 0-127
    public long StartTick { get; set; }
    public long DurationTicks { get; set; }
    public int Channel { get; set; }          // 0-15
    public double StartTimeSeconds { get; set; }
    public double DurationSeconds { get; set; }

    // Computed properties
    public string NoteName => GetNoteName(NoteNumber);
    public int Octave => (NoteNumber / 12) - 1;
    public int PitchClass => NoteNumber % 12;

    private static readonly string[] NoteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    public static string GetNoteName(int noteNumber)
    {
        int octave = (noteNumber / 12) - 1;
        string name = NoteNames[noteNumber % 12];
        return $"{name}{octave}";
    }

    // MIDI note number to frequency (Hz)
    public double Frequency => 440.0 * Math.Pow(2.0, (NoteNumber - 69) / 12.0);
}
