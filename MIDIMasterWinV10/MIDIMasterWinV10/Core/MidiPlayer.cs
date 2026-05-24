using NAudio.Midi;

namespace MIDIMasterWinV10.Core;

public enum PlaybackState { Stopped, Playing, Paused }

public class MidiPlayer : IDisposable
{
    private MidiOut? _midiOut;
    private MidiFile? _midiFile;
    private Thread? _playThread;
    private CancellationTokenSource? _cts;
    private long _pauseAtTick;
    private long _currentTick;     // written by playback thread, read by Pause()
    private int _selectedInstrument = 0;
    private bool _disposed;

    public PlaybackState State { get; private set; } = PlaybackState.Stopped;
    public double TotalSeconds { get; private set; }
    public double CurrentSeconds { get; private set; }

    public event Action<double>? PositionChanged;
    public event Action? PlaybackStopped;

    public int OutputDeviceIndex { get; set; } = 0;

    public static string[] GetOutputDevices()
    {
        var devices = new string[MidiOut.NumberOfDevices];
        for (int i = 0; i < MidiOut.NumberOfDevices; i++)
            devices[i] = MidiOut.DeviceInfo(i).ProductName;
        return devices;
    }

    public void LoadFile(string filePath)
    {
        Stop();
        _midiFile = new MidiFile(filePath, false);
        _pauseAtTick = 0;
        _currentTick = 0;

        int tempo = 500000;
        foreach (var track in _midiFile.Events)
            foreach (var ev in track)
                if (ev is TempoEvent te) tempo = te.MicrosecondsPerQuarterNote;

        double tps = (double)tempo / (1_000_000.0 * _midiFile.DeltaTicksPerQuarterNote);
        long maxTick = 0;
        foreach (var track in _midiFile.Events)
            foreach (var ev in track)
                if (ev.AbsoluteTime > maxTick) maxTick = ev.AbsoluteTime;
        TotalSeconds = maxTick * tps;
    }

    public void SetInstrument(int programNumber)
    {
        _selectedInstrument = programNumber;
        if (_midiOut != null)
        {
            for (int ch = 1; ch <= 16; ch++)
            {
                if (ch == 10) continue;
                _midiOut.Send(MidiMessage.ChangePatch(programNumber, ch).RawData);
            }
        }
    }

    public void Play()
    {
        if (_midiFile == null) return;
        if (State == PlaybackState.Playing) return;

        if (State == PlaybackState.Paused)
        {
            Resume();
            return;
        }

        StartPlayback(0);
    }

    public void Pause()
    {
        if (State != PlaybackState.Playing) return;
        State = PlaybackState.Paused;
        // Capture tick before cancelling so Resume() has the right position
        _pauseAtTick = Volatile.Read(ref _currentTick);
        _cts?.Cancel();
        _playThread?.Join(2000);
        AllNotesOff();
    }

    public void Stop()
    {
        if (State == PlaybackState.Stopped) return;
        State = PlaybackState.Stopped;
        _cts?.Cancel();
        _playThread?.Join(1000);
        AllNotesOff();
        _pauseAtTick = 0;
        _currentTick = 0;
        CurrentSeconds = 0;
        PlaybackStopped?.Invoke();
    }

    public void SeekToSeconds(double seconds)
    {
        bool wasPlaying = State == PlaybackState.Playing;
        if (wasPlaying) { State = PlaybackState.Paused; _cts?.Cancel(); _playThread?.Join(500); }
        AllNotesOff();

        if (_midiFile == null) return;
        int tempo = 500000;
        foreach (var track in _midiFile.Events)
            foreach (var ev in track)
                if (ev is TempoEvent te) tempo = te.MicrosecondsPerQuarterNote;

        double tps = (double)tempo / (1_000_000.0 * _midiFile.DeltaTicksPerQuarterNote);
        _pauseAtTick = (long)(seconds / tps);
        _currentTick = _pauseAtTick;
        CurrentSeconds = seconds;

        if (wasPlaying) StartPlayback(_pauseAtTick);
    }

    private void Resume()
    {
        StartPlayback(_pauseAtTick);
    }

    private void StartPlayback(long fromTick)
    {
        // Cancel and wait for any running thread before starting a new one
        _cts?.Cancel();
        _playThread?.Join(2000);

        _midiOut?.Dispose();
        _midiOut = new MidiOut(OutputDeviceIndex);
        SetInstrument(_selectedInstrument);

        State = PlaybackState.Playing;
        _cts = new CancellationTokenSource();
        var token = _cts.Token;

        _playThread = new Thread(() => PlaybackThread(fromTick, token))
        {
            IsBackground = true,
            Name = "MidiPlayback"
        };
        _playThread.Start();
    }

