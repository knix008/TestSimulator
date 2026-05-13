using System.Drawing;
using System.Linq;
using System.Reflection;
using System.Speech.Synthesis;
using System.Text;
using System.Threading;
using NAudio.MediaFoundation;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace TTSWinV10;

public partial class MainForm : Form
{
    private readonly System.Windows.Forms.Timer _waveTimer;
    private WaveOutEvent? _waveOut;
    private WaveFileReader? _playReader;
    private VolumeSampleProvider? _volumeProvider;
    private PeakProbe? _peakProbe;
    private CancellationTokenSource? _synthCts;
    private float[] _peakHistory = Array.Empty<float>();
    private volatile bool _isPlaying;
    private volatile bool _isSynthesizing;
    private readonly List<VoiceEntry> _allVoiceEntries = new();
    private bool _suppressGenderFilterEvent;

    public MainForm()
    {
        InitializeComponent();
        typeof(Control).InvokeMember(
            "DoubleBuffered",
            BindingFlags.SetProperty | BindingFlags.Instance | BindingFlags.NonPublic,
            null,
            panelWaveform,
            new object[] { true });

        _waveTimer = new System.Windows.Forms.Timer { Interval = 35 };
        _waveTimer.Tick += WaveTimer_Tick;
        _waveTimer.Start();

        UpdateVolumeLabel();
        UpdateRateLabel();
        UpdateWaveGainLabel();
        ConfigurePlaybackStopGlyphs();
        Load += MainForm_Load;
    }

    private void ConfigurePlaybackStopGlyphs()
    {
        ApplyTransportChrome(buttonSpeak, accentPlay: true);
        ApplyTransportChrome(buttonStop, accentPlay: false);

        Font glyphFont = TryCreateGlyphFont("Segoe MDL2 Assets", 17f)
            ?? TryCreateGlyphFont("Segoe UI Symbol", 15f)
            ?? new Font(Font.FontFamily, 13f, FontStyle.Regular, GraphicsUnit.Point);

        bool isMdl2 = glyphFont.Name.StartsWith("Segoe MDL2", StringComparison.OrdinalIgnoreCase);

        buttonSpeak.Text = isMdl2 ? "\uE102" : "\u25B6";
        buttonStop.Text = isMdl2 ? "\uE15B" : "\u23F9";
        buttonSpeak.Font = glyphFont;
        buttonStop.Font = (Font)glyphFont.Clone();
        buttonSpeak.ForeColor = Color.FromArgb(0, 120, 215);
        buttonStop.ForeColor = Color.FromArgb(190, 70, 70);
        buttonSpeak.TextAlign = ContentAlignment.MiddleCenter;
        buttonStop.TextAlign = ContentAlignment.MiddleCenter;
    }

