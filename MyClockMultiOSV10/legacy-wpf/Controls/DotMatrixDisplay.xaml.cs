using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace MyClockWinV10.Controls;

public partial class DotMatrixDisplay : UserControl
{
    // 7×7 square dot matrix — single-row top/bottom bars, equal width and height per digit
    private const int Rows = 7;
    private const int Cols = 7;

    private const int DotPx  = 4;
    private const int GapPx  = 2;
    private const int Cell   = DotPx + GapPx;  // 6 px
    private const int DigitW = Cols * Cell;      // 42 px
    private const int DigitH = Rows * Cell;      // 42 px (square)
    private const int ColonW  = Cell * 2;        // 12 px
    private const int CharGap = Cell;            // 6 px

    private static readonly Dictionary<char, string[]> Patterns = new()
    {
        ['0'] = ["0111110","1000001","1000001","1000001","1000001","1000001","0111110"],
        ['1'] = ["0001000","0011000","0001000","0001000","0001000","0001000","0111110"],
        ['2'] = ["0111110","1000001","0000001","0011110","0110000","1000000","1111111"],
        ['3'] = ["0111110","1000001","0000001","0001110","0000001","1000001","0111110"],
        ['4'] = ["0010001","0100001","1000001","1111111","0000001","0000001","0000001"],
        ['5'] = ["1111111","1000000","1000000","0111110","0000001","0000001","0111110"],
        ['6'] = ["0111110","1000000","1000000","1111110","1000001","1000001","0111110"],
        ['7'] = ["1111111","0000001","0000010","0000100","0001000","0010000","0010000"],
        ['8'] = ["0111110","1000001","1000001","0111110","1000001","1000001","0111110"],
        ['9'] = ["0111110","1000001","1000001","0111111","0000001","0000001","0111110"],
        [' '] = ["0000000","0000000","0000000","0000000","0000000","0000000","0000000"],
    };

    public static readonly DependencyProperty TextProperty =
        DependencyProperty.Register(nameof(Text), typeof(string), typeof(DotMatrixDisplay),
            new PropertyMetadata("", (d, e) =>
            {
                var ctrl = (DotMatrixDisplay)d;
                ctrl.Rebuild();
                ctrl.InvalidateMeasure();
            }));

    public static readonly DependencyProperty DotColorProperty =
        DependencyProperty.Register(nameof(DotColor), typeof(Brush), typeof(DotMatrixDisplay),
            new PropertyMetadata(Brushes.DodgerBlue, (d, _) => ((DotMatrixDisplay)d).Rebuild()));

    public static readonly DependencyProperty DimColorProperty =
        DependencyProperty.Register(nameof(DimColor), typeof(Brush), typeof(DotMatrixDisplay),
            new PropertyMetadata(new SolidColorBrush(Color.FromArgb(40, 255, 255, 255)),
                (d, _) => ((DotMatrixDisplay)d).Rebuild()));

    public string Text
    {
        get => (string)GetValue(TextProperty);
        set => SetValue(TextProperty, value);
    }

    public Brush DotColor
    {
        get => (Brush)GetValue(DotColorProperty);
        set => SetValue(DotColorProperty, value);
    }

    public Brush DimColor
    {
        get => (Brush)GetValue(DimColorProperty);
        set => SetValue(DimColorProperty, value);
    }

    public DotMatrixDisplay() => InitializeComponent();

    private void Rebuild()
    {
        DotCanvas.Children.Clear();
        if (string.IsNullOrEmpty(Text)) return;

        int x = 0;
        foreach (char ch in Text)
        {
            if (ch == ':')
            {
                DrawColon(x);
                x += ColonW + CharGap;
            }
            else if (Patterns.TryGetValue(ch, out var rows))
            {
                DrawDigit(x, rows);
                x += DigitW + CharGap;
            }
            else
            {
                x += DigitW + CharGap;
            }
        }

        DotCanvas.Width  = x > 0 ? x - CharGap : 0;
        DotCanvas.Height = DigitH;
    }

    private void DrawDigit(int originX, string[] rows)
    {
        for (int r = 0; r < Rows; r++)
        {
            string row = rows[r];
            for (int c = 0; c < Cols && c < row.Length; c++)
                AddPixel(originX + c * Cell, r * Cell, row[c] == '1');
        }
    }

    private void DrawColon(int originX)
    {
        int cx = originX + (ColonW - DotPx) / 2;
        AddPixel(cx, 2 * Cell, true);
        AddPixel(cx, 4 * Cell, true);
    }

    private void AddPixel(int x, int y, bool on)
    {
        var pixel = new Rectangle
        {
            Width  = DotPx,
            Height = DotPx,
            Fill   = on ? DotColor : DimColor
        };
        Canvas.SetLeft(pixel, x);
        Canvas.SetTop(pixel, y);
        RenderOptions.SetEdgeMode(pixel, EdgeMode.Aliased);
        DotCanvas.Children.Add(pixel);
    }
}
