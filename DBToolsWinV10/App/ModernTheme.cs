using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using DBToolsWinV10.Controls;

namespace DBToolsWinV10.App;

public static class ModernTheme
{
	public enum ThemeKind { Light, Dark }

	private static ThemeKind _current = ThemeKind.Light;

	public static ThemeKind Current => _current;
	public static bool IsDark => _current == ThemeKind.Dark;

	public static void SetTheme(ThemeKind theme) => _current = theme;

	private static Color C(int r, int g, int b) => Color.FromArgb(r, g, b);
	private static Color C(int a, int r, int g, int b) => Color.FromArgb(a, r, g, b);

	// ─── Renderer ────────────────────────────────────────────────────────────
	private sealed class ModernColorTable : ProfessionalColorTable
	{
		public override Color ToolStripGradientBegin           => PanelBackground;
		public override Color ToolStripGradientMiddle          => PanelBackground;
		public override Color ToolStripGradientEnd             => PanelBackground;
		public override Color ToolStripDropDownBackground      => PanelBackground;
		public override Color MenuStripGradientBegin           => PanelBackground;
		public override Color MenuStripGradientEnd             => PanelBackground;
		public override Color MenuItemSelected                 => AccentMuted;
		public override Color MenuItemSelectedGradientBegin    => AccentMuted;
		public override Color MenuItemSelectedGradientEnd      => AccentMuted;
		public override Color MenuItemPressedGradientBegin     => AccentMuted;
		public override Color MenuItemPressedGradientEnd       => AccentMuted;
		public override Color MenuItemPressedGradientMiddle    => AccentMuted;
		public override Color MenuItemBorder                   => Border;
		public override Color MenuBorder                       => Border;
		public override Color ImageMarginGradientBegin         => PanelBackground;
		public override Color ImageMarginGradientMiddle        => PanelBackground;
		public override Color ImageMarginGradientEnd           => PanelBackground;
		public override Color ButtonSelectedBorder             => Accent;
		public override Color ButtonCheckedHighlight           => AccentMuted;
		public override Color ButtonCheckedGradientBegin       => AccentMuted;
		public override Color ButtonCheckedGradientEnd         => AccentMuted;
		public override Color ButtonCheckedGradientMiddle      => AccentMuted;
		public override Color ButtonSelectedGradientBegin      => ToolHover;
		public override Color ButtonSelectedGradientEnd        => ToolHover;
		public override Color ButtonSelectedGradientMiddle     => ToolHover;
		public override Color SeparatorDark                    => Border;
		public override Color SeparatorLight                   => BorderLight;
		public override Color OverflowButtonGradientBegin      => PanelBackground;
		public override Color OverflowButtonGradientMiddle     => PanelBackground;
		public override Color OverflowButtonGradientEnd        => PanelBackground;
		public override Color ToolStripBorder                  => PanelBackground;
		public override Color ToolStripContentPanelGradientBegin => PanelBackground;
		public override Color ToolStripContentPanelGradientEnd   => PanelBackground;
		public override Color ToolStripPanelGradientBegin      => PanelBackground;
		public override Color ToolStripPanelGradientEnd        => PanelBackground;
	}

	private sealed class ModernRenderer : ToolStripProfessionalRenderer
	{
		public ModernRenderer() : base(new ModernColorTable()) { }

		protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
		{
			e.TextColor = e.Item.Enabled ? TextPrimary : TextMuted;
			base.OnRenderItemText(e);
		}
	}

	// ─── Core UI colors ──────────────────────────────────────────────────────

	public static Color AppBackground
		=> IsDark ? C(18, 18, 24)   : C(240, 242, 245);

	public static Color PanelBackground
		=> IsDark ? C(28, 28, 40)   : C(255, 255, 255);

	public static Color SidebarBackground
		=> IsDark ? C(22, 22, 32)   : C(250, 251, 253);

	public static Color CanvasBackground
		=> IsDark ? C(20, 20, 30)   : C(255, 255, 255);

