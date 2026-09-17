using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace MyClockWinV10.Controls;

public partial class MiniAnalogClockControl : UserControl
{
    private const double CX = 36;
    private const double CY = 36;
    private const double R  = 32;

    public static readonly DependencyProperty LocalTimeProperty =
        DependencyProperty.Register("LocalTime", typeof(DateTime), typeof(MiniAnalogClockControl),
            new PropertyMetadata(DateTime.Now, (d, _) => ((MiniAnalogClockControl)d).Redraw()));

    public DateTime LocalTime
    {
        get => (DateTime)GetValue(LocalTimeProperty);
        set => SetValue(LocalTimeProperty, value);
    }

    public MiniAnalogClockControl()
    {
        InitializeComponent();
        Redraw();
    }

    private void Redraw()
    {
        MiniCanvas.Children.Clear();
        var now = LocalTime;

        var faceFill  = Br("ClockFaceBrush",  Brushes.Black);
        var faceBorder= Br("ClockBorderBrush", Brushes.Gray);
        var tickHr    = Br("HourTickBrush",    Brushes.White);
        var hourHand  = Br("HourHandBrush",    Brushes.White);
        var minHand   = Br("MinuteHandBrush",  Brushes.LightBlue);
        var secHand   = Br("SecondHandBrush",  Brushes.Red);
        var centerDot = Br("CenterDotBrush",   Brushes.Red);

        // Face
        var face = new Ellipse
        {
            Width = R * 2, Height = R * 2,
            Fill = faceFill, Stroke = faceBorder, StrokeThickness = 2
        };
        Canvas.SetLeft(face, CX - R);
        Canvas.SetTop(face,  CY - R);
        MiniCanvas.Children.Add(face);

        // 12 hour tick marks only
        for (int i = 0; i < 12; i++)
        {
            double a = i * 30 * Math.PI / 180;
            bool major = i % 3 == 0;
            double outerR = R - 2;
            double innerR = major ? R - 9 : R - 6;
            MiniCanvas.Children.Add(new Line
            {
                X1 = CX + outerR * Math.Sin(a), Y1 = CY - outerR * Math.Cos(a),
                X2 = CX + innerR * Math.Sin(a), Y2 = CY - innerR * Math.Cos(a),
                Stroke = tickHr, StrokeThickness = major ? 2 : 1,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap   = PenLineCap.Round
            });
        }

        double secA = now.Second                * 6      * Math.PI / 180;
        double minA = (now.Minute + now.Second  / 60.0)  * 6      * Math.PI / 180;
        double hrA  = ((now.Hour % 12) + now.Minute / 60.0) * 30  * Math.PI / 180;

        AddHand(hrA,  R * 0.50, 3,  hourHand);
        AddHand(minA, R * 0.72, 2,  minHand);
        AddHand(secA, R * 0.82, 1,  secHand, R * 0.15);

        var cap = new Ellipse { Width = 6, Height = 6, Fill = centerDot };
        Canvas.SetLeft(cap, CX - 3);
        Canvas.SetTop(cap,  CY - 3);
        MiniCanvas.Children.Add(cap);
    }

    private void AddHand(double angle, double len, double thickness, Brush stroke, double tail = 0)
    {
        MiniCanvas.Children.Add(new Line
        {
            X1 = CX - tail * Math.Sin(angle), Y1 = CY + tail * Math.Cos(angle),
            X2 = CX + len  * Math.Sin(angle), Y2 = CY - len  * Math.Cos(angle),
            Stroke = stroke, StrokeThickness = thickness,
            StrokeStartLineCap = PenLineCap.Round,
            StrokeEndLineCap   = PenLineCap.Round
        });
    }

    private Brush Br(string key, Brush fallback)
        => TryFindResource(key) as Brush ?? fallback;
}
