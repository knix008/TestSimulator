namespace MIDIMasterWinV10.Models;

public class MidiTrackInfo
{
    public int TrackIndex { get; set; }
    public string Name { get; set; } = string.Empty;
    public int Channel { get; set; }
    public int InstrumentNumber { get; set; }  // GM program number 0-127
    public List<NoteEvent> Notes { get; set; } = [];
}
