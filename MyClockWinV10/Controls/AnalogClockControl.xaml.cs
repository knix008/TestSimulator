using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace MyClockWinV10.Controls;

public partial class AnalogClockControl : UserControl
{
    private const double CX = 190;
    private const double CY = 190;
    private const double R  = 178;

    public AnalogClockControl() => InitializeComponent();

    public void DrawClock(DateTime now)
    {
        ClockCanvas.Children.Clear();

        var faceFill   = Brush("ClockFaceBrush",   Brushes.Black);
        var faceBorder = Brush("ClockBorderBrush",  Brushes.Gray);
        var tickMin    = Brush("TickMarkBrush",      Brushes.DimGray);
        var tickHr     = Brush("HourTickBrush",      Brushes.White);
        var numBrush   = Brush("NumberBrush",        Brushes.White);
        var hourHand   = Brush("HourHandBrush",      Brushes.White);
        var minHand    = Brush("MinuteHandBrush",    Brushes.LightBlue);
        var secHand    = Brush("SecondHandBrush",    Brushes.Red);
        var centerDot  = Brush("CenterDotBrush",     Brushes.Red);

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

        // Tick marks
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

        // Hour numbers
        for (int i = 1; i <= 12; i++)
        {
            double a = i * 30 * Math.PI / 180;
            double tr = R - 42;
            var tb = new TextBlock
            {
                Text = i.ToString(),
                FontSize = 16,
                FontWeight = FontWeights.Bold,
                Foreground = numBrush
            };
            tb.Measure(new Size(40, 40));
            double tw = tb.DesiredSize.Width, th = tb.DesiredSize.Height;
            Canvas.SetLeft(tb, CX + tr * Math.Sin(a) - tw / 2);
            Canvas.SetTop(tb,  CY - tr * Math.Cos(a) - th / 2);
            ClockCanvas.Children.Add(tb);
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

    private Brush Brush(string key, Brush fallback)
        => TryFindResource(key) as Brush ?? fallback;
}