	public static Color CanvasChrome
		=> IsDark ? C(36, 36, 52)   : C(226, 232, 240);

	public static Color Accent
		=> IsDark ? C(96, 165, 250)  : C(37, 99, 235);

	public static Color AccentHover
		=> IsDark ? C(147, 197, 253) : C(29, 78, 216);

	public static Color AccentMuted
		=> IsDark ? C(30, 58, 138)   : C(219, 234, 254);

	public static Color Border
		=> IsDark ? C(55, 55, 84)    : C(209, 213, 219);

	public static Color BorderLight
		=> IsDark ? C(42, 42, 68)    : C(229, 231, 235);

	public static Color TextPrimary
		=> IsDark ? C(229, 231, 235) : C(17, 24, 39);

	public static Color TextSecondary
		=> IsDark ? C(156, 163, 175) : C(107, 114, 128);

	public static Color GridLine
		=> IsDark ? C(58, 62, 88)    : C(218, 220, 224);

	public static Color TextMuted
		=> IsDark ? C(100, 107, 115) : C(156, 163, 175);

	public static Color ToolIdle
		=> IsDark ? C(28, 28, 40)    : C(250, 251, 253);

	public static Color ToolHover
		=> IsDark ? C(42, 42, 68)    : C(243, 244, 246);

	public static Color ToolSelected
		=> IsDark ? C(30, 58, 138)   : C(219, 234, 254);

	public static Color Success  => C(16, 185, 129);
	public static Color Warning  => C(245, 158, 11);
	public static Color Danger   => C(239, 68, 68);
	public static Color Info     => C(99, 102, 241);

	// ─── Canvas diagram colors ───────────────────────────────────────────────

	public static Color CanvasRowEven
		=> IsDark ? C(35, 35, 52)    : C(248, 249, 250);

	public static Color CanvasRowOdd
		=> IsDark ? C(28, 28, 44)    : C(255, 255, 255);

	public static Color CanvasBorder
		=> IsDark ? C(65, 65, 95)    : C(180, 180, 190);

	public static Color CanvasBorderLight
		=> IsDark ? C(48, 48, 72)    : C(220, 220, 226);

	public static Color CanvasShadow
		=> IsDark ? C(70, 0, 0, 0)   : C(30, 0, 0, 0);

	public static Color CanvasTextPrimary
		=> IsDark ? C(205, 210, 220) : C(40, 40, 40);

	public static Color CanvasTextSecondary
		=> IsDark ? C(130, 138, 155) : C(110, 110, 120);

	public static Color CanvasPkText
		=> IsDark ? C(220, 130, 30)  : C(180, 100, 0);

	public static Color CanvasFkText
		=> IsDark ? C(55, 148, 215)  : C(0, 100, 160);

	public static Color CanvasHighlightRow
		=> IsDark ? C(72, 54, 10)    : C(255, 243, 205);

	public static Color CanvasRelLine
		=> IsDark ? C(120, 128, 165) : C(100, 100, 120);

	public static Color CanvasRelText
		=> IsDark ? C(148, 148, 178) : C(80, 80, 100);

	public static Color CanvasRelNameBg
		=> IsDark ? C(210, 38, 38, 58) : C(200, 242, 242, 248);

	public static Color CanvasGridMinor
		=> IsDark ? C(15, 255, 255, 255) : C(10, 0, 0, 0);

	public static Color CanvasGridMajor
		=> IsDark ? C(28, 255, 255, 255) : C(22, 0, 0, 0);

	// ─── Ruler colors ────────────────────────────────────────────────────────

	public static Color RulerBackground
		=> IsDark ? C(28, 28, 40)    : C(248, 249, 251);

	public static Color RulerTick
		=> IsDark ? C(88, 92, 112)   : C(180, 186, 195);

	public static Color RulerMajorTick
		=> IsDark ? C(128, 134, 158) : C(107, 114, 128);

	public static Color RulerText
		=> IsDark ? C(138, 146, 168) : C(75, 85, 99);

	public static Color RulerBorder
		=> IsDark ? C(55, 55, 84)    : C(209, 213, 219);

