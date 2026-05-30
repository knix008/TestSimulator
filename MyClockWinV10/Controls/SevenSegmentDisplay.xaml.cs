using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace MyClockWinV10.Controls;

public partial class SevenSegmentDisplay : UserControl
{
    // Geometry constants (in device-independent units)
    private const double DW  = 52;   // digit width
    private const double DH  = 96;   // digit height
    private const double ST  = 10;   // segment thickness
    private const double GAP = 3;    // gap from digit edge
    private const double CG  = 12;   // character spacing
    private const double CW  = 24;   // colon width

    // Segment patterns: [a, b, c, d, e, f, g]
    private static readonly Dictionary<char, bool[]> Map = new()
    {
        ['0'] = [true,  true,  true,  true,  true,  true,  false],
        ['1'] = [false, true,  true,  false, false, false, false],
        ['2'] = [true,  true,  false, true,  true,  false, true ],
        ['3'] = [true,  true,  true,  true,  false, false, true ],
        ['4'] = [false, true,  true,  false, false, true,  true ],
        ['5'] = [true,  false, true,  true,  false, true,  true ],
        ['6'] = [true,  false, true,  true,  true,  true,  true ],
        ['7'] = [true,  true,  true,  false, false, false, false],
        ['8'] = [true,  true,  true,  true,  true,  true,  true ],
        ['9'] = [true,  true,  true,  true,  false, true,  true ],
        [' '] = [false, false, false, false, false, false, false],
        ['-'] = [false, false, false, false, false, false, true ],
    };

    // ── Dependency Properties ─────────────────────────────────────────────

    public static readonly DependencyProperty TextProperty =
        DependencyProperty.Register(nameof(Text), typeof(string), typeof(SevenSegmentDisplay),
            new PropertyMetadata("", (d, _) => ((SevenSegmentDisplay)d).Rebuild()));

    public static readonly DependencyProperty SegColorProperty =
        DependencyProperty.Register(nameof(SegColor), typeof(Brush), typeof(SevenSegmentDisplay),
            new PropertyMetadata(Brushes.DodgerBlue, (d, _) => ((SevenSegmentDisplay)d).Rebuild()));

    public static readonly DependencyProperty DimColorProperty =
        DependencyProperty.Register(nameof(DimColor), typeof(Brush), typeof(SevenSegmentDisplay),
            new PropertyMetadata(new SolidColorBrush(Color.FromArgb(30, 255, 255, 255)),
                (d, _) => ((SevenSegmentDisplay)d).Rebuild()));

    public string Text
    {
        get => (string)GetValue(TextProperty);
        set => SetValue(TextProperty, value);
    }

    public Brush SegColor
    {
        get => (Brush)GetValue(SegColorProperty);
        set => SetValue(SegColorProperty, value);
    }

    public Brush DimColor
    {
        get => (Brush)GetValue(DimColorProperty);
        set => SetValue(DimColorProperty, value);
    }

    // ── Constructor ───────────────────────────────────────────────────────

    public SevenSegmentDisplay() => InitializeComponent();

    // ── Drawing ───────────────────────────────────────────────────────────

    private void Rebuild()
    {
        SegCanvas.Children.Clear();
        if (string.IsNullOrEmpty(Text)) return;

        double x = 0;
        foreach (char ch in Text)
        {
            if (ch == ':')
            {
                DrawColon(x);
                x += CW;
            }
            else if (Map.TryGetValue(ch, out var segs))
            {
                DrawDigit(x, segs);
                x += DW + CG;
            }
            else
            {
                x += DW + CG;
            }
        }

        SegCanvas.Width  = x > 0 ? x - CG : 0;
        SegCanvas.Height = DH;
    }

    private void DrawDigit(double x, bool[] s)
    {
        // a – top
        SegCanvas.Children.Add(MakeH(x + GAP,        0,           DW - 2*GAP, ST,          s[0]));
        // b – top-right
        SegCanvas.Children.Add(MakeV(x + DW - ST,    GAP,         ST,         DH/2 - 2*GAP, s[1]));
        // c – bottom-right
        SegCanvas.Children.Add(MakeV(x + DW - ST,    DH/2 + GAP,  ST,         DH/2 - 2*GAP, s[2]));
        // d – bottom
        SegCanvas.Children.Add(MakeH(x + GAP,        DH - ST,     DW - 2*GAP, ST,           s[3]));
        // e – bottom-left
        SegCanvas.Children.Add(MakeV(x,              DH/2 + GAP,  ST,         DH/2 - 2*GAP, s[4]));
        // f – top-left
        SegCanvas.Children.Add(MakeV(x,              GAP,         ST,         DH/2 - 2*GAP, s[5]));
        // g – middle
        SegCanvas.Children.Add(MakeH(x + GAP,        (DH-ST)/2,   DW - 2*GAP, ST,           s[6]));
    }

    private void DrawColon(double x)
    {
        double r  = ST * 0.7;
        double cx = x + CW / 2 - r / 2;
        AddDot(cx, DH / 3 - r / 2, r);
        AddDot(cx, 2 * DH / 3 - r / 2, r);
    }

    private void AddDot(double x, double y, double size)
    {
        var e = new Ellipse { Width = size, Height = size, Fill = SegColor };
        Canvas.SetLeft(e, x);
        Canvas.SetTop(e, y);
        SegCanvas.Children.Add(e);
    }

    // Horizontal hexagon segment
    private Polygon MakeH(double x, double y, double w, double h, bool on)
    {
        double c = h / 2;
        return new Polygon
        {
            Fill = on ? SegColor : DimColor,
            Points = new PointCollection
            {
                new Point(x + c,     y),
                new Point(x + w - c, y),
                new Point(x + w,     y + c),
                new Point(x + w - c, y + h),
                new Point(x + c,     y + h),
                new Point(x,         y + c)
            }
        };
    }

    // Vertical hexagon segment
    private Polygon MakeV(double x, double y, double w, double h, bool on)
    {
        double c = w / 2;
        return new Polygon
        {
            Fill = on ? SegColor : DimColor,
            Points = new PointCollection
            {
                new Point(x + c, y),
                new Point(x + w, y + c),
                new Point(x + w, y + h - c),
                new Point(x + c, y + h),
                new Point(x,     y + h - c),
                new Point(x,     y + c)
            }
        };
    }
}
