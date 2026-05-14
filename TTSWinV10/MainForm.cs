using System.ComponentModel;
using System.Drawing;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Speech.Synthesis;
using System.Text;
using System.Threading;
using Windows.Foundation;
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
    private float _waveHorizontalMag = 1f;
    private bool _waveWheelFilterRegistered;
    private Font? _waveRulerFont;
    private double _waveRulerPlaybackSec;
    private volatile bool _isPlaying;
    private volatile bool _isSynthesizing;
    private readonly List<VoiceEntry> _allVoiceEntries = new();
    private Bitmap? _transportPlayIcon;
    private Bitmap? _transportStopIcon;

    public MainForm()
    {
        // InitializeComponent may paint panelWaveform; PanelWaveform_Paint reads _waveTimer.Interval.
        _waveTimer = new System.Windows.Forms.Timer { Interval = 35 };
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
        Font uiFont = TryCreateUiFont(10f) ?? new Font("Segoe UI", 10f, FontStyle.Regular, GraphicsUnit.Point);
        Font uiFontSemi = new Font(uiFont.FontFamily, uiFont.SizeInPoints + 0.25f, FontStyle.Bold, GraphicsUnit.Point);

        Color appBg = Color.FromArgb(242, 244, 248);
        Color surface = Color.White;
        Color border = Color.FromArgb(220, 224, 232);
        Color textPrimary = Color.FromArgb(28, 30, 36);
        Color textMuted = Color.FromArgb(96, 101, 112);
        Color accent = Color.FromArgb(0, 103, 192);
        Color accentDark = Color.FromArgb(0, 78, 152);

        Font = uiFont;
        BackColor = appBg;
        ForeColor = textPrimary;

        panelBody.BackColor = appBg;
        textBoxContent.Font = uiFont;
        textBoxContent.BackColor = surface;
        textBoxContent.ForeColor = textPrimary;
        textBoxContent.BorderStyle = BorderStyle.FixedSingle;

        panelSynthCard.BackColor = surface;
        labelSynthTitle.Font = uiFontSemi;
        labelSynthTitle.ForeColor = textPrimary;
        labelSynthTitle.BackColor = surface;

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

        Color dropDownFieldBack = Color.FromArgb(243, 246, 252);
        ApplyDropDownFieldStyle(comboBoxSynthMethod, dropDownFieldBack, textPrimary, uiFont);
        ApplyDropDownFieldStyle(comboBoxVoice, dropDownFieldBack, textPrimary, uiFont);
        ApplyDropDownFieldStyle(comboBoxEmphasis, dropDownFieldBack, textPrimary, uiFont);

        ApplySecondaryChrome(buttonOpenFile, surface, textPrimary, border);
        ApplyPrimaryChrome(buttonSave, accent, accentDark, surface);

        trackBarRate.BackColor = surface;
        trackBarSynthVol.BackColor = surface;
        trackBarPitch.BackColor = surface;
        trackBarPitch.SmallChange = 1;
        trackBarPitch.LargeChange = 1;
        trackBarWaveGain.BackColor = surface;
        // TrackBar는 Transparent 배경을 허용하지 않는 경우가 많음.
        trackBarVolume.BackColor = appBg;

        // StatusStrip은 System 렌더러와 함께 임의 BackColor를 두면 ArgumentException이 날 수 있음.
        statusLabel.ForeColor = textMuted;
        statusLabel.Font = uiFont;
        statusLabel.Margin = new Padding(6, 2, 6, 2);

        // ToolTip의 BackColor/ForeColor는 환경에 따라 유효하지 않아 예외가 날 수 있음.
    }

    private static void PanelSynthCard_Paint(object? sender, PaintEventArgs e)
    {
        if (sender is not Panel p)
        {
            return;
        }

        var g = e.Graphics;
        Rectangle r = p.ClientRectangle;
        r.Width -= 1;
        r.Height -= 1;
        using var pen = new Pen(Color.FromArgb(220, 224, 232), 1f);
        g.DrawRectangle(pen, r);
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
        cb.FlatStyle = FlatStyle.Popup;
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
        b.FlatAppearance.MouseOverBackColor = Color.FromArgb(236, 240, 247);
        b.FlatAppearance.MouseDownBackColor = Color.FromArgb(224, 230, 242);
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
            b.BackColor = Color.FromArgb(0, 114, 198);
            b.ForeColor = Color.White;
            b.FlatAppearance.BorderColor = b.BackColor;
            b.FlatAppearance.MouseOverBackColor = Color.FromArgb(28, 145, 228);
            b.FlatAppearance.MouseDownBackColor = Color.FromArgb(0, 88, 164);
        }
        else
        {
            b.BackColor = Color.FromArgb(196, 54, 61);
            b.ForeColor = Color.White;
            b.FlatAppearance.BorderColor = b.BackColor;
            b.FlatAppearance.MouseOverBackColor = Color.FromArgb(218, 86, 92);
            b.FlatAppearance.MouseDownBackColor = Color.FromArgb(168, 44, 50);
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

        string? engineDefault = GetSelectedSynthMethod() == SpeechSynthesisMethod.WindowsMediaWinRt
            ? PopulateWinRtVoices()
            : PopulateSapiVoices();

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
        if (_isPlaying && _playReader is not null)
        {
            try
            {
                _waveRulerPlaybackSec = _playReader.CurrentTime.TotalSeconds;
            }
            catch
            {
                _waveRulerPlaybackSec = 0;
            }
        }
        else
        {
            _waveRulerPlaybackSec = 0;
        }

        if (_isPlaying && _peakProbe is not null)
        {
            float peak = _peakProbe.DrainPeak();
            PushPeak(VisualGain(peak));
        }
        else
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
        panelWaveform.Invalidate();
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

    private void PanelWaveform_Paint(object? sender, PaintEventArgs e)
    {
        var g = e.Graphics;
        var rect = panelWaveform.ClientRectangle;
        using (var bg = new SolidBrush(panelWaveform.BackColor))
        {
            g.FillRectangle(bg, rect);
        }

        const int preferRulerH = 26;
        int rulerH = Math.Min(preferRulerH, Math.Max(16, rect.Height / 5));
        if (rulerH >= rect.Height - 8)
        {
            rulerH = Math.Max(12, rect.Height / 6);
        }

        int plotHeight = Math.Max(10, rect.Height - rulerH);
        var plotRect = new Rectangle(rect.X, rect.Y, rect.Width, plotHeight);
        var rulerRect = new Rectangle(rect.X, rect.Y + plotHeight, rect.Width, rulerH);

        int w = plotRect.Width;
        if (w < 2)
        {
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

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.None;
        DrawWaveformHorizontalGrid(g, plotRect);
        DrawWaveformTimeVerticalTicks(g, plotRect, windowSec);

        int midY = plotRect.Y + plotRect.Height / 2;
        using (var axisPen = new Pen(Color.FromArgb(88, 90, 110, 130), 1f))
        {
            g.DrawLine(axisPen, plotRect.Left, midY, plotRect.Right, midY);
        }

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        using var wavePen = new Pen(Color.FromArgb(235, 120, 190, 255), 1.75f);
        float denom = Math.Max(1f, w - 1);
        for (int px = 0; px < w - 1; px++)
        {
            float t0 = px / denom * (take - 1);
            float t1 = (px + 1) / denom * (take - 1);
            float v0 = SampleWaveScratch(_wavePaintScratch, take, t0);
            float v1 = SampleWaveScratch(_wavePaintScratch, take, t1);
            float x0 = plotRect.X + px;
            float x1 = plotRect.X + px + 1;
            float y0 = midY - v0 * (plotRect.Height * 0.48f);
            float y1 = midY - v1 * (plotRect.Height * 0.48f);
            g.DrawLine(wavePen, x0, y0, x1, y1);
        }

        if (rulerRect.Height > 4 && _waveRulerFont is not null)
        {
            DrawWaveformTimeRuler(g, rulerRect, plotRect, windowSec, _waveRulerPlaybackSec);
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

    private static void DrawWaveformTimeVerticalTicks(Graphics g, Rectangle plotRect, double windowSec)
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

    private void DrawWaveformTimeRuler(Graphics g, Rectangle rulerRect, Rectangle plotRect, double windowSec, double playbackOffsetSec)
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
        using var textBrush = new SolidBrush(Color.FromArgb(210, 190, 200, 220));
        using var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };

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

            g.DrawLine(tickPen, x, rulerRect.Top, x, rulerRect.Top + 5);
            double labelT = t + playbackOffsetSec;
            string label = FormatTimeSecondsLabel(labelT, step);
            var layout = new RectangleF(x - 36, rulerRect.Top + 4, 72, rulerRect.Height - 4);
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
        if (options.Method == SpeechSynthesisMethod.WindowsMediaWinRt)
        {
            return SynthesizeToWavBytesWinRt(text, token, options);
        }

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
                    string? ssml = BuildSsmlForSpeak(text, in options);
                    if (ssml is not null)
                    {
                        synth.SpeakSsmlAsync(ssml);
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

    private static double MapSapiRateToWinRtSpeakingRate(int rate)
    {
        int clamped = rate < -10 ? -10 : (rate > 10 ? 10 : rate);
        double v = 1.0 + clamped * 0.1;
        return v < 0.5 ? 0.5 : (v > 3.0 ? 3.0 : v);
    }

    private static byte[]? SynthesizeToWavBytesWinRt(string text, CancellationToken token, SynthOptions options)
    {
        byte[]? result = null;
        Exception? caught = null;

        var thread = new Thread(() =>
        {
            try
            {
                var synth = new Windows.Media.SpeechSynthesis.SpeechSynthesizer();
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
                using Stream net = stream.AsStreamForRead();
                using var ms = new MemoryStream();
                net.CopyTo(ms);
                result = ms.ToArray();

                if (!IsLikelyWavePcm(result))
                {
                    caught = new InvalidOperationException("WinRT 합성 결과가 올바른 WAV 형식이 아닙니다.");
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
