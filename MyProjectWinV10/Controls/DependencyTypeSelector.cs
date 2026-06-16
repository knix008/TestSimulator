using MyProject.Models;
using MyProject.Rendering;
using MyProject.Theme;

namespace MyProject.Controls
{
    public class DependencyTypeSelector : UserControl
    {
        private readonly ComboBox _combo;
        private readonly ToolTip _toolTip;
        private DependencyType _selectedType = DependencyType.FS;
        private int _hoverTipIndex = -1;
        private const int PreviewWidth = 72;
        private static readonly Color ComboSurfaceColor = AppTheme.SurfaceColor;
        private static readonly Color ComboSelectedColor = Color.FromArgb(230, 240, 255);

        public DependencyType SelectedType
        {
            get => _selectedType;
            set
            {
                if (_selectedType == value) return;
                _selectedType = value;
                SyncComboSelection();
                Invalidate();
                SelectedTypeChanged?.Invoke(this, EventArgs.Empty);
            }
        }

        public event EventHandler? SelectedTypeChanged;

        public DependencyTypeSelector()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            BackColor = AppTheme.ToolbarBackground;
            Margin = Padding.Empty;

            _toolTip = new ToolTip
            {
                ShowAlways = true,
                AutomaticDelay = 300,
                AutoPopDelay = 8000,
                InitialDelay = 300
            };

            _combo = new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                DrawMode = DrawMode.OwnerDrawFixed,
                IntegralHeight = false,
                FlatStyle = FlatStyle.Flat,
                Font = AppTheme.FontToolbar,
                BackColor = ComboSurfaceColor,
                ForeColor = AppTheme.TextPrimary,
                Margin = Padding.Empty,
                Dock = DockStyle.Fill
            };

            foreach (var type in DependencyTypeInfo.AllTypes)
                _combo.Items.Add(type);

            _combo.SelectedIndex = 0;
            _combo.DrawItem += OnDrawItem;
            _combo.SelectedIndexChanged += OnComboSelectionChanged;
            _combo.MouseMove += OnComboMouseMove;
            _combo.DropDownClosed += (_, _) =>
            {
                _hoverTipIndex = -1;
                UpdateTooltipForType(_selectedType);
            };

            Controls.Add(_combo);
            UpdateTooltipForType(_selectedType);
            Size = new Size(AppTheme.ToolbarControlHostWidth, AppTheme.ToolbarHeight - AppTheme.ToolbarStripPadding.Vertical);
            UpdateComboMetrics();
        }

        protected override void OnPaintBackground(PaintEventArgs e)
        {
            using var brush = new SolidBrush(AppTheme.ToolbarBackground);
            e.Graphics.FillRectangle(brush, ClientRectangle);
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            UpdateComboMetrics();
        }

        private void UpdateComboMetrics()
        {
            if (Width <= 0 || Height <= 0 || !Controls.Contains(_combo))
                return;

            _combo.ItemHeight = Math.Max(22, Height - 2);
        }

        private void OnComboSelectionChanged(object? sender, EventArgs e)
        {
            if (_combo.SelectedItem is not DependencyType type || _selectedType == type)
                return;

            _selectedType = type;
            Invalidate();
            UpdateTooltipForType(type);
            SelectedTypeChanged?.Invoke(this, EventArgs.Empty);
        }

        private void SyncComboSelection()
        {
            var types = DependencyTypeInfo.AllTypes;
            for (int i = 0; i < types.Count; i++)
            {
                if (types[i] == _selectedType && _combo.SelectedIndex != i)
                {
                    _combo.SelectedIndex = i;
                    break;
                }
            }
        }

        private void OnComboMouseMove(object? sender, MouseEventArgs e)
        {
            int index = GetItemIndexAtPoint(e.Location);
            if (index == _hoverTipIndex)
                return;

            _hoverTipIndex = index;
            if (index >= 0 && index < _combo.Items.Count)
                UpdateTooltipForType((DependencyType)_combo.Items[index]!);
        }

        private int GetItemIndexAtPoint(Point clientPoint)
        {
            if (!_combo.DroppedDown)
                return _combo.SelectedIndex;

            if (clientPoint.Y < _combo.Height)
                return _combo.SelectedIndex;

            int relativeY = clientPoint.Y - _combo.Height;
            int index = relativeY / _combo.ItemHeight;
            if (index < 0 || index >= _combo.Items.Count)
                return -1;

            return index;
        }

        private void UpdateTooltipForType(DependencyType type) =>
            _toolTip.SetToolTip(_combo, DependencyTypeInfo.GetTooltipText(type));

        private void OnDrawItem(object? sender, DrawItemEventArgs e) => DrawComboItem(e);

        private void DrawComboItem(DrawItemEventArgs e)
        {
            if (e.Index < 0 || e.Index >= _combo.Items.Count) return;

            var type = (DependencyType)_combo.Items[e.Index]!;
            bool selected = (e.State & DrawItemState.Selected) != 0;
            bool isEditState = (e.State & DrawItemState.ComboBoxEdit) != 0;

            Color background = selected && !isEditState ? ComboSelectedColor : ComboSurfaceColor;
            using (var bgBrush = new SolidBrush(background))
                e.Graphics.FillRectangle(bgBrush, e.Bounds);

            int previewHeight = Math.Min(20, Math.Max(12, e.Bounds.Height - 6));
            int previewLeft = e.Bounds.Right - PreviewWidth - 8;
            int previewY = e.Bounds.Y + (e.Bounds.Height - previewHeight) / 2;
            var previewRect = new Rectangle(previewLeft, previewY, PreviewWidth, previewHeight);
            DependencyLineGeometry.DrawPreview(e.Graphics, previewRect, type);

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
            e.Graphics.DrawString(DependencyTypeInfo.GetDisplayName(type), font, textBrush, textRect, sf);

            if (!isEditState)
            {
                using var linePen = new Pen(AppTheme.GridLineColor);
                e.Graphics.DrawLine(linePen, e.Bounds.Left, e.Bounds.Bottom - 1, e.Bounds.Right, e.Bounds.Bottom - 1);
            }
        }
    }
}
