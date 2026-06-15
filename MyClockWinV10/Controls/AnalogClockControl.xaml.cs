using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using MyClockWinV10.Models;

namespace MyClockWinV10.Controls;

public partial class AnalogClockControl : UserControl
{
    private const double DesignSize = 380;

    private static readonly string[] RomanNumerals =
        ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

    private double _cx, _cy, _r, _scale = 1;
    private DateTime _lastDraw;

    public AnalogStyle ClockStyle { get; set; } = AnalogStyle.Classic;

    public AnalogClockControl()
    {
        InitializeComponent();
        Loaded     += (_, _) => RedrawIfSized();
        SizeChanged += (_, _) => RedrawIfSized();
    }

    public void DrawClock(DateTime now)
    {
        _lastDraw = now;
        if (!UpdateGeometry())
            return;

        ClockCanvas.Children.Clear();

        var faceFill   = GetBrush("ClockFaceBrush",   Brushes.Black);
        var faceBorder = GetBrush("ClockBorderBrush",  Brushes.Gray);
        var tickMin    = GetBrush("TickMarkBrush",      Brushes.DimGray);
        var tickHr     = GetBrush("HourTickBrush",      Brushes.White);
        var numBrush   = GetBrush("NumberBrush",        Brushes.White);
        var hourHand   = GetBrush("HourHandBrush",      Brushes.White);
        var minHand    = GetBrush("MinuteHandBrush",    Brushes.LightBlue);
        var secHand    = GetBrush("SecondHandBrush",    Brushes.Red);
        var centerDot  = GetBrush("CenterDotBrush",     Brushes.Red);

        double glowPad = Sc(8);
        var glow = new Ellipse
        {
            Width = _r * 2 + Sc(16), Height = _r * 2 + Sc(16),
            Fill = Brushes.Transparent,
            Stroke = faceBorder, StrokeThickness = Sc(1),
            Opacity = 0.3
        };
        Canvas.SetLeft(glow, _cx - _r - glowPad);
        Canvas.SetTop(glow,  _cy - _r - glowPad);
        ClockCanvas.Children.Add(glow);

        var face = new Ellipse
        {
            Width = _r * 2, Height = _r * 2,
            Fill = faceFill, Stroke = faceBorder, StrokeThickness = Sc(5)
        };
        Canvas.SetLeft(face, _cx - _r);
        Canvas.SetTop(face,  _cy - _r);
        ClockCanvas.Children.Add(face);

        switch (ClockStyle)
        {
            case AnalogStyle.Classic:
                DrawAllTicks(tickMin, tickHr);
                DrawArabicNumbers(numBrush);
                break;
            case AnalogStyle.Minimal:
                DrawCardinalDots(tickHr);
                break;
            case AnalogStyle.Roman:
                DrawAllTicks(tickMin, tickHr);
                DrawRomanNumbers(numBrush);
                break;
            case AnalogStyle.Indices:
                DrawIndexMarkers(tickHr);
                break;
            case AnalogStyle.Railroad:
                DrawRailroadMarkers(tickMin, tickHr);
                break;
            case AnalogStyle.Bauhaus:
                DrawBauhausMarkers(tickMin, tickHr);
                break;
            case AnalogStyle.Dots:
                DrawDotRing(tickHr, tickMin);
                break;
            case AnalogStyle.Aviator:
                DrawAviatorFace(tickMin, tickHr, numBrush);
                break;
            case AnalogStyle.Nautical:
                DrawNauticalFace(tickMin, tickHr, numBrush);
                break;
            case AnalogStyle.Modern:
                DrawModernFace(tickHr, tickMin);
                break;
            case AnalogStyle.Steampunk:
                DrawSteampunkFace(faceBorder, tickMin, tickHr, numBrush);
                break;
        }

        DrawAmPmAndDate(now, numBrush);

        double secA = now.Second               * 6      * Math.PI / 180;
        double minA = (now.Minute + now.Second / 60.0)  * 6      * Math.PI / 180;
        double hrA  = ((now.Hour % 12) + now.Minute / 60.0) * 30 * Math.PI / 180;

        AddHand(hrA,  _r * 0.50, Sc(8),  hourHand);
        AddHand(minA, _r * 0.72, Sc(5),  minHand);
        AddHand(secA, _r * 0.85, Sc(2),  secHand, _r * 0.22);

        double capSize = Sc(16);
        var cap = new Ellipse { Width = capSize, Height = capSize, Fill = centerDot };
        Canvas.SetLeft(cap, _cx - capSize / 2);
        Canvas.SetTop(cap,  _cy - capSize / 2);
        ClockCanvas.Children.Add(cap);
    }

