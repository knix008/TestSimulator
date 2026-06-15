using MyAgileBoardWinV10.Models;

namespace MyAgileBoardWinV10.Forms;

public sealed class BurndownChartColorForm : Form
{
    private readonly BurndownChartColorSettings _colors;
    private readonly Dictionary<string, Panel> _swatches = new();

    public BurndownChartColorForm(BurndownChartColorSettings colors)
    {
        _colors = colors.Clone();
        InitializeLayout();
        UpdateSwatches();
    }

    public BurndownChartColorSettings Colors => _colors.Clone();

    private void InitializeLayout()
    {
        Text = "Burn Down 차트 색상";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(360, 220);

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 3,
            RowCount = 4,
            Padding = new Padding(12)
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 44));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        AddColorRow(layout, 0, "dailyBar", "일별 완료 막대");
        AddColorRow(layout, 1, "idealLine", "이상 소진선");
        AddColorRow(layout, 2, "remainingLine", "실제 잔여량");

        var btnReset = new Button
        {
            Text = "기본값으로 재설정",
            AutoSize = true,
            Anchor = AnchorStyles.Left
        };
        btnReset.Click += (_, _) =>
        {
            var defaults = BurndownChartColorSettings.CreateDefault();
            _colors.DailyBarHex = defaults.DailyBarHex;
            _colors.IdealLineHex = defaults.IdealLineHex;
            _colors.RemainingLineHex = defaults.RemainingLineHex;
            UpdateSwatches();
        };

        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false
        };
        var btnOk = new Button { Text = "확인", DialogResult = DialogResult.OK, Width = 80 };
        var btnCancel = new Button { Text = "취소", DialogResult = DialogResult.Cancel, Width = 80 };
        buttons.Controls.Add(btnOk);
        buttons.Controls.Add(btnCancel);

        var bottom = new TableLayoutPanel
        {
            Dock = DockStyle.Bottom,
            Height = 44,
            ColumnCount = 2,
            Padding = new Padding(12, 0, 12, 12)
        };
        bottom.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        bottom.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        bottom.Controls.Add(btnReset, 0, 0);
        bottom.Controls.Add(buttons, 1, 0);

        Controls.Add(layout);
        Controls.Add(bottom);
        AcceptButton = btnOk;
        CancelButton = btnCancel;
    }

    private void AddColorRow(TableLayoutPanel layout, int row, string key, string labelText)
    {
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));

        var lbl = new Label
        {
            Text = labelText,
            AutoSize = false,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft
        };

        var swatch = new Panel
        {
            Size = new Size(32, 24),
            BorderStyle = BorderStyle.FixedSingle,
            Margin = new Padding(4, 8, 4, 8),
            Cursor = Cursors.Hand
        };
        swatch.Click += (_, _) => PickColor(key);
        _swatches[key] = swatch;

        var btnPick = new Button
        {
            Text = "색 선택...",
            AutoSize = true,
            Anchor = AnchorStyles.Left,
            Tag = key
        };
        btnPick.Click += (_, _) => PickColor(key);

        layout.Controls.Add(lbl, 0, row);
        layout.Controls.Add(swatch, 1, row);
        layout.Controls.Add(btnPick, 2, row);
    }

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
        foreach (var (key, panel) in _swatches)
            panel.BackColor = ColorFromHex(GetHex(key));
    }

    private static Color ColorFromHex(string hex)
    {
        try { return ColorTranslator.FromHtml(hex); }
        catch { return Color.Gray; }
    }

    private static string ColorToHex(Color color)
        => $"#{color.R:X2}{color.G:X2}{color.B:X2}";
}
