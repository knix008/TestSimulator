using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using MyMindWin.Models;

namespace MyMindWin.Views
{
    public partial class ExportImageDialog : Window
    {
        private sealed record HeadingPositionItem(ExportHeadingPosition Position, string Label);

        private static readonly HeadingPositionItem[] PositionItems =
        [
            new(ExportHeadingPosition.TopLeft, "좌상단"),
            new(ExportHeadingPosition.TopCenter, "상단 중앙"),
            new(ExportHeadingPosition.TopRight, "상단 우측"),
            new(ExportHeadingPosition.BottomLeft, "좌하단"),
            new(ExportHeadingPosition.BottomCenter, "하단 중앙"),
            new(ExportHeadingPosition.BottomRight, "하단 우측")
        ];

        private static readonly string[] PaletteColors =
        [
            "#000000", "#333333", "#666666", "#999999", "#CCCCCC", "#FFFFFF",
            "#8B0000", "#CC0000", "#FF6600", "#FFCC00", "#228B22", "#0066CC",
            "#4B0082", "#FF1493", "#1A1F2E", "#E8EEF8"
        ];

        private readonly Dictionary<string, Border> _paletteSwatches = new(StringComparer.OrdinalIgnoreCase);

        private bool _includeHeading;
        private string _headingText = string.Empty;
        private bool _suppressColorSync;

        public ExportImageDialog(string documentTitle, Window? owner)
        {
            InitializeComponent();

            IncludeHeadingCheck.Checked += IncludeHeadingCheck_Changed;
            IncludeHeadingCheck.Unchecked += IncludeHeadingCheck_Changed;

            HeadingPositionCombo.ItemsSource = PositionItems;
            HeadingPositionCombo.SelectedValuePath = nameof(HeadingPositionItem.Position);
            HeadingPositionCombo.SelectedIndex = 0;

            BuildColorPalette();

            HeadingColorBox.TextChanged += HeadingColorBox_TextChanged;

            HeadingBox.Text = documentTitle;
            IncludeHeadingCheck.IsChecked = true;
            SelectHeadingColor("#000000", fromTextBox: false);
            UpdateHeadingEnabled();

            if (owner != null)
            {
                Owner = owner;
                WindowStartupLocation = WindowStartupLocation.CenterOwner;
            }
        }

        /// <summary>확인 시점에 확정된 Heading 포함 여부.</summary>
        public bool IncludeHeading => _includeHeading;

        /// <summary>확인 시점의 Heading 텍스트 (포함 해제 시 null).</summary>
        public string? HeadingText =>
            _includeHeading && !string.IsNullOrWhiteSpace(_headingText)
                ? _headingText.Trim()
                : null;

        /// <summary>보내기 옵션용 제목 설정.</summary>
        public (bool IncludeHeading, string? Heading, ExportHeadingPosition Position, Color HeadingColor)
            GetExportHeadingSettings()
        {
            if (IncludeHeadingCheck.IsChecked != true)
                return (false, null, ExportHeadingPosition.TopLeft, Colors.Black);

            var text = HeadingBox.Text?.Trim();
            if (string.IsNullOrWhiteSpace(text))
                return (false, null, ExportHeadingPosition.TopLeft, Colors.Black);

            var position = HeadingPositionCombo.SelectedValue is ExportHeadingPosition selected
                ? selected
                : ExportHeadingPosition.TopLeft;
            var color = ParseHeadingColor(HeadingColorBox.Text);
            return (true, text, position, color);
        }

        private void BuildColorPalette()
        {
            foreach (var hex in PaletteColors)
            {
                var swatch = new Border
                {
                    Width = 28,
                    Height = 28,
                    Margin = new Thickness(2),
                    CornerRadius = new CornerRadius(4),
                    BorderBrush = new SolidColorBrush(Color.FromRgb(0x44, 0x55, 0x66)),
                    BorderThickness = new Thickness(1),
                    Background = new SolidColorBrush(ParseHeadingColor(hex)),
                    Cursor = Cursors.Hand,
                    ToolTip = hex
                };
                swatch.MouseLeftButtonDown += (_, _) => SelectHeadingColor(hex, fromTextBox: false);
                _paletteSwatches[hex] = swatch;
                HeadingColorPalette.Children.Add(swatch);
            }
        }

        private void IncludeHeadingCheck_Changed(object sender, RoutedEventArgs e) => UpdateHeadingEnabled();

        private void UpdateHeadingEnabled()
        {
            if (HeadingBox == null || IncludeHeadingCheck == null)
                return;

            bool enabled = IncludeHeadingCheck.IsChecked == true;
            HeadingBox.IsEnabled = enabled;
            HeadingPositionCombo.IsEnabled = enabled;
            HeadingColorBox.IsEnabled = enabled;

            foreach (var swatch in _paletteSwatches.Values)
                swatch.IsEnabled = enabled;
        }

        private void SelectHeadingColor(string hex, bool fromTextBox)
        {
            var normalized = NormalizeHex(hex);
            if (!fromTextBox)
            {
                _suppressColorSync = true;
                HeadingColorBox.Text = normalized;
                _suppressColorSync = false;
            }

            UpdateHeadingColorPreview(ParseHeadingColor(normalized));
            UpdatePaletteSelection(normalized);
        }

        private void HeadingColorBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            if (_suppressColorSync)
                return;

            SelectHeadingColor(HeadingColorBox.Text, fromTextBox: true);
        }

        private void UpdateHeadingColorPreview(Color color)
        {
            if (HeadingColorPreview == null)
                return;

            HeadingColorPreview.Background = new SolidColorBrush(color);
        }

        private void UpdatePaletteSelection(string normalizedHex)
        {
            if (_paletteSwatches.Count == 0)
                return;
            foreach (var (hex, swatch) in _paletteSwatches)
            {
                bool selected = string.Equals(NormalizeHex(hex), normalizedHex, StringComparison.OrdinalIgnoreCase);
                swatch.BorderBrush = selected
                    ? new SolidColorBrush(Color.FromRgb(0x64, 0xB5, 0xF6))
                    : new SolidColorBrush(Color.FromRgb(0x44, 0x55, 0x66));
                swatch.BorderThickness = selected ? new Thickness(2) : new Thickness(1);
            }
        }

        private static Color ParseHeadingColor(string? hex)
        {
            var normalized = NormalizeHex(hex);
            if (normalized.Length != 7)
                return Colors.Black;

            try
            {
                return Color.FromRgb(
                    byte.Parse(normalized.AsSpan(1, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture),
                    byte.Parse(normalized.AsSpan(3, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture),
                    byte.Parse(normalized.AsSpan(5, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
            }
            catch
            {
                return Colors.Black;
            }
        }

        private static string NormalizeHex(string? hex)
        {
            if (string.IsNullOrWhiteSpace(hex))
                return "#000000";

            var trimmed = hex.Trim();
            if (!trimmed.StartsWith('#'))
                trimmed = "#" + trimmed;

            return trimmed.Length > 7 ? trimmed[..7] : trimmed;
        }

        private void Ok_Click(object sender, RoutedEventArgs e)
        {
            _includeHeading = IncludeHeadingCheck.IsChecked == true;
            _headingText = HeadingBox.Text ?? string.Empty;
            DialogResult = true;
            Close();
        }
    }
}
