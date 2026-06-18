using MyAgileBoardWinV10.Utils;

namespace MyAgileBoardWinV10.Controls;

internal sealed class CardResizeGripPanel : Panel
{
    private Color _cardColor = Color.WhiteSmoke;

    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    [System.ComponentModel.Browsable(false)]
    public Color CardColor
    {
        get => _cardColor;
        set
        {
            if (_cardColor == value) return;
            _cardColor = value;
            Invalidate();
        }
    }

    public CardResizeGripPanel()
    {
        Size = new Size(CardCanvasHelper.ResizeGripVisualSize, CardCanvasHelper.ResizeGripVisualSize);
        BackColor = Color.Transparent;
        Cursor = Cursors.SizeNWSE;
        TabStop = false;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.SupportsTransparentBackColor, true);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        CardResizeGripPainter.Paint(e.Graphics, ClientRectangle, _cardColor);
    }

    protected override void OnPaintBackground(PaintEventArgs pevent)
    {
    }
}
