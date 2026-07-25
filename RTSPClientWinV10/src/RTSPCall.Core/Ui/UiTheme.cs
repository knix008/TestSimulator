using RTSPCall.Core.Models;

namespace RTSPCall.Core.Ui;

public sealed class ThemePalette
{
    public required Color FormBack { get; init; }
    public required Color PanelTop { get; init; }
    public required Color PanelContent { get; init; }
    public required Color PanelLog { get; init; }
    public required Color VideoBack { get; init; }
    public required Color Label { get; init; }
    public required Color LabelMuted { get; init; }
    public required Color LabelAccent { get; init; }
    public required Color InputBack { get; init; }
    public required Color InputFore { get; init; }
    public required Color ButtonBack { get; init; }
    public required Color ButtonFore { get; init; }
}

public static class UiTheme
{
    public static ThemePalette Get(UiThemeMode mode) => mode switch
    {
        UiThemeMode.Light => new ThemePalette
        {
            FormBack = Color.FromArgb(245, 247, 250),
            PanelTop = Color.FromArgb(232, 236, 242),
            PanelContent = Color.FromArgb(255, 255, 255),
            PanelLog = Color.FromArgb(232, 236, 242),
            VideoBack = Color.FromArgb(30, 34, 40),
            Label = Color.FromArgb(28, 32, 38),
            LabelMuted = Color.FromArgb(90, 98, 110),
            LabelAccent = Color.FromArgb(0, 102, 163),
            InputBack = Color.White,
            InputFore = Color.FromArgb(20, 22, 26),
            ButtonBack = Color.FromArgb(236, 240, 245),
            ButtonFore = Color.FromArgb(28, 32, 38)
        },
        _ => new ThemePalette
        {
            FormBack = Color.FromArgb(30, 31, 34),
            PanelTop = Color.FromArgb(43, 45, 49),
            PanelContent = Color.FromArgb(17, 18, 20),
            PanelLog = Color.FromArgb(43, 45, 49),
            VideoBack = Color.FromArgb(17, 18, 20),
            Label = Color.White,
            LabelMuted = Color.Silver,
            LabelAccent = Color.FromArgb(160, 230, 255),
            InputBack = Color.White,
            InputFore = Color.FromArgb(20, 22, 26),
            ButtonBack = Color.FromArgb(60, 63, 70),
            ButtonFore = Color.White
        }
    };

    public static void ApplyForm(Form form, ThemePalette p)
    {
        form.BackColor = p.FormBack;
        form.ForeColor = p.Label;
    }

    public static void ApplyPanel(Panel panel, Color back)
    {
        panel.BackColor = back;
    }

    public static void ApplyLabel(Label label, Color fore)
    {
        label.ForeColor = fore;
    }

    public static void ApplyInput(Control control, ThemePalette p)
    {
        control.BackColor = p.InputBack;
        control.ForeColor = p.InputFore;
    }

    public static void ApplyButton(Button button, ThemePalette p)
    {
        button.FlatStyle = FlatStyle.Standard;
        button.UseVisualStyleBackColor = false;
        button.BackColor = p.ButtonBack;
        button.ForeColor = p.ButtonFore;
    }

    public static void ApplyCheckBox(CheckBox checkBox, ThemePalette p)
    {
        checkBox.ForeColor = p.Label;
        checkBox.BackColor = Color.Transparent;
        checkBox.UseVisualStyleBackColor = true;
    }
}
