namespace MyAgileBoardWinV10.Controls;

internal sealed class ColumnCanvasPanel : Panel
{
    public ColumnCanvasPanel()
    {
        DoubleBuffered = true;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
    }
}
