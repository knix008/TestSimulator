using MyAgileBoardWinV10.Models;

namespace MyAgileBoardWinV10.Forms;

public partial class BurndownChartColorForm : Form
{
    private BurndownChartColorSettings _colors = BurndownChartColorSettings.CreateDefault();

    public BurndownChartColorForm()
    {
        InitializeComponent();
    }

    public BurndownChartColorForm(BurndownChartColorSettings colors) : this()
    {
        _colors = colors.Clone();
        UpdateSwatches();
    }

    public BurndownChartColorSettings Colors => _colors.Clone();

    private void btnReset_Click(object? sender, EventArgs e)
    {
        var defaults = BurndownChartColorSettings.CreateDefault();
        _colors.DailyBarHex = defaults.DailyBarHex;
        _colors.IdealLineHex = defaults.IdealLineHex;
        _colors.RemainingLineHex = defaults.RemainingLineHex;
        UpdateSwatches();
    }

    private void swatchDailyBar_Click(object? sender, EventArgs e) => PickColor("dailyBar");
    private void btnPickDailyBar_Click(object? sender, EventArgs e) => PickColor("dailyBar");
    private void swatchIdealLine_Click(object? sender, EventArgs e) => PickColor("idealLine");
    private void btnPickIdealLine_Click(object? sender, EventArgs e) => PickColor("idealLine");
    private void swatchRemainingLine_Click(object? sender, EventArgs e) => PickColor("remainingLine");
    private void btnPickRemainingLine_Click(object? sender, EventArgs e) => PickColor("remainingLine");

    private void PickColor(string key)
    {
        var current = ColorFromHex(GetHex(key));
        using var dlg = new ColorDialog { Color = current, FullOpen = true };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;

        SetHex(key, ColorToHex(dlg.Color));
        UpdateSwatches();
    }

    private string GetHex(string key) => key switch
    {
        "dailyBar" => _colors.DailyBarHex,
        "idealLine" => _colors.IdealLineHex,
        "remainingLine" => _colors.RemainingLineHex,
        _ => "#000000"
    };

    private void SetHex(string key, string hex)
    {
        switch (key)
        {
            case "dailyBar": _colors.DailyBarHex = hex; break;
            case "idealLine": _colors.IdealLineHex = hex; break;
            case "remainingLine": _colors.RemainingLineHex = hex; break;
        }
    }

    private void UpdateSwatches()
    {
        swatchDailyBar.BackColor = ColorFromHex(_colors.DailyBarHex);
        swatchIdealLine.BackColor = ColorFromHex(_colors.IdealLineHex);
        swatchRemainingLine.BackColor = ColorFromHex(_colors.RemainingLineHex);
    }

    private static Color ColorFromHex(string hex)
    {
        try { return ColorTranslator.FromHtml(hex); }
        catch { return Color.Gray; }
    }

    private static string ColorToHex(Color color)
        => $"#{color.R:X2}{color.G:X2}{color.B:X2}";
}