    // Compute elapsed microseconds from tick 0 to targetTick using the tempo map.
    private long TicksToStartMicros(long targetTick)
    {
        if (_midiFile == null || targetTick <= 0) return 0;
        int dtpq = _midiFile.DeltaTicksPerQuarterNote;

        var tempoChanges = _midiFile.Events
            .SelectMany(t => t)
            .OfType<TempoEvent>()
            .OrderBy(t => t.AbsoluteTime)
            .ToList();

        long micros = 0;
        long prevTick = 0;
        int tempo = 500000;

        foreach (var te in tempoChanges)
        {
            if (te.AbsoluteTime >= targetTick) break;
            micros += (te.AbsoluteTime - prevTick) * tempo / dtpq;
            prevTick = te.AbsoluteTime;
            tempo = te.MicrosecondsPerQuarterNote;
        }
        micros += (targetTick - prevTick) * tempo / dtpq;
        return micros;
    }

    private void PlaybackThread(long fromTick, CancellationToken token)
    {
        if (_midiFile == null) return;

        int tempo = 500000;
        int dtpq = _midiFile.DeltaTicksPerQuarterNote;

        // Merge all events sorted by absolute time
        var events = _midiFile.Events
            .SelectMany(t => t)
            .Where(e => e.AbsoluteTime >= fromTick)
            .OrderBy(e => e.AbsoluteTime)
            .ThenBy(e => e.CommandCode)
            .ToList();

        // Apply program changes before fromTick
        if (fromTick > 0)
        {
            var priorPatch = _midiFile.Events
                .SelectMany(t => t)
                .Where(e => e is PatchChangeEvent && e.AbsoluteTime < fromTick)
                .Cast<PatchChangeEvent>()
                .GroupBy(p => p.Channel)
                .Select(g => g.Last());

            foreach (var pc in priorPatch)
            {
                if (pc.Channel == 10) continue;
                int prog = _selectedInstrument > 0 ? _selectedInstrument : pc.Patch;
                _midiOut?.Send(MidiMessage.ChangePatch(prog, pc.Channel).RawData);
            }

            // Apply tempo events before fromTick
            foreach (var ev in _midiFile.Events
                .SelectMany(t => t)
                .OfType<TempoEvent>()
                .Where(t => t.AbsoluteTime < fromTick)
                .OrderBy(t => t.AbsoluteTime))
            {
                tempo = ev.MicrosecondsPerQuarterNote;
            }
        }

        long prevTick = fromTick;
        var sw = System.Diagnostics.Stopwatch.StartNew();
        // Initialize elapsedMicros to the absolute time of fromTick for correct CurrentSeconds on resume
        long startMicros = TicksToStartMicros(fromTick);
        long elapsedMicros = startMicros;

        foreach (var ev in events)
        {
            if (token.IsCancellationRequested) break;

            long deltaTicks = ev.AbsoluteTime - prevTick;
            long waitMicros = deltaTicks * tempo / dtpq;
            elapsedMicros += waitMicros;

            long targetMs = (elapsedMicros - startMicros) / 1000;
            long nowMs = sw.ElapsedMilliseconds;
            if (targetMs > nowMs)
            {
                int sleep = (int)(targetMs - nowMs);
                if (sleep > 0)
                    token.WaitHandle.WaitOne(sleep);
                if (token.IsCancellationRequested) break;
            }

            prevTick = ev.AbsoluteTime;
            Volatile.Write(ref _currentTick, prevTick);
            CurrentSeconds = elapsedMicros / 1_000_000.0;
            PositionChanged?.Invoke(CurrentSeconds);

            if (ev is TempoEvent te)
            {
                tempo = te.MicrosecondsPerQuarterNote;
                continue;
            }

            if (ev is PatchChangeEvent pce)
            {
                if (pce.Channel != 10)
                {
                    int prog = _selectedInstrument > 0 ? _selectedInstrument : pce.Patch;
                    _midiOut?.Send(MidiMessage.ChangePatch(prog, pce.Channel).RawData);
                }
                continue;
            }

            if (ev.CommandCode is MidiCommandCode.NoteOn or MidiCommandCode.NoteOff
                or MidiCommandCode.ControlChange or MidiCommandCode.PitchWheelChange
                or MidiCommandCode.Sysex)
            {
                try { _midiOut?.Send(ev.GetAsShortMessage()); }
                catch { }
            }
        }

        if (!token.IsCancellationRequested)
        {
            State = PlaybackState.Stopped;
            CurrentSeconds = TotalSeconds;
            _pauseAtTick = 0;
            _currentTick = 0;
            PlaybackStopped?.Invoke();
        }
    }

    private void AllNotesOff()
    {
        if (_midiOut == null) return;
        for (int ch = 1; ch <= 16; ch++)
        {
            try { _midiOut.Send(new ControlChangeEvent(0, ch, MidiController.AllNotesOff, 0).GetAsShortMessage()); }
            catch { }
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        Stop();
        _midiOut?.Dispose();
    }
}
