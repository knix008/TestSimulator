using System.ComponentModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Speech.Synthesis;
using System.Text;
using System.Threading;
using Windows.Foundation;
using Windows.Media.Core;
using NAudio.MediaFoundation;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace TTSWinV10;

public partial class MainForm : Form, IMessageFilter
{
    private readonly System.Windows.Forms.Timer _waveTimer;
    private WaveOutEvent? _waveOut;
    private WaveFileReader? _playReader;
    private VolumeSampleProvider? _volumeProvider;
    private PeakProbe? _peakProbe;
    private CancellationTokenSource? _synthCts;
    private readonly List<float> _peakRing = new();
    private float[] _wavePaintScratch = Array.Empty<float>();
    /// <summary>시간축 확대: 값이 클수록 더 짧은 구간(초)을 화면에 담습니다.</summary>
    private float _waveHorizontalMag = 1f;
    private float[] _bakedWavePeaks = Array.Empty<float>();
    private float[] _bakedWaveValleys = Array.Empty<float>();
    private double _bakedWaveDurationSec;
    private double _waveViewStartSec;
    private double _lastPlaybackSec;
    private readonly float[] _vuBarHistory = new float[32];
    private int _vuBarHead;
    private int _vuBarCount;
    private bool _waveWheelFilterRegistered;
    private Font? _waveRulerFont;
    private volatile bool _isPlaying;
    private volatile bool _playbackUserAbort;
    private bool _waveformScrubDrag;
    private volatile bool _isSynthesizing;
    private readonly List<VoiceEntry> _allVoiceEntries = new();
    private Bitmap? _transportPlayIcon;
    private Bitmap? _transportStopIcon;

    private readonly struct SpeechProgressMark(double timeSec, int charStart, int charLength)
    {
        public double TimeSec { get; } = timeSec;
        public int CharStart { get; } = charStart;
        public int CharLength { get; } = charLength;
        public int CharEndExclusive => CharStart + Math.Max(0, CharLength);
    }

    private sealed class SpeechSyncTrack
    {
        public bool LinearMode { get; private set; }
        public List<SpeechProgressMark> Marks { get; } = new();
        /// <summary>SAPI 재생에 WinRT 단어 경계 시간만 스케일해 입힌 경우 true( SpeakProgress 기반 보정 비활성).</summary>
        public bool UsesWinRtScaledTiming { get; private set; }
        private readonly object _gate = new();
        private readonly List<(TimeSpan AudioTime, int CharStart, int CharLen)> _raw = new();

        public void Clear()
        {
            lock (_gate)
            {
                _raw.Clear();
            }

            Marks.Clear();
            LinearMode = false;
            UsesWinRtScaledTiming = false;
        }

        public void AddSpeakProgress(SpeakProgressEventArgs e)
        {
            lock (_gate)
            {
                _raw.Add((e.AudioPosition, e.CharacterPosition, Math.Max(1, e.CharacterCount)));
            }
        }

        public void FinalizeFromSapi(string displayText, bool ssmlUsed)
        {
            Marks.Clear();
            UsesWinRtScaledTiming = false;
            if (ssmlUsed)
            {
                LinearMode = true;
                return;
            }

            LinearMode = false;
            lock (_gate)
            {
                foreach ((TimeSpan at, int cs, int cl) in _raw)
                {
                    double t = at.TotalSeconds;
                    if (t < 0)
                    {
                        t = 0;
                    }

                    int start = ClampInt(cs, 0, displayText.Length);
                    int len = ClampInt(cl, 1, Math.Max(1, displayText.Length - start));
                    Marks.Add(new SpeechProgressMark(t, start, len));
                }
            }

            if (Marks.Count == 0)
            {
                LinearMode = true;
                return;
            }

            Marks.Sort((a, b) => a.TimeSec.CompareTo(b.TimeSec));

            // 첫 단어가 t>0에서만 시작하면 재생 초반(0~첫 마크) 구간이 선형 폴백으로 느리게 보입니다.
            if (Marks.Count > 0 && Marks[0].CharStart == 0 && Marks[0].TimeSec > 0.03)
            {
                SpeechProgressMark m0 = Marks[0];
                Marks[0] = new SpeechProgressMark(0, m0.CharStart, m0.CharLength);
            }
        }

        public void ForceLinear()
        {
            Marks.Clear();
            lock (_gate)
            {
                _raw.Clear();
            }

            LinearMode = true;
            UsesWinRtScaledTiming = false;
        }

        /// <summary>
        /// WinRT 합성 스트림에 포함된 단어 경계 메타데이터로 마크를 채웁니다.
        /// SSML 등 입력과 표시 텍스트 인덱스가 다를 때는 <paramref name="useWordMetadata"/>를 false로 두고 선형으로 둡니다.
        /// </summary>
        public void FinalizeFromWinRtStream(Windows.Media.SpeechSynthesis.SpeechSynthesisStream stream, string displayText, bool useWordMetadata)
        {
            Marks.Clear();
            UsesWinRtScaledTiming = false;
            if (!useWordMetadata)
            {
                LinearMode = true;
                return;
            }

            try
            {
                PopulateWinRtWordMarksToList(stream, displayText, Marks);
            }
            catch
            {
                Marks.Clear();
            }

            if (Marks.Count == 0)
            {
                LinearMode = true;
                return;
            }

            Marks.Sort((a, b) => a.TimeSec.CompareTo(b.TimeSec));
            LinearMode = false;
        }

        /// <summary>SAPI WAV 길이에 맞춰 WinRT 단어 시각을 스케일한 마크로 교체합니다.</summary>
        public void ReplaceMarksFromWinRtScaledForSapiPlayback(IReadOnlyList<SpeechProgressMark> scaledMarks)
        {
            Marks.Clear();
            if (scaledMarks.Count == 0)
            {
                LinearMode = true;
                UsesWinRtScaledTiming = false;
                return;
            }

            Marks.AddRange(scaledMarks);
            Marks.Sort((a, b) => a.TimeSec.CompareTo(b.TimeSec));
            LinearMode = false;
            UsesWinRtScaledTiming = true;
        }

        /// <summary>
        /// WinRT/Sherpa 등 마크가 없을 때, 공백으로 나눈 단어에 오디오 길이를 글자 수 비례로 나눠
        /// SAPI <see cref="FinalizeFromSapi"/> 와 같은 단어 단위 선택을 근사합니다.
        /// </summary>
        public void FinalizeApproximateWordsByWhitespace(string displayText, double audioDurationSec)
        {
            Marks.Clear();
            LinearMode = false;
            UsesWinRtScaledTiming = false;
            if (string.IsNullOrEmpty(displayText) || audioDurationSec < 1e-6)
            {
                LinearMode = true;
                return;
            }

            var spans = new List<(int Start, int Len)>();
            int n = displayText.Length;
            int i = 0;
            while (i < n)
            {
                while (i < n && char.IsWhiteSpace(displayText[i]))
                {
                    i++;
                }

                if (i >= n)
                {
                    break;
                }

                int start = i;
                while (i < n && !char.IsWhiteSpace(displayText[i]))
                {
                    i++;
                }

                int len = i - start;
                if (len > 0)
                {
                    spans.Add((start, len));
                }
            }

            if (spans.Count == 0)
            {
                LinearMode = true;
                return;
            }

            double totalWeight = 0;
            foreach ((_, int len) in spans)
            {
                totalWeight += Math.Max(1, len);
            }

            double t = 0;
            foreach ((int start, int len) in spans)
            {
                double w = Math.Max(1, len);
                Marks.Add(new SpeechProgressMark(t, start, len));
                t += audioDurationSec * (w / totalWeight);
            }
        }
    }

    private static void PopulateWinRtWordMarksToList(
        Windows.Media.SpeechSynthesis.SpeechSynthesisStream stream,
        string displayText,
        List<SpeechProgressMark> dest)
    {
        dest.Clear();
        foreach (TimedMetadataTrack track in stream.TimedMetadataTracks)
        {
            if (track.TimedMetadataKind != TimedMetadataKind.Speech)
            {
                continue;
            }

            if (!string.Equals(track.Label, "SpeechWord", StringComparison.Ordinal))
            {
                continue;
            }

            foreach (IMediaCue cue in track.Cues)
            {
                if (cue is not SpeechCue sc)
                {
                    continue;
                }

                double t = sc.StartTime.TotalSeconds;
                if (t < 0)
                {
                    t = 0;
                }

                if (!sc.StartPositionInInput.HasValue || !sc.EndPositionInInput.HasValue)
                {
                    continue;
                }

                int start = (int)sc.StartPositionInInput.Value;
                int endIn = (int)sc.EndPositionInInput.Value;
                int len = Math.Max(1, endIn - start + 1);
                start = ClampInt(start, 0, displayText.Length);
                len = ClampInt(len, 1, Math.Max(1, displayText.Length - start));
                dest.Add(new SpeechProgressMark(t, start, len));
            }
        }
    }

    private static void ApplyWinRtProxyVoiceForCulture(Windows.Media.SpeechSynthesis.SpeechSynthesizer synth, string voiceCulture)
    {
        string norm = string.IsNullOrWhiteSpace(voiceCulture) ? "ko-KR" : voiceCulture.Trim().Replace('_', '-');
        Windows.Media.SpeechSynthesis.VoiceInformation? prefixMatch = null;
        foreach (Windows.Media.SpeechSynthesis.VoiceInformation v in Windows.Media.SpeechSynthesis.SpeechSynthesizer.AllVoices)
        {
            if (string.Equals(v.Language, norm, StringComparison.OrdinalIgnoreCase))
            {
                synth.Voice = v;
                return;
            }

            if (norm.Length >= 2)
            {
                string prefix = norm.Substring(0, 2);
                if (v.Language.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) && prefixMatch is null)
                {
                    prefixMatch = v;
                }
            }
        }

