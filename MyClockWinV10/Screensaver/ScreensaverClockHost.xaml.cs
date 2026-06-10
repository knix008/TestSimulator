using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Threading;
using MyClockWinV10.Models;

namespace MyClockWinV10.Screensaver;

public partial class ScreensaverClockHost : UserControl
{
    private readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromMilliseconds(200) };

    private bool _isDigital = true;
    private bool _use24h;
    private string _digitalStyle = nameof(DigitalStyle.SevenSegment);
    private Color _digitColor = Color.FromRgb(0x58, 0xA6, 0xFF);
    private Color _amPmColor  = Color.FromRgb(0x89, 0xB4, 0xFA);
    private double _digitalTextBaseFontSize = 60;

    public ScreensaverClockHost()
    {
        InitializeComponent();
        _timer.Tick += (_, _) => UpdateClock(DateTime.Now);
    }

    public void Apply(ScreensaverSettings settings)
    {
        ApplyTheme(settings.Theme);
        _isDigital    = settings.IsDigital;
        _use24h       = settings.Use24h;
        _digitColor   = ParseColor(settings.DigitColor);
        _amPmColor    = ParseAmPmColor(settings.AmPmColor);
        ApplyDigitColor(_digitColor);
        ApplyAmPmColor(_amPmColor);
        ApplyDigitalStyle(settings.DigitalStyleName);
        ApplyAnalogStyle(settings.AnalogStyleName);

        DigitalPanel.Visibility = _isDigital ? Visibility.Visible : Visibility.Collapsed;
        AnalogClock.Visibility  = _isDigital ? Visibility.Collapsed : Visibility.Visible;

        UpdateClock(DateTime.Now);
    }

    public void Start() => _timer.Start();
    public void Stop()  => _timer.Stop();

    private void ApplyTheme(string name)
    {
        var dicts = Application.Current.Resources.MergedDictionaries;
        if (dicts.Count > 0)
            dicts[0] = new ResourceDictionary { Source = new Uri($"Themes/{name}.xaml", UriKind.Relative) };
        else
            dicts.Add(new ResourceDictionary { Source = new Uri($"Themes/{name}.xaml", UriKind.Relative) });
        ApplyDigitColor(_digitColor);
    }

    private void ApplyDigitColor(Color c)
    {
        _digitColor = c;
        var brush = new SolidColorBrush(c);
        SevenSeg.SegColor = brush;
        DotMatrixClock.DotColor = brush;
        Application.Current.Resources["DigitalTextBrush"] = brush;
        if (_digitalStyle == nameof(DigitalStyle.Neon) && TextTime.Effect is DropShadowEffect glow)
            glow.Color = c;
    }

    private void ApplyAmPmColor(Color c)
    {
        _amPmColor = c;
        var brush = new SolidColorBrush(c);
        brush.Freeze();
        AmPmText.Foreground = brush;
        TextAmPm.Foreground = brush;
    }

    private void ApplyDigitalStyle(string style)
    {
        _digitalStyle = style;
        bool isSeg    = style == nameof(DigitalStyle.SevenSegment);
        bool isDot    = style == nameof(DigitalStyle.DotMatrix);
        bool isCanvas = isSeg || isDot;

        AmPmText.Visibility       = isCanvas ? Visibility.Visible   : Visibility.Collapsed;
        SevenSeg.Visibility       = isSeg    ? Visibility.Visible   : Visibility.Collapsed;
        DotMatrixClock.Visibility = isDot    ? Visibility.Visible   : Visibility.Collapsed;
        TextClockBox.Visibility   = isCanvas ? Visibility.Collapsed : Visibility.Visible;

        if (!isCanvas)
        {
            TextTime.Effect = null;
            switch (style)
            {
                case nameof(DigitalStyle.Minimal):
                    TextTime.FontFamily = new FontFamily("Segoe UI");
                    TextTime.FontWeight = FontWeights.Light;
                    _digitalTextBaseFontSize = 72;
                    break;
                case nameof(DigitalStyle.Retro):
                    TextTime.FontFamily = new FontFamily("Courier New");
                    TextTime.FontWeight = FontWeights.Normal;
                    _digitalTextBaseFontSize = 56;
                    break;
                case nameof(DigitalStyle.Neon):
                    TextTime.FontFamily = new FontFamily("Consolas");
                    TextTime.FontWeight = FontWeights.Bold;
                    _digitalTextBaseFontSize = 64;
                    TextTime.Effect = new DropShadowEffect
                    {
                        Color = _digitColor, BlurRadius = 18, ShadowDepth = 0, Opacity = 0.85
                    };
                    break;
                case nameof(DigitalStyle.Korean):
                    TextTime.FontFamily = new FontFamily("Malgun Gothic, 맑은 고딕, Batang");
                    TextTime.FontWeight = FontWeights.SemiBold;
                    _digitalTextBaseFontSize = 36;
                    break;
                case nameof(DigitalStyle.Matrix):
                    TextTime.FontFamily = new FontFamily("Consolas");
                    TextTime.FontWeight = FontWeights.Bold;
                    _digitalTextBaseFontSize = 58;
                    TextTime.Effect = new DropShadowEffect
                    {
                        Color = _digitColor, BlurRadius = 10, ShadowDepth = 0, Opacity = 0.65
                    };
                    break;
                case nameof(DigitalStyle.Vintage):
                    TextTime.FontFamily = new FontFamily("Georgia");
                    TextTime.FontWeight = FontWeights.Normal;
                    _digitalTextBaseFontSize = 54;
                    break;
                case nameof(DigitalStyle.Thin):
                    TextTime.FontFamily = new FontFamily("Segoe UI");
                    TextTime.FontWeight = FontWeights.Thin;
                    _digitalTextBaseFontSize = 76;
                    break;
                default:
                    TextTime.FontFamily = new FontFamily("Consolas");
                    TextTime.FontWeight = FontWeights.Bold;
                    _digitalTextBaseFontSize = 60;
                    break;
            }
        }
    }

    private void ApplyAnalogStyle(string style)
    {
        if (Enum.TryParse<AnalogStyle>(style, out var s))
            AnalogClock.ClockStyle = s;
    }

    private void UpdateClock(DateTime now)
    {
        if (_isDigital) UpdateDigital(now);
        else            AnalogClock.DrawClock(now);
    }

    private void UpdateDigital(DateTime now)
    {
        string ampm = _use24h ? "" : (now.Hour < 12 ? "오전" : "오후");

        if (UsesCanvasDigitalDisplay())
        {
            SetAmPmText(AmPmText, ampm);
            SetCanvasDigitalTime(_use24h ? now.ToString("HH:mm:ss") : now.ToString("hh:mm:ss"));
        }
        else
        {
            SetAmPmText(TextAmPm, ampm);
            bool showSeconds = _digitalStyle != nameof(DigitalStyle.Minimal);
            string display = _digitalStyle == nameof(DigitalStyle.Korean)
                ? KoreanTimeText.FormatClock(now, _use24h, showSeconds)
                : FormatNumericDigitalTime(now, showSeconds);
            TextTime.FontSize = _digitalTextBaseFontSize;
            TextTime.Text = display;
        }
    }

    private static void SetAmPmText(TextBlock target, string ampm)
    {
        target.Text = ampm;
        target.Visibility = string.IsNullOrEmpty(ampm) ? Visibility.Collapsed : Visibility.Visible;
    }

    private void SetCanvasDigitalTime(string time)
    {
        if (_digitalStyle == nameof(DigitalStyle.DotMatrix))
            DotMatrixClock.Text = time;
        else
            SevenSeg.Text = time;
    }

    private bool UsesCanvasDigitalDisplay() =>
        _digitalStyle is nameof(DigitalStyle.SevenSegment) or nameof(DigitalStyle.DotMatrix);

    private string FormatNumericDigitalTime(DateTime now, bool showSeconds)
    {
        return showSeconds
            ? (_use24h ? now.ToString("HH:mm:ss") : now.ToString("hh:mm:ss"))
            : (_use24h ? now.ToString("HH:mm") : now.ToString("hh:mm"));
    }

    private static Color ParseColor(string hex)
    {
        try { return (Color)ColorConverter.ConvertFromString(hex); }
        catch { return Color.FromRgb(0x58, 0xA6, 0xFF); }
    }

    private static Color ParseAmPmColor(string hex)
    {
        try { return (Color)ColorConverter.ConvertFromString(hex); }
        catch { return Color.FromRgb(0x89, 0xB4, 0xFA); }
    }
}
