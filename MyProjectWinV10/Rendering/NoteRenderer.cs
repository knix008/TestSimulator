using MyProject.Models;
using MyProject.Theme;
using System.Drawing.Drawing2D;

namespace MyProject.Rendering
{
    /// <summary>UML-style note rendering (folded corner, yellow gradient, dashed note link).</summary>
    public class NoteRenderer
    {
        public const int NoteWidth = 104;
        public const int NoteHeight = 58;
        public const int NoteStackGap = 8;
        public const int NoteTaskGap = 10;

        // UML note palette (aligned with MyUML NoteGradientTop/Bottom)
        public static Color GradientTop { get; } = Color.FromArgb(255, 252, 220);
        public static Color GradientBottom { get; } = Color.FromArgb(255, 238, 170);
        public static Color BorderColor { get; } = Color.FromArgb(72, 72, 72);
        public static Color ShadowColor { get; } = Color.FromArgb(42, 0, 0, 0);

        public static Color NoteEditorBack { get; } = Color.FromArgb(255, 252, 220);
        public static Font NoteEditorFont { get; } = AppTheme.FontSmall;

        private readonly GanttViewport _viewport;

        public NoteRenderer(GanttViewport viewport)
        {
            _viewport = viewport;
        }

        public Rectangle GetNoteRect(ProjectNote note, int scrollY)
        {
            int x = _viewport.DateToX(note.AnchorDate);
            int y = note.ContentY - scrollY;
            return new Rectangle(x, y, NoteWidth, NoteHeight);
        }

        public void DrawNote(Graphics g, ProjectNote note, Rectangle rect, bool isSelected, bool hideText = false)
        {
            var bounds = new RectangleF(rect.X, rect.Y, rect.Width, rect.Height);
            float fold = GetFoldSize(bounds.Width);

            DrawUmlNoteShape(g, bounds, isSelected, fold);
            if (!hideText)
                DrawNoteText(g, note, bounds, fold, isSelected);
        }

        /// <summary>Dashed ghost while dragging a note to a new position.</summary>
        public void DrawNoteSilhouette(Graphics g, Rectangle rect)
        {
            var bounds = new RectangleF(rect.X, rect.Y, rect.Width, rect.Height);
            float fold = GetFoldSize(bounds.Width);

            using var fillBrush = new SolidBrush(Color.FromArgb(36, GradientTop));
            g.FillRectangle(fillBrush, bounds);

            using var pen = new Pen(AppTheme.DependencyLinePreview, 1.5f)
            {
                DashStyle = DashStyle.Dash,
                DashPattern = new[] { 5f, 4f }
            };
            g.DrawRectangle(pen, bounds.X, bounds.Y, bounds.Width - 1f, bounds.Height - 1f);
            g.DrawLine(pen, bounds.Right - fold, bounds.Top, bounds.Right, bounds.Top + fold);
            g.DrawLine(pen, bounds.Right - fold, bounds.Top, bounds.Right - fold, bounds.Top + fold);
            g.DrawLine(pen, bounds.Right - fold, bounds.Top + fold, bounds.Right, bounds.Top + fold);
        }

        public void DrawConnector(Graphics g, Rectangle taskBarRect, Rectangle noteRect)
        {
            if (taskBarRect.Width <= 0 || taskBarRect.Height <= 0
                || noteRect.Width <= 0 || noteRect.Height <= 0)
                return;

            var from = GetRectEdgePoint(taskBarRect, GetRectCenter(noteRect));
            var to = GetRectEdgePoint(noteRect, GetRectCenter(taskBarRect));

            using var pen = new Pen(BorderColor, 1.25f)
            {
                DashStyle = DashStyle.Dash,
                DashPattern = new float[] { 4f, 3f }
            };

            g.DrawLine(pen, from, to);
        }

        public void DrawConnectorSilhouette(Graphics g, Rectangle taskBarRect, Rectangle noteRect)
        {
            if (taskBarRect.Width <= 0 || taskBarRect.Height <= 0
                || noteRect.Width <= 0 || noteRect.Height <= 0)
                return;

            var from = GetRectEdgePoint(taskBarRect, GetRectCenter(noteRect));
            var to = GetRectEdgePoint(noteRect, GetRectCenter(taskBarRect));

            using var pen = new Pen(AppTheme.DependencyLinePreview, 1.25f)
            {
                DashStyle = DashStyle.Dash,
                DashPattern = new[] { 5f, 4f }
            };

            g.DrawLine(pen, from, to);
        }

        private static Point GetRectCenter(Rectangle rect) =>
            new(rect.Left + rect.Width / 2, rect.Top + rect.Height / 2);

        /// <summary>Point on <paramref name="rect"/> border closest to <paramref name="target"/>.</summary>
        private static Point GetRectEdgePoint(Rectangle rect, Point target)
        {
            float cx = rect.Left + rect.Width / 2f;
            float cy = rect.Top + rect.Height / 2f;
            float dx = target.X - cx;
            float dy = target.Y - cy;

            if (rect.Width <= 0 || rect.Height <= 0)
                return new Point((int)cx, (int)cy);

            // Pick horizontal vs vertical edge by comparing normalized direction.
            if (Math.Abs(dx) * rect.Height > Math.Abs(dy) * rect.Width)
                return dx >= 0
                    ? new Point(rect.Right, (int)Math.Round(cy))
                    : new Point(rect.Left, (int)Math.Round(cy));

            return dy >= 0
                ? new Point((int)Math.Round(cx), rect.Bottom)
                : new Point((int)Math.Round(cx), rect.Top);
        }

        private static float GetFoldSize(float noteWidth) =>
            Math.Min(14f, noteWidth * 0.16f);

        private static void DrawUmlNoteShape(Graphics g, RectangleF bounds, bool isSelected, float fold)
        {
            var shadow = new RectangleF(bounds.X + 2f, bounds.Y + 2f, bounds.Width, bounds.Height);
            using (var shadowBrush = new SolidBrush(ShadowColor))
                g.FillRectangle(shadowBrush, shadow.X, shadow.Y, shadow.Width, shadow.Height);

            var fillRect = Rectangle.Round(bounds);
            if (fillRect.Width > 0 && fillRect.Height > 0)
            {
                using var gradient = new LinearGradientBrush(
                    fillRect, GradientTop, GradientBottom, LinearGradientMode.Vertical);
                g.FillRectangle(gradient, bounds);
            }

            Color border = isSelected ? AppTheme.AccentDark : BorderColor;
            float borderWidth = isSelected ? 2f : 1f;
            using var pen = new Pen(border, borderWidth);
            g.DrawRectangle(pen, bounds.X, bounds.Y, bounds.Width - 1f, bounds.Height - 1f);

            // UML folded top-right corner
            g.DrawLine(pen, bounds.Right - fold, bounds.Top, bounds.Right, bounds.Top + fold);
            g.DrawLine(pen, bounds.Right - fold, bounds.Top, bounds.Right - fold, bounds.Top + fold);
            g.DrawLine(pen, bounds.Right - fold, bounds.Top + fold, bounds.Right, bounds.Top + fold);
        }

        private static void DrawNoteText(Graphics g, ProjectNote note, RectangleF bounds, float fold, bool isSelected)
        {
            var textRect = new RectangleF(
                bounds.Left + 6f,
                bounds.Top + 6f,
                bounds.Width - fold - 10f,
                bounds.Height - 10f);

            NoteRtfHelper.DrawNoteContent(g, note, textRect, isSelected);
        }
    }
}
