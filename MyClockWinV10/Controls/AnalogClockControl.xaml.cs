using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using MyClockWinV10.Models;

namespace MyClockWinV10.Controls;

public partial class AnalogClockControl : UserControl
{
    private const double CX = 190;
    private const double CY = 190;
    private const double R  = 178;

    private static readonly string[] RomanNumerals =
        ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

    public AnalogStyle ClockStyle { get; set; } = AnalogStyle.Classic;

    public AnalogClockControl() => InitializeComponent();

    public void DrawClock(DateTime now)
    {
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

        // Outer glow ring
        var glow = new Ellipse
        {
            Width = R * 2 + 16, Height = R * 2 + 16,
            Fill = Brushes.Transparent,
            Stroke = faceBorder, StrokeThickness = 1,
            Opacity = 0.3
        };
        Canvas.SetLeft(glow, CX - R - 8);
        Canvas.SetTop(glow,  CY - R - 8);
        ClockCanvas.Children.Add(glow);

        // Clock face
        var face = new Ellipse
        {
            Width = R * 2, Height = R * 2,
            Fill = faceFill, Stroke = faceBorder, StrokeThickness = 5
        };
        Canvas.SetLeft(face, CX - R);
        Canvas.SetTop(face,  CY - R);
        ClockCanvas.Children.Add(face);

        // Style-specific markers
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
        }

        // Hand angles
        double secA = now.Second               * 6      * Math.PI / 180;
        double minA = (now.Minute + now.Second / 60.0)  * 6      * Math.PI / 180;
        double hrA  = ((now.Hour % 12) + now.Minute / 60.0) * 30 * Math.PI / 180;

        AddHand(hrA,  R * 0.50, 8,  hourHand);
        AddHand(minA, R * 0.72, 5,  minHand);
        AddHand(secA, R * 0.85, 2,  secHand, R * 0.22);

        // Center cap
        var cap = new Ellipse { Width = 16, Height = 16, Fill = centerDot };
        Canvas.SetLeft(cap, CX - 8);
        Canvas.SetTop(cap,  CY - 8);
        ClockCanvas.Children.Add(cap);
    }

    private void DrawAllTicks(Brush tickMin, Brush tickHr)
    {
        for (int i = 0; i < 60; i++)
        {
            bool isHour = i % 5 == 0;
            double a = i * 6 * Math.PI / 180;
            double outerR = R - 4;
            double innerR = isHour ? R - 24 : R - 11;
            ClockCanvas.Children.Add(new Line
            {
                X1 = CX + outerR * Math.Sin(a), Y1 = CY - outerR * Math.Cos(a),
                X2 = CX + innerR * Math.Sin(a), Y2 = CY - innerR * Math.Cos(a),
                Stroke = isHour ? tickHr : tickMin,
                StrokeThickness = isHour ? 3 : 1,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap   = PenLineCap.Round
            });
        }
    }

    private void DrawArabicNumbers(Brush numBrush)
    {
        for (int i = 1; i <= 12; i++)
        {
            double a = i * 30 * Math.PI / 180;
            PlaceLabel(i.ToString(), a, R - 42, 16, FontWeights.Bold, numBrush);
        }
    }

    private void DrawRomanNumbers(Brush numBrush)
    {
        for (int i = 1; i <= 12; i++)
        {
            double a = i * 30 * Math.PI / 180;
            PlaceLabel(RomanNumerals[i], a, R - 44, 12, FontWeights.Bold, numBrush);
        }
    }

    private void DrawCardinalDots(Brush tickHr)
    {
        for (int i = 0; i < 12; i++)
        {
            bool isCardinal = i % 3 == 0;
            double a = i * 30 * Math.PI / 180;
            double dotR = isCardinal ? 6 : 3;
            double pos  = R - 14;
            double cx = CX + pos * Math.Sin(a);
            double cy = CY - pos * Math.Cos(a);
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
            double outerR    = R - 4;
            double innerR    = isCardinal ? R - 30 : R - 18;
            double thickness = isCardinal ? 7 : 4;
            ClockCanvas.Children.Add(new Line
            {
                X1 = CX + outerR * Math.Sin(a), Y1 = CY - outerR * Math.Cos(a),
                X2 = CX + innerR * Math.Sin(a), Y2 = CY - innerR * Math.Cos(a),
                Stroke = tickHr,
                StrokeThickness = thickness,
                StrokeStartLineCap = PenLineCap.Flat,
                StrokeEndLineCap   = PenLineCap.Flat
            });
        }
    }

    private void PlaceLabel(string text, double angle, double radius, double fontSize,
                            FontWeight weight, Brush brush)
    {
        var tb = new TextBlock
        {
            Text = text, FontSize = fontSize, FontWeight = weight, Foreground = brush
        };
        tb.Measure(new Size(60, 40));
        double tw = tb.DesiredSize.Width, th = tb.DesiredSize.Height;
        Canvas.SetLeft(tb, CX + radius * Math.Sin(angle) - tw / 2);
        Canvas.SetTop(tb,  CY - radius * Math.Cos(angle) - th / 2);
        ClockCanvas.Children.Add(tb);
    }

    private void AddHand(double angle, double len, double thickness, Brush stroke, double tail = 0)
    {
        ClockCanvas.Children.Add(new Line
        {
            X1 = CX - tail * Math.Sin(angle), Y1 = CY + tail * Math.Cos(angle),
            X2 = CX + len  * Math.Sin(angle), Y2 = CY - len  * Math.Cos(angle),
            Stroke = stroke, StrokeThickness = thickness,
            StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round
        });
    }

    private Brush GetBrush(string key, Brush fallback)
        => TryFindResource(key) as Brush ?? fallback;
}
