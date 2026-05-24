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
    private long _currentTick;  // written by playback thread via Volatile.Write; read by Pause()
    private int _selectedInstrument = 0;
    private bool _disposed;

    public PlaybackState State { get; private set; } = PlaybackState.Stopped;
    public double TotalSeconds { get; private set; }
    public double CurrentSeconds { get; private set; }

    /// <summary>Fires on the playback thread whenever the position advances.</summary>
    public event Action<double>? PositionChanged;

    /// <summary>Fires on the playback thread when the song naturally reaches its end.</summary>
    public event Action? PlaybackStopped;

    /// <summary>Fires on the calling thread whenever State changes (Playing / Paused / Stopped).</summary>
    public event Action<PlaybackState>? StateChanged;

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
            StartPlayback(_pauseAtTick);
            return;
        }

        StartPlayback(0);
    }

    /// <summary>
    /// Pauses playback. Non-blocking: cancels the playback thread without waiting for it to exit.
    /// The thread will stop imminently; StartPlayback() joins it before creating a new one.
    /// </summary>
    public void Pause()
    {
        if (State != PlaybackState.Playing) return;

        // Save position BEFORE cancelling the thread so Resume() starts from the right place.
        _pauseAtTick = Volatile.Read(ref _currentTick);
        State = PlaybackState.Paused;
        StateChanged?.Invoke(State);

        _cts?.Cancel();
        AllNotesOff();
        // Do NOT join here — that would block the UI thread.
        // StartPlayback() always joins before spawning a new thread.
    }

    public void Stop()
    {
        if (State == PlaybackState.Stopped) return;
        _cts?.Cancel();
        _playThread?.Join(1000);
        AllNotesOff();
        _pauseAtTick = 0;
        _currentTick = 0;
        CurrentSeconds = 0;
        State = PlaybackState.Stopped;
        StateChanged?.Invoke(State);
        PlaybackStopped?.Invoke();
    }

    public void SeekToSeconds(double seconds)
    {
        bool wasPlaying = State == PlaybackState.Playing;
        if (wasPlaying) { _cts?.Cancel(); _playThread?.Join(500); }
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

    private void StartPlayback(long fromTick)
    {
        // Join any previous thread before creating a new one (handles resume-after-pause).
        _cts?.Cancel();
        _playThread?.Join(2000);

        _midiOut?.Dispose();
        _midiOut = new MidiOut(OutputDeviceIndex);
        SetInstrument(_selectedInstrument);

        State = PlaybackState.Playing;
        StateChanged?.Invoke(State);

        _cts = new CancellationTokenSource();
        var token = _cts.Token;

        _playThread = new Thread(() => PlaybackThread(fromTick, token))
        {
            IsBackground = true,
            Name = "MidiPlayback"
        };
        _playThread.Start();
    }

    // Compute the absolute elapsed microseconds from tick 0 to targetTick using the tempo map.
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

        var events = _midiFile.Events
            .SelectMany(t => t)
            .Where(e => e.AbsoluteTime >= fromTick)
            .OrderBy(e => e.AbsoluteTime)
            .ThenBy(e => e.CommandCode)
            .ToList();

        // Restore program changes that occurred before the resume point.
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

            // Apply tempo events that happened before the resume point.
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
        // Initialize elapsedMicros to the absolute position of fromTick so CurrentSeconds
        // is correct immediately on resume (not reset to 0).
        long startMicros = TicksToStartMicros(fromTick);
        long elapsedMicros = startMicros;

        foreach (var ev in events)
        {
            if (token.IsCancellationRequested) break;

            long deltaTicks = ev.AbsoluteTime - prevTick;
            long waitMicros = deltaTicks * tempo / dtpq;
            elapsedMicros += waitMicros;

            // targetMs is relative to when this playback segment started (stopwatch origin).
            long targetMs = (elapsedMicros - startMicros) / 1000;
            long nowMs = sw.ElapsedMilliseconds;
            if (targetMs > nowMs)
            {
                token.WaitHandle.WaitOne((int)(targetMs - nowMs));
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

        // Song finished naturally (not cancelled).
        if (!token.IsCancellationRequested)
        {
            State = PlaybackState.Stopped;
            CurrentSeconds = TotalSeconds;
            _pauseAtTick = 0;
            _currentTick = 0;
            PlaybackStopped?.Invoke();
            StateChanged?.Invoke(State);
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
