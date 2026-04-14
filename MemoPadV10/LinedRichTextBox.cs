namespace MemoPadV10;

public sealed class LinedRichTextBox : RichTextBox
{
    private Color _editorBackColor = Color.FromArgb(255, 248, 225, 140);

    public LinedRichTextBox()
    {
        BorderStyle = BorderStyle.None;
        ForeColor = Color.Black;
        WordWrap = true;
        base.BackColor = _editorBackColor;
    }

    public Color LineColor
    {
        get => Color.FromArgb(190, 145, 40);
        set
        {
            // Kept for compatibility with designer code.
        }
    }

    public override Color BackColor
    {
        get => _editorBackColor;
        set
        {
            _editorBackColor = value;
            base.BackColor = value;
        }
    }
}
