using MyDiffWinV10.App.Services;

namespace MyDiffWinV10.App.Controls;

/// <summary>
/// Twenty pastel swatches plus a custom-color picker for one pane title bar.
/// </summary>
public sealed class PaneHeaderColorSelector : UserControl
{
    private const int SwatchSize = 28;

    private static readonly Color SelectionBorderColor = Color.FromArgb(59, 130, 246);

    private readonly FlowLayoutPanel _swatches = new()
    {
        AutoSize = true,
        WrapContents = true,
        MaximumSize = new Size(340, 0),
    };

    private readonly Panel _preview = new()
    {
        Size = new Size(52, 28),
        BorderStyle = BorderStyle.FixedSingle,
        Margin = new Padding(0, 4, 8, 0),
    };

    private readonly Button _customButton = new()
    {
        AutoSize = true,
        Margin = new Padding(0, 4, 0, 0),
    };

    private readonly List<Button> _swatchButtons = new();
    private Button? _selectedSwatch;
    private Color _selectedColor = PaneHeaderColorPalette.DefaultLeftBackground;
    private bool _isCustomColor;

    public event EventHandler? SelectedColorChanged;

    public Color SelectedColor
    {
        get => _selectedColor;
        private set
        {
            if (_selectedColor.ToArgb() == value.ToArgb())
            {
                return;
            }

            _selectedColor = value;
            UpdatePreview();
            SelectedColorChanged?.Invoke(this, EventArgs.Empty);
        }
    }

    public PaneHeaderColorSelector()
    {
        AutoSize = true;
        foreach (Color color in PaneHeaderColorPalette.Colors)
        {
            var swatch = CreateSwatchButton(color);
            _swatchButtons.Add(swatch);
            _swatches.Controls.Add(swatch);
        }

        var customRow = new FlowLayoutPanel
        {
            AutoSize = true,
            WrapContents = false,
            Margin = new Padding(0, 6, 0, 0),
        };
        customRow.Controls.Add(_preview);
        customRow.Controls.Add(_customButton);
        _customButton.Click += (_, _) => PickCustomColor();

        var layout = new FlowLayoutPanel
        {
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
        };
        layout.Controls.Add(_swatches);
        layout.Controls.Add(customRow);
        Controls.Add(layout);

        ApplyLocalizedText();
        SetColor(PaneHeaderColorPalette.DefaultLeftBackground, notify: false);
    }

    public void SetColor(Color color, bool notify = true)
    {
        _isCustomColor = !PaneHeaderColorPalette.IsPaletteColor(color);
        _selectedColor = color;
        UpdatePreview();
        UpdateSwatchSelection(color);

        if (notify)
        {
            SelectedColorChanged?.Invoke(this, EventArgs.Empty);
        }
    }

    public void ApplyLocalizedText()
    {
        _customButton.Text = Strings.PreferencesCustomHeaderColor;
    }

    private Button CreateSwatchButton(Color color)
    {
        var button = new Button
        {
            Size = new Size(SwatchSize, SwatchSize),
            Margin = new Padding(0, 0, 4, 4),
            BackColor = color,
            FlatStyle = FlatStyle.Flat,
            TabStop = false,
            Tag = color,
        };
        button.FlatAppearance.BorderSize = 1;
        button.FlatAppearance.BorderColor = Color.FromArgb(203, 213, 225);
        button.Click += (_, _) => SelectPaletteColor(color, button);
        return button;
    }

    private void SelectPaletteColor(Color color, Button swatch)
    {
        _isCustomColor = false;
        _selectedColor = color;
        _selectedSwatch = swatch;
        UpdateSwatchSelection(color);
        UpdatePreview();
        SelectedColorChanged?.Invoke(this, EventArgs.Empty);
    }

    private void PickCustomColor()
    {
        using var dialog = new ColorDialog
        {
            Color = _selectedColor,
            FullOpen = true,
            AnyColor = true,
        };

        if (dialog.ShowDialog(FindForm()) != DialogResult.OK)
        {
            return;
        }

        _isCustomColor = true;
        _selectedColor = dialog.Color;
        _selectedSwatch = null;
        UpdateSwatchSelection(_selectedColor);
        UpdatePreview();
        SelectedColorChanged?.Invoke(this, EventArgs.Empty);
    }

    private void UpdateSwatchSelection(Color color)
    {
        foreach (var swatch in _swatchButtons)
        {
            bool selected = !_isCustomColor && ((Color)swatch.Tag!).ToArgb() == color.ToArgb();
            swatch.FlatAppearance.BorderSize = selected ? 2 : 1;
            swatch.FlatAppearance.BorderColor = selected ? SelectionBorderColor : Color.FromArgb(203, 213, 225);
            if (selected)
            {
                _selectedSwatch = swatch;
            }
        }
    }

    private void UpdatePreview()
    {
        _preview.BackColor = _selectedColor;
    }
}