    private bool UpdateGeometry()
    {
        double w = ActualWidth;
        double h = ActualHeight;
        if (w < 1 || h < 1)
            return false;

        double size = Math.Min(w, h);
        _scale = size / DesignSize;
        _cx = size / 2;
        _cy = size / 2;
        _r  = size / 2 - Sc(12);

        ClockCanvas.Width  = size;
        ClockCanvas.Height = size;
        return true;
    }

    private void RedrawIfSized()
    {
        if (ActualWidth < 1 || ActualHeight < 1) return;
        DrawClock(_lastDraw == default ? DateTime.Now : _lastDraw);
    }

    /// <summary>Scale a length defined for the 380×380 design canvas.</summary>
    private double Sc(double designUnits) => designUnits * _scale;

    /// <summary>Font size proportional to clock radius (scales with window).</summary>
    private double ScaledNumFont(double radiusFactor) => Math.Max(10, _r * radiusFactor);

    private void DrawAllTicks(Brush tickMin, Brush tickHr)
    {
        for (int i = 0; i < 60; i++)
        {
            bool isHour = i % 5 == 0;
            double a = i * 6 * Math.PI / 180;
            double outerR = _r - Sc(4);
            double innerR = isHour ? _r - Sc(24) : _r - Sc(11);
            ClockCanvas.Children.Add(new Line
            {
                X1 = _cx + outerR * Math.Sin(a), Y1 = _cy - outerR * Math.Cos(a),
                X2 = _cx + innerR * Math.Sin(a), Y2 = _cy - innerR * Math.Cos(a),
                Stroke = isHour ? tickHr : tickMin,
                StrokeThickness = isHour ? Sc(3) : Sc(1),
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap   = PenLineCap.Round
            });
        }
    }

    private void DrawArabicNumbers(Brush numBrush)
    {
        double fontSize = ScaledNumFont(0.145);
        double labelR   = _r * 0.72;
        for (int i = 1; i <= 12; i++)
        {
            double a = i * 30 * Math.PI / 180;
            PlaceLabel(i.ToString(), a, labelR, fontSize, FontWeights.Bold, numBrush);
        }
    }

    private void DrawRomanNumbers(Brush numBrush)
    {
        double fontSize = ScaledNumFont(0.115);
        double labelR   = _r * 0.70;
        for (int i = 1; i <= 12; i++)
        {
            double a = i * 30 * Math.PI / 180;
            PlaceLabel(RomanNumerals[i], a, labelR, fontSize, FontWeights.Bold, numBrush);
        }
    }

    private void DrawCardinalDots(Brush tickHr)
    {
        for (int i = 0; i < 12; i++)
        {
            bool isCardinal = i % 3 == 0;
            double a = i * 30 * Math.PI / 180;
            double dotR = Sc(isCardinal ? 6 : 3);
            double pos  = _r - Sc(14);
            double cx = _cx + pos * Math.Sin(a);
            double cy = _cy - pos * Math.Cos(a);
            var dot = new Ellipse
            {
                Width = dotR * 2, Height = dotR * 2,
                Fill = tickHr,
                Opacity = isCardinal ? 1.0 : 0.45
            };
            Canvas.SetLeft(dot, cx - dotR);
            Canvas.SetTop(dot,  cy - dotR);
            ClockCanvas.Children.Add(dot);
        }
    }

    private void DrawIndexMarkers(Brush tickHr)
    {
        for (int i = 0; i < 12; i++)
        {
            bool isCardinal = i % 3 == 0;
            double a = i * 30 * Math.PI / 180;
            double outerR    = _r - Sc(4);
            double innerR    = isCardinal ? _r - Sc(30) : _r - Sc(18);
            double thickness = isCardinal ? Sc(7) : Sc(4);
            ClockCanvas.Children.Add(new Line
            {
                X1 = _cx + outerR * Math.Sin(a), Y1 = _cy - outerR * Math.Cos(a),
                X2 = _cx + innerR * Math.Sin(a), Y2 = _cy - innerR * Math.Cos(a),
                Stroke = tickHr,
                StrokeThickness = thickness,
                StrokeStartLineCap = PenLineCap.Flat,
                StrokeEndLineCap   = PenLineCap.Flat
            });
        }
    }

