using System.Drawing;
using System.Windows.Forms;
using DBToolsWinV10.Controls;

namespace DBToolsWinV10.App;

public static class ModernTheme
{
	private sealed class ModernColorTable : ProfessionalColorTable
	{
		public override Color ToolStripGradientBegin => PanelBackground;

		public override Color ToolStripGradientMiddle => PanelBackground;

		public override Color ToolStripGradientEnd => PanelBackground;

		public override Color MenuStripGradientBegin => PanelBackground;

		public override Color MenuStripGradientEnd => PanelBackground;

		public override Color MenuItemSelected => AccentMuted;

		public override Color MenuItemBorder => Border;

		public override Color MenuBorder => Border;

		public override Color ImageMarginGradientBegin => PanelBackground;

		public override Color ImageMarginGradientMiddle => PanelBackground;

		public override Color ImageMarginGradientEnd => PanelBackground;

		public override Color ButtonSelectedBorder => Accent;

		public override Color ButtonCheckedHighlight => AccentMuted;

		public override Color ButtonCheckedGradientBegin => AccentMuted;

		public override Color ButtonCheckedGradientEnd => AccentMuted;

		public override Color ButtonCheckedGradientMiddle => AccentMuted;

		public override Color ButtonSelectedGradientBegin => ToolHover;

		public override Color ButtonSelectedGradientEnd => ToolHover;

		public override Color ButtonSelectedGradientMiddle => ToolHover;
	}

	public static readonly Color AppBackground = Color.FromArgb(240, 242, 245);

	public static readonly Color PanelBackground = Color.FromArgb(255, 255, 255);

	public static readonly Color SidebarBackground = Color.FromArgb(250, 251, 253);

	public static readonly Color CanvasBackground = Color.FromArgb(255, 255, 255);

	public static readonly Color CanvasChrome = Color.FromArgb(226, 232, 240);

	public static readonly Color Accent = Color.FromArgb(37, 99, 235);

	public static readonly Color AccentHover = Color.FromArgb(29, 78, 216);

	public static readonly Color AccentMuted = Color.FromArgb(219, 234, 254);

	public static readonly Color Border = Color.FromArgb(209, 213, 219);

	public static readonly Color BorderLight = Color.FromArgb(229, 231, 235);

	public static readonly Color TextPrimary = Color.FromArgb(17, 24, 39);

	public static readonly Color TextSecondary = Color.FromArgb(107, 114, 128);

	public static readonly Color TextMuted = Color.FromArgb(156, 163, 175);

	public static readonly Color ToolIdle = Color.FromArgb(250, 251, 253);

	public static readonly Color ToolHover = Color.FromArgb(243, 244, 246);

	public static readonly Color ToolSelected = Color.FromArgb(219, 234, 254);

	public static readonly Color Success = Color.FromArgb(16, 185, 129);

	public static readonly Color Warning = Color.FromArgb(245, 158, 11);

	public static readonly Color Danger = Color.FromArgb(239, 68, 68);

	public static readonly Color Info = Color.FromArgb(99, 102, 241);

	public static readonly Font UiFont = new Font("Segoe UI", 9f);

	public static readonly Font UiFontSmall = new Font("Segoe UI", 8.5f);

	public static readonly Font SectionFont = new Font("Segoe UI Semibold", 8f, FontStyle.Bold);

	public static readonly Font TitleFont = new Font("Segoe UI Semibold", 9.5f, FontStyle.Bold);

	public static readonly Font ToolboxFont = new Font("Segoe UI", 7.5f);

	public static void StyleMenuStrip(MenuStrip menu)
	{
		menu.BackColor = PanelBackground;
		menu.ForeColor = TextPrimary;
		menu.Font = UiFont;
		menu.ImageScalingSize = new Size(16, 16);
		menu.Renderer = new ToolStripProfessionalRenderer(new ModernColorTable());
		EnableMenuItemImages(menu.Items);
	}

	public static void StyleContextMenu(ContextMenuStrip menu)
	{
		menu.Font = UiFont;
		menu.ImageScalingSize = new Size(16, 16);
		menu.ShowImageMargin = true;
		menu.Renderer = new ToolStripProfessionalRenderer(new ModernColorTable());
		EnableMenuItemImages(menu.Items);
	}

	public static ToolStripMenuItem CreateMenuItem(string text, string iconName, EventHandler onClick = null)
	{
		var item = new ToolStripMenuItem(text, IconProvider.Get(iconName))
		{
			ImageScaling = ToolStripItemImageScaling.SizeToFit
		};
		if (onClick is not null)
			item.Click += onClick;
		return item;
	}

	private static void EnableMenuItemImages(ToolStripItemCollection items)
	{
		foreach (ToolStripItem item in items)
		{
			if (item is ToolStripMenuItem toolStripMenuItem)
			{
				toolStripMenuItem.ImageScaling = ToolStripItemImageScaling.SizeToFit;
				if (toolStripMenuItem.HasDropDownItems)
				{
					EnableMenuItemImages(toolStripMenuItem.DropDownItems);
				}
			}
		}
	}

