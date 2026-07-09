namespace MyGitWinV10.App.Controls;

public class SingleLineToolStripTextBox : ToolStripControlHost
{
    private const int VerticalCenterBias = 1;
    private readonly Panel _panel;
    private readonly TextBox _textBox;

    public SingleLineToolStripTextBox()
        : base(new Panel())
    {
        _panel = (Panel)Control;
        _panel.BackColor = SystemColors.Window;
        _panel.BorderStyle = BorderStyle.FixedSingle;

        _textBox = new TextBox
        {
            BorderStyle = BorderStyle.None,
            Multiline = false,
            AcceptsReturn = false,
            AcceptsTab = false,
            WordWrap = false,
            AutoSize = false,
        };
        _panel.Controls.Add(_textBox);

        _panel.Resize += (_, _) => AlignTextBoxVertically();
        _textBox.FontChanged += (_, _) => AlignTextBoxVertically();
        AutoSize = false;
        AlignTextBoxVertically();
    }

    public TextBox TextBox => _textBox;

    public void Clear() => _textBox.Clear();

    protected override void OnFontChanged(EventArgs e)
    {
        base.OnFontChanged(e);
        if (_textBox is null)
        {
            return;
        }

        _textBox.Font = Font;
        AlignTextBoxVertically();
    }

    protected override void OnBoundsChanged()
    {
        base.OnBoundsChanged();
        AlignTextBoxVertically();
    }

    private void AlignTextBoxVertically()
    {
        if (_textBox is null || _panel.IsDisposed || _textBox.IsDisposed)
        {
            return;
        }

        _textBox.Multiline = false;

        int innerHeight = _textBox.PreferredHeight;
        int width = Math.Max(0, _panel.ClientSize.Width - 2);
        int y = Math.Max(0, (_panel.ClientSize.Height - innerHeight) / 2 + VerticalCenterBias);

        _textBox.SetBounds(1, y, width, innerHeight);
    }
}
