using MyProject.Models;
using MyProject.Rendering;
using MyProject.Theme;

namespace MyProject.Controls
{
    public class DependencyLineEndSelector : UserControl
    {
        private readonly ComboBox _combo;
        private DependencyLineEnd _selectedStyle = DependencyLineEnd.Arrow;
        private const int ItemHeight = 28;
        private const int PreviewWidth = 72;

        public bool PreviewAtLineStart { get; set; } = false;

        public DependencyLineEnd SelectedLineEnd
        {
            get => _selectedStyle;
            set
            {
                if (_selectedStyle == value) return;
                _selectedStyle = value;
                SyncComboSelection();
            }
        }

        public event EventHandler? SelectedLineEndChanged;

        public DependencyLineEndSelector()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            MinimumSize = new Size(80, 28);
            Height = 28;
            BackColor = Color.White;

            _combo = new ComboBox
            {
                Dock = DockStyle.Fill,
                DropDownStyle = ComboBoxStyle.DropDownList,
                DrawMode = DrawMode.OwnerDrawFixed,
                ItemHeight = ItemHeight,
                IntegralHeight = false,
                Font = AppTheme.FontNormal,
                BackColor = Color.White,
                Margin = Padding.Empty
            };

            foreach (var style in DependencyLineEndInfo.AllStyles)
                _combo.Items.Add(style);

            _combo.SelectedIndex = 0;
            _combo.DrawItem += OnDrawItem;
            _combo.SelectedIndexChanged += OnComboSelectionChanged;

            Controls.Add(_combo);
            Resize += (_, _) => UpdateDropDownWidth(Width);
        }

        public void UpdateDropDownWidth(int valueColumnWidth)
        {
            if (valueColumnWidth <= 0)
                return;

            _combo.DropDownWidth = valueColumnWidth;
        }

        private void OnComboSelectionChanged(object? sender, EventArgs e)
        {
            if (_combo.SelectedItem is not DependencyLineEnd style || _selectedStyle == style)
                return;

            _selectedStyle = style;
            SelectedLineEndChanged?.Invoke(this, EventArgs.Empty);
        }

        private void SyncComboSelection()
        {
            var styles = DependencyLineEndInfo.AllStyles;
            for (int i = 0; i < styles.Count; i++)
            {
                if (styles[i] == _selectedStyle && _combo.SelectedIndex != i)
                {
                    _combo.SelectedIndex = i;
                    break;
                }
            }
        }

        private void OnDrawItem(object? sender, DrawItemEventArgs e) => DrawComboItem(e);

        private void DrawComboItem(DrawItemEventArgs e)
        {
            if (e.Index < 0 || e.Index >= _combo.Items.Count) return;

            var style = (DependencyLineEnd)_combo.Items[e.Index]!;
            bool selected = (e.State & DrawItemState.Selected) != 0;
            bool isEditState = (e.State & DrawItemState.ComboBoxEdit) != 0;

            e.DrawBackground();

            using var textBrush = new SolidBrush(AppTheme.TextPrimary);
            var sf = new StringFormat { LineAlignment = StringAlignment.Center, Trimming = StringTrimming.EllipsisCharacter };
            var font = e.Font ?? Font;

            if (isEditState)
            {
                var textRect = new Rectangle(e.Bounds.X + 4, e.Bounds.Y, e.Bounds.Width - 8, e.Bounds.Height);
                e.Graphics.DrawString(DependencyLineEndInfo.GetDisplayName(style), font, textBrush, textRect, sf);
                return;
            }

            if (selected)
            {
                using var selBrush = new SolidBrush(Color.FromArgb(230, 240, 255));
                e.Graphics.FillRectangle(selBrush, e.Bounds);
            }

            int previewLeft = e.Bounds.Right - PreviewWidth - 8;
            var previewRect = new Rectangle(previewLeft, e.Bounds.Y + 3, PreviewWidth, e.Bounds.Height - 6);
            DependencyLineGeometry.DrawLineEndPreview(e.Graphics, previewRect, style, PreviewAtLineStart);

            var textRectOpen = new Rectangle(e.Bounds.X + 8, e.Bounds.Y, previewLeft - e.Bounds.X - 12, e.Bounds.Height);
            e.Graphics.DrawString(DependencyLineEndInfo.GetDisplayName(style), font, textBrush, textRectOpen, sf);

            using var linePen = new Pen(AppTheme.GridLineColor);
            e.Graphics.DrawLine(linePen, e.Bounds.Left, e.Bounds.Bottom - 1, e.Bounds.Right, e.Bounds.Bottom - 1);
        }
    }
}