	public static void StyleToolStrip(ToolStrip strip)
	{
		strip.BackColor = PanelBackground;
		strip.ForeColor = TextPrimary;
		strip.Font = UiFont;
		strip.Renderer = new ToolStripProfessionalRenderer(new ModernColorTable());
		strip.Padding = new Padding(8, 3, 8, 3);
		strip.GripStyle = ToolStripGripStyle.Hidden;
	}

	public static void StyleStatusStrip(StatusStrip strip)
	{
		strip.BackColor = SidebarBackground;
		strip.ForeColor = TextSecondary;
		strip.Font = UiFontSmall;
		strip.Renderer = new ToolStripProfessionalRenderer(new ModernColorTable());
	}

	public static void StyleToolboxButton(Button button)
	{
		button.FlatStyle = FlatStyle.Flat;
		button.FlatAppearance.BorderSize = 0;
		button.BackColor = ToolIdle;
		button.ForeColor = TextPrimary;
		button.Font = ToolboxFont;
		button.Cursor = Cursors.Hand;
		button.Margin = new Padding(0, 1, 0, 1);
		button.FlatAppearance.MouseOverBackColor = ToolHover;
	}

	public static void SetToolboxButtonActive(Button button, bool active)
	{
		button.BackColor = (active ? ToolSelected : ToolIdle);
		button.ForeColor = (active ? Accent : TextPrimary);
		button.FlatAppearance.BorderSize = (active ? 1 : 0);
		button.FlatAppearance.BorderColor = (active ? Accent : ToolIdle);
	}

	public static void StyleCanvasToggleButton(Button button)
	{
		button.FlatStyle = FlatStyle.Flat;
		button.FlatAppearance.BorderSize = 1;
		button.FlatAppearance.BorderColor = Border;
		button.BackColor = PanelBackground;
		button.ForeColor = TextSecondary;
		button.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
		button.Cursor = Cursors.Hand;
		button.FlatAppearance.MouseOverBackColor = ToolHover;
	}

	public static void StyleToolboxGroupBox(GroupBox groupBox)
	{
		groupBox.FlatStyle = FlatStyle.Flat;
		groupBox.BackColor = SidebarBackground;
		groupBox.ForeColor = TextMuted;
		groupBox.Font = SectionFont;
		if (groupBox is ToolboxGroupBox)
		{
			groupBox.Invalidate();
		}
	}

	public static void StyleSectionLabel(Label label)
	{
		label.Font = SectionFont;
		label.ForeColor = TextMuted;
		label.BackColor = SidebarBackground;
		label.TextAlign = ContentAlignment.MiddleLeft;
		label.Padding = new Padding(2, 4, 0, 0);
	}

	public static void StyleDataTree(TreeView tree)
	{
		tree.BorderStyle = BorderStyle.None;
		tree.BackColor = PanelBackground;
		tree.ForeColor = TextPrimary;
		tree.Font = UiFont;
		tree.ItemHeight = 22;
		tree.LineColor = BorderLight;
	}

	public static void StyleDataList(ListView list)
	{
		list.BorderStyle = BorderStyle.None;
		list.BackColor = PanelBackground;
		list.ForeColor = TextPrimary;
		list.Font = UiFont;
		list.GridLines = false;
	}

	public static void StylePropertyGrid(PropertyGrid grid)
	{
		grid.BackColor = PanelBackground;
		grid.ViewBackColor = PanelBackground;
		grid.ViewForeColor = TextPrimary;
		grid.CategoryForeColor = Accent;
		grid.HelpBackColor = SidebarBackground;
		grid.HelpForeColor = TextSecondary;
		grid.Font = UiFont;
		grid.LineColor = BorderLight;
	}

	public static void StylePropertyDescription(TextBox box)
	{
		box.BackColor = SidebarBackground;
		box.ForeColor = TextSecondary;
		box.Font = UiFontSmall;
		box.BorderStyle = BorderStyle.None;
		box.ReadOnly = true;
		box.Multiline = true;
		box.ScrollBars = ScrollBars.Vertical;
		box.TabStop = false;
	}

	public static void StyleTabControl(TabControl tabs)
	{
		tabs.Font = UiFont;
		tabs.Padding = new Point(12, 4);
		foreach (TabPage tabPage in tabs.TabPages)
		{
			tabPage.BackColor = PanelBackground;
		}
	}

	public static void StyleSplitContainer(SplitContainer split, Color panel1Bg, Color panel2Bg)
	{
		split.BackColor = BorderLight;
		split.Panel1.BackColor = panel1Bg;
		split.Panel2.BackColor = panel2Bg;
	}
}
