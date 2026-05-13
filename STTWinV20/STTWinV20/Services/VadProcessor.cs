namespace STTWinV20.Services;

public enum VadMode { Mic, File }

// VAD-based audio segmentation, matching STTGTKV10/stt_core.cpp parameters.
// Frame size: 512 samples (32 ms at 16 kHz).
// Pre-roll: 6 frames (~192 ms) to capture word onset.
public sealed class VadProcessor
{
    private const int FrameSize = 512;
    private const int PreRollFrames = 6;
    private const int MaxSegmentSamples = 29 * 16000; // 29 seconds

    private readonly float _vadThresh;
    private readonly int _minSpeechFrames;
    private readonly int _silenceEndFrames;
    private readonly float _rmsNormalizeMax;

    private readonly Queue<float[]> _preRoll = new();
    private readonly List<float> _segment = new();
    private readonly List<float> _remainder = new();

    private int _speechRun;
    private int _silenceRun;
    private bool _inSpeech;

    public event EventHandler<float[]>? SegmentReady;

    public VadProcessor(VadMode mode)
    {
        if (mode == VadMode.Mic)
        {
            _vadThresh = 0.015f;
            _minSpeechFrames = 8;      // 256 ms
            _silenceEndFrames = 22;    // 704 ms
            _rmsNormalizeMax = 8f;
        }
        else
        {
            _vadThresh = 0.030f;
            _minSpeechFrames = 12;     // 384 ms
            _silenceEndFrames = 22;
            _rmsNormalizeMax = 3f;
        }
    }

    // Feed arbitrary-length audio; internally splits into 512-sample frames.
    public void Feed(float[] audio)
    {
        _remainder.AddRange(audio);

        while (_remainder.Count >= FrameSize)
        {
            var frame = _remainder.GetRange(0, FrameSize).ToArray();
            _remainder.RemoveRange(0, FrameSize);
            ProcessFrame(frame);
        }
    }

    // Flush any pending speech segment (e.g. at end of file).
    public void Flush()
    {
        if (_inSpeech && _segment.Count > 0)
        {
            SegmentReady?.Invoke(this, _segment.ToArray());
            _segment.Clear();
            _inSpeech = false;
        }
        _preRoll.Clear();
        _speechRun = 0;
        _silenceRun = 0;
        _remainder.Clear();
    }

    public void Reset()
    {
        _segment.Clear();
        _preRoll.Clear();
        _remainder.Clear();
        _speechRun = 0;
        _silenceRun = 0;
        _inSpeech = false;
    }

    private void ProcessFrame(float[] frame)
    {
        float rms = ComputeRms(frame);

        // RMS normalize: boost quiet audio up to rmsNormalizeMax times
        if (rms > 1e-6f && rms < 0.1f)
        {
            float gain = MathF.Min(0.1f / rms, _rmsNormalizeMax);
            for (int i = 0; i < frame.Length; i++)
                frame[i] = Math.Clamp(frame[i] * gain, -1f, 1f);
            rms = MathF.Min(rms * gain, 1f);
        }

        bool isSpeech = rms >= _vadThresh;

        if (!_inSpeech)
        {
            // Maintain pre-roll ring buffer
            _preRoll.Enqueue(frame);
            if (_preRoll.Count > PreRollFrames)
                _preRoll.Dequeue();

            if (isSpeech) _speechRun++;
            else _speechRun = 0;

            if (_speechRun >= _minSpeechFrames)
            {
                _inSpeech = true;
                foreach (var f in _preRoll) _segment.AddRange(f);
                _preRoll.Clear();
                _silenceRun = 0;
                _speechRun = 0;
            }
        }
        else
        {
            _segment.AddRange(frame);

            if (isSpeech) _silenceRun = 0;
            else _silenceRun++;

            bool endBySilence = _silenceRun >= _silenceEndFrames;
            bool endByLength = _segment.Count >= MaxSegmentSamples;

            if (endBySilence || endByLength)
            {
                SegmentReady?.Invoke(this, _segment.ToArray());
                _segment.Clear();
                _inSpeech = false;
                _silenceRun = 0;
            }
        }
    }

    private static float ComputeRms(float[] frame)
    {
        float sum = 0f;
        foreach (var s in frame) sum += s * s;
        return MathF.Sqrt(sum / frame.Length);
    }
}