    private void DrawRailroadMarkers(Brush tickMin, Brush tickHr)
    {
        for (int i = 0; i < 60; i++)
        {
            bool isHour = i % 5 == 0;
            double a = i * 6 * Math.PI / 180;
            double outerR = _r - Sc(4);
            if (isHour)
            {
                double innerR = _r - Sc(28);
                ClockCanvas.Children.Add(new Line
                {
                    X1 = _cx + outerR * Math.Sin(a), Y1 = _cy - outerR * Math.Cos(a),
                    X2 = _cx + innerR * Math.Sin(a), Y2 = _cy - innerR * Math.Cos(a),
                    Stroke = tickHr, StrokeThickness = Sc(5),
                    StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round
                });
            }
            else
            {
                double innerR = _r - Sc(10);
                ClockCanvas.Children.Add(new Line
                {
                    X1 = _cx + outerR * Math.Sin(a), Y1 = _cy - outerR * Math.Cos(a),
                    X2 = _cx + innerR * Math.Sin(a), Y2 = _cy - innerR * Math.Cos(a),
                    Stroke = tickMin, StrokeThickness = Sc(1),
                    StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round
                });
            }
        }
    }

    private void DrawBauhausMarkers(Brush tickMin, Brush tickHr)
    {
        for (int i = 0; i < 60; i++)
        {
            if (i % 5 != 0)
            {
                double a = i * 6 * Math.PI / 180;
                double outerR = _r - Sc(4), innerR = _r - Sc(9);
                ClockCanvas.Children.Add(new Line
                {
                    X1 = _cx + outerR * Math.Sin(a), Y1 = _cy - outerR * Math.Cos(a),
                    X2 = _cx + innerR * Math.Sin(a), Y2 = _cy - innerR * Math.Cos(a),
                    Stroke = tickMin, StrokeThickness = Sc(1), Opacity = 0.5
                });
            }
        }
        for (int h = 0; h < 12; h += 3)
        {
            double a = h * 30 * Math.PI / 180;
            double len = Sc(22);
            double outerR = _r - Sc(6);
            double innerR = outerR - len;
            ClockCanvas.Children.Add(new Line
            {
                X1 = _cx + outerR * Math.Sin(a), Y1 = _cy - outerR * Math.Cos(a),
                X2 = _cx + innerR * Math.Sin(a), Y2 = _cy - innerR * Math.Cos(a),
                Stroke = tickHr, StrokeThickness = Sc(4),
                StrokeStartLineCap = PenLineCap.Flat, StrokeEndLineCap = PenLineCap.Flat
            });
        }
    }

    private void DrawDotRing(Brush tickHr, Brush tickMin)
    {
        for (int i = 0; i < 60; i++)
        {
            bool isHour = i % 5 == 0;
            double a   = i * 6 * Math.PI / 180;
            double pos = _r - Sc(10);
            double cx  = _cx + pos * Math.Sin(a);
            double cy  = _cy - pos * Math.Cos(a);

            if (i == 0)
            {
                // 12시 위치: 방사 방향(수직)으로 길쭉한 pill 바
                double bw = Sc(5), bh = Sc(20);
                var bar = new Rectangle
                {
                    Width = bw, Height = bh, Fill = tickHr,
                    RadiusX = bw / 2, RadiusY = bw / 2
                };
                Canvas.SetLeft(bar, cx - bw / 2);
                Canvas.SetTop(bar,  cy - bh / 2);
                ClockCanvas.Children.Add(bar);
            }
            else
            {
                double dotR = Sc(isHour ? 4.5 : 2.5);
                var dot = new Ellipse
                {
                    Width = dotR * 2, Height = dotR * 2,
                    Fill = isHour ? tickHr : tickMin,
                    Opacity = isHour ? 1.0 : 0.65
                };
                Canvas.SetLeft(dot, cx - dotR);
                Canvas.SetTop(dot,  cy - dotR);
                ClockCanvas.Children.Add(dot);
            }
        }
    }

