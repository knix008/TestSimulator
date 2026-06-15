using MyProject.Models;
using MyProject.Rendering;
using MyProject.Theme;

namespace MyProject.Controls
{
    /// <summary>Preview of note connector line style and both line ends together.</summary>
    public class NoteConnectorPreviewControl : Control
    {
        private NoteLineStyle _lineStyle = NoteLineStyle.Dash;
        private DependencyLineEnd _taskLineEnd = DependencyLineEnd.None;
        private DependencyLineEnd _noteLineEnd = DependencyLineEnd.None;

        public NoteLineStyle LineStyle
        {
            get => _lineStyle;
            set
            {
                if (_lineStyle == value) return;
                _lineStyle = value;
                Invalidate();
            }
        }

        public DependencyLineEnd TaskLineEnd
        {
            get => _taskLineEnd;
            set
            {
                if (_taskLineEnd == value) return;
                _taskLineEnd = value;
                Invalidate();
            }
        }

        public DependencyLineEnd NoteLineEnd
        {
            get => _noteLineEnd;
            set
            {
                if (_noteLineEnd == value) return;
                _noteLineEnd = value;
                Invalidate();
            }
        }

        public NoteConnectorPreviewControl()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            Height = 32;
            MinimumSize = new Size(120, 32);
            BackColor = Color.White;
        }

        public void SetAppearance(NoteLineStyle lineStyle, DependencyLineEnd taskLineEnd, DependencyLineEnd noteLineEnd)
        {
            _lineStyle = lineStyle;
            _taskLineEnd = taskLineEnd;
            _noteLineEnd = noteLineEnd;
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);

            e.Graphics.Clear(BackColor);
            using var borderPen = new Pen(AppTheme.GridLineColor);
            var inner = new Rectangle(0, 0, Width - 1, Height - 1);
            e.Graphics.DrawRectangle(borderPen, inner);

            var previewRect = new Rectangle(8, 4, Math.Max(8, Width - 16), Math.Max(8, Height - 8));
            NoteRenderer.DrawConnectorPreview(
                e.Graphics,
                previewRect,
                _lineStyle,
                _taskLineEnd,
                _noteLineEnd);
        }
    }
}
