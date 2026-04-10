using System;
using System.Drawing;
using System.Windows.Forms;

namespace YOLO26V10
{
    internal static class UiTheme
    {
        public static readonly Color Surface = Color.FromArgb(248, 249, 251);
        public static readonly Color PanelHeader = Color.FromArgb(232, 234, 240);
        public static readonly Color Canvas = Color.FromArgb(235, 236, 241);
        public static readonly Color BorderSubtle = Color.FromArgb(208, 211, 220);
        public static readonly Color TextPrimary = Color.FromArgb(28, 30, 36);
        public static readonly Color TextSecondary = Color.FromArgb(88, 92, 102);
        public static readonly Color Accent = Color.FromArgb(37, 99, 235);
        public static readonly Color AccentHover = Color.FromArgb(29, 78, 216);
        public static readonly Color ButtonSecondary = Color.FromArgb(255, 255, 255);
        public static readonly Color LogBack = Color.FromArgb(255, 255, 255);
        public static readonly Color GroupPanel = Color.FromArgb(252, 252, 254);

        public static Font UiFont(float size = 9f) =>
            new Font("Malgun Gothic", size, FontStyle.Regular, GraphicsUnit.Point);

        public static Font UiFontBold(float size = 9f) =>
            new Font("Malgun Gothic", size, FontStyle.Bold, GraphicsUnit.Point);

        public static void StylePrimaryButton(Button b)
        {
            b.FlatStyle = FlatStyle.Flat;
            b.FlatAppearance.BorderSize = 0;
            b.BackColor = Accent;
            b.ForeColor = Color.White;
            b.FlatAppearance.MouseOverBackColor = AccentHover;
            b.Cursor = Cursors.Hand;
            b.Height = Math.Max(b.Height, 28);
        }

        public static void StyleSecondaryButton(Button b)
        {
            b.FlatStyle = FlatStyle.Flat;
            b.FlatAppearance.BorderSize = 1;
            b.FlatAppearance.BorderColor = BorderSubtle;
            b.BackColor = ButtonSecondary;
            b.ForeColor = TextPrimary;
            b.FlatAppearance.MouseOverBackColor = Color.FromArgb(241, 245, 255);
            b.Cursor = Cursors.Hand;
            b.Height = Math.Max(b.Height, 28);
        }

        public static void StyleTransportButton(Button b)
        {
            b.FlatStyle = FlatStyle.Flat;
            b.FlatAppearance.BorderSize = 1;
            b.FlatAppearance.BorderColor = BorderSubtle;
            b.BackColor = ButtonSecondary;
            b.FlatAppearance.MouseOverBackColor = Color.FromArgb(241, 245, 255);
            b.Cursor = Cursors.Hand;
        }

        /// <summary>Inner field groups (모델, 추론, 동영상).</summary>
        public static void StyleGroupBox(GroupBox g)
        {
            g.FlatStyle = FlatStyle.Flat;
            g.BackColor = GroupPanel;
            g.ForeColor = TextSecondary;
            g.Font = UiFontBold(8.25f);
        }

        public static void StyleCombo(ComboBox c)
        {
            c.FlatStyle = FlatStyle.Flat;
            c.BackColor = Color.White;
        }

        public static void StyleNumeric(NumericUpDown n)
        {
            n.BorderStyle = BorderStyle.FixedSingle;
            n.BackColor = Color.White;
        }
    }
}
