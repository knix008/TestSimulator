using NAudio.Midi;
using MIDIMasterWinV10.Models;
using NoteEvent = MIDIMasterWinV10.Models.NoteEvent;
using NaudioNoteEvent = NAudio.Midi.NoteEvent;

namespace MIDIMasterWinV10.Core;

public class MidiFileInfo
{
    public string FilePath { get; set; } = string.Empty;
    public int DeltaTicksPerQuarterNote { get; set; }
    public int MidiType { get; set; }
    public double TotalSeconds { get; set; }
    public int Tempo { get; set; } = 500000;
    public List<MidiTrackInfo> Tracks { get; set; } = [];
    public List<NoteEvent> AllNotes { get; set; } = [];
}

public class MidiParser
{
    public static MidiFileInfo Parse(string filePath)
    {
        var midiFile = new MidiFile(filePath, false);
        int dtpq = midiFile.DeltaTicksPerQuarterNote;

        var info = new MidiFileInfo
        {
            FilePath = filePath,
            DeltaTicksPerQuarterNote = dtpq,
            MidiType = midiFile.FileFormat
        };

        if (dtpq <= 0)
            throw new InvalidDataException($"MIDI 파일의 타임 디비전 값이 잘못되었습니다: {dtpq}");

        // Build tempo map: list of (absoluteTick, microsecondsPerBeat)
        // NAudio Channel is 1-based (1–16); note this throughout.
        var tempoMap = new List<(long tick, int uspb)> { (0, 500000) };
        for (int t = 0; t < midiFile.Tracks; t++)
            foreach (var ev in midiFile.Events[t])
                if (ev is TempoEvent te)
                    tempoMap.Add((te.AbsoluteTime, te.MicrosecondsPerQuarterNote));

        tempoMap.Sort((a, b) => a.tick.CompareTo(b.tick));
        info.Tempo = tempoMap[^1].uspb;

        double TicksToSeconds(long ticks)
        {
            double secs = 0;
            long prevTick = 0;
            int curTempo = 500000;
            foreach (var (tick, uspb) in tempoMap)
            {
                if (tick >= ticks) break;
                secs += (tick - prevTick) * curTempo / (1_000_000.0 * dtpq);
                prevTick = tick;
                curTempo = uspb;
            }
            secs += (ticks - prevTick) * curTempo / (1_000_000.0 * dtpq);
            return secs;
        }

        // Parse notes per track
        for (int t = 0; t < midiFile.Tracks; t++)
        {
            var trackInfo = new MidiTrackInfo { TrackIndex = t };
            // key = channel(1-16) * 128 + noteNumber(0-127)
            var openNotes = new Dictionary<int, (long tick, int velocity)>();
            long lastTick = 0;

            foreach (var ev in midiFile.Events[t])
            {
                lastTick = Math.Max(lastTick, ev.AbsoluteTime);
                if (ev is TextEvent txt && txt.MetaEventType == MetaEventType.SequenceTrackName)
                    trackInfo.Name = txt.Text;

                if (ev is PatchChangeEvent pc)
                {
                    // pc.Channel is 1-based (1–16) — store as-is
                    trackInfo.InstrumentNumber = pc.Patch;
                    trackInfo.Channel = pc.Channel;
                }

                if (ev is NoteOnEvent noteOn && noteOn.Velocity > 0)
                {
                    int key = noteOn.Channel * 128 + noteOn.NoteNumber;
                    openNotes[key] = (noteOn.AbsoluteTime, noteOn.Velocity);
                    trackInfo.Channel = noteOn.Channel;
                }
                else if (ev is NaudioNoteEvent noteOff &&
                         (ev.CommandCode == MidiCommandCode.NoteOff ||
                          (ev.CommandCode == MidiCommandCode.NoteOn &&
                           noteOff.Velocity == 0)))
                {
                    int key = noteOff.Channel * 128 + noteOff.NoteNumber;
                    if (openNotes.TryGetValue(key, out var start))
                    {
                        long dur = noteOff.AbsoluteTime - start.tick;
                        trackInfo.Notes.Add(new NoteEvent
                        {
                            NoteNumber    = noteOff.NoteNumber,
                            Velocity      = start.velocity,
                            StartTick     = start.tick,
                            DurationTicks = Math.Max(1, dur),
                            Channel       = noteOff.Channel,           // 1-based
                            StartTimeSeconds = TicksToSeconds(start.tick),
                            DurationSeconds  = TicksToSeconds(start.tick + Math.Max(1, dur))
                                               - TicksToSeconds(start.tick)
                        });
                        info.AllNotes.Add(trackInfo.Notes[^1]);
                        openNotes.Remove(key);
                    }
                }
            }

            // Close notes still held at end of track (some files omit NoteOff).
            foreach (var (key, start) in openNotes)
            {
                long dur = Math.Max(1, lastTick - start.tick);
                int noteNumber = key % 128;
                int channel    = key / 128;
                trackInfo.Notes.Add(new NoteEvent
                {
                    NoteNumber       = noteNumber,
                    Velocity         = start.velocity,
                    StartTick        = start.tick,
                    DurationTicks    = dur,
                    Channel          = channel,
                    StartTimeSeconds = TicksToSeconds(start.tick),
                    DurationSeconds  = TicksToSeconds(start.tick + dur) - TicksToSeconds(start.tick)
                });
                info.AllNotes.Add(trackInfo.Notes[^1]);
            }

            if (string.IsNullOrEmpty(trackInfo.Name))
                trackInfo.Name = $"Track {t + 1}";

            if (trackInfo.Notes.Count > 0)
                info.Tracks.Add(trackInfo);
        }

        info.AllNotes.Sort((a, b) => a.StartTick.CompareTo(b.StartTick));

        info.TotalSeconds = info.AllNotes.Count > 0
            ? info.AllNotes.Max(n => n.StartTimeSeconds + n.DurationSeconds)
            : TicksToSeconds(
                Enumerable.Range(0, midiFile.Tracks)
                           .SelectMany(t => midiFile.Events[t])
                           .Max(e => e.AbsoluteTime));

        return info;
    }
}
