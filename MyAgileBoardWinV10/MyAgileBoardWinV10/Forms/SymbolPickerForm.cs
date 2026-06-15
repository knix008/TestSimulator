namespace MyAgileBoardWinV10.Forms;

public sealed class SymbolPickerForm : Form
{
    private readonly TabControl _tabs = new() { Dock = DockStyle.Fill };
    private readonly Button _btnClose = new() { Text = "닫기", DialogResult = DialogResult.Cancel, Width = 80 };

    public string? SelectedSymbol { get; private set; }

    private static readonly string[] SpecialSymbols =
    [
        "★", "☆", "●", "○", "■", "□", "▲", "△", "▼", "◆",
        "→", "←", "↑", "↓", "↔", "⇒", "⇐", "✓", "✗", "•",
        "…", "—", "–", "±", "×", "÷", "≈", "≠", "≤", "≥",
        "©", "®", "™", "§", "¶", "†", "‡", "°", "℃", "℉",
        "€", "£", "¥", "₩", "$", "¢", "‰", "∞", "µ", "π"
    ];

    private static readonly string[] Emoticons =
    [
        "😀", "😊", "😂", "😍", "🤔", "😎", "👍", "👎", "👏", "🙏",
        "❤️", "💙", "💚", "💛", "💜", "⭐", "🔥", "✅", "❌", "⚠️",
        "📌", "📅", "📎", "💡", "🎯", "🚀", "✨", "🎉", "🏆", "⏰",
        "☀️", "🌙", "☁️", "🌧️", "❄️", "🍀", "🎵", "📧", "🔔", "🔒"
    ];

    public SymbolPickerForm()
    {
        Text = "특수문자 / 이모티콘";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(420, 300);

        _tabs.TabPages.Add(BuildPage("특수문자", SpecialSymbols));
        _tabs.TabPages.Add(BuildPage("이모티콘", Emoticons));

        _btnClose.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
        _btnClose.Location = new Point(ClientSize.Width - 92, ClientSize.Height - 36);

        Controls.Add(_tabs);
        Controls.Add(_btnClose);
        CancelButton = _btnClose;
    }

    private TabPage BuildPage(string title, string[] symbols)
    {
        var page = new TabPage(title);
        var panel = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            Padding = new Padding(6),
            WrapContents = true
        };

        foreach (var symbol in symbols)
        {
            var btn = new Button
            {
                Text = symbol,
                Size = new Size(36, 32),
                Margin = new Padding(2),
                Font = new Font("Segoe UI Emoji", 12f),
                Tag = symbol
            };
            btn.Click += SymbolButton_Click;
            panel.Controls.Add(btn);
        }

        page.Controls.Add(panel);
        return page;
    }

    private void SymbolButton_Click(object? sender, EventArgs e)
    {
        if (sender is not Button btn || btn.Tag is not string symbol) return;
        SelectedSymbol = symbol;
        DialogResult = DialogResult.OK;
        Close();
    }
}