    private void DrawNauticalFace(Brush tickMin, Brush tickHr, Brush numBrush)
    {
        for (int i = 0; i < 60; i++)
        {
            bool isHour = i % 5 == 0;
            double a = i * 6 * Math.PI / 180;
            double outerR = _r - Sc(4);
            double innerR = isHour ? _r - Sc(26) : _r - Sc(9);
            ClockCanvas.Children.Add(new Line
            {
                X1 = _cx + outerR * Math.Sin(a), Y1 = _cy - outerR * Math.Cos(a),
                X2 = _cx + innerR * Math.Sin(a), Y2 = _cy - innerR * Math.Cos(a),
                Stroke = isHour ? tickHr : tickMin,
                StrokeThickness = isHour ? Sc(3.5) : Sc(1),
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap   = PenLineCap.Round,
                Opacity = isHour ? 1.0 : 0.55
            });
        }

        foreach (int h in new[] { 12, 3, 6, 9 })
        {
            double a = h * 30 * Math.PI / 180;
            double tipR = _r - Sc(8);
            double baseR = _r - Sc(28);
            double halfW = Sc(7);
            double bx = _cx + baseR * Math.Sin(a);
            double by = _cy - baseR * Math.Cos(a);
            double tx = _cx + tipR * Math.Sin(a);
            double ty = _cy - tipR * Math.Cos(a);
            double px = Math.Cos(a) * halfW;
            double py = Math.Sin(a) * halfW;
            ClockCanvas.Children.Add(new Polygon
            {
                Fill = tickHr,
                Points = new PointCollection
                {
                    new Point(tx, ty),
                    new Point(bx - px, by - py),
                    new Point(bx + px, by + py)
                }
            });
        }

        DrawArabicNumbers(numBrush);
    }

    private void DrawModernFace(Brush tickHr, Brush tickMin)
    {
        for (int i = 0; i < 12; i++)
        {
            bool isCardinal = i % 3 == 0;
            double a = i * 30 * Math.PI / 180;
            double outerR = _r - Sc(6);
            if (isCardinal)
            {
                double innerR = _r - Sc(34);
                ClockCanvas.Children.Add(new Line
                {
                    X1 = _cx + outerR * Math.Sin(a), Y1 = _cy - outerR * Math.Cos(a),
                    X2 = _cx + innerR * Math.Sin(a), Y2 = _cy - innerR * Math.Cos(a),
                    Stroke = tickHr, StrokeThickness = Sc(3),
                    StrokeStartLineCap = PenLineCap.Flat, StrokeEndLineCap = PenLineCap.Flat
                });
            }
            else
            {
                double pos = _r - Sc(12);
                double dotR = Sc(2.5);
                double cx = _cx + pos * Math.Sin(a);
                double cy = _cy - pos * Math.Cos(a);
                var dot = new Ellipse
                {
                    Width = dotR * 2, Height = dotR * 2,
                    Fill = tickMin, Opacity = 0.7
                };
                Canvas.SetLeft(dot, cx - dotR);
                Canvas.SetTop(dot,  cy - dotR);
                ClockCanvas.Children.Add(dot);
            }
        }
    }

    private void DrawSteampunkFace(Brush faceBorder, Brush tickMin, Brush tickHr, Brush numBrush)
    {
        double innerD = (_r - Sc(22)) * 2;
        var innerRing = new Ellipse
        {
            Width = innerD, Height = innerD,
            Stroke = faceBorder, StrokeThickness = Sc(2),
            Fill = Brushes.Transparent, Opacity = 0.55
        };
        Canvas.SetLeft(innerRing, _cx - innerD / 2);
        Canvas.SetTop(innerRing,  _cy - innerD / 2);
        ClockCanvas.Children.Add(innerRing);

        for (int i = 0; i < 12; i++)
        {
            double a = i * 30 * Math.PI / 180;
            double rivetR = Sc(3);
            double pos = _r - Sc(3);
            double cx = _cx + pos * Math.Sin(a);
            double cy = _cy - pos * Math.Cos(a);
            var rivet = new Ellipse
            {
                Width = rivetR * 2, Height = rivetR * 2,
                Fill = tickHr, Opacity = 0.85
            };
            Canvas.SetLeft(rivet, cx - rivetR);
            Canvas.SetTop(rivet,  cy - rivetR);
            ClockCanvas.Children.Add(rivet);
        }

        DrawAllTicks(tickMin, tickHr);
        DrawRomanNumbers(numBrush);
    }

