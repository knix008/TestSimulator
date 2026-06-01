using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace MyClockWinV10.Controls;

public partial class DotMatrixDisplay : UserControl
{
    // 10 rows: horizontal segments (top/middle/bottom) are always 2 rows thick
    private const int Rows = 10;
    private const int Cols = 5;

    /// <summary>Lit/dim square size in device pixels (before Viewbox scale).</summary>
    private const int DotPx = 4;

    /// <summary>Minimum gap between dots horizontally and vertically.</summary>
    private const int GapPx = 2;

    /// <summary>Cell pitch = dot + gap (6px).</summary>
    private const int Cell = DotPx + GapPx;

    private const int DigitW  = Cols * Cell;
    private const int DigitH  = Rows * Cell;
    private const int ColonW  = Cell * 2;
    private const int CharGap = Cell;

    // 10×5 — each horizontal bar uses 2 consecutive rows (e.g. 2, 3, 5 → top bar = rows 0–1)
    private static readonly Dictionary<char, string[]> Patterns = new()
    {
        ['0'] = ["01110","01110","10001","10001","10001","10001","01110","01110","00000","00000"],
        ['1'] = ["00000","00100","01100","00100","00100","00100","00100","00100","00100","00100"],
        ['2'] = ["01110","01110","00001","00001","01110","01110","10000","10000","01110","01110"],
        ['3'] = ["01110","01110","00001","00001","01110","01110","00001","00001","01110","01110"],
        ['4'] = ["10001","10001","10001","10001","01110","01110","00001","00001","00001","00001"],
        ['5'] = ["01110","01110","10000","10000","01110","01110","00001","00001","01110","01110"],
        ['6'] = ["01110","01110","10000","10000","01110","01110","10001","10001","01110","01110"],
        ['7'] = ["01110","01110","00001","00010","00100","01000","01000","01000","01000","01000"],
        ['8'] = ["01110","01110","10001","10001","01110","01110","10001","10001","01110","01110"],
        ['9'] = ["01110","01110","10001","10001","01110","01110","00001","00001","01110","01110"],
        [' '] = ["00000","00000","00000","00000","00000","00000","00000","00000","00000","00000"],
    };

    public static readonly DependencyProperty TextProperty =
        DependencyProperty.Register(nameof(Text), typeof(string), typeof(DotMatrixDisplay),
            new PropertyMetadata("", (d, _) => ((DotMatrixDisplay)d).Rebuild()));

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
        AddPixel(cx, 3 * Cell, true);
        AddPixel(cx, 7 * Cell, true);
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
