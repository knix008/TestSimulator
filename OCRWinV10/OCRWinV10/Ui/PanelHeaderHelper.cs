namespace OCRWinV10.Ui;

public static class PanelHeaderHelper
{
    public static void Style(Label label, string text)
    {
        label.Text = $"  {text.Trim()}";
        label.Font = UiTheme.TitleFont;
        label.ForeColor = UiTheme.HeaderText;
        label.BackColor = Color.Transparent;
        label.TextAlign = ContentAlignment.MiddleLeft;
        label.Dock = DockStyle.Fill;
    }

    public static void StylePanel(Panel panel)
    {
        panel.BackColor = UiTheme.HeaderBackground;
        panel.Padding = new Padding(4, 0, 8, 0);
        panel.Height = 32;
    }
}