    private void DrawAviatorFace(Brush tickMin, Brush tickHr, Brush numBrush)
    {
        double fontSize = ScaledNumFont(0.15);
        double labelR   = _r * 0.71;
        for (int i = 0; i < 12; i++)
        {
            bool isCardinal = i % 3 == 0;
            double a = i * 30 * Math.PI / 180;
            double outerR = _r - Sc(4);
            double innerR = isCardinal ? _r - Sc(26) : _r - Sc(12);
            ClockCanvas.Children.Add(new Line
            {
                X1 = _cx + outerR * Math.Sin(a), Y1 = _cy - outerR * Math.Cos(a),
                X2 = _cx + innerR * Math.Sin(a), Y2 = _cy - innerR * Math.Cos(a),
                Stroke = isCardinal ? tickHr : tickMin,
                StrokeThickness = isCardinal ? Sc(4) : Sc(1),
                StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round
            });
        }
        foreach (int h in new[] { 12, 3, 6, 9 })
        {
            double a = h * 30 * Math.PI / 180;
            PlaceLabel(h.ToString(), a, labelR, fontSize, FontWeights.Bold, numBrush);
        }
    }

    private void PlaceLabel(string text, double angle, double radius, double fontSize,
                            FontWeight weight, Brush brush)
    {
        var tb = new TextBlock
        {
            Text = text, FontSize = fontSize, FontWeight = weight, Foreground = brush
        };
        double measure = Math.Max(Sc(60), fontSize * 4);
        tb.Measure(new Size(measure, measure));
        double tw = tb.DesiredSize.Width, th = tb.DesiredSize.Height;
        Canvas.SetLeft(tb, _cx + radius * Math.Sin(angle) - tw / 2);
        Canvas.SetTop(tb,  _cy - radius * Math.Cos(angle) - th / 2);
        ClockCanvas.Children.Add(tb);
    }

    private void AddHand(double angle, double len, double thickness, Brush stroke, double tail = 0)
    {
        ClockCanvas.Children.Add(new Line
        {
            X1 = _cx - tail * Math.Sin(angle), Y1 = _cy + tail * Math.Cos(angle),
            X2 = _cx + len  * Math.Sin(angle), Y2 = _cy - len  * Math.Cos(angle),
            Stroke = stroke, StrokeThickness = thickness,
            StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round
        });
    }

    private void DrawAmPmAndDate(DateTime now, Brush textBrush)
    {
        // ── 오전/오후 — 12시 바로 아래 ────────────────────────────────────
        string ampm = now.Hour < 12 ? "오전" : "오후";
        double ampmFont = ScaledNumFont(0.095);

        var ampmTb = new TextBlock
        {
            Text = ampm, FontSize = ampmFont,
            FontWeight = FontWeights.SemiBold, Foreground = textBrush
        };
        ampmTb.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
        double ampmW = ampmTb.DesiredSize.Width;
        double ampmH = ampmTb.DesiredSize.Height;
        // 12 숫자 위치(_r*0.72)에서 간격을 두고 아래쪽(중앙 방향)에 배치
        double ampmCy = _cy - _r * 0.50;
        Canvas.SetLeft(ampmTb, _cx - ampmW / 2);
        Canvas.SetTop(ampmTb,  ampmCy - ampmH / 2);
        ClockCanvas.Children.Add(ampmTb);

        // ── 날짜 — 6시 바로 위, 하얀 배경 ───────────────────────────────
        string dateStr = now.Day.ToString("D2");
        double dateFont = ScaledNumFont(0.105);

        var dateTb = new TextBlock
        {
            Text = dateStr, FontSize = dateFont,
            FontWeight = FontWeights.Bold, Foreground = Brushes.Black
        };
        dateTb.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
        double dateTbW = dateTb.DesiredSize.Width;
        double dateTbH = dateTb.DesiredSize.Height;

        double padX = Sc(5), padY = Sc(2.5);
        double bgW = dateTbW + padX * 2;
        double bgH = dateTbH + padY * 2;
        // 6 숫자 위치(_r*0.72)에서 간격을 두고 위쪽(중앙 방향)에 배치
        double dateCy = _cy + _r * 0.50;

        var bg = new Rectangle
        {
            Width = bgW, Height = bgH, Fill = Brushes.White,
            RadiusX = Sc(2), RadiusY = Sc(2)
        };
        Canvas.SetLeft(bg, _cx - bgW / 2);
        Canvas.SetTop(bg,  dateCy - bgH / 2);
        ClockCanvas.Children.Add(bg);

        Canvas.SetLeft(dateTb, _cx - dateTbW / 2);
        Canvas.SetTop(dateTb,  dateCy - dateTbH / 2);
        ClockCanvas.Children.Add(dateTb);
    }

    private Brush GetBrush(string key, Brush fallback)
        => TryFindResource(key) as Brush ?? fallback;
}
