using MyProject.Models;
using MyProject.Rendering;
using MyProject.Theme;

namespace MyProject.Controls
{
    public class NoteLineStyleSelector : UserControl
    {
        private readonly ComboBox _combo;
        private NoteLineStyle _selectedStyle = NoteLineStyle.Dash;
        private DependencyLineEnd _taskLineEndContext = DependencyLineEnd.None;
        private DependencyLineEnd _noteLineEndContext = DependencyLineEnd.None;
        private const int ItemHeight = 28;
        private const int PreviewWidth = 96;

        public NoteLineStyle SelectedLineStyle
        {
            get => _selectedStyle;
            set
            {
                if (_selectedStyle == value) return;
                _selectedStyle = value;
                SyncComboSelection();
            }
        }

        public event EventHandler? SelectedLineStyleChanged;

        public void SetPreviewContext(DependencyLineEnd taskLineEnd, DependencyLineEnd noteLineEnd)
        {
            if (_taskLineEndContext == taskLineEnd && _noteLineEndContext == noteLineEnd)
                return;

            _taskLineEndContext = taskLineEnd;
            _noteLineEndContext = noteLineEnd;
            _combo.Invalidate();
            Invalidate();
        }

        public NoteLineStyleSelector()
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

            foreach (var style in NoteLineStyleInfo.AllStyles)
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
            if (_combo.SelectedItem is not NoteLineStyle style || _selectedStyle == style)
                return;

            _selectedStyle = style;
            SelectedLineStyleChanged?.Invoke(this, EventArgs.Empty);
        }

        private void SyncComboSelection()
        {
            var styles = NoteLineStyleInfo.AllStyles;
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

            var style = (NoteLineStyle)_combo.Items[e.Index]!;
            bool selected = (e.State & DrawItemState.Selected) != 0;
            bool isEditState = (e.State & DrawItemState.ComboBoxEdit) != 0;

            e.DrawBackground();

            if (selected && !isEditState)
            {
                using var selBrush = new SolidBrush(Color.FromArgb(230, 240, 255));
                e.Graphics.FillRectangle(selBrush, e.Bounds);
            }

            int previewHeight = Math.Min(20, Math.Max(12, e.Bounds.Height - 6));
            int previewLeft = e.Bounds.Right - PreviewWidth - 8;
            int previewY = e.Bounds.Y + (e.Bounds.Height - previewHeight) / 2;
            var previewRect = new Rectangle(previewLeft, previewY, PreviewWidth, previewHeight);
            NoteRenderer.DrawConnectorPreview(
                e.Graphics,
                previewRect,
                style,
                _taskLineEndContext,
                _noteLineEndContext);

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
            e.Graphics.DrawString(NoteLineStyleInfo.GetDisplayName(style), font, textBrush, textRect, sf);

            if (!isEditState)
            {
                using var linePen = new Pen(AppTheme.GridLineColor);
                e.Graphics.DrawLine(linePen, e.Bounds.Left, e.Bounds.Bottom - 1, e.Bounds.Right, e.Bounds.Bottom - 1);
            }
        }
    }
}
