using System.Drawing;
using System.Windows.Forms;

namespace LVLGEditor1._0
{
    internal class DarkMenuRenderer : ToolStripProfessionalRenderer
    {
        public DarkMenuRenderer() : base(new DarkMenuColorTable()) { }
    }

    internal class DarkMenuColorTable : ProfessionalColorTable
    {
        private static readonly Color BgDark   = Color.FromArgb(37, 37, 38);
        private static readonly Color BgHover  = Color.FromArgb(62, 62, 64);
        private static readonly Color BgSelect = Color.FromArgb(0, 122, 204);

        public override Color MenuStripGradientBegin                => BgDark;
        public override Color MenuStripGradientEnd                  => BgDark;
        public override Color MenuItemSelectedGradientBegin         => BgHover;
        public override Color MenuItemSelectedGradientEnd           => BgHover;
        public override Color MenuItemPressedGradientBegin          => BgSelect;
        public override Color MenuItemPressedGradientEnd            => BgSelect;
        public override Color MenuItemSelected                      => BgHover;
        public override Color MenuBorder                            => BgDark;
        public override Color ToolStripDropDownBackground           => BgDark;
        public override Color ImageMarginGradientBegin              => BgDark;
        public override Color ImageMarginGradientMiddle             => BgDark;
        public override Color ImageMarginGradientEnd                => BgDark;
    }
}
