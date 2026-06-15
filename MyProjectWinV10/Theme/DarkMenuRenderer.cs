using MyProject.Rendering;
using System.Drawing.Drawing2D;

namespace MyProject.Theme
{
    public class DarkMenuRenderer : ToolStripProfessionalRenderer
    {
        public DarkMenuRenderer() : base(new DarkMenuColorTable()) { }

        protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
        {
            var item = e.Item;
            var g = e.Graphics;
            var rect = new Rectangle(1, 1, item.Width - 2, item.Height - 2);

            if (!item.Enabled)
            {
                using var b = new SolidBrush(Color.FromArgb(40, 45, 55));
                g.FillRectangle(b, new Rectangle(0, 0, item.Width, item.Height));
                return;
            }

            if (item.Selected || item.Pressed)
            {
                using var b = new SolidBrush(AppTheme.ToolbarButtonHover);
                g.FillRectangle(b, rect);
                using var rp = new Pen(AppTheme.ToolbarButtonHover);
                g.DrawRectangle(rp, rect);
            }
            else
            {
                using var b = new SolidBrush(Color.FromArgb(40, 45, 55));
                g.FillRectangle(b, new Rectangle(0, 0, item.Width, item.Height));
            }
        }

        protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e)
        {
            using var b = new SolidBrush(Color.FromArgb(40, 45, 55));
            e.Graphics.FillRectangle(b, e.AffectedBounds);
        }

        protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
        {
            e.TextColor = e.Item.Enabled ? Color.White : Color.FromArgb(120, 140, 160);
            base.OnRenderItemText(e);
        }

        protected override void OnRenderArrow(ToolStripArrowRenderEventArgs e)
        {
            e.ArrowColor = Color.White;
            base.OnRenderArrow(e);
        }

        protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
        {
            var g = e.Graphics;
            int midY = e.Item.Height / 2;
            using var pen = new Pen(Color.FromArgb(70, 80, 95));
            g.DrawLine(pen, 4, midY, e.Item.Width - 4, midY);
        }

        protected override void OnRenderItemCheck(ToolStripItemImageRenderEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            var rect = e.ImageRectangle;

            if (e.Item is ToolStripMenuItem { Image: Image img })
            {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.DrawImage(img, rect);
            }

            using var pen = new Pen(AppTheme.Accent, 2f);
            g.DrawLines(pen, new Point[] {
                new(rect.X + 2, rect.Y + rect.Height / 2),
                new(rect.X + rect.Width / 2 - 1, rect.Bottom - 3),
                new(rect.Right - 2, rect.Y + 2)
            });
        }
    }

    internal class DarkMenuColorTable : ProfessionalColorTable
    {
        public override Color MenuStripGradientBegin => Color.FromArgb(40, 45, 55);
        public override Color MenuStripGradientEnd => Color.FromArgb(40, 45, 55);
        public override Color MenuItemSelected => AppTheme.ToolbarButtonHover;
        public override Color MenuItemSelectedGradientBegin => AppTheme.ToolbarButtonHover;
        public override Color MenuItemSelectedGradientEnd => AppTheme.ToolbarButtonHover;
        public override Color MenuItemPressedGradientBegin => AppTheme.ToolbarButtonPressed;
        public override Color MenuItemPressedGradientEnd => AppTheme.ToolbarButtonPressed;
        public override Color MenuItemBorder => Color.FromArgb(60, 70, 85);
        public override Color MenuBorder => Color.FromArgb(60, 70, 85);
        public override Color ToolStripDropDownBackground => Color.FromArgb(40, 45, 55);
        public override Color ImageMarginGradientBegin => Color.FromArgb(40, 45, 55);
        public override Color ImageMarginGradientMiddle => Color.FromArgb(40, 45, 55);
        public override Color ImageMarginGradientEnd => Color.FromArgb(40, 45, 55);
        public override Color SeparatorDark => Color.FromArgb(70, 80, 95);
        public override Color SeparatorLight => Color.FromArgb(70, 80, 95);
    }

    public class DarkToolStripRenderer : ToolStripProfessionalRenderer
    {
        public DarkToolStripRenderer() : base(new DarkToolbarColorTable()) { }

        protected override void OnRenderButtonBackground(ToolStripItemRenderEventArgs e)
        {
            var g = e.Graphics;
            var item = e.Item;
            var rect = new Rectangle(1, 1, item.Width - 2, item.Height - 2);

            if (item.Pressed)
            {
                using var b = new SolidBrush(AppTheme.ToolbarButtonPressed);
                g.FillRoundedRectangle(b, rect, 3);
            }
            else if (item.Selected)
            {
                using var b = new SolidBrush(AppTheme.ToolbarButtonHover);
                g.FillRoundedRectangle(b, rect, 3);
            }
        }

        protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e)
        {
            using var b = new SolidBrush(AppTheme.ToolbarBackground);
            e.Graphics.FillRectangle(b, e.AffectedBounds);
        }

        protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
        {
            var g = e.Graphics;
            int midX = e.Item.Width / 2;
            int margin = 6;
            using var pen = new Pen(AppTheme.ToolbarSeparator);
            g.DrawLine(pen, midX, margin, midX, e.Item.Height - margin);
        }

        protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
        {
            e.TextColor = e.Item.Enabled ? Color.White : Color.FromArgb(130, 160, 200);
            base.OnRenderItemText(e);
        }

        protected override void OnRenderGrip(ToolStripGripRenderEventArgs e) { }
    }

    internal class DarkToolbarColorTable : ProfessionalColorTable
    {
        public override Color ToolStripGradientBegin => AppTheme.ToolbarBackground;
        public override Color ToolStripGradientMiddle => AppTheme.ToolbarBackground;
        public override Color ToolStripGradientEnd => AppTheme.ToolbarBackground;
        public override Color ButtonSelectedHighlight => AppTheme.ToolbarButtonHover;
        public override Color ButtonSelectedGradientBegin => AppTheme.ToolbarButtonHover;
        public override Color ButtonSelectedGradientEnd => AppTheme.ToolbarButtonHover;
        public override Color ButtonPressedGradientBegin => AppTheme.ToolbarButtonPressed;
        public override Color ButtonPressedGradientEnd => AppTheme.ToolbarButtonPressed;
        public override Color ButtonSelectedBorder => Color.Transparent;
    }
}