        if (prefixMatch is not null)
        {
            synth.Voice = prefixMatch;
        }
    }

    private static bool TryWinRtPlainTextSynthesizeForWordMarks(
        string text,
        in SynthOptions options,
        CancellationToken token,
        out byte[]? winRtWav,
        out List<SpeechProgressMark>? winRtMarks)
    {
        winRtWav = null;
        winRtMarks = null;
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        try
        {
            var marks = new List<SpeechProgressMark>();
            var synth = new Windows.Media.SpeechSynthesis.SpeechSynthesizer();
            synth.Options.IncludeWordBoundaryMetadata = true;
            ApplyWinRtProxyVoiceForCulture(synth, options.VoiceCulture);
            synth.Options.SpeakingRate = MapSapiRateToWinRtSpeakingRate(options.Rate);
            double vol = options.SynthVolume / 100.0;
            if (vol < 0.0)
            {
                vol = 0.0;
            }
            else if (vol > 1.0)
            {
                vol = 1.0;
            }

            synth.Options.AudioVolume = vol;

            var op = synth.SynthesizeTextToStreamAsync(text);
            while (op.Status == AsyncStatus.Started)
            {
                if (token.IsCancellationRequested)
                {
                    op.Cancel();
                    return false;
                }

                Thread.Sleep(25);
            }

            if (op.Status != AsyncStatus.Completed)
            {
                return false;
            }

            using Windows.Media.SpeechSynthesis.SpeechSynthesisStream stream = op.GetResults();
            PopulateWinRtWordMarksToList(stream, text, marks);
            using Stream net = stream.AsStreamForRead();
            using var ms = new MemoryStream();
            net.CopyTo(ms);
            byte[] wav = ms.ToArray();
            if (marks.Count == 0 || !IsLikelyWavePcm(wav))
            {
                return false;
            }

            winRtWav = wav;
            winRtMarks = marks;
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static void TryReplaceSapiSyncMarksWithWinRtScaledWordTiming(
        string text,
        in SynthOptions options,
        CancellationToken token,
        SpeechSyncTrack? syncTrack,
        byte[] sapiWav)
    {
        if (syncTrack is null || sapiWav.Length == 0)
        {
            return;
        }

        double ts = TryGetWavDurationSeconds(sapiWav);
        if (ts < 1e-3)
        {
            return;
        }

        try
        {
            if (!TryWinRtPlainTextSynthesizeForWordMarks(text, in options, token, out byte[]? winRtWav, out List<SpeechProgressMark>? winRtMarks)
                || winRtMarks is null
                || winRtMarks.Count == 0
                || winRtWav is null
                || winRtWav.Length == 0)
            {
                return;
            }

            double tw = TryGetWavDurationSeconds(winRtWav);
            if (tw < 1e-3)
            {
                return;
            }

            double scale = ts / tw;
            var scaled = new List<SpeechProgressMark>(winRtMarks.Count);
            foreach (SpeechProgressMark m in winRtMarks)
            {
                scaled.Add(new SpeechProgressMark(m.TimeSec * scale, m.CharStart, m.CharLength));
            }

            scaled.Sort((a, b) => a.TimeSec.CompareTo(b.TimeSec));
            syncTrack.ReplaceMarksFromWinRtScaledForSapiPlayback(scaled);
        }
        catch
        {
            // SpeakProgress / 선형 마크 유지
        }
    }

    private List<SpeechProgressMark> _playbackSpeechMarks = new();
    private bool _playbackSpeechLinear;
    /// <summary>SAPI <see cref="SpeechSynthesisMethod.SystemSpeechSapi"/> 의 SpeakProgress 마크로 동기할 때만 true.</summary>
    private bool _playbackTextSyncSapiMarks;
    private string _playbackSpeechSourceText = "";

    public MainForm()
    {
        // InitializeComponent may paint panelWaveform; PanelWaveform_Paint reads _waveTimer.Interval.
        // 재생 헤드·텍스트 동기: 너무 길면 커서가 오디오보다 늦게 느껴짐(NAudio WaveOut 기본 300ms 버퍼).
        _waveTimer = new System.Windows.Forms.Timer { Interval = 16 };
        InitializeComponent();

        if (LicenseManager.UsageMode == LicenseUsageMode.Designtime)
        {
            return;
        }

        ApplyFormIconFromDaemonHammer();
        typeof(Control).InvokeMember(
            "DoubleBuffered",
            BindingFlags.SetProperty | BindingFlags.Instance | BindingFlags.NonPublic,
            null,
            panelWaveform,
            new object[] { true });
        typeof(Control).InvokeMember(
            "DoubleBuffered",
            BindingFlags.SetProperty | BindingFlags.Instance | BindingFlags.NonPublic,
            null,
            panelSynthCard,
            new object[] { true });
        typeof(Control).InvokeMember(
            "DoubleBuffered",
            BindingFlags.SetProperty | BindingFlags.Instance | BindingFlags.NonPublic,
            null,
            this,
            new object[] { true });
        typeof(Control).InvokeMember(
            "DoubleBuffered",
            BindingFlags.SetProperty | BindingFlags.Instance | BindingFlags.NonPublic,
            null,
            panelBody,
            new object[] { true });
        foreach (Control c in new Control[] { panelBottomBar, panelVolumeHost, flowBottomButtons })
        {
            typeof(Control).InvokeMember(
                "DoubleBuffered",
                BindingFlags.SetProperty | BindingFlags.Instance | BindingFlags.NonPublic,
                null,
                c,
                new object[] { true });
        }

        ApplyModernTheme();
        panelSynthCard.Paint += PanelSynthCard_Paint;

        _waveTimer.Tick += WaveTimer_Tick;
        _waveTimer.Start();

        UpdateVolumeLabel();
        UpdateRateLabel();
        UpdateWaveGainLabel();
        UpdateSynthVolLabel();
        UpdatePitchLabel();
        ConfigurePlaybackStopGlyphs();
        _waveRulerFont = new Font(Font.FontFamily, 8.25f, FontStyle.Regular, GraphicsUnit.Point);
        panelWaveform.SizeChanged += PanelWaveform_SizeChanged;
        panelWaveform.MouseDown += PanelWaveform_MouseDown;
        panelWaveform.MouseMove += PanelWaveform_MouseMove;
        panelWaveform.MouseUp += PanelWaveform_MouseUp;
        panelWaveform.MouseLeave += PanelWaveform_MouseLeave;
        Load += MainForm_Load;
        comboBoxSynthMethod.SelectedIndexChanged += ComboBoxSynthMethod_SelectedIndexChanged;
    }

    private void ApplyFormIconFromDaemonHammer()
    {
        Icon? icon = TryLoadDaemonHammerIcon();
        if (icon is not null)
        {
            Icon = icon;
        }
    }

    private static Icon? TryLoadDaemonHammerIcon()
    {
        string[] dirs =
        {
            AppContext.BaseDirectory,
            Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location) ?? "",
            Path.GetDirectoryName(Application.ExecutablePath) ?? "",
        };

        foreach (string dir in dirs)
        {
            if (string.IsNullOrWhiteSpace(dir))
            {
                continue;
            }

            string path = Path.Combine(dir, "daemon_hammer.ico");
            if (!File.Exists(path))
            {
                continue;
            }

            try
            {
                return new Icon(path);
            }
            catch (ArgumentException)
            {
            }
            catch (IOException)
            {
            }
        }

        return null;
    }

    private void PanelWaveform_SizeChanged(object? sender, EventArgs e)
    {
        TrimPeakRingToCapacity();
        panelWaveform.Invalidate();
    }

    private void ApplyModernTheme()
    {
        Font uiFont = TryCreateUiFont(10.25f) ?? new Font("Segoe UI", 10.25f, FontStyle.Regular, GraphicsUnit.Point);
        Font uiFontSemi = new Font(uiFont.FontFamily, 11f, FontStyle.Bold, GraphicsUnit.Point);

        Color appBg = Color.FromArgb(243, 245, 249);
        Color surface = Color.White;
        Color cardFrame = Color.FromArgb(248, 249, 252);
        Color border = Color.FromArgb(210, 216, 228);
        Color textPrimary = Color.FromArgb(26, 32, 44);
        Color textMuted = Color.FromArgb(100, 108, 124);
        Color accent = Color.FromArgb(0, 120, 212);
        Color accentDark = Color.FromArgb(0, 92, 168);

        Font = uiFont;
        BackColor = appBg;
        ForeColor = textPrimary;

        panelBody.BackColor = appBg;
        panelBody.Padding = new Padding(20, 16, 20, 16);

        textBoxContent.Font = uiFont;
        textBoxContent.BackColor = surface;
        textBoxContent.ForeColor = textPrimary;
        textBoxContent.BorderStyle = BorderStyle.FixedSingle;
        textBoxContent.Margin = new Padding(0, 0, 0, 12);

        panelSynthCard.BackColor = cardFrame;
        panelSynthCard.Padding = new Padding(18, 16, 18, 16);
        labelSynthTitle.Font = uiFontSemi;
        labelSynthTitle.ForeColor = textPrimary;
        labelSynthTitle.BackColor = Color.Transparent;

        foreach (Label lbl in new[] { labelVoice, labelRate, labelSynthVol, labelPitch, labelEmphasis, labelWaveGain, labelVolume, labelSynthMethod })
        {
            lbl.Font = uiFont;
            lbl.ForeColor = textMuted;
            lbl.BackColor = Color.Transparent;
        }

        labelRateValue.Font = uiFont;
        labelRateValue.ForeColor = textPrimary;
        labelRateValue.BackColor = Color.Transparent;
        labelSynthVolPct.Font = uiFont;
        labelSynthVolPct.ForeColor = textPrimary;
        labelSynthVolPct.BackColor = Color.Transparent;
        labelPitchValue.Font = uiFont;
        labelPitchValue.ForeColor = textPrimary;
        labelPitchValue.BackColor = Color.Transparent;
        labelWaveGainPct.Font = uiFont;
        labelWaveGainPct.ForeColor = textPrimary;
        labelWaveGainPct.BackColor = Color.Transparent;

        panelBottomBar.BackColor = appBg;
        panelVolumeHost.BackColor = appBg;
        panelBottomBar.Padding = new Padding(0, 6, 0, 10);
        flowBottomButtons.Padding = new Padding(0, 2, 0, 6);

        Color dropDownFieldBack = Color.FromArgb(250, 251, 253);
        ApplyDropDownFieldStyle(comboBoxSynthMethod, dropDownFieldBack, textPrimary, uiFont);
        ApplyDropDownFieldStyle(comboBoxVoice, dropDownFieldBack, textPrimary, uiFont);
        ApplyDropDownFieldStyle(comboBoxEmphasis, dropDownFieldBack, textPrimary, uiFont);

        ApplySecondaryChrome(buttonOpenFile, surface, textPrimary, border);
        ApplyPrimaryChrome(buttonSave, accent, accentDark, surface);

        panelWaveform.BackColor = Color.FromArgb(22, 26, 36);
        panelWaveform.Margin = new Padding(0, 0, 0, 12);

        foreach (TrackBar tb in new[] { trackBarRate, trackBarSynthVol, trackBarPitch, trackBarWaveGain })
        {
            tb.BackColor = surface;
            tb.TickStyle = TickStyle.None;
        }

        trackBarPitch.SmallChange = 1;
        trackBarPitch.LargeChange = 1;
        trackBarVolume.BackColor = appBg;
        trackBarVolume.TickStyle = TickStyle.None;

        statusLabel.ForeColor = textMuted;
        statusLabel.Font = uiFont;
        statusLabel.Margin = new Padding(10, 3, 10, 3);
        statusStrip.Padding = new Padding(4, 5, 16, 5);

        // ToolTip의 BackColor/ForeColor는 환경에 따라 유효하지 않아 예외가 날 수 있음.
    }

    private static void PanelSynthCard_Paint(object? sender, PaintEventArgs e)
    {
        if (sender is not Panel p)
        {
            return;
        }

        Graphics g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        Rectangle bounds = p.ClientRectangle;
        bounds.Width--;
        bounds.Height--;

        const int inset = 5;
        Rectangle inner = bounds;
        inner.Inflate(-inset, -inset);

        Rectangle shadow = inner;
        shadow.Offset(1, 2);
        using (var sh = new SolidBrush(Color.FromArgb(28, 60, 80, 120)))
        {
            g.FillRectangle(sh, shadow);
        }

        using (var fill = new SolidBrush(Color.White))
        {
            g.FillRectangle(fill, inner);
        }

        using var pen = new Pen(Color.FromArgb(218, 224, 236), 1f);
        g.DrawRectangle(pen, inner);
    }

    private static Font? TryCreateUiFont(float sizePt)
    {
        foreach (string name in new[] { "Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI" })
        {
            try
            {
                return new Font(name, sizePt, FontStyle.Regular, GraphicsUnit.Point);
            }
            catch (ArgumentException)
            {
            }
            catch
            {
            }
        }

        return null;
    }

    private static void ApplyDropDownFieldStyle(ComboBox cb, Color fieldBack, Color fieldFore, Font font)
    {
        cb.FlatStyle = FlatStyle.Flat;
        cb.BackColor = fieldBack;
        cb.ForeColor = fieldFore;
        cb.Font = font;
    }

    private static void ApplySecondaryChrome(Button b, Color surface, Color text, Color border)
    {
        b.FlatStyle = FlatStyle.Flat;
        b.UseVisualStyleBackColor = false;
        b.Cursor = Cursors.Hand;
        b.FlatAppearance.BorderSize = 1;
        b.FlatAppearance.BorderColor = border;
        b.BackColor = surface;
        b.ForeColor = text;
        b.FlatAppearance.MouseOverBackColor = Color.FromArgb(240, 244, 250);
        b.FlatAppearance.MouseDownBackColor = Color.FromArgb(228, 234, 246);
    }

    private static void ApplyPrimaryChrome(Button b, Color accent, Color accentPressed, Color onAccent)
    {
        b.FlatStyle = FlatStyle.Flat;
        b.UseVisualStyleBackColor = false;
        b.Cursor = Cursors.Hand;
        b.FlatAppearance.BorderSize = 0;
        b.BackColor = accent;
        b.ForeColor = onAccent;
        b.FlatAppearance.MouseOverBackColor = Color.FromArgb(
            Math.Min(255, accent.R + 18),
            Math.Min(255, accent.G + 12),
            Math.Min(255, accent.B + 10));
        b.FlatAppearance.MouseDownBackColor = accentPressed;
    }

    private void ConfigurePlaybackStopGlyphs()
    {
        ApplyTransportChrome(buttonSpeak, accentPlay: true);
        ApplyTransportChrome(buttonStop, accentPlay: false);

        DisposeTransportButtonImages();

        string playPath = Path.Combine(AppContext.BaseDirectory, "Assets", "play.png");
        string stopPath = Path.Combine(AppContext.BaseDirectory, "Assets", "stop.png");
        Bitmap? playBmp = null;
        Bitmap? stopBmp = null;
        if (TryLoadPng(playPath, out playBmp) && TryLoadPng(stopPath, out stopBmp) && playBmp != null && stopBmp != null)
        {
            _transportPlayIcon = playBmp;
            _transportStopIcon = stopBmp;
            buttonSpeak.Image = _transportPlayIcon;
            buttonStop.Image = _transportStopIcon;
            buttonSpeak.Text = "";
            buttonStop.Text = "";
            buttonSpeak.ImageAlign = ContentAlignment.MiddleCenter;
            buttonStop.ImageAlign = ContentAlignment.MiddleCenter;
            buttonSpeak.Font = (Font)Font.Clone();
            buttonStop.Font = (Font)Font.Clone();
            buttonSpeak.TextAlign = ContentAlignment.MiddleCenter;
            buttonStop.TextAlign = ContentAlignment.MiddleCenter;
            return;
        }

        playBmp?.Dispose();
        stopBmp?.Dispose();

        Font glyphFont = TryCreateGlyphFont("Segoe MDL2 Assets", 17f)
            ?? TryCreateGlyphFont("Segoe UI Symbol", 15f)
            ?? new Font(Font.FontFamily, 13f, FontStyle.Regular, GraphicsUnit.Point);

        bool isMdl2 = glyphFont.Name.StartsWith("Segoe MDL2", StringComparison.OrdinalIgnoreCase);

        buttonSpeak.Text = isMdl2 ? "\uE102" : "\u25B6";
        buttonStop.Text = isMdl2 ? "\uE15B" : "\u23F9";
        buttonSpeak.Font = glyphFont;
        buttonStop.Font = (Font)glyphFont.Clone();
        buttonSpeak.TextAlign = ContentAlignment.MiddleCenter;
        buttonStop.TextAlign = ContentAlignment.MiddleCenter;
    }

    private static bool TryLoadPng(string path, out Bitmap? bmp)
    {
        bmp = null;
        if (!File.Exists(path))
        {
            return false;
        }

        try
        {
            bmp = new Bitmap(path);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private void DisposeTransportButtonImages()
    {
        buttonSpeak.Image = null;
        buttonStop.Image = null;
        _transportPlayIcon?.Dispose();
        _transportStopIcon?.Dispose();
        _transportPlayIcon = null;
        _transportStopIcon = null;
    }

    private static void ApplyTransportChrome(Button b, bool accentPlay)
    {
        b.FlatStyle = FlatStyle.Flat;
        b.UseVisualStyleBackColor = false;
        b.Cursor = Cursors.Hand;
        b.FlatAppearance.BorderSize = 0;
        if (accentPlay)
        {
            Color play = Color.FromArgb(0, 120, 212);
            b.BackColor = play;
            b.ForeColor = Color.White;
            b.FlatAppearance.BorderColor = play;
            b.FlatAppearance.MouseOverBackColor = Color.FromArgb(38, 148, 232);
            b.FlatAppearance.MouseDownBackColor = Color.FromArgb(0, 96, 176);
        }
        else
        {
            Color stop = Color.FromArgb(196, 60, 68);
            b.BackColor = stop;
            b.ForeColor = Color.White;
            b.FlatAppearance.BorderColor = stop;
            b.FlatAppearance.MouseOverBackColor = Color.FromArgb(220, 88, 94);
            b.FlatAppearance.MouseDownBackColor = Color.FromArgb(168, 48, 54);
        }
    }

    private static Font? TryCreateGlyphFont(string familyName, float emSize)
    {
        try
        {
            return new Font(familyName, emSize, FontStyle.Regular, GraphicsUnit.Point);
        }
        catch (ArgumentException)
        {
            return null;
        }
        catch
        {
            return null;
        }
    }

    private void MainForm_Load(object? sender, EventArgs e)
    {
        EnsureSynthMethodComboItems();
        PopulateSynthVoicesForCurrentMethod(preferCultureFromCurrentVoice: false);
        if (comboBoxEmphasis.Items.Count > 0 && comboBoxEmphasis.SelectedIndex < 0)
        {
            comboBoxEmphasis.SelectedIndex = 0;
        }

        textBoxContent.HideSelection = false;

        if (!_waveWheelFilterRegistered)
        {
            Application.AddMessageFilter(this);
            _waveWheelFilterRegistered = true;
        }
    }

    private void TrackBarRate_Scroll(object? sender, EventArgs e)
    {
        UpdateRateLabel();
    }

    private void TrackBarWaveGain_Scroll(object? sender, EventArgs e)
    {
        UpdateWaveGainLabel();
        panelWaveform.Invalidate();
    }

    private void TrackBarSynthVol_Scroll(object? sender, EventArgs e)
    {
        UpdateSynthVolLabel();
    }

    private void TrackBarPitch_Scroll(object? sender, EventArgs e)
    {
        UpdatePitchLabel();
    }

    private void UpdateSynthVolLabel()
    {
        labelSynthVolPct.Text = $"{trackBarSynthVol.Value}%";
    }

    private void UpdatePitchLabel()
    {
        int p = trackBarPitch.Value;
        labelPitchValue.Text = p == 0 ? "0 (기본)" : $"{p} 반음";
    }

    private void UpdateWaveGainLabel()
    {
        labelWaveGainPct.Text = $"{trackBarWaveGain.Value}%";
    }

    private void UpdateRateLabel()
    {
        int r = trackBarRate.Value;
        string hint = r switch
        {
            0 => "기본",
            < 0 => "느리게",
            _ => "빠르게",
        };
        labelRateValue.Text = $"{r} ({hint})";
    }

    private void EnsureSynthMethodComboItems()
    {
        if (comboBoxSynthMethod.Items.Count > 0)
        {
            if (comboBoxSynthMethod.SelectedIndex < 0)
            {
                comboBoxSynthMethod.SelectedIndex = 0;
            }

            return;
        }

        comboBoxSynthMethod.Items.Add(new SynthMethodItem(
            SpeechSynthesisMethod.SystemSpeechSapi,
            "SAPI 5 (.NET System.Speech) — 데스크톱 설치 음성"));
        comboBoxSynthMethod.Items.Add(new SynthMethodItem(
            SpeechSynthesisMethod.WindowsMediaWinRt,
            "WinRT (Windows.Media.SpeechSynthesis) — 시스템 음성"));
        comboBoxSynthMethod.Items.Add(new SynthMethodItem(
            SpeechSynthesisMethod.SherpaOnnxKoreanMimic3KssLow,
            "Sherpa ONNX — 한국어 (Mimic3 KSS low, 오프라인 · 모델 폴더 필요)"));
        comboBoxSynthMethod.SelectedIndex = 0;
    }

    private SpeechSynthesisMethod GetSelectedSynthMethod()
    {
        return comboBoxSynthMethod.SelectedItem is SynthMethodItem sm
            ? sm.Method
            : SpeechSynthesisMethod.SystemSpeechSapi;
    }

    private void ComboBoxSynthMethod_SelectedIndexChanged(object? sender, EventArgs e)
    {
        if (!IsHandleCreated)
        {
            return;
        }

        PopulateSynthVoicesForCurrentMethod(preferCultureFromCurrentVoice: true);
    }

    private void PopulateSynthVoicesForCurrentMethod(bool preferCultureFromCurrentVoice)
    {
        string? cultureHint = preferCultureFromCurrentVoice && comboBoxVoice.SelectedItem is VoiceEntry cur
            ? cur.CultureName
            : null;

        string? engineDefault = GetSelectedSynthMethod() switch
        {
            SpeechSynthesisMethod.WindowsMediaWinRt => PopulateWinRtVoices(),
            SpeechSynthesisMethod.SherpaOnnxKoreanMimic3KssLow => PopulateSherpaOnnxKoreanVoices(),
            _ => PopulateSapiVoices(),
        };

        string? preferName = null;
        if (cultureHint is { } ch && !string.IsNullOrWhiteSpace(ch))
        {
            string hint = ch.Trim();
            string prefix = hint.Length >= 2 ? hint.Substring(0, 2) : hint;
            preferName = _allVoiceEntries
                .FirstOrDefault(v =>
                    v.CultureName.StartsWith(hint, StringComparison.OrdinalIgnoreCase)
                    || v.CultureName.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                ?.Name;
        }

        RefreshVoiceCombo(preferName ?? engineDefault);
    }

    private string? PopulateSapiVoices()
    {
        _allVoiceEntries.Clear();
        using var probe = new SpeechSynthesizer();
        string? defaultVoiceName = probe.Voice?.Name;

        foreach (InstalledVoice installed in probe.GetInstalledVoices())
        {
            if (!installed.Enabled)
            {
                continue;
            }

            VoiceInfo info = installed.VoiceInfo;
            string caption = $"{info.Description}  ({info.Culture.Name})";
            _allVoiceEntries.Add(new VoiceEntry(info.Name, caption, info.Culture.Name));
        }

        _allVoiceEntries.Sort((a, b) => string.Compare(a.Caption, b.Caption, StringComparison.CurrentCultureIgnoreCase));
        return defaultVoiceName;
    }

    private string? PopulateSherpaOnnxKoreanVoices()
    {
        _allVoiceEntries.Clear();
        bool ok = SherpaOnnxKoreanTts.TryResolveModelDirectory() is not null;
        string caption = ok
            ? "KSS 한국어 (Sherpa ONNX · Mimic3 low, 화자 0)"
            : "KSS 한국어 (Sherpa ONNX) — 첫 재생 시 받기 · 경로는 SherpaKoModelDir.txt 또는 환경 변수";
        _allVoiceEntries.Add(new VoiceEntry("0", caption, "ko-KR"));
        return "0";
    }

    private string? PopulateWinRtVoices()
    {
        _allVoiceEntries.Clear();
        try
        {
            foreach (Windows.Media.SpeechSynthesis.VoiceInformation vi in Windows.Media.SpeechSynthesis.SpeechSynthesizer.AllVoices)
            {
                string culture = vi.Language.Replace('_', '-');
                string caption = $"{vi.DisplayName}  ({culture})";
                _allVoiceEntries.Add(new VoiceEntry(vi.Id, caption, culture));
            }

            _allVoiceEntries.Sort((a, b) => string.Compare(a.Caption, b.Caption, StringComparison.CurrentCultureIgnoreCase));
            return Windows.Media.SpeechSynthesis.SpeechSynthesizer.DefaultVoice?.Id;
        }
        catch (Exception)
        {
            return null;
        }
    }

    private void RefreshVoiceCombo(string? preferVoiceName)
    {
        string? preserve = preferVoiceName
            ?? (comboBoxVoice.SelectedItem is VoiceEntry cur ? cur.Name : null);

        comboBoxVoice.Items.Clear();
        foreach (VoiceEntry entry in _allVoiceEntries)
        {
            comboBoxVoice.Items.Add(entry);
        }

        int select = -1;
        if (!string.IsNullOrEmpty(preserve))
        {
            for (int i = 0; i < comboBoxVoice.Items.Count; i++)
            {
                if (comboBoxVoice.Items[i] is VoiceEntry ve && string.Equals(ve.Name, preserve, StringComparison.OrdinalIgnoreCase))
                {
                    select = i;
                    break;
                }
            }
        }

        comboBoxVoice.SelectedIndex = select >= 0 ? select : (comboBoxVoice.Items.Count > 0 ? 0 : -1);
    }

    private SynthOptions GetSynthOptionsFromUi()
    {
        SpeechSynthesisMethod method = GetSelectedSynthMethod();
        string? voiceName = null;
        string? voiceCulture = null;
        if (comboBoxVoice.SelectedItem is VoiceEntry ve)
        {
            voiceName = ve.Name;
            voiceCulture = ve.CultureName;
        }

        int rate = trackBarRate.Value;
        rate = rate < -10 ? -10 : (rate > 10 ? 10 : rate);
        int synthVol = trackBarSynthVol.Value;
        synthVol = synthVol < 0 ? 0 : (synthVol > 100 ? 100 : synthVol);
        int pitch = trackBarPitch.Value;
        pitch = pitch < -5 ? -5 : (pitch > 5 ? 5 : pitch);
        SynthEmphasis emphasis = comboBoxEmphasis.SelectedIndex switch
        {
            2 => SynthEmphasis.Strong,
            1 => SynthEmphasis.Moderate,
            _ => SynthEmphasis.None,
        };

        return new SynthOptions(method, voiceName, voiceCulture, rate, synthVol, pitch, emphasis);
    }

    private readonly struct SynthOptions
    {
        public SynthOptions(
            SpeechSynthesisMethod method,
            string? voiceName,
            string? voiceCulture,
            int rate,
            int synthVolume,
            int pitchSemitones,
            SynthEmphasis emphasis)
        {
            Method = method;
            VoiceName = voiceName;
            VoiceCulture = string.IsNullOrWhiteSpace(voiceCulture) ? "ko-KR" : voiceCulture!.Trim();
            Rate = rate;
            SynthVolume = synthVolume;
            PitchSemitones = pitchSemitones;
            Emphasis = emphasis;
        }

        public SpeechSynthesisMethod Method { get; }
        public string? VoiceName { get; }
        public string VoiceCulture { get; }
        public int Rate { get; }
        public int SynthVolume { get; }
        public int PitchSemitones { get; }
        public SynthEmphasis Emphasis { get; }
    }

    private sealed class VoiceEntry
    {
        public VoiceEntry(string name, string caption, string cultureName)
        {
            Name = name;
            Caption = caption;
            CultureName = cultureName;
        }

        public string Name { get; }
        public string Caption { get; }
        public string CultureName { get; }

        public override string ToString() => Caption;
    }

    private static void ApplySynthOptions(SpeechSynthesizer synth, SynthOptions options)
    {
        if (!string.IsNullOrWhiteSpace(options.VoiceName))
        {
            try
            {
                synth.SelectVoice(options.VoiceName);
            }
            catch (Exception)
            {
                // 해당 음성을 선택할 수 없으면 기본 음성 유지
            }
        }

        synth.Rate = options.Rate;
        synth.Volume = options.SynthVolume;
    }

    private static string EscapeSsmlText(string text)
    {
        return text
            .Replace("&", "&amp;")
            .Replace("<", "&lt;")
            .Replace(">", "&gt;")
            .Replace("\"", "&quot;")
            .Replace("'", "&apos;");
    }

    private static string? BuildSsmlForSpeak(string plainText, in SynthOptions options)
    {
        bool usePitch = options.PitchSemitones != 0;
        bool useEmphasis = options.Emphasis != SynthEmphasis.None;
        if (!usePitch && !useEmphasis)
        {
            return null;
        }

        string inner = EscapeSsmlText(plainText);
        if (useEmphasis)
        {
            string level = options.Emphasis == SynthEmphasis.Strong ? "strong" : "moderate";
            inner = $"<emphasis level=\"{level}\">{inner}</emphasis>";
        }

        if (usePitch)
        {
            string pitchAttr = options.PitchSemitones > 0
                ? $"+{options.PitchSemitones}st"
                : $"{options.PitchSemitones}st";
            inner = $"<prosody pitch=\"{pitchAttr}\">{inner}</prosody>";
        }

        string lang = SanitizeXmlLang(options.VoiceCulture);
        return "<speak version=\"1.0\" xmlns=\"http://www.w3.org/2001/10/synthesis\" xml:lang=\""
            + lang
            + "\">"
            + inner
            + "</speak>";
    }

    private static string SanitizeXmlLang(string culture)
    {
        if (culture.Length is < 2 or > 32)
        {
            return "ko-KR";
        }

        foreach (char ch in culture)
        {
            if (!(char.IsLetterOrDigit(ch) || ch is '-' or '_'))
            {
                return "ko-KR";
            }
        }

        return culture.Replace("_", "-");
    }

    private float VolumeFactor => trackBarVolume.Value / 100f;

    private void UpdateVolumeLabel()
    {
        labelVolume.Text = $"볼륨 ({trackBarVolume.Value}%)";
    }

    private void TrackBarVolume_Scroll(object? sender, EventArgs e)
    {
        UpdateVolumeLabel();
        if (_volumeProvider is not null)
        {
            _volumeProvider.Volume = VolumeFactor;
        }
    }

    /// <summary>
    /// BOM·UTF-8(무 BOM) 우선, 유효하지 않은 UTF-8이면 시스템 ANSI(예: 한국어 Windows CP949)로 읽습니다.
    /// </summary>
    private static string ReadTextFileWithEncodingDetection(string path)
    {
        byte[] bytes = File.ReadAllBytes(path);
        if (bytes.Length == 0)
        {
            return string.Empty;
        }

        // UTF-8 BOM
        if (bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF)
        {
            return Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3);
        }

        // UTF-16 LE BOM
        if (bytes.Length >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE)
        {
            return Encoding.Unicode.GetString(bytes, 2, bytes.Length - 2);
        }

        // UTF-16 BE BOM
        if (bytes.Length >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF)
        {
            return Encoding.BigEndianUnicode.GetString(bytes, 2, bytes.Length - 2);
        }

        // UTF-32 LE BOM
        if (bytes.Length >= 4 && bytes[0] == 0 && bytes[1] == 0 && bytes[2] == 0xFE && bytes[3] == 0xFF)
        {
            return Encoding.UTF32.GetString(bytes, 4, bytes.Length - 4);
        }

        var strictUtf8 = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);
        try
        {
            return strictUtf8.GetString(bytes);
        }
        catch (DecoderFallbackException)
        {
            return Encoding.Default.GetString(bytes);
        }
        catch (ArgumentException)
        {
            return Encoding.Default.GetString(bytes);
        }
    }

    private void ButtonOpenFile_Click(object? sender, EventArgs e)
    {
        using var dlg = new OpenFileDialog
        {
            Filter = "텍스트 파일 (*.txt)|*.txt|모든 파일 (*.*)|*.*",
            Title = "텍스트 파일 열기",
        };
        if (dlg.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        try
        {
            textBoxContent.Text = ReadTextFileWithEncodingDetection(dlg.FileName);
            SetStatus($"불러옴: {Path.GetFileName(dlg.FileName)}");
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "파일을 열 수 없습니다", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private async void ButtonSpeak_Click(object? sender, EventArgs e)
    {
        string text = textBoxContent.Text;
        if (string.IsNullOrWhiteSpace(text))
        {
            MessageBox.Show(this, "읽을 텍스트를 입력하거나 파일을 여세요.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        StopPlayback(sendStop: false);
        _synthCts?.Cancel();
        _synthCts = new CancellationTokenSource();
        var token = _synthCts.Token;

        _playbackSpeechMarks.Clear();
        _playbackSpeechLinear = true;
        _playbackTextSyncSapiMarks = false;
        _playbackSpeechSourceText = "";

        SetBusy(true);
        _isSynthesizing = true;
        SetStatus("음성 합성 중…");

        SynthOptions synthOptions = GetSynthOptionsFromUi();

        byte[]? wavBytes = null;
        Exception? synthError = null;
        var syncTrack = new SpeechSyncTrack();
        try
        {
            wavBytes = await Task.Run(() => SynthesizeToWavBytes(text, token, synthOptions, syncTrack, ReportSherpaModelStatus)).ConfigureAwait(true);
        }
        catch (OperationCanceledException)
        {
            SetStatus("취소됨");
        }
        catch (Exception ex)
        {
            synthError = ex;
        }
        finally
        {
            _isSynthesizing = false;
            SetBusy(false);
        }

        if (synthError is not null)
        {
            _playbackSpeechMarks.Clear();
            _playbackTextSyncSapiMarks = false;
            _playbackSpeechSourceText = "";
            MessageBox.Show(this, synthError.Message, "합성 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            SetStatus("오류");
            return;
        }

        if (token.IsCancellationRequested)
        {
            _playbackSpeechMarks.Clear();
            _playbackTextSyncSapiMarks = false;
            _playbackSpeechSourceText = "";
            SetStatus("취소됨");
            return;
        }

        if (wavBytes is null || wavBytes.Length == 0)
        {
            _playbackSpeechMarks.Clear();
            _playbackTextSyncSapiMarks = false;
            _playbackSpeechSourceText = "";
            MessageBox.Show(
                this,
                "재생할 오디오 데이터가 없습니다. 합성 결과가 비어 있거나 유효한 WAV가 아닐 수 있습니다.",
                "재생 실패",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            SetStatus("재생 실패");
            return;
        }

        double wavDurationSec = TryGetWavDurationSeconds(wavBytes);
        if (wavDurationSec > 1e-3
            && syncTrack.LinearMode
            && syncTrack.Marks.Count == 0
            && (synthOptions.Method == SpeechSynthesisMethod.WindowsMediaWinRt
                || synthOptions.Method == SpeechSynthesisMethod.SherpaOnnxKoreanMimic3KssLow))
        {
            syncTrack.FinalizeApproximateWordsByWhitespace(text, wavDurationSec);
        }

        _playbackSpeechMarks.Clear();
        _playbackSpeechMarks.AddRange(syncTrack.Marks);
        _playbackSpeechLinear = syncTrack.LinearMode;
        _playbackTextSyncSapiMarks =
            synthOptions.Method == SpeechSynthesisMethod.SystemSpeechSapi
            && !syncTrack.LinearMode
            && syncTrack.Marks.Count > 0
            && !syncTrack.UsesWinRtScaledTiming;
        _playbackSpeechSourceText = text;

        try
        {
            StartPlayback(wavBytes);
        }
        catch (Exception ex)
        {
            string detail = FormatPlaybackFailureMessage("재생을 시작할 수 없습니다. 원인은 다음과 같습니다.", ex);
            MessageBox.Show(this, detail, "재생 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
            SetStatus("재생 실패");
        }
    }

    private void ButtonStop_Click(object? sender, EventArgs e)
    {
        _synthCts?.Cancel();
        StopPlayback(sendStop: true);
        ClearWaveform();
        SetStatus("중지됨");
    }

    private async void ButtonSave_Click(object? sender, EventArgs e)
    {
        await SaveAudioAsync().ConfigureAwait(true);
    }

    private async Task SaveAudioAsync()
    {
        string text = textBoxContent.Text;
        if (string.IsNullOrWhiteSpace(text))
        {
            MessageBox.Show(this, "저장할 텍스트가 없습니다.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var dlg = new SaveFileDialog
        {
            Title = "다른 이름으로 저장",
            Filter = "WAV (*.wav)|*.wav|MP3 (*.mp3)|*.mp3",
            FilterIndex = 1,
            DefaultExt = "wav",
            FileName = "speech.wav",
            OverwritePrompt = true,
            SupportMultiDottedExtensions = true,
        };
        if (dlg.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        string outPath = dlg.FileName;
        bool encodeMp3 = ResolveEncodeMp3(dlg, ref outPath);

        SetBusy(true);
        SetStatus(encodeMp3 ? "MP3 인코딩 중…" : "WAV 저장 중…");
        try
        {
            SynthOptions synthOptions = GetSynthOptionsFromUi();
            byte[] wavBytes = await Task.Run(() =>
            {
                using var cts = new CancellationTokenSource();
                return SynthesizeToWavBytes(text, cts.Token, synthOptions, null) ?? Array.Empty<byte>();
            }).ConfigureAwait(true);

            if (wavBytes.Length == 0)
            {
                MessageBox.Show(this, "합성된 데이터가 없습니다.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            float vol = VolumeFactor;
            if (encodeMp3)
            {
                await Task.Run(() => EncodeToMp3WithFallback(wavBytes, outPath, vol)).ConfigureAwait(true);
            }
            else
            {
                await Task.Run(() => WriteWavWithVolume(wavBytes, outPath, vol)).ConfigureAwait(true);
            }

            SetStatus($"저장됨: {Path.GetFileName(outPath)}");
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "저장 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            SetStatus("저장 실패");
        }
        finally
        {
            SetBusy(false);
        }
    }

    private static bool ResolveEncodeMp3(SaveFileDialog dlg, ref string path)
    {
        if (dlg.FilterIndex == 2)
        {
            string ext = Path.GetExtension(path);
            if (!string.Equals(ext, ".mp3", StringComparison.OrdinalIgnoreCase))
            {
                path = Path.ChangeExtension(path, ".mp3");
            }

            return true;
        }

        if (dlg.FilterIndex == 1)
        {
            string ext = Path.GetExtension(path);
            if (!string.Equals(ext, ".wav", StringComparison.OrdinalIgnoreCase))
            {
                path = Path.ChangeExtension(path, ".wav");
            }

            return false;
        }

        string ext2 = Path.GetExtension(path);
        if (string.Equals(ext2, ".mp3", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (string.IsNullOrEmpty(ext2))
        {
            path = Path.ChangeExtension(path, ".wav");
        }

        return false;
    }

    private static void WriteWavWithVolume(byte[] wavBytes, string path, float volume)
    {
        using var ms = new MemoryStream(wavBytes, writable: false);
        using var reader = new WaveFileReader(ms);
        var samples = new Pcm16BitToSampleProvider(reader);
        var volumeProvider = new VolumeSampleProvider(samples) { Volume = volume };
        WaveFileWriter.CreateWaveFile16(path, volumeProvider);
    }

    private static void EncodeToMp3WithFallback(byte[] wavBytes, string path, float volume)
    {
        MediaFoundationApi.Startup();
        using var ms = new MemoryStream(wavBytes, writable: false);
        using var reader = new WaveFileReader(ms);

        reader.Position = 0;
        var samples = new Pcm16BitToSampleProvider(reader);
        var volumeProvider = new VolumeSampleProvider(samples) { Volume = volume };
        IWaveProvider wave16 = volumeProvider.ToWaveProvider16();
        try
        {
            try
            {
                MediaFoundationEncoder.EncodeToMp3(wave16, path, 192000);
                return;
            }
            catch (InvalidOperationException)
            {
                // encoder / format mismatch — try 44.1 kHz PCM path
            }
        }
        finally
        {
            if (wave16 is IDisposable d16)
            {
                d16.Dispose();
            }
        }

        reader.Position = 0;
        var targetFormat = new WaveFormat(44100, 16, Math.Max(1, reader.WaveFormat.Channels));
        using var resampler = new MediaFoundationResampler(reader, targetFormat);
        var resampled = new Pcm16BitToSampleProvider(resampler);
        var volume2 = new VolumeSampleProvider(resampled) { Volume = volume };
        IWaveProvider wave162 = volume2.ToWaveProvider16();
        try
        {
            MediaFoundationEncoder.EncodeToMp3(wave162, path, 192000);
        }
        finally
        {
            if (wave162 is IDisposable d162)
            {
                d162.Dispose();
            }
        }
    }

    private void StartPlayback(byte[] wavBytes)
    {
        StopPlayback(sendStop: false);

        var ms = new MemoryStream(wavBytes, writable: false);
        _playReader = new WaveFileReader(ms);
        TryBakeWaveformEnvelope(_playReader);
        _playReader.Position = 0;
        _lastPlaybackSec = 0;
        _waveViewStartSec = 0;
        ResetVuBarHistory();

        _volumeProvider = new VolumeSampleProvider(new Pcm16BitToSampleProvider(_playReader)) { Volume = VolumeFactor };
        _peakProbe = new PeakProbe(_volumeProvider);

        _waveOut = new WaveOutEvent
        {
            DesiredLatency = 60,
            NumberOfBuffers = 4,
        };
        _waveOut.PlaybackStopped += WaveOut_PlaybackStopped;
        _waveOut.Init(_peakProbe.ToWaveProvider16());
        _isPlaying = true;
        _waveOut.Play();
        buttonSpeak.Enabled = false;
        SetStatus("재생 중…");
        panelWaveform.Invalidate();
    }

    private void WaveOut_PlaybackStopped(object? sender, StoppedEventArgs e)
    {
        if (InvokeRequired)
        {
            BeginInvoke(() => WaveOut_PlaybackStopped(sender, e));
            return;
        }

        if (_playReader is not null)
        {
            try
            {
                _lastPlaybackSec = Math.Max(0, _playReader.TotalTime.TotalSeconds);
            }
            catch
            {
                _lastPlaybackSec = Math.Max(_lastPlaybackSec, _bakedWaveDurationSec);
            }
        }

        _isPlaying = false;
        bool playbackFailed = e.Exception is not null;
        if (playbackFailed)
        {
            Exception ex = e.Exception!;
            string detail = FormatPlaybackFailureMessage("재생이 중단되었습니다. 원인은 다음과 같습니다.", ex);
            MessageBox.Show(this, detail, "재생 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }

        DisposePlaybackGraph();
        buttonSpeak.Enabled = !_isSynthesizing;
        SetStatus(playbackFailed ? "재생 실패" : "준비됨");
        if (!playbackFailed)
        {
            if (_playbackUserAbort)
            {
                ClearPlaybackTextSelection();
                _playbackUserAbort = false;
            }
            else
            {
                ApplyPlaybackCompletedTextSelection();
            }
        }
        else
        {
            ClearPlaybackTextSelection();
        }

        panelWaveform.Invalidate();
    }

    private void StopPlayback(bool sendStop)
    {
        if (sendStop)
        {
            _playbackUserAbort = true;
        }
        else
        {
            _playbackUserAbort = false;
        }

        if (_waveOut is not null)
        {
            try
            {
                if (sendStop)
                {
                    _waveOut.Stop();
                }
                else
                {
                    _waveOut.Stop();
                }
            }
            catch
            {
                // ignore
            }
        }

        DisposePlaybackGraph();
        _isPlaying = false;
        if (!_isSynthesizing)
        {
            buttonSpeak.Enabled = true;
        }

        if (sendStop)
        {
            ClearPlaybackTextSelection();
        }
    }

    private void DisposePlaybackGraph()
    {
        if (_waveOut is not null)
        {
            try
            {
                _waveOut.PlaybackStopped -= WaveOut_PlaybackStopped;
                _waveOut.Dispose();
            }
            catch
            {
                // ignore
            }

            _waveOut = null;
        }

        _peakProbe = null;
        _volumeProvider = null;
        _playReader?.Dispose();
        _playReader = null;
    }

    /// <summary>
    /// WinMM 장치가 실제로 재생한 바이트 기준 시각. <see cref="WaveStream.CurrentTime"/>은 출력 버퍼 때문에
    /// 들리는 소리와 어긋날 수 있어, 텍스트·파형 헤드는 이 값을 우선합니다.
    /// </summary>
    private bool TryGetPlaybackSecondsFromWaveOut(out double seconds)
    {
        seconds = 0;
        if (_waveOut is null)
        {
            return false;
        }

        try
        {
            WaveFormat wf = _waveOut.OutputWaveFormat;
            int bps = wf.AverageBytesPerSecond;
            int ba = wf.BlockAlign;
            if (bps <= 0 || ba <= 0)
            {
                return false;
            }

            long pos = _waveOut.GetPosition();
            pos -= pos % ba;
            if (pos < 0)
            {
                return false;
            }

            seconds = pos / (double)bps;
            return true;
        }
        catch
        {
            return false;
        }
    }

    private void WaveTimer_Tick(object? sender, EventArgs e)
    {
        if (_isPlaying && _playReader is not null)
        {
            try
            {
                if (TryGetPlaybackSecondsFromWaveOut(out double devSec))
                {
                    double total = Math.Max(1e-9, _playReader.TotalTime.TotalSeconds);
                    _lastPlaybackSec = ClampDouble(devSec, 0, total);
                }
                else
                {
                    _lastPlaybackSec = _playReader.CurrentTime.TotalSeconds;
                }
            }
            catch
            {
                _lastPlaybackSec = 0;
            }
        }

        if (_isPlaying && _peakProbe is not null)
        {
            float peak = VisualGain(_peakProbe.DrainPeak());
            PushVuBar(peak);
            if (_bakedWavePeaks.Length == 0)
            {
                PushPeak(peak);
            }
        }
        else
        {
            if (_bakedWavePeaks.Length == 0)
            {
                PushPeak(0f);
            }
        }

        if (_bakedWavePeaks.Length > 0 && _bakedWaveDurationSec > 1e-6 && _isPlaying)
        {
            double span = GetVisibleSpanSec();
            double maxStart = Math.Max(0, _bakedWaveDurationSec - span);
            double want = _lastPlaybackSec - span * 0.22;
            _waveViewStartSec = ClampDouble(want, 0, maxStart);
        }

        if (!_waveformScrubDrag)
        {
            UpdatePlaybackTextSelection();
        }

        panelWaveform.Invalidate();
    }

    private float VisualGain(float samplePeak)
    {
        float gain = trackBarWaveGain.Value / 100f;
        float v = samplePeak * 5f * gain;
        if (v < 0f)
        {
            return 0f;
        }

        return v > 1f ? 1f : v;
    }

    private int PeakRingCapacity()
    {
        int w = Math.Max(8, panelWaveform.ClientSize.Width);
        return Math.Max(4096, w * 40);
    }

    private void TrimPeakRingToCapacity()
    {
        int cap = PeakRingCapacity();
        while (_peakRing.Count > cap)
        {
            _peakRing.RemoveAt(0);
        }
    }

    private void PushPeak(float value)
    {
        _peakRing.Add(value);
        TrimPeakRingToCapacity();
    }

    private void ClearWaveform()
    {
        _peakRing.Clear();
        _bakedWavePeaks = Array.Empty<float>();
        _bakedWaveValleys = Array.Empty<float>();
        _bakedWaveDurationSec = 0;
        _waveViewStartSec = 0;
        _lastPlaybackSec = 0;
        ResetVuBarHistory();
        _playbackSpeechMarks.Clear();
        _playbackSpeechLinear = false;
        _playbackTextSyncSapiMarks = false;
        _playbackSpeechSourceText = "";
        panelWaveform.Invalidate();
    }

    private void ClearPlaybackTextSelection()
    {
        if (!textBoxContent.IsHandleCreated)
        {
            return;
        }

        try
        {
            int len = textBoxContent.TextLength;
            int pos = textBoxContent.SelectionStart;
            if (pos > len)
            {
                pos = len;
            }

            textBoxContent.Select(pos, 0);
        }
        catch
        {
            // ignore
        }
    }

    private void ApplyPlaybackCompletedTextSelection()
    {
        if (_playbackSpeechSourceText.Length == 0)
        {
            return;
        }

        if (!string.Equals(textBoxContent.Text, _playbackSpeechSourceText, StringComparison.Ordinal))
        {
            return;
        }

        try
        {
            textBoxContent.Select(0, _playbackSpeechSourceText.Length);
        }
        catch
        {
            // ignore
        }
    }

    private static int FindLastSpeechMarkIndex(IReadOnlyList<SpeechProgressMark> marks, double tSec)
    {
        if (marks.Count == 0)
        {
            return -1;
        }

        int lo = 0;
        int hi = marks.Count - 1;
        int ans = -1;
        while (lo <= hi)
        {
            int mid = (lo + hi) >> 1;
            if (marks[mid].TimeSec <= tSec + 1e-6)
            {
                ans = mid;
                lo = mid + 1;
            }
            else
            {
                hi = mid - 1;
            }
        }

        return ans;
    }

    private void UpdatePlaybackTextSelection()
    {
        if (!_isPlaying || !textBoxContent.IsHandleCreated)
        {
            return;
        }

        string tb = textBoxContent.Text;
        if (!string.Equals(tb, _playbackSpeechSourceText, StringComparison.Ordinal))
        {
            return;
        }

        int n = tb.Length;
        int selStart;
        int selLen;

        if (_playbackSpeechLinear || _playbackSpeechMarks.Count == 0)
        {
            double total = _playReader is not null
                ? Math.Max(1e-6, _playReader.TotalTime.TotalSeconds)
                : (_bakedWaveDurationSec > 1e-6 ? _bakedWaveDurationSec : 1.0);
            int end = ClampInt((int)Math.Round(n * (_lastPlaybackSec / total)), 0, n);
            selStart = 0;
            selLen = end;
        }
        else
        {
            double audioTotal = _playReader is not null
                ? Math.Max(1e-6, _playReader.TotalTime.TotalSeconds)
                : (_bakedWaveDurationSec > 1e-6 ? _bakedWaveDurationSec : 1.0);

            int caret = ComputeCaretIndexFromPlaybackTime(_lastPlaybackSec, tb, audioTotal);
            // 길이 0 선택은 포커스가 없으면 커서가 그려지지 않습니다. SAPI처럼 비포커스에서도
            // 진행 위치가 보이도록 현재 글자 하나를 선택합니다(HideSelection=false일 때 회색 강조).
            if (n <= 0)
            {
                selStart = 0;
                selLen = 0;
            }
            else if (caret >= n)
            {
                selStart = n - 1;
                selLen = 1;
            }
            else
            {
                selStart = caret;
                selLen = 1;
            }
        }

        if (textBoxContent.SelectionStart == selStart && textBoxContent.SelectionLength == selLen)
        {
            return;
        }

        try
        {
            textBoxContent.Select(selStart, selLen);
            if (!_playbackSpeechLinear && _playbackSpeechMarks.Count > 0)
            {
                textBoxContent.ScrollToCaret();
                SendMessage(textBoxContent.Handle, EmScrollCaret, IntPtr.Zero, IntPtr.Zero);
            }
            else if (selLen == 0)
            {
                textBoxContent.ScrollToCaret();
                SendMessage(textBoxContent.Handle, EmScrollCaret, IntPtr.Zero, IntPtr.Zero);
            }
        }
        catch
        {
            // ignore
        }
    }

    private static void FillWaveScratchFromRing(List<float> ring, float[] scratch, int take)
    {
        int have = ring.Count;
        if (have == 0)
        {
            Array.Clear(scratch, 0, take);
            return;
        }

        int copy = Math.Min(take, have);
        int pad = take - copy;
        for (int z = 0; z < pad; z++)
        {
            scratch[z] = 0f;
        }

        int start = have - copy;
        for (int i = 0; i < copy; i++)
        {
            scratch[pad + i] = ring[start + i];
        }
    }

    private static float SampleWaveScratch(float[] scratch, int take, float t)
    {
        if (take <= 1)
        {
            return scratch[0];
        }

        if (t <= 0f)
        {
            return scratch[0];
        }

        if (t >= take - 1)
        {
            return scratch[take - 1];
        }

        int i0 = (int)t;
        float f = t - i0;
        return scratch[i0] * (1f - f) + scratch[i0 + 1] * f;
    }

    private static int ClampInt(int v, int lo, int hi) => v < lo ? lo : (v > hi ? hi : v);

    private static double ClampDouble(double v, double lo, double hi) => v < lo ? lo : (v > hi ? hi : v);

    private static float ClampFloat(float v, float lo, float hi) => v < lo ? lo : (v > hi ? hi : v);

    /// <summary>재생 실패 팝업에 표시할 예외 정보(형식, 메시지, HRESULT, 내부 예외)를 정리합니다.</summary>
    private static string FormatPlaybackFailureMessage(string headline, Exception? ex)
    {
        const int maxLen = 3800;
        var sb = new StringBuilder();
        sb.Append(headline);
        if (ex is null)
        {
            string s0 = sb.ToString();
            return s0.Length > maxLen ? s0.Substring(0, maxLen - 1) + "…" : s0;
        }

        sb.AppendLine();
        sb.AppendLine();
        Exception? cur = ex;
        for (int depth = 0; cur is not null && depth < 12; depth++, cur = cur.InnerException)
        {
            string typeName = cur.GetType().Name;
            string msg = cur.Message.Trim();
            if (string.IsNullOrEmpty(msg))
            {
                sb.AppendLine("• " + typeName);
            }
            else
            {
                sb.AppendLine("• " + typeName + ": " + msg);
            }

            if (cur is COMException com)
            {
                sb.AppendLine("  HRESULT: 0x" + ((uint)com.HResult).ToString("X8"));
            }
        }

        string s = sb.ToString().TrimEnd();
        if (s.Length > maxLen)
        {
            return s.Substring(0, maxLen - 1) + "…";
        }

        return s;
    }

    private void PushVuBar(float sample01)
    {
        _vuBarHistory[_vuBarHead] = sample01;
        _vuBarHead = (_vuBarHead + 1) % _vuBarHistory.Length;
        if (_vuBarCount < _vuBarHistory.Length)
        {
            _vuBarCount++;
        }
    }

    private void ResetVuBarHistory()
    {
        _vuBarHead = 0;
        _vuBarCount = 0;
        Array.Clear(_vuBarHistory, 0, _vuBarHistory.Length);
    }

    private double GetVisibleSpanSec()
    {
        if (_bakedWaveDurationSec <= 1e-9)
        {
            return 1.0;
        }

        double mag = ClampDouble(_waveHorizontalMag, 0.25, 12.0);
        double span = _bakedWaveDurationSec / mag;
        return ClampDouble(span, 0.05, _bakedWaveDurationSec);
    }

    private void TryBakeWaveformEnvelope(WaveFileReader reader)
    {
        _bakedWavePeaks = Array.Empty<float>();
        _bakedWaveValleys = Array.Empty<float>();
        _bakedWaveDurationSec = 0;

        try
        {
            double totalSec = reader.TotalTime.TotalSeconds;
            if (totalSec <= 1e-6 || reader.Length <= reader.WaveFormat.BlockAlign)
            {
                return;
            }

            int bucketCount = ClampInt(Math.Max(panelWaveform.ClientSize.Width, 320) * 3, 2048, 12000);
            var peaks = new float[bucketCount];
            var valleys = new float[bucketCount];
            reader.Position = 0;
            var sp = new Pcm16BitToSampleProvider(reader);
            int ch = sp.WaveFormat.Channels;
            if (ch < 1)
            {
                return;
            }

            long estFrames = Math.Max(
                1L,
                (long)Math.Round(reader.WaveFormat.SampleRate * totalSec));
            long frameIndex = 0;
            float[] buf = new float[ch * 65536];
            while (true)
            {
                int got = sp.Read(buf, 0, buf.Length);
                if (got <= 0)
                {
                    break;
                }

                int frames = got / ch;
                for (int f = 0; f < frames; f++)
                {
                    float hi = 0f;
                    float lo = 0f;
                    for (int c = 0; c < ch; c++)
                    {
                        float s = buf[f * ch + c];
                        if (s > hi) hi = s;
                        if (s < lo) lo = s;
                    }

                    long fi = frameIndex + f;
                    int bi = (int)(fi * (long)bucketCount / estFrames);
                    if (bi >= bucketCount)
                    {
                        bi = bucketCount - 1;
                    }

                    if (hi > peaks[bi]) peaks[bi] = hi;
                    if (lo < valleys[bi]) valleys[bi] = lo;
                }

                frameIndex += frames;
            }

            float maxAbs = 1e-6f;
            for (int i = 0; i < bucketCount; i++)
            {
                if (peaks[i] > maxAbs) maxAbs = peaks[i];
                if (-valleys[i] > maxAbs) maxAbs = -valleys[i];
            }

            float inv = 1f / maxAbs;
            for (int i = 0; i < bucketCount; i++)
            {
                peaks[i] = ClampFloat(peaks[i] * inv, 0f, 1f);
                valleys[i] = ClampFloat(valleys[i] * inv, -1f, 0f);
            }

            _bakedWavePeaks = peaks;
            _bakedWaveValleys = valleys;
            _bakedWaveDurationSec = totalSec;
        }
        catch
        {
            _bakedWavePeaks = Array.Empty<float>();
            _bakedWaveValleys = Array.Empty<float>();
            _bakedWaveDurationSec = 0;
        }
    }

    private float SampleBakedAtTimeSeconds(double tSec)
    {
        float[] p = _bakedWavePeaks;
        if (p.Length == 0 || _bakedWaveDurationSec <= 1e-9)
        {
            return 0f;
        }

        if (tSec <= 0)
        {
            return p[0];
        }

        if (tSec >= _bakedWaveDurationSec)
        {
            return p[p.Length - 1];
        }

        double u = tSec / _bakedWaveDurationSec * (p.Length - 1);
        int i0 = (int)u;
        if (i0 >= p.Length - 1)
        {
            return p[p.Length - 1];
        }

        float f = (float)(u - i0);
        return p[i0] * (1f - f) + p[i0 + 1] * f;
    }

    private float SampleBakedValleyAtTimeSeconds(double tSec)
    {
        float[] p = _bakedWaveValleys;
        if (p.Length == 0 || _bakedWaveDurationSec <= 1e-9)
        {
            return 0f;
        }

        if (tSec <= 0)
        {
            return p[0];
        }

        if (tSec >= _bakedWaveDurationSec)
        {
            return p[p.Length - 1];
        }

        double u = tSec / _bakedWaveDurationSec * (p.Length - 1);
        int i0 = (int)u;
        if (i0 >= p.Length - 1)
        {
            return p[p.Length - 1];
        }

        float frac = (float)(u - i0);
        return p[i0] * (1f - frac) + p[i0 + 1] * frac;
    }

    private static void GetWaveformPanelLayout(Rectangle client, out Rectangle plotRect, out Rectangle rulerRect)
    {
        GetWaveformPanelLayout(client, out plotRect, out rulerRect, out _);
    }

    private static void GetWaveformPanelLayout(Rectangle client, out Rectangle plotRect, out Rectangle rulerRect, out Rectangle yAxisRect)
    {
        const int preferRulerH = 26;
        const int yAxisW = 38;

        int rulerH = Math.Min(preferRulerH, Math.Max(16, client.Height / 5));
        if (rulerH >= client.Height - 8)
        {
            rulerH = Math.Max(12, client.Height / 6);
        }

        int plotHeight = Math.Max(10, client.Height - rulerH);
        int pw = Math.Max(2, client.Width - yAxisW);
        yAxisRect = new Rectangle(client.X, client.Y, yAxisW, plotHeight);
        plotRect = new Rectangle(client.X + yAxisW, client.Y, pw, plotHeight);
        rulerRect = new Rectangle(client.X + yAxisW, client.Y + plotHeight, pw, rulerH);
    }

    private bool TryGetPlaybackTimeFromWaveformPoint(System.Drawing.Point clientPt, bool clampHorizontalOnly, out double tSec)
    {
        tSec = 0;
        if (!_isPlaying || _playReader is null)
        {
            return false;
        }

        GetWaveformPanelLayout(panelWaveform.ClientRectangle, out Rectangle plotRect, out _);
        if (!clampHorizontalOnly && !plotRect.Contains(clientPt))
        {
            return false;
        }

        double total = Math.Max(1e-6, _playReader.TotalTime.TotalSeconds);
        int w = plotRect.Width;
        if (w < 2)
        {
            return false;
        }

        int x = ClampInt(clientPt.X, plotRect.Left, Math.Max(plotRect.Left, plotRect.Right - 1));
        double frac = (x - plotRect.Left) / (double)(w - 1);

        if (_bakedWavePeaks.Length > 0 && _bakedWaveDurationSec > 1e-9)
        {
            double viewSpan = GetVisibleSpanSec();
            double maxStart = Math.Max(0, _bakedWaveDurationSec - viewSpan);
            double viewStart = ClampDouble(_waveViewStartSec, 0, maxStart);
            tSec = viewStart + frac * viewSpan;
        }
        else
        {
            tSec = frac * total;
        }

        tSec = ClampDouble(tSec, 0, total);
        return true;
    }

    private int ComputeCaretIndexFromPlaybackTime(double tSec, string tb, double audioTotalSec)
    {
        int n = tb.Length;
        if (n <= 0)
        {
            return 0;
        }

        double total = audioTotalSec > 1e-6 ? audioTotalSec : 1.0;

        if (_playbackTextSyncSapiMarks && !_playbackSpeechLinear && _playbackSpeechMarks.Count > 0)
        {
            // SpeakProgress의 AudioPosition이 재생 헤드·실제 발화보다 약간 늦게 잡히는 경우가 있어 소량 선행합니다.
            const double sapiTextSyncLeadSec = 0.038;
            tSec = Math.Min(total, tSec + sapiTextSyncLeadSec);
        }

        if (_playbackSpeechLinear || _playbackSpeechMarks.Count == 0)
        {
            return ClampInt((int)Math.Round(n * (tSec / total)), 0, n);
        }

        int idx = FindLastSpeechMarkIndex(_playbackSpeechMarks, tSec);
        if (idx < 0)
        {
            return ClampInt((int)Math.Round(n * (tSec / total)), 0, n);
        }

        if (tSec >= total - 0.05)
        {
            return n;
        }

        SpeechProgressMark m = _playbackSpeechMarks[idx];
        int wStart = ClampInt(m.CharStart, 0, n);
        int wEndEx = ClampInt(m.CharEndExclusive, wStart, n);
        if (idx + 1 < _playbackSpeechMarks.Count)
        {
            int nextStart = ClampInt(_playbackSpeechMarks[idx + 1].CharStart, 0, n);
            wEndEx = Math.Min(wEndEx, nextStart);
        }

        if (idx == _playbackSpeechMarks.Count - 1
            && tSec > m.TimeSec + 0.02
            && total > 1e-6
            && tSec >= total - 0.05)
        {
            wEndEx = n;
        }

        double t0 = m.TimeSec;
        double t1 = idx + 1 < _playbackSpeechMarks.Count
            ? _playbackSpeechMarks[idx + 1].TimeSec
            : total;
        if (t1 <= t0 + 1e-9)
        {
            t1 = t0 + 1e-6;
        }

        double u = (tSec - t0) / (t1 - t0);
        u = ClampDouble(u, 0, 1);

        int span = wEndEx - wStart;
        if (span <= 0)
        {
            return wStart;
        }

        int maxOffset = span - 1;
        int offset = maxOffset == 0 ? 0 : ClampInt((int)Math.Round(u * maxOffset), 0, maxOffset);
        return ClampInt(wStart + offset, 0, n);
    }

    private void SeekPlaybackToSeconds(double tSec)
    {
        if (_playReader is null || !_isPlaying)
        {
            return;
        }

        try
        {
            double total = Math.Max(0, _playReader.TotalTime.TotalSeconds);
            double clamped = ClampDouble(tSec, 0, Math.Max(0, total - 0.01));
            _playReader.CurrentTime = TimeSpan.FromSeconds(clamped);
            _lastPlaybackSec = clamped;

            if (_bakedWavePeaks.Length > 0 && _bakedWaveDurationSec > 1e-6)
            {
                double span = GetVisibleSpanSec();
                double maxStart = Math.Max(0, _bakedWaveDurationSec - span);
                double want = clamped - span * 0.22;
                _waveViewStartSec = ClampDouble(want, 0, maxStart);
            }

            ApplyTextCaretFromPlaybackSeconds(clamped);
            panelWaveform.Invalidate();
        }
        catch
        {
            // ignore seek errors
        }
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    private const int EmScrollCaret = 0x00B7;

    private void ApplyTextCaretFromPlaybackSeconds(double tSec)
    {
        if (!textBoxContent.IsHandleCreated)
        {
            return;
        }

        string tb = textBoxContent.Text;
        if (!string.Equals(tb, _playbackSpeechSourceText, StringComparison.Ordinal))
        {
            return;
        }

        double audioTotal = _playReader is not null
            ? Math.Max(1e-6, _playReader.TotalTime.TotalSeconds)
            : (_bakedWaveDurationSec > 1e-6 ? _bakedWaveDurationSec : 1.0);

        int caret = ComputeCaretIndexFromPlaybackTime(tSec, tb, audioTotal);
        if (textBoxContent.SelectionStart == caret && textBoxContent.SelectionLength == 0)
        {
            ScrollTextCaretIntoView();
            return;
        }

        try
        {
            textBoxContent.Focus();
            textBoxContent.Select(caret, 0);
            textBoxContent.ScrollToCaret();
            SendMessage(textBoxContent.Handle, EmScrollCaret, IntPtr.Zero, IntPtr.Zero);
        }
        catch
        {
            // ignore
        }
    }

    private void ScrollTextCaretIntoView()
    {
        if (!textBoxContent.IsHandleCreated)
        {
            return;
        }

        try
        {
            SendMessage(textBoxContent.Handle, EmScrollCaret, IntPtr.Zero, IntPtr.Zero);
        }
        catch
        {
            // ignore
        }
    }

    private void PanelWaveform_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left)
        {
            return;
        }

        if (!TryGetPlaybackTimeFromWaveformPoint(e.Location, clampHorizontalOnly: false, out double t))
        {
            return;
        }

        _waveformScrubDrag = true;
        panelWaveform.Capture = true;
        SeekPlaybackToSeconds(t);
    }

    private void PanelWaveform_MouseMove(object? sender, MouseEventArgs e)
    {
        if (!_waveformScrubDrag)
        {
            bool can = _isPlaying && _playReader is not null;
            GetWaveformPanelLayout(panelWaveform.ClientRectangle, out Rectangle plotRect, out _);
            panelWaveform.Cursor = can && plotRect.Contains(e.Location) ? Cursors.Hand : Cursors.Default;
            return;
        }

        if (TryGetPlaybackTimeFromWaveformPoint(e.Location, clampHorizontalOnly: true, out double t))
        {
            SeekPlaybackToSeconds(t);
        }
    }

    private void PanelWaveform_MouseUp(object? sender, MouseEventArgs e)
    {
        if (!_waveformScrubDrag)
        {
            return;
        }

        _waveformScrubDrag = false;
        panelWaveform.Capture = false;
        panelWaveform.Cursor = Cursors.Default;
        UpdatePlaybackTextSelection();
        panelWaveform.Invalidate();
    }

    private void PanelWaveform_MouseLeave(object? sender, EventArgs e)
    {
        if (!_waveformScrubDrag)
        {
            panelWaveform.Cursor = Cursors.Default;
        }
    }

    private void PanelWaveform_Paint(object? sender, PaintEventArgs e)
    {
        var g = e.Graphics;
        var rect = panelWaveform.ClientRectangle;
        using (var bg = new SolidBrush(panelWaveform.BackColor))
        {
            g.FillRectangle(bg, rect);
        }

        GetWaveformPanelLayout(rect, out Rectangle plotRect, out Rectangle rulerRect, out Rectangle yAxisRect);

        int w = plotRect.Width;
        if (w < 2)
        {
            return;
        }

        int midY = plotRect.Y + plotRect.Height / 2;
        float gain = trackBarWaveGain.Value / 100f;
        float amp = plotRect.Height * 0.48f * Math.Max(0.15f, gain);
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.None;
        DrawWaveformHorizontalGrid(g, plotRect);
        if (_waveRulerFont is not null)
        {
            DrawWaveformAmplitudeYAxis(g, yAxisRect, midY, amp);
        }

        if (_bakedWavePeaks.Length > 0 && _bakedWaveDurationSec > 1e-9)
        {
            double viewSpan = GetVisibleSpanSec();
            double maxStart = Math.Max(0, _bakedWaveDurationSec - viewSpan);
            double viewStart = ClampDouble(_waveViewStartSec, 0, maxStart);

            DrawWaveformTimeVerticalTicksAbsolute(g, plotRect, viewStart, viewSpan);

            using (var axisPen = new Pen(Color.FromArgb(88, 90, 110, 130), 1f))
            {
                g.DrawLine(axisPen, plotRect.Left, midY, plotRect.Right, midY);
            }

            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.None;
            using var wavePen = new Pen(Color.FromArgb(210, 110, 175, 245), 1f);
            float denom = Math.Max(1f, w - 1);

            for (int px = 0; px < w; px++)
            {
                double u = viewStart + (px / denom) * viewSpan;
                float vHi = SampleBakedAtTimeSeconds(u);
                float vLo = SampleBakedValleyAtTimeSeconds(u);
                float x = plotRect.X + px;
                float yTop = midY - vHi * amp;
                float yBot = midY - vLo * amp;
                g.DrawLine(wavePen, x, yTop, x, Math.Max(yTop + 1f, yBot));
            }

            double headT = _lastPlaybackSec;
            if (headT >= viewStart - 1e-6 && headT <= viewStart + viewSpan + 1e-6)
            {
                float playX = plotRect.X + (float)((headT - viewStart) / viewSpan * (w - 1));
                DrawPlayhead(g, plotRect, playX);
            }

            if (rulerRect.Height > 4 && _waveRulerFont is not null)
            {
                DrawWaveformTimeRulerBaked(g, rulerRect, plotRect, viewStart, viewSpan);
            }

            return;
        }

        int take = Math.Max(2, (int)Math.Round(w / (double)_waveHorizontalMag));
        take = Math.Min(take, 65536);
        if (_wavePaintScratch.Length < take)
        {
            _wavePaintScratch = new float[take];
        }

        FillWaveScratchFromRing(_peakRing, _wavePaintScratch, take);

        double dtSec = _waveTimer.Interval / 1000.0;
        double windowSec = Math.Max(take * dtSec, dtSec);

        DrawWaveformTimeVerticalTicksLegacy(g, plotRect, windowSec);

        using (var axisPen = new Pen(Color.FromArgb(88, 90, 110, 130), 1f))
        {
            g.DrawLine(axisPen, plotRect.Left, midY, plotRect.Right, midY);
        }

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.None;
        using var wavePenLegacy = new Pen(Color.FromArgb(235, 120, 190, 255), 1f);
        float denomL = Math.Max(1f, w - 1);
        float legacyAmp = plotRect.Height * 0.48f;
        for (int px = 0; px < w; px++)
        {
            float t = px / denomL * (take - 1);
            float v = SampleWaveScratch(_wavePaintScratch, take, t);
            float x = plotRect.X + px;
            float yTop = midY - v * legacyAmp;
            float yBot = midY + v * legacyAmp;
            g.DrawLine(wavePenLegacy, x, yTop, x, Math.Max(yTop + 1f, yBot));
        }

        if (rulerRect.Height > 4 && _waveRulerFont is not null)
        {
            DrawWaveformTimeRulerLegacy(g, rulerRect, plotRect, windowSec, _lastPlaybackSec);
        }
    }

    private static void DrawWaveformHorizontalGrid(Graphics g, Rectangle plotRect)
    {
        if (plotRect.Width < 2 || plotRect.Height < 2)
        {
            return;
        }

        using var gridPen = new Pen(Color.FromArgb(38, 110, 120, 140), 1f);
        const int DivY = 8;
        for (int j = 1; j < DivY; j++)
        {
            float y = plotRect.Y + j * (plotRect.Height / (float)DivY);
            g.DrawLine(gridPen, plotRect.Left, y, plotRect.Right, y);
        }
    }

    private void DrawWaveformAmplitudeYAxis(Graphics g, Rectangle yAxisRect, int midY, float amp)
    {
        if (yAxisRect.Width < 14 || yAxisRect.Height < 20)
        {
            return;
        }

        Font font = _waveRulerFont ?? SystemFonts.SmallCaptionFont;

        using var sepPen = new Pen(Color.FromArgb(55, 100, 110, 130), 1f);
        g.DrawLine(sepPen, yAxisRect.Right - 1, yAxisRect.Top, yAxisRect.Right - 1, yAxisRect.Bottom);

        (float level, string label)[] marks =
        {
            (1.0f, "+1"), (0.5f, "+½"), (0.0f, "0"), (-0.5f, "-½"), (-1.0f, "-1")
        };
        using var textBrush = new SolidBrush(Color.FromArgb(160, 185, 195, 215));
        using var tickPen = new Pen(Color.FromArgb(65, 100, 110, 130), 1f);
        using var sf = new StringFormat { Alignment = StringAlignment.Far, LineAlignment = StringAlignment.Center };

        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
        foreach (var (level, label) in marks)
        {
            float y = midY - level * amp;
            if (y < yAxisRect.Top - 2 || y > yAxisRect.Bottom + 2)
            {
                continue;
            }

            g.DrawLine(tickPen, yAxisRect.Right - 5, y, yAxisRect.Right - 1, y);
            var lr = new RectangleF(yAxisRect.X, y - 8f, yAxisRect.Width - 7f, 16f);
            g.DrawString(label, font, textBrush, lr, sf);
        }
    }

    private static void DrawWaveformTimeVerticalTicksLegacy(Graphics g, Rectangle plotRect, double windowSec)
    {
        if (plotRect.Width < 2 || windowSec <= 0)
        {
            return;
        }

        int w = plotRect.Width;
        int approxTicks = Math.Max(4, Math.Min(16, w / 72));
        double step = NiceTimeStep(windowSec, approxTicks);
        if (step <= 0)
        {
            step = windowSec / approxTicks;
        }

        using var tickPen = new Pen(Color.FromArgb(48, 100, 120, 150), 1f);
        double t0 = Math.Ceiling(-windowSec / step) * step - step;
        for (double t = t0; t <= step * 0.5; t += step)
        {
            if (t < -windowSec - 1e-9 || t > 1e-9)
            {
                continue;
            }

            float x = plotRect.X + (float)((t + windowSec) / windowSec * (w - 1));
            if (x < plotRect.Left - 1 || x > plotRect.Right + 1)
            {
                continue;
            }

            g.DrawLine(tickPen, x, plotRect.Top, x, plotRect.Bottom);
        }
    }

    private static void DrawWaveformTimeVerticalTicksAbsolute(Graphics g, Rectangle plotRect, double viewStartSec, double viewSpanSec)
    {
        if (plotRect.Width < 2 || viewSpanSec <= 0)
        {
            return;
        }

        int w = plotRect.Width;
        int approxTicks = Math.Max(4, Math.Min(16, w / 72));
        double step = NiceTimeStep(viewSpanSec, approxTicks);
        if (step <= 0)
        {
            step = viewSpanSec / approxTicks;
        }

        using var tickPen = new Pen(Color.FromArgb(48, 100, 120, 150), 1f);
        double tMark = Math.Floor(viewStartSec / step) * step;
        double endT = viewStartSec + viewSpanSec + step * 0.5;
        for (; tMark <= endT; tMark += step)
        {
            if (tMark < viewStartSec - 1e-9 || tMark > viewStartSec + viewSpanSec + 1e-9)
            {
                continue;
            }

            float x = plotRect.X + (float)((tMark - viewStartSec) / viewSpanSec * (w - 1));
            if (x < plotRect.Left - 1 || x > plotRect.Right + 1)
            {
                continue;
            }

            g.DrawLine(tickPen, x, plotRect.Top, x, plotRect.Bottom);
        }
    }

    private static void DrawPlayhead(Graphics g, Rectangle plotRect, float centerX)
    {
        const float barW = 2.5f;
        using var barBrush = new SolidBrush(Color.FromArgb(170, 220, 40, 40));
        g.FillRectangle(barBrush, centerX - barW / 2f, plotRect.Top + 1, barW, plotRect.Height - 2);
        using var linePen = new Pen(Color.FromArgb(240, 255, 110, 110), 1f);
        g.DrawLine(linePen, centerX, plotRect.Top + 1, centerX, plotRect.Bottom - 1);
    }

    private void DrawWaveformTimeRulerBaked(Graphics g, Rectangle rulerRect, Rectangle plotRect, double viewStartSec, double viewSpanSec)
    {
        Font font = _waveRulerFont ?? SystemFonts.SmallCaptionFont;

        using var bandBrush = new SolidBrush(Color.FromArgb(255, 14, 17, 22));
        g.FillRectangle(bandBrush, rulerRect);
        using var sepPen = new Pen(Color.FromArgb(60, 80, 100, 130), 1f);
        g.DrawLine(sepPen, rulerRect.Left, rulerRect.Top, rulerRect.Right, rulerRect.Top);

        string span =
            $"재생 {FormatSecondsCompact(_lastPlaybackSec)} / {FormatSecondsCompact(_bakedWaveDurationSec)} · "
            + $"보기 {FormatSecondsCompact(viewStartSec)}–{FormatSecondsCompact(viewStartSec + viewSpanSec)}";

        using var smallBrush = new SolidBrush(Color.FromArgb(140, 120, 130, 150));
        using var sfRight = new StringFormat { Alignment = StringAlignment.Far, LineAlignment = StringAlignment.Center };
        var spanRect = new RectangleF(rulerRect.X + 4, rulerRect.Y, rulerRect.Width - 8, rulerRect.Height);
        g.DrawString(span, font, smallBrush, spanRect, sfRight);

        int w = plotRect.Width;
        if (w < 2)
        {
            return;
        }

        int approxTicks = Math.Max(4, Math.Min(16, w / 72));
        double step = NiceTimeStep(viewSpanSec, approxTicks);
        if (step <= 0)
        {
            step = viewSpanSec / approxTicks;
        }

        using var tickPen = new Pen(Color.FromArgb(72, 130, 150, 175), 1f);
        using var minorTickPen = new Pen(Color.FromArgb(40, 100, 120, 150), 1f);
        using var textBrush = new SolidBrush(Color.FromArgb(210, 190, 200, 220));
        using var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };

        double halfStep = step / 2;
        double tMinor = Math.Floor(viewStartSec / halfStep) * halfStep;
        for (; tMinor <= viewStartSec + viewSpanSec + halfStep * 0.5; tMinor += halfStep)
        {
            if (tMinor < viewStartSec - 1e-9 || tMinor > viewStartSec + viewSpanSec + 1e-9)
            {
                continue;
            }

            bool isMajor = Math.Abs((tMinor / step) - Math.Round(tMinor / step)) < 0.01;
            if (isMajor)
            {
                continue;
            }

            float x = plotRect.X + (float)((tMinor - viewStartSec) / viewSpanSec * (w - 1));
            if (x >= rulerRect.Left - 1 && x <= rulerRect.Right + 1)
            {
                g.DrawLine(minorTickPen, x, rulerRect.Top, x, rulerRect.Top + 3);
            }
        }

        double tMark = Math.Floor(viewStartSec / step) * step;
        double endT = viewStartSec + viewSpanSec + step * 0.5;
        for (; tMark <= endT; tMark += step)
        {
            if (tMark < viewStartSec - 1e-9 || tMark > viewStartSec + viewSpanSec + 1e-9)
            {
                continue;
            }

            float x = plotRect.X + (float)((tMark - viewStartSec) / viewSpanSec * (w - 1));
            if (x < rulerRect.Left - 2 || x > rulerRect.Right + 2)
            {
                continue;
            }

            g.DrawLine(tickPen, x, rulerRect.Top, x, rulerRect.Top + 7);
            string label = FormatTimeSecondsLabel(tMark, step);
            var layout = new RectangleF(x - 36, rulerRect.Top + 7, 72, rulerRect.Height - 7);
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
            g.DrawString(label, font, textBrush, layout, sf);
        }
    }

    private void DrawWaveformTimeRulerLegacy(Graphics g, Rectangle rulerRect, Rectangle plotRect, double windowSec, double playbackOffsetSec)
    {
        Font font = _waveRulerFont ?? SystemFonts.SmallCaptionFont;

        using var bandBrush = new SolidBrush(Color.FromArgb(255, 14, 17, 22));
        g.FillRectangle(bandBrush, rulerRect);
        using var sepPen = new Pen(Color.FromArgb(60, 80, 100, 130), 1f);
        g.DrawLine(sepPen, rulerRect.Left, rulerRect.Top, rulerRect.Right, rulerRect.Top);

        string span;
        if (playbackOffsetSec > 1e-6 && _playReader is not null)
        {
            double total = Math.Max(0, _playReader.TotalTime.TotalSeconds);
            span = $"재생 {FormatSecondsCompact(playbackOffsetSec)} / {FormatSecondsCompact(total)} · 창 {FormatSecondsCompact(windowSec)}";
        }
        else
        {
            span = $"{FormatSecondsCompact(windowSec)} · 틱 {_waveTimer.Interval} ms";
        }

        using var smallBrush = new SolidBrush(Color.FromArgb(140, 120, 130, 150));
        using var sfRight = new StringFormat { Alignment = StringAlignment.Far, LineAlignment = StringAlignment.Center };
        var spanRect = new RectangleF(rulerRect.X + 4, rulerRect.Y, rulerRect.Width - 8, rulerRect.Height);
        g.DrawString(span, font, smallBrush, spanRect, sfRight);

        int w = plotRect.Width;
        if (w < 2)
        {
            return;
        }

        int approxTicks = Math.Max(4, Math.Min(16, w / 72));
        double step = NiceTimeStep(windowSec, approxTicks);
        if (step <= 0)
        {
            step = windowSec / approxTicks;
        }

        using var tickPen = new Pen(Color.FromArgb(72, 130, 150, 175), 1f);
        using var minorTickPen = new Pen(Color.FromArgb(40, 100, 120, 150), 1f);
        using var textBrush = new SolidBrush(Color.FromArgb(210, 190, 200, 220));
        using var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };

        double halfStep = step / 2;
        double tMinorStart = Math.Ceiling(-windowSec / halfStep) * halfStep - halfStep;
        for (double t = tMinorStart; t <= halfStep * 0.5; t += halfStep)
        {
            if (t < -windowSec - 1e-9 || t > 1e-9)
            {
                continue;
            }

            bool isMajor = Math.Abs((t / step) - Math.Round(t / step)) < 0.01;
            if (isMajor)
            {
                continue;
            }

            float x = plotRect.X + (float)((t + windowSec) / windowSec * (w - 1));
            if (x >= rulerRect.Left - 1 && x <= rulerRect.Right + 1)
            {
                g.DrawLine(minorTickPen, x, rulerRect.Top, x, rulerRect.Top + 3);
            }
        }

        double tStart = Math.Ceiling(-windowSec / step) * step - step;
        for (double t = tStart; t <= step * 0.5; t += step)
        {
            if (t < -windowSec - 1e-9 || t > 1e-9)
            {
                continue;
            }

            float x = plotRect.X + (float)((t + windowSec) / windowSec * (w - 1));
            if (x < rulerRect.Left - 2 || x > rulerRect.Right + 2)
            {
                continue;
            }

            g.DrawLine(tickPen, x, rulerRect.Top, x, rulerRect.Top + 7);
            double labelT = t + playbackOffsetSec;
            string label = FormatTimeSecondsLabel(labelT, step);
            var layout = new RectangleF(x - 36, rulerRect.Top + 7, 72, rulerRect.Height - 7);
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
            g.DrawString(label, font, textBrush, layout, sf);
        }
    }

    private static string FormatTimeSecondsLabel(double tSec, double step)
    {
        if (Math.Abs(tSec) < step * 0.01)
        {
            return "0 초";
        }

        int decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
        string fmt = decimals == 0 ? "F0" : decimals == 1 ? "F1" : "F2";
        return $"{tSec.ToString(fmt, System.Globalization.CultureInfo.InvariantCulture)} 초";
    }

    private static string FormatSecondsCompact(double s)
    {
        if (s >= 10)
        {
            return $"{s:F1} s";
        }

        if (s >= 1)
        {
            return $"{s:F2} s";
        }

        return $"{s:F3} s";
    }

    private static double NiceTimeStep(double rangeSec, int approxTicks)
    {
        if (rangeSec <= 1e-12 || approxTicks < 1)
        {
            return 0.01;
        }

        double rough = rangeSec / approxTicks;
        double exp = Math.Floor(Math.Log10(rough));
        double mant = rough / Math.Pow(10, exp);
        double niceM = mant <= 1 ? 1 : mant <= 2 ? 2 : mant <= 5 ? 5 : 10;
        return niceM * Math.Pow(10, exp);
    }

    private void SetBusy(bool busy)
    {
        buttonSpeak.Enabled = !busy;
        buttonSave.Enabled = !busy;
        buttonOpenFile.Enabled = !busy;
    }

    private void SetStatus(string text)
    {
        statusLabel.Text = text;
    }

    private void ReportSherpaModelStatus(string message)
    {
        if (IsDisposed || !IsHandleCreated)
        {
            return;
        }

        if (InvokeRequired)
        {
            try
            {
                BeginInvoke(new Action(() => SetStatus(message)));
            }
            catch (ObjectDisposedException)
            {
            }
            catch (InvalidOperationException)
            {
                // 핸들이 없거나 창이 닫히는 중 BeginInvoke 불가
            }
        }
        else
        {
            SetStatus(message);
        }
    }

    private static bool IsLikelyWavePcm(byte[] data)
    {
        if (data.Length < 12)
        {
            return false;
        }

        return data[0] == (byte)'R'
            && data[1] == (byte)'I'
            && data[2] == (byte)'F'
            && data[3] == (byte)'F'
            && data[8] == (byte)'W'
            && data[9] == (byte)'A'
            && data[10] == (byte)'V'
            && data[11] == (byte)'E';
    }

    private static double TryGetWavDurationSeconds(byte[] wavBytes)
    {
        try
        {
            using var ms = new MemoryStream(wavBytes, writable: false);
            using var reader = new WaveFileReader(ms);
            return reader.TotalTime.TotalSeconds;
        }
        catch (Exception)
        {
            return 0;
        }
    }

    private static byte[]? SynthesizeToWavBytes(string text, CancellationToken token, SynthOptions options, SpeechSyncTrack? syncTrack, Action<string>? sherpaModelStatus = null)
    {
        if (options.Method == SpeechSynthesisMethod.WindowsMediaWinRt)
        {
            return SynthesizeToWavBytesWinRt(text, token, options, syncTrack);
        }

        if (options.Method == SpeechSynthesisMethod.SherpaOnnxKoreanMimic3KssLow)
        {
            return SynthesizeToWavBytesSherpaOnnxKorean(text, token, options, syncTrack, sherpaModelStatus);
        }

        byte[]? result = null;
        Exception? caught = null;

        var thread = new Thread(() =>
        {
            try
            {
                syncTrack?.Clear();
                using var synth = new SpeechSynthesizer();
                ApplySynthOptions(synth, options);
                using var ms = new MemoryStream();
                synth.SetOutputToWaveStream(ms);
                using var completed = new ManualResetEventSlim(false);

                void OnCompleted(object? _, SpeakCompletedEventArgs __)
                {
                    completed.Set();
                }

                void OnProgress(object? _, SpeakProgressEventArgs e)
                {
                    syncTrack?.AddSpeakProgress(e);
                }

                string? ssml = BuildSsmlForSpeak(text, in options);
                bool ssmlUsed = ssml is not null;
                bool hookProgress = syncTrack is not null && !ssmlUsed;

                synth.SpeakCompleted += OnCompleted;
                if (hookProgress)
                {
                    synth.SpeakProgress += OnProgress;
                }

                try
                {
                    if (ssmlUsed)
                    {
                        synth.SpeakSsmlAsync(ssml!);
                    }
                    else
                    {
                        synth.SpeakAsync(text);
                    }

                    while (!completed.Wait(50))
                    {
                        if (token.IsCancellationRequested)
                        {
                            synth.SpeakAsyncCancelAll();
                        }
                    }
                }
                finally
                {
                    if (hookProgress)
                    {
                        synth.SpeakProgress -= OnProgress;
                    }

                    synth.SpeakCompleted -= OnCompleted;
                }

                if (token.IsCancellationRequested)
                {
                    return;
                }

                result = ms.ToArray();
                if (!IsLikelyWavePcm(result))
                {
                    caught = new InvalidOperationException(
                        "음성 합성 결과가 올바른 WAV 형식이 아닙니다. 다른 음성이나 속도로 다시 시도해 보세요.");
                    result = null;
                    syncTrack?.ForceLinear();
                }
                else
                {
                    syncTrack?.FinalizeFromSapi(text, ssmlUsed);
                    if (!ssmlUsed && result is not null)
                    {
                        TryReplaceSapiSyncMarksWithWinRtScaledWordTiming(text, in options, token, syncTrack, result);
                    }
                }
            }
            catch (Exception ex)
            {
                caught = ex;
                syncTrack?.ForceLinear();
            }
        });

        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();

        if (caught is not null)
        {
            throw caught;
        }

        return result;
    }

    private static double MapSapiRateToWinRtSpeakingRate(int rate)
    {
        int clamped = rate < -10 ? -10 : (rate > 10 ? 10 : rate);
        double v = 1.0 + clamped * 0.1;
        return v < 0.5 ? 0.5 : (v > 3.0 ? 3.0 : v);
    }

    private static byte[]? SynthesizeToWavBytesSherpaOnnxKorean(
        string text,
        CancellationToken token,
        SynthOptions options,
        SpeechSyncTrack? syncTrack,
        Action<string>? sherpaModelStatus)
    {
        byte[]? result = null;
        Exception? caught = null;

        var thread = new Thread(() =>
        {
            try
            {
                syncTrack?.Clear();
                float speed = (float)MapSapiRateToWinRtSpeakingRate(options.Rate);
                int sid = 0;
                if (options.VoiceName is { Length: > 0 } idRaw
                    && int.TryParse(idRaw.Trim(), System.Globalization.NumberStyles.Integer, System.Globalization.CultureInfo.InvariantCulture, out int parsed))
                {
                    sid = parsed;
                }

                float vol01 = options.SynthVolume / 100f;
                if (vol01 < 0f)
                {
                    vol01 = 0f;
                }
                else if (vol01 > 1f)
                {
                    vol01 = 1f;
                }

                byte[] wav = SherpaOnnxKoreanTts.SynthesizeToWavBytes(text, speed, sid, vol01, token, sherpaModelStatus);
                if (!IsLikelyWavePcm(wav))
                {
                    syncTrack?.ForceLinear();
                    caught = new InvalidOperationException("Sherpa ONNX 출력이 올바른 WAV 형식이 아닙니다.");
                    return;
                }

                syncTrack?.ForceLinear();
                result = wav;
            }
            catch (Exception ex)
            {
                caught = ex;
                syncTrack?.ForceLinear();
            }
        });

        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();

        if (caught is not null)
        {
            throw caught;
        }

        return result;
    }

    private static byte[]? SynthesizeToWavBytesWinRt(string text, CancellationToken token, SynthOptions options, SpeechSyncTrack? syncTrack)
    {
        byte[]? result = null;
        Exception? caught = null;

        var thread = new Thread(() =>
        {
            try
            {
                syncTrack?.Clear();
                var synth = new Windows.Media.SpeechSynthesis.SpeechSynthesizer();
                synth.Options.IncludeWordBoundaryMetadata = true;
                if (!string.IsNullOrWhiteSpace(options.VoiceName))
                {
                    foreach (Windows.Media.SpeechSynthesis.VoiceInformation v in Windows.Media.SpeechSynthesis.SpeechSynthesizer.AllVoices)
                    {
                        if (string.Equals(v.Id, options.VoiceName, StringComparison.OrdinalIgnoreCase))
                        {
                            synth.Voice = v;
                            break;
                        }
                    }
                }

                synth.Options.SpeakingRate = MapSapiRateToWinRtSpeakingRate(options.Rate);
                double vol = options.SynthVolume / 100.0;
                if (vol < 0.0)
                {
                    vol = 0.0;
                }
                else if (vol > 1.0)
                {
                    vol = 1.0;
                }

                synth.Options.AudioVolume = vol;

                string? ssml = BuildSsmlForSpeak(text, in options);
                var op = ssml is not null
                    ? synth.SynthesizeSsmlToStreamAsync(ssml)
                    : synth.SynthesizeTextToStreamAsync(text);

                while (op.Status == AsyncStatus.Started)
                {
                    if (token.IsCancellationRequested)
                    {
                        op.Cancel();
                        return;
                    }

                    Thread.Sleep(25);
                }

                if (op.Status == AsyncStatus.Canceled || token.IsCancellationRequested)
                {
                    return;
                }

                if (op.Status == AsyncStatus.Error)
                {
                    try
                    {
                        op.GetResults();
                    }
                    catch (Exception ex)
                    {
                        caught = ex;
                    }

                    return;
                }

                if (op.Status != AsyncStatus.Completed)
                {
                    caught = new InvalidOperationException($"WinRT 합성이 완료되지 않았습니다 (상태: {op.Status}).");
                    return;
                }

                using Windows.Media.SpeechSynthesis.SpeechSynthesisStream stream = op.GetResults();
                bool plainInput = ssml is null;
                syncTrack?.FinalizeFromWinRtStream(stream, text, plainInput);

                using Stream net = stream.AsStreamForRead();
                using var ms = new MemoryStream();
                net.CopyTo(ms);
                result = ms.ToArray();

                if (!IsLikelyWavePcm(result))
                {
                    caught = new InvalidOperationException("WinRT 합성 결과가 올바른 WAV 형식이 아닙니다.");
                    result = null;
                    syncTrack?.ForceLinear();
                }
            }
            catch (Exception ex)
            {
                caught = ex;
                syncTrack?.ForceLinear();
            }
        });

        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();

        if (caught is not null)
        {
            throw caught;
        }

        return result;
    }

    public bool PreFilterMessage(ref Message m)
    {
        const int WM_MOUSEWHEEL = 0x020A;
        if (m.Msg != WM_MOUSEWHEEL || !IsHandleCreated || !Visible)
        {
            return false;
        }

        if (!panelWaveform.RectangleToScreen(panelWaveform.ClientRectangle).Contains(Control.MousePosition))
        {
            return false;
        }

        int delta = unchecked((short)(((uint)(int)m.WParam) >> 16));
        if (delta == 0)
        {
            return false;
        }

        float factor = delta > 0 ? 1.1f : 1f / 1.1f;
        float next = _waveHorizontalMag * factor;
        _waveHorizontalMag = Math.Max(0.25f, Math.Min(12f, next));
        panelWaveform.Invalidate();
        return true;
    }

    protected override void OnSizeChanged(EventArgs e)
    {
        base.OnSizeChanged(e);
        if (!IsHandleCreated || WindowState == FormWindowState.Minimized)
        {
            return;
        }

        // 가로·세로 리사이즈 시 새로 드러난 영역에 이전 프레임이 남는 현상 방지(특히 상단 클라이언트).
        Invalidate(true);
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        if (_waveWheelFilterRegistered)
        {
            Application.RemoveMessageFilter(this);
            _waveWheelFilterRegistered = false;
        }

        _waveRulerFont?.Dispose();
        _waveRulerFont = null;

        DisposeTransportButtonImages();

        panelWaveform.SizeChanged -= PanelWaveform_SizeChanged;
        panelWaveform.MouseDown -= PanelWaveform_MouseDown;
        panelWaveform.MouseMove -= PanelWaveform_MouseMove;
        panelWaveform.MouseUp -= PanelWaveform_MouseUp;
        panelWaveform.MouseLeave -= PanelWaveform_MouseLeave;
        panelSynthCard.Paint -= PanelSynthCard_Paint;
        comboBoxSynthMethod.SelectedIndexChanged -= ComboBoxSynthMethod_SelectedIndexChanged;
        _waveTimer.Stop();
        _waveTimer.Tick -= WaveTimer_Tick;
        _waveTimer.Dispose();
        _synthCts?.Cancel();
        StopPlayback(sendStop: false);
        base.OnFormClosed(e);
    }

    private sealed class PeakProbe : ISampleProvider
    {
        private readonly ISampleProvider _source;
        private readonly object _gate = new();
        private float _peak;

        public PeakProbe(ISampleProvider source)
        {
            _source = source;
            WaveFormat = source.WaveFormat;
        }

        public WaveFormat WaveFormat { get; }

        public int Read(float[] buffer, int offset, int count)
        {
            int read = _source.Read(buffer, offset, count);
            if (read <= 0)
            {
                return read;
            }

            int ch = WaveFormat.Channels;
            float max = 0f;
            for (int i = 0; i < read; i += ch)
            {
                for (int c = 0; c < ch; c++)
                {
                    float s = Math.Abs(buffer[offset + i + c]);
                    if (s > max)
                    {
                        max = s;
                    }
                }
            }

            lock (_gate)
            {
                if (max > _peak)
                {
                    _peak = max;
                }
            }

            return read;
        }

        public float DrainPeak()
        {
            lock (_gate)
            {
                float v = _peak;
                _peak = 0f;
                return v;
            }
        }
    }
}