    private static void ApplyTransportChrome(Button b, bool accentPlay)
    {
        b.FlatStyle = FlatStyle.Flat;
        b.UseVisualStyleBackColor = false;
        b.Cursor = Cursors.Hand;
        b.FlatAppearance.BorderSize = 1;
        b.FlatAppearance.BorderColor = Color.FromArgb(210, 213, 220);
        b.BackColor = Color.FromArgb(248, 249, 252);
        if (accentPlay)
        {
            b.FlatAppearance.MouseOverBackColor = Color.FromArgb(228, 241, 255);
            b.FlatAppearance.MouseDownBackColor = Color.FromArgb(204, 228, 255);
        }
        else
        {
            b.FlatAppearance.MouseOverBackColor = Color.FromArgb(255, 236, 236);
            b.FlatAppearance.MouseDownBackColor = Color.FromArgb(255, 214, 214);
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
        PopulateVoices();
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

    private void PopulateVoices()
    {
        EnsureGenderCombo();
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
            string sexLabel = info.Gender switch
            {
                VoiceGender.Female => "여",
                VoiceGender.Male => "남",
                _ => "기타",
            };
            string caption = $"{info.Description}  ({info.Culture.Name}) · {sexLabel}";
            _allVoiceEntries.Add(new VoiceEntry(info.Name, caption, info.Gender));
        }

        _allVoiceEntries.Sort((a, b) => string.Compare(a.Caption, b.Caption, StringComparison.CurrentCultureIgnoreCase));
        RefreshVoiceComboFromFilter(defaultVoiceName, showMessageIfEmpty: false);
    }

    private void EnsureGenderCombo()
    {
        if (comboBoxGender.Items.Count > 0)
        {
            return;
        }

        comboBoxGender.Items.Add(new GenderFilter("전체", null));
        comboBoxGender.Items.Add(new GenderFilter("여성", VoiceGender.Female));
        comboBoxGender.Items.Add(new GenderFilter("남성", VoiceGender.Male));
        comboBoxGender.SelectedIndex = 0;
    }

    private VoiceGender? GetSelectedGenderFilter()
    {
        return comboBoxGender.SelectedItem is GenderFilter gf ? gf.Gender : null;
    }

    private void RefreshVoiceComboFromFilter(string? preferVoiceName, bool showMessageIfEmpty)
    {
        string? preserve = preferVoiceName
            ?? (comboBoxVoice.SelectedItem is VoiceEntry cur ? cur.Name : null);

        VoiceGender? filter = GetSelectedGenderFilter();
        List<VoiceEntry> filtered = filter is null
            ? _allVoiceEntries.ToList()
            : _allVoiceEntries.Where(e => e.Gender == filter.Value).ToList();

        if (filtered.Count == 0 && filter is not null && showMessageIfEmpty)
        {
            MessageBox.Show(
                this,
                "선택한 성별에 해당하는 사용 가능한 음성이 없습니다. 전체 목록으로 돌아갑니다.",
                Text,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            _suppressGenderFilterEvent = true;
            comboBoxGender.SelectedIndex = 0;
            _suppressGenderFilterEvent = false;
            RefreshVoiceComboFromFilter(preserve, showMessageIfEmpty: false);
            return;
        }

        comboBoxVoice.Items.Clear();
        foreach (VoiceEntry entry in filtered)
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

    private void ComboBoxGender_SelectedIndexChanged(object? sender, EventArgs e)
    {
        if (_suppressGenderFilterEvent)
        {
            return;
        }

        string? keep = comboBoxVoice.SelectedItem is VoiceEntry ve ? ve.Name : null;
        RefreshVoiceComboFromFilter(keep, showMessageIfEmpty: true);
    }

    private SynthOptions GetSynthOptionsFromUi()
    {
        string? voiceName = comboBoxVoice.SelectedItem is VoiceEntry ve ? ve.Name : null;
        return new SynthOptions(voiceName, trackBarRate.Value);
    }

    private readonly struct SynthOptions
    {
        public SynthOptions(string? voiceName, int rate)
        {
            VoiceName = voiceName;
            Rate = rate < -10 ? -10 : (rate > 10 ? 10 : rate);
        }

        public string? VoiceName { get; }
        public int Rate { get; }
    }

    private sealed class VoiceEntry
    {
        public VoiceEntry(string name, string caption, VoiceGender gender)
        {
            Name = name;
            Caption = caption;
            Gender = gender;
        }

        public string Name { get; }
        public string Caption { get; }
        public VoiceGender Gender { get; }

        public override string ToString() => Caption;
    }

    private sealed class GenderFilter
    {
        public GenderFilter(string caption, VoiceGender? gender)
        {
            Caption = caption;
            Gender = gender;
        }

        public string Caption { get; }
        public VoiceGender? Gender { get; }

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
        synth.Volume = 100;
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
            using var sr = new StreamReader(dlg.FileName, Encoding.Default, true);
            textBoxContent.Text = sr.ReadToEnd();
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

        SetBusy(true);
        _isSynthesizing = true;
        SetStatus("음성 합성 중…");

        SynthOptions synthOptions = GetSynthOptionsFromUi();

        byte[]? wavBytes = null;
        Exception? synthError = null;
        try
        {
            wavBytes = await Task.Run(() => SynthesizeToWavBytes(text, token, synthOptions)).ConfigureAwait(true);
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
            MessageBox.Show(this, synthError.Message, "합성 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            SetStatus("오류");
            return;
        }

        if (token.IsCancellationRequested || wavBytes is null || wavBytes.Length == 0)
        {
            SetStatus(token.IsCancellationRequested ? "취소됨" : "합성 결과가 비어 있습니다");
            return;
        }

        try
        {
            StartPlayback(wavBytes);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "재생 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
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
                return SynthesizeToWavBytes(text, cts.Token, synthOptions) ?? Array.Empty<byte>();
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
        _volumeProvider = new VolumeSampleProvider(new Pcm16BitToSampleProvider(_playReader)) { Volume = VolumeFactor };
        _peakProbe = new PeakProbe(_volumeProvider);

        _waveOut = new WaveOutEvent();
        _waveOut.PlaybackStopped += WaveOut_PlaybackStopped;
        _waveOut.Init(_peakProbe.ToWaveProvider16());
        _isPlaying = true;
        _waveOut.Play();
        buttonSpeak.Enabled = false;
        SetStatus("재생 중…");
    }

    private void WaveOut_PlaybackStopped(object? sender, StoppedEventArgs e)
    {
        if (InvokeRequired)
        {
            BeginInvoke(() => WaveOut_PlaybackStopped(sender, e));
            return;
        }

        _isPlaying = false;
        if (e.Exception is not null)
        {
            MessageBox.Show(this, e.Exception.Message, "재생 중 오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        DisposePlaybackGraph();
        buttonSpeak.Enabled = !_isSynthesizing;
        SetStatus("준비됨");
    }

    private void StopPlayback(bool sendStop)
    {
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

    private void WaveTimer_Tick(object? sender, EventArgs e)
    {
        EnsurePeakHistory();
        if (_isPlaying && _peakProbe is not null)
        {
            float peak = _peakProbe.DrainPeak();
            PushPeak(VisualGain(peak));
        }
        else if (!_isSynthesizing)
        {
            PushPeak(0f);
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

    private void EnsurePeakHistory()
    {
        int w = Math.Max(8, panelWaveform.ClientSize.Width);
        if (_peakHistory.Length != w)
        {
            _peakHistory = new float[w];
        }
    }

    private void PushPeak(float value)
    {
        if (_peakHistory.Length == 0)
        {
            return;
        }

        Array.Copy(_peakHistory, 1, _peakHistory, 0, _peakHistory.Length - 1);
        _peakHistory[_peakHistory.Length - 1] = value;
    }

    private void ClearWaveform()
    {
        EnsurePeakHistory();
        Array.Clear(_peakHistory, 0, _peakHistory.Length);
        panelWaveform.Invalidate();
    }

    private void PanelWaveform_Paint(object? sender, PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        var rect = panelWaveform.ClientRectangle;
        using var bg = new SolidBrush(panelWaveform.BackColor);
        g.FillRectangle(bg, rect);

        int midY = rect.Height / 2;
        using var axisPen = new Pen(Color.FromArgb(60, 90, 90, 100), 1f);
        g.DrawLine(axisPen, 0, midY, rect.Width, midY);

        if (_peakHistory.Length < 2)
        {
            return;
        }

        using var wavePen = new Pen(Color.FromArgb(220, 100, 200, 255), 1.5f);
        float xStep = rect.Width / (float)(_peakHistory.Length - 1);
        for (int i = 0; i < _peakHistory.Length - 1; i++)
        {
            float x1 = i * xStep;
            float x2 = (i + 1) * xStep;
            float y1 = midY - _peakHistory[i] * midY * 0.95f;
            float y2 = midY - _peakHistory[i + 1] * midY * 0.95f;
            g.DrawLine(wavePen, x1, y1, x2, y2);
        }
    }

    private void SetBusy(bool busy)
    {
        UseWaitCursor = busy;
        buttonSpeak.Enabled = !busy;
        buttonSave.Enabled = !busy;
        buttonOpenFile.Enabled = !busy;
        comboBoxVoice.Enabled = !busy;
        comboBoxGender.Enabled = !busy;
        trackBarRate.Enabled = !busy;
        trackBarWaveGain.Enabled = !busy;
    }

    private void SetStatus(string text)
    {
        statusLabel.Text = text;
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

    private static byte[]? SynthesizeToWavBytes(string text, CancellationToken token, SynthOptions options)
    {
        byte[]? result = null;
        Exception? caught = null;

        var thread = new Thread(() =>
        {
            try
            {
                using var synth = new SpeechSynthesizer();
                ApplySynthOptions(synth, options);
                using var ms = new MemoryStream();
                synth.SetOutputToWaveStream(ms);
                using var completed = new ManualResetEventSlim(false);

                void OnCompleted(object? _, SpeakCompletedEventArgs __)
                {
                    completed.Set();
                }

                synth.SpeakCompleted += OnCompleted;
                try
                {
                    // 문자열 오버로드: Prompt/SSML로 잘못 해석되는 경우를 줄임
                    synth.SpeakAsync(text);
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
                }
            }
            catch (Exception ex)
            {
                caught = ex;
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

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
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
