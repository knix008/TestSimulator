using MyAgileBoardWinV10.Utils;

namespace MyAgileBoardWinV10.Controls;

/// <summary>카드 우측 상단 접힘 표시.</summary>
internal sealed class CardFoldCornerPanel : Panel
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

    public CardFoldCornerPanel()
    {
        Size = new Size(CardFoldEffect.DefaultFoldSize, CardFoldEffect.DefaultFoldSize);
        TabStop = false;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        using (var baseFill = new SolidBrush(_cardColor))
            g.FillRectangle(baseFill, ClientRectangle);

        CardFoldEffect.DrawTopRightFold(g, ClientRectangle, _cardColor);
    }

    protected override void OnPaintBackground(PaintEventArgs pevent)
    {
    }
}
