using MyProject.Models;
using MyProject.Rendering;
using MyProject.Theme;
using MyProject.Forms;

namespace MyProject.Controls
{
    public class DependencyTypeSelector : UserControl
    {
        private readonly ComboBox _combo;
        private DependencyType _selectedType = DependencyType.FS;
        private const int ItemHeight = 34;
        private const int PreviewWidth = 72;

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
            Size = new Size(260, 28);
            BackColor = Color.White;

            _combo = new ComboBox
            {
                Dock = DockStyle.Fill,
                DropDownStyle = ComboBoxStyle.DropDownList,
                DrawMode = DrawMode.OwnerDrawFixed,
                ItemHeight = ItemHeight,
                IntegralHeight = false,
                Font = AppTheme.FontNormal,
                BackColor = Color.White
            };

            foreach (var type in DependencyTypeInfo.AllTypes)
                _combo.Items.Add(type);

            _combo.SelectedIndex = 0;
            _combo.DrawItem += OnDrawItem;
            _combo.SelectedIndexChanged += OnComboSelectionChanged;
            _combo.DropDownClosed += (_, _) => Invalidate();

            Controls.Add(_combo);
        }

        private void OnComboSelectionChanged(object? sender, EventArgs e)
        {
            if (_combo.SelectedItem is not DependencyType type || _selectedType == type)
                return;

            _selectedType = type;
            Invalidate();
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

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);

            if (_combo.DroppedDown) return;

            var g = e.Graphics;
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

            int previewLeft = Width - PreviewWidth - 22;
            var previewRect = new Rectangle(previewLeft, 4, PreviewWidth, Height - 8);
            DependencyLineGeometry.DrawPreview(g, previewRect, _selectedType);
        }

        private void OnDrawItem(object? sender, DrawItemEventArgs e)
        {
            try
            {
                DrawComboItem(e);
            }
            catch (Exception ex)
            {
                if (!ExceptionHandler.IsShuttingDown)
                    ExceptionHandler.Show(FindForm(), "Draw Error", "Could not draw dependency line preview.", ex);
            }
        }

        private void DrawComboItem(DrawItemEventArgs e)
        {
            if (e.Index < 0 || e.Index >= _combo.Items.Count) return;

            var type = (DependencyType)_combo.Items[e.Index]!;
            bool selected = (e.State & DrawItemState.Selected) != 0;

            e.DrawBackground();

            if (selected)
            {
                using var selBrush = new SolidBrush(Color.FromArgb(230, 240, 255));
                e.Graphics.FillRectangle(selBrush, e.Bounds);
            }

            int previewLeft = e.Bounds.Right - PreviewWidth - 8;
            var previewRect = new Rectangle(previewLeft, e.Bounds.Y + 6, PreviewWidth, e.Bounds.Height - 12);
            DependencyLineGeometry.DrawPreview(e.Graphics, previewRect, type);

            using var textBrush = new SolidBrush(AppTheme.TextPrimary);
            var textRect = new Rectangle(e.Bounds.X + 8, e.Bounds.Y, previewLeft - e.Bounds.X - 12, e.Bounds.Height);
            var sf = new StringFormat { LineAlignment = StringAlignment.Center, Trimming = StringTrimming.EllipsisCharacter };
            var font = e.Font ?? Font;
            e.Graphics.DrawString(DependencyTypeInfo.GetDisplayName(type), font, textBrush, textRect, sf);

            using var linePen = new Pen(AppTheme.GridLineColor);
            e.Graphics.DrawLine(linePen, e.Bounds.Left, e.Bounds.Bottom - 1, e.Bounds.Right, e.Bounds.Bottom - 1);
        }
    }
}
