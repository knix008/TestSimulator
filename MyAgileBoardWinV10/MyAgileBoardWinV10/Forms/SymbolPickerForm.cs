namespace MyAgileBoardWinV10.Forms;

public partial class SymbolPickerForm : Form
{
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
        InitializeComponent();
        Load += SymbolPickerForm_Load;
    }

    private void SymbolPickerForm_Load(object? sender, EventArgs e)
    {
        Load -= SymbolPickerForm_Load;
        PopulateSymbols(flowSpecial, SpecialSymbols);
        PopulateSymbols(flowEmoji, Emoticons);
    }

    private void PopulateSymbols(FlowLayoutPanel panel, string[] symbols)
    {
        panel.Controls.Clear();
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
    }

    private void SymbolButton_Click(object? sender, EventArgs e)
    {
        if (sender is not Button btn || btn.Tag is not string symbol) return;
        SelectedSymbol = symbol;
        DialogResult = DialogResult.OK;
        Close();
    }
}
