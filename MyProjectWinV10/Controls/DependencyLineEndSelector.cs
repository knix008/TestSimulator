using MyProject.Models;
using MyProject.Rendering;
using MyProject.Theme;

namespace MyProject.Controls
{
    public class DependencyLineEndSelector : UserControl
    {
        private readonly ComboBox _combo;
        private DependencyLineEnd _selectedStyle = DependencyLineEnd.Arrow;
        private const int PreviewWidth = 72;
        private const int BorderInset = 1;
        private static readonly Color ComboSurfaceColor = AppTheme.SurfaceColor;
        private static readonly Color ComboSelectedColor = Color.FromArgb(230, 240, 255);

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
            MinimumSize = new Size(80, 36);
            Height = 36;
            BackColor = AppTheme.SurfaceColor;
            Margin = Padding.Empty;

            _combo = new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                DrawMode = DrawMode.OwnerDrawFixed,
                IntegralHeight = false,
                FlatStyle = FlatStyle.Flat,
                Font = AppTheme.FontNormal,
                BackColor = ComboSurfaceColor,
                ForeColor = AppTheme.TextPrimary,
                Margin = Padding.Empty
            };

            foreach (var style in DependencyLineEndInfo.AllStyles)
                _combo.Items.Add(style);

            _combo.SelectedIndex = 0;
            _combo.DrawItem += OnDrawItem;
            _combo.SelectedIndexChanged += OnComboSelectionChanged;

            Controls.Add(_combo);
            LayoutCombo();
            Resize += (_, _) =>
            {
                LayoutCombo();
                UpdateDropDownWidth(Width);
            };
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            using var borderPen = new Pen(AppTheme.BorderColor);
            e.Graphics.DrawRectangle(borderPen, 0, 0, Width - 1, Height - 1);
        }

        public void UpdateDropDownWidth(int valueColumnWidth)
        {
            if (valueColumnWidth <= 0)
                return;

            _combo.DropDownWidth = Math.Max(valueColumnWidth - BorderInset * 2, 120);
        }

        private void LayoutCombo()
        {
            if (Width <= 0 || Height <= 0 || !Controls.Contains(_combo))
                return;

            int left = BorderInset;
            int top = BorderInset;
            int width = Math.Max(40, Width - BorderInset * 2);
            int height = Math.Max(24, Height - BorderInset * 2);
            _combo.SetBounds(left, top, width, height);
            _combo.ItemHeight = Math.Max(24, height - 2);
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

            Color background = selected && !isEditState ? ComboSelectedColor : ComboSurfaceColor;
            using (var bgBrush = new SolidBrush(background))
                e.Graphics.FillRectangle(bgBrush, e.Bounds);

            int previewHeight = Math.Min(20, Math.Max(12, e.Bounds.Height - 6));
            int previewLeft = e.Bounds.Right - PreviewWidth - 8;
            int previewY = e.Bounds.Y + (e.Bounds.Height - previewHeight) / 2;
            var previewRect = new Rectangle(previewLeft, previewY, PreviewWidth, previewHeight);
            DependencyLineGeometry.DrawLineEndPreview(e.Graphics, previewRect, style, PreviewAtLineStart);

            using var textBrush = new SolidBrush(AppTheme.TextPrimary);
            var textRect = new Rectangle(e.Bounds.X + 8, e.Bounds.Y, previewLeft - e.Bounds.X - 12, e.Bounds.Height);
            var sf = new StringFormat
            {
                Alignment = StringAlignment.Near,
                LineAlignment = StringAlignment.Center,
                Trimming = StringTrimming.EllipsisCharacter,
                FormatFlags = StringFormatFlags.NoWrap
            };
            var font = e.Font ?? Font;
            e.Graphics.DrawString(DependencyLineEndInfo.GetDisplayName(style), font, textBrush, textRect, sf);

            using var borderPen = new Pen(isEditState ? AppTheme.BorderColor : AppTheme.GridLineColor);
            e.Graphics.DrawRectangle(
                borderPen,
                e.Bounds.X,
                e.Bounds.Y,
                e.Bounds.Width - 1,
                e.Bounds.Height - 1);
        }
    }
}