	// ─── Static fonts (same for both themes) ─────────────────────────────────

	public static readonly Font UiFont         = new Font("Segoe UI", 9f);
	public static readonly Font UiFontSmall    = new Font("Segoe UI", 8.5f);
	public static readonly Font SectionFont    = new Font("Segoe UI Semibold", 8f, FontStyle.Bold);
	public static readonly Font TitleFont      = new Font("Segoe UI Semibold", 9.5f, FontStyle.Bold);
	public static readonly Font ToolboxFont    = new Font("Segoe UI", 7.5f);

	// ─── Style methods ───────────────────────────────────────────────────────

	private static ToolStripProfessionalRenderer Renderer()
		=> new ModernRenderer();

	public static void StyleMenuStrip(MenuStrip menu)
	{
		menu.BackColor = PanelBackground;
		menu.ForeColor = TextPrimary;
		menu.Font = UiFont;
		menu.ImageScalingSize = new Size(16, 16);
		menu.Renderer = Renderer();
		EnableMenuItemImages(menu.Items);
	}

	public static void StyleContextMenu(ContextMenuStrip menu)
	{
		menu.Font = UiFont;
		menu.BackColor = PanelBackground;
		menu.ForeColor = TextPrimary;
		menu.ImageScalingSize = new Size(16, 16);
		menu.ShowImageMargin = true;
		menu.Renderer = Renderer();
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
			if (item is ToolStripMenuItem mi)
			{
				mi.ImageScaling = ToolStripItemImageScaling.SizeToFit;
				if (mi.HasDropDownItems)
					EnableMenuItemImages(mi.DropDownItems);
			}
		}
	}

	public static void StyleToolStrip(ToolStrip strip)
	{
		strip.BackColor = PanelBackground;
		strip.ForeColor = TextPrimary;
		strip.Font = UiFont;
		strip.Renderer = Renderer();
		strip.Padding = new Padding(8, 3, 8, 3);
		strip.GripStyle = ToolStripGripStyle.Hidden;
		strip.Stretch = true;
	}

	public static void StyleStatusStrip(StatusStrip strip)
	{
		strip.BackColor = SidebarBackground;
		strip.ForeColor = TextSecondary;
		strip.Font = UiFontSmall;
		strip.Renderer = Renderer();
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
		button.BackColor = active ? ToolSelected : ToolIdle;
		button.ForeColor = active ? Accent : TextPrimary;
		button.FlatAppearance.BorderSize = active ? 1 : 0;
		button.FlatAppearance.BorderColor = active ? Accent : ToolIdle;
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
			groupBox.Invalidate();
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

	[DllImport("uxtheme.dll", CharSet = CharSet.Unicode)]
	private static extern int SetWindowTheme(IntPtr hwnd, string pszSubAppName, string pszSubIdList);

	private static void ApplyWindowTheme(Control ctrl, string subApp)
	{
		if (ctrl.IsHandleCreated)
			SetWindowTheme(ctrl.Handle, subApp, null);
		else
		{
			void OnCreated(object s, EventArgs _)
			{
				ctrl.HandleCreated -= OnCreated;
				SetWindowTheme(ctrl.Handle, subApp, null);
			}
			ctrl.HandleCreated += OnCreated;
		}
	}

	public static void StyleScrollBar(ScrollBar bar)
		=> ApplyWindowTheme(bar, IsDark ? "DarkMode_Explorer" : "Explorer");

	public static void StyleDataList(ListView list)
	{
		list.BorderStyle = BorderStyle.None;
		list.BackColor = PanelBackground;
		list.ForeColor = TextPrimary;
		list.Font = UiFont;
		list.GridLines = false;
		list.OwnerDraw = true;
		list.DrawColumnHeader -= OnListViewDrawColumnHeader;
		list.DrawColumnHeader += OnListViewDrawColumnHeader;
		list.DrawItem -= OnListViewDrawItem;
		list.DrawItem += OnListViewDrawItem;
		list.DrawSubItem -= OnListViewDrawSubItem;
		list.DrawSubItem += OnListViewDrawSubItem;
		// Dark scrollbars when in dark mode
		ApplyWindowTheme(list, IsDark ? "DarkMode_Explorer" : "Explorer");
	}

	private static void OnListViewDrawColumnHeader(object sender, DrawListViewColumnHeaderEventArgs e)
	{
		var list = (ListView)sender;
		int total = list.Columns.Count;
		// For the last column, extend the fill to the full ListView client width
		int fillRight = (e.ColumnIndex == total - 1) ? list.ClientSize.Width : e.Bounds.Right;
		var fillRect = new Rectangle(e.Bounds.Left, e.Bounds.Top, fillRight - e.Bounds.Left, e.Bounds.Height);

		using var bgBrush = new SolidBrush(AppBackground);
		e.Graphics.FillRectangle(bgBrush, fillRect);

		using var gridPen = new Pen(GridLine);
		e.Graphics.DrawLine(gridPen, fillRect.Left, fillRect.Bottom - 1, fillRect.Right, fillRect.Bottom - 1);
		if (e.ColumnIndex < total - 1)
			e.Graphics.DrawLine(gridPen, e.Bounds.Right - 1, e.Bounds.Top + 4, e.Bounds.Right - 1, e.Bounds.Bottom - 4);

		TextRenderer.DrawText(e.Graphics, e.Header?.Text ?? string.Empty,
			e.Font ?? list.Font,
			new Rectangle(e.Bounds.X + 6, e.Bounds.Y, e.Bounds.Width - 8, e.Bounds.Height),
			TextPrimary, TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine);
	}

	private static void OnListViewDrawItem(object sender, DrawListViewItemEventArgs e)
	{
		// Fill the full-row background here; DrawSubItem handles text and vertical separators
		bool selected = e.Item.Selected;
		Color itemBg = e.Item.BackColor;
		bool hasCustomBg = itemBg != Color.Empty && itemBg != SystemColors.Window
			&& itemBg != Color.White && itemBg != PanelBackground;
		Color bg = selected ? AccentMuted : (hasCustomBg ? itemBg : PanelBackground);

		using var bgBrush = new SolidBrush(bg);
		e.Graphics.FillRectangle(bgBrush, e.Bounds);

		// Horizontal separator at the very bottom of the row — drawn once here, not per-cell
		using var gridPen = new Pen(GridLine);
		e.Graphics.DrawLine(gridPen, e.Bounds.Left, e.Bounds.Bottom - 1, e.Bounds.Right, e.Bounds.Bottom - 1);
	}

	private static void OnListViewDrawSubItem(object sender, DrawListViewSubItemEventArgs e)
	{
		var list = (ListView)sender;
		bool selected = e.Item.Selected;
		Color fg = selected ? Accent : e.Item.ForeColor;

		// Vertical column separator on the right edge (all columns except the last)
		if (e.ColumnIndex < list.Columns.Count - 1)
		{
			using var gridPen = new Pen(GridLine);
			e.Graphics.DrawLine(gridPen, e.Bounds.Right - 1, e.Bounds.Top, e.Bounds.Right - 1, e.Bounds.Bottom - 1);
		}

		// Text (leave 1 px at bottom for the horizontal separator drawn in DrawItem)
		var textRect = new Rectangle(e.Bounds.X + 4, e.Bounds.Y, e.Bounds.Width - 6, e.Bounds.Height - 1);
		TextRenderer.DrawText(e.Graphics, e.SubItem?.Text ?? string.Empty,
			e.SubItem?.Font ?? e.Item?.Font ?? list.Font,
			textRect, fg,
			TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis);
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
		tabs.BackColor = PanelBackground;
		tabs.DrawMode = TabDrawMode.OwnerDrawFixed;
		tabs.DrawItem -= DrawTabHeader;
		tabs.DrawItem += DrawTabHeader;
		// Disable UxTheme so BackColor applies to the entire tab strip area
		ApplyWindowTheme(tabs, "");
		foreach (TabPage tabPage in tabs.TabPages)
		{
			tabPage.BackColor = PanelBackground;
			tabPage.ForeColor = TextPrimary;
		}
	}

	private static void DrawTabHeader(object sender, DrawItemEventArgs e)
	{
		var tabs = (TabControl)sender;
		var page = tabs.TabPages[e.Index];
		var rect = tabs.GetTabRect(e.Index);
		bool selected = e.Index == tabs.SelectedIndex;
		var bgColor = selected ? PanelBackground : (IsDark ? C(22, 22, 32) : C(236, 237, 240));
		using var bgBrush = new SolidBrush(bgColor);
		e.Graphics.FillRectangle(bgBrush, rect);
		var textColor = selected ? TextPrimary : TextSecondary;
		TextRenderer.DrawText(e.Graphics, page.Text, e.Font ?? tabs.Font, rect, textColor,
			TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine);
	}

	public static void StyleDialogButton(Button btn, string iconName)
	{
		btn.Image = IconProvider.Get(iconName, 16);
		btn.TextImageRelation = TextImageRelation.ImageBeforeText;
		btn.ImageAlign = ContentAlignment.MiddleLeft;
		btn.TextAlign = ContentAlignment.MiddleLeft;
		btn.Padding = new Padding(6, 0, 4, 0);
	}

	public static void StyleSplitContainer(SplitContainer split, Color panel1Bg, Color panel2Bg)
	{
		split.BackColor = BorderLight;
		split.Panel1.BackColor = panel1Bg;
		split.Panel2.BackColor = panel2Bg;
	}

	public static void ApplyThemeToForm(Form form)
	{
		form.BackColor = PanelBackground;
		form.ForeColor = TextPrimary;
		ApplyThemeToControlsDeep(form.Controls);
	}

	private static void ApplyThemeToControlsDeep(Control.ControlCollection controls)
	{
		var inputBg = IsDark ? C(36, 38, 50) : SystemColors.Window;
		foreach (Control ctrl in controls)
		{
			switch (ctrl)
			{
				case DataGridView dgv:
					dgv.BackgroundColor = PanelBackground;
					dgv.GridColor = Border;
					dgv.EnableHeadersVisualStyles = false;
					dgv.DefaultCellStyle.BackColor = PanelBackground;
					dgv.DefaultCellStyle.ForeColor = TextPrimary;
					dgv.DefaultCellStyle.SelectionBackColor = AccentMuted;
					dgv.DefaultCellStyle.SelectionForeColor = TextPrimary;
					dgv.ColumnHeadersDefaultCellStyle.BackColor = AppBackground;
					dgv.ColumnHeadersDefaultCellStyle.ForeColor = TextPrimary;
					dgv.RowHeadersDefaultCellStyle.BackColor = AppBackground;
					dgv.RowHeadersDefaultCellStyle.ForeColor = TextPrimary;
					break;
				case TextBox txt:
					txt.BackColor = inputBg;
					txt.ForeColor = TextPrimary;
					break;
				case ComboBox cmb:
					cmb.BackColor = inputBg;
					cmb.ForeColor = TextPrimary;
					break;
				case NumericUpDown nud:
					nud.BackColor = inputBg;
					nud.ForeColor = TextPrimary;
					break;
				case Label lbl when IsNeutralColor(lbl.ForeColor):
					lbl.ForeColor = TextPrimary;
					break;
				case GroupBox grp:
					grp.ForeColor = TextPrimary;
					break;
				case CheckBox chk:
					chk.ForeColor = TextPrimary;
					break;
				case RadioButton rb:
					rb.ForeColor = TextPrimary;
					break;
			}
			if (ctrl.HasChildren)
				ApplyThemeToControlsDeep(ctrl.Controls);
		}
	}

	private static bool IsNeutralColor(Color c)
	{
		int max = Math.Max(c.R, Math.Max(c.G, c.B));
		int min = Math.Min(c.R, Math.Min(c.G, c.B));
		return max - min < 40;
	}
}
