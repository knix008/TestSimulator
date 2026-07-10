using System.Drawing;
using System.Windows.Forms;
using DBToolsWinV10.Controls;

namespace DBToolsWinV10.App;

public static class ModernTheme
{
	public enum ThemeKind { Light, Dark }

	private static ThemeKind _current = ThemeKind.Light;

	public static ThemeKind Current => _current;
	public static bool IsDark => _current == ThemeKind.Dark;

	public static void SetTheme(ThemeKind theme)
	{
		_current = theme;
		ScrollBarTheme.SyncSystemColorMode();
	}

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
		public override Color ButtonSelectedBorder             => PanelBackground;
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

		protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
		{
			using var pen = new Pen(BorderLight, 1f);
			var rect = e.AffectedBounds;
			e.Graphics.DrawLine(pen, rect.Left, rect.Bottom - 1, rect.Right, rect.Bottom - 1);
		}

		protected override void OnRenderButtonBackground(ToolStripItemRenderEventArgs e)
		{
			if (e.Item is not ToolStripButton && e.Item is not ToolStripDropDownButton)
			{
				base.OnRenderButtonBackground(e);
				return;
			}

			if (!e.Item.Enabled)
			{
				base.OnRenderButtonBackground(e);
				return;
			}

			Rectangle bounds = new Rectangle(Point.Empty, e.Item.Size);
			Color bg = Color.Transparent;

			if (e.Item.Pressed)
				bg = AccentMuted;
			else if (e.Item is ToolStripButton { CheckOnClick: true, Checked: true })
				bg = ToolSelected;
			else if (e.Item.Selected)
				bg = ToolHover;

			if (bg.A == 0)
				return;

			using var brush = new SolidBrush(bg);
			e.Graphics.FillRectangle(brush, bounds);
		}
	}

	// ─── Core UI colors ──────────────────────────────────────────────────────

	public static Color AppBackground
		=> IsDark ? C(18, 18, 24)   : C(240, 242, 245);

	public static Color PanelBackground
		=> IsDark ? C(28, 28, 40)   : C(255, 255, 255);

	public static Color SidebarBackground
		=> IsDark ? C(22, 22, 32)   : C(250, 251, 253);

	public static Color ListRowAlternate
		=> IsDark ? C(32, 32, 46)    : C(248, 249, 252);

	public static Color InputBackground
		=> IsDark ? C(36, 38, 50)    : C(255, 255, 255);

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

	public static Color TextMuted
		=> IsDark ? C(100, 107, 115) : C(156, 163, 175);

	public static Color ScrollBarTrack
		=> IsDark ? C(36, 36, 52)    : C(241, 241, 241);

	public static Color ScrollBarThumb
		=> IsDark ? C(78, 78, 104)   : C(180, 180, 180);

	public static Color ScrollBarArrow
		=> IsDark ? C(156, 163, 175) : C(96, 96, 96);

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
		button.UseVisualStyleBackColor = false;
		button.FlatAppearance.BorderSize = 0;
		button.FlatAppearance.BorderColor = ToolIdle;
		button.BackColor = ToolIdle;
		button.ForeColor = TextPrimary;
		button.Font = ToolboxFont;
		button.Cursor = Cursors.Hand;
		button.Margin = new Padding(0, 1, 0, 1);
		button.FlatAppearance.MouseOverBackColor = ToolHover;
		button.FlatAppearance.MouseDownBackColor = ToolSelected;
		NativeControlTheme.Reapply(button);
		button.Invalidate(true);
	}

	public static void SetToolboxButtonActive(Button button, bool active)
	{
		button.BackColor = active ? ToolSelected : ToolIdle;
		button.ForeColor = active ? Accent : TextPrimary;
		button.FlatAppearance.BorderSize = 0;
		button.FlatAppearance.BorderColor = button.BackColor;
		NativeControlTheme.Reapply(button);
		button.Invalidate(true);
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
		if (tree is ThemedTreeView themed)
		{
			themed.ApplyTheme();
			return;
		}

		tree.BorderStyle = BorderStyle.None;
		tree.BackColor = PanelBackground;
		tree.ForeColor = TextPrimary;
		tree.Font = UiFont;
		tree.ItemHeight = 22;
		tree.LineColor = BorderLight;
	}

	public static void StyleDataList(ListView list, bool propertyGridStyle = false)
	{
		if (list is BufferedListView buffered)
		{
			buffered.PropertyGridStyle = propertyGridStyle;
			buffered.ApplyTheme();
			return;
		}

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

		if (grid is BufferedPropertyGrid buffered)
			buffered.ApplyTheme();
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

	public static void StyleDialogButton(Button btn, string iconName)
	{
		if (btn is ThemedDialogButton themed)
		{
			themed.Image = IconProvider.Get(iconName, 16);
			themed.TextImageRelation = TextImageRelation.ImageBeforeText;
			themed.ImageAlign = ContentAlignment.MiddleLeft;
			themed.TextAlign = ContentAlignment.MiddleLeft;
			themed.Padding = new Padding(6, 0, 4, 0);
			themed.RefreshTheme();
			return;
		}

		StyleDialogButtonCore(btn);
		btn.Image = IconProvider.Get(iconName, 16);
		btn.TextImageRelation = TextImageRelation.ImageBeforeText;
		btn.ImageAlign = ContentAlignment.MiddleLeft;
		btn.TextAlign = ContentAlignment.MiddleLeft;
		btn.Padding = new Padding(6, 0, 4, 0);
	}

	public static void StyleDialogButtonCore(Button btn)
	{
		if (btn is ThemedDialogButton themed)
		{
			themed.RefreshTheme();
			return;
		}

		btn.UseVisualStyleBackColor = false;
		if (btn.FlatStyle == FlatStyle.Flat)
			btn.FlatStyle = FlatStyle.Standard;
		btn.FlatStyle = FlatStyle.Flat;
		btn.FlatAppearance.BorderSize = 1;
		btn.FlatAppearance.BorderColor = Border;
		btn.BackColor = PanelBackground;
		btn.ForeColor = TextPrimary;
		btn.Font = UiFont;
		btn.Cursor = Cursors.Hand;
		btn.FlatAppearance.MouseOverBackColor = ToolHover;
		btn.FlatAppearance.MouseDownBackColor = AccentMuted;
		NativeControlTheme.Reapply(btn);
		btn.Invalidate(true);
	}

	public static void StyleDialogGroupBox(GroupBox grp)
	{
		grp.FlatStyle = FlatStyle.Flat;
		grp.BackColor = PanelBackground;
		grp.ForeColor = TextMuted;
		grp.Font = SectionFont;
	}

	public static void StyleDialogLabel(Label lbl)
	{
		lbl.ForeColor = TextPrimary;
		lbl.BackColor = Color.Transparent;
	}

	public static void StyleComboBox(ComboBox cmb)
	{
		cmb.FlatStyle = FlatStyle.Flat;
		cmb.BackColor = InputBackground;
		cmb.ForeColor = TextPrimary;
		cmb.Font = UiFont;
		cmb.DrawMode = DrawMode.OwnerDrawFixed;
		cmb.DrawItem -= OnComboBoxDrawItem;
		cmb.DrawItem += OnComboBoxDrawItem;
		if (cmb.ItemHeight < 20)
			cmb.ItemHeight = 22;

		int selected = cmb.SelectedIndex;
		cmb.Invalidate(true);
		if (selected >= 0)
			cmb.SelectedIndex = selected;
	}

	private static void OnComboBoxDrawItem(object sender, DrawItemEventArgs e)
	{
		if (e.Index < 0)
			return;

		var cmb = (ComboBox)sender;
		bool selected = (e.State & DrawItemState.Selected) != 0;
		var bg = selected ? AccentMuted : InputBackground;
		var fg = selected ? Accent : TextPrimary;
		using var brush = new SolidBrush(bg);
		e.Graphics.FillRectangle(brush, e.Bounds);
		string text = cmb.Items[e.Index]?.ToString() ?? string.Empty;
		var textRect = new Rectangle(e.Bounds.X + 4, e.Bounds.Y, e.Bounds.Width - 6, e.Bounds.Height);
		TextRenderer.DrawText(e.Graphics, text, cmb.Font, textRect, fg,
			TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.SingleLine);
	}

	public static void StyleNumericUpDown(NumericUpDown nud)
	{
		nud.BackColor = InputBackground;
		nud.ForeColor = TextPrimary;
		nud.Font = UiFont;
		nud.BorderStyle = BorderStyle.FixedSingle;
		nud.Invalidate(true);
	}

	public static void StyleCheckBox(CheckBox chk)
	{
		chk.ForeColor = TextPrimary;
		chk.BackColor = Color.Transparent;
		chk.Font = UiFont;
		if (chk is ThemedCheckBox)
		{
			chk.Invalidate();
			return;
		}

		chk.FlatStyle = FlatStyle.Flat;
		chk.FlatAppearance.BorderSize = 1;
		chk.FlatAppearance.BorderColor = Border;
		chk.FlatAppearance.CheckedBackColor = AccentMuted;
		chk.FlatAppearance.MouseOverBackColor = ToolHover;
		chk.UseVisualStyleBackColor = false;
	}

	public const int ContentFrameWidth = 1;

	public static void ApplyContentFrame(Control container)
	{
		container.Padding = new Padding(ContentFrameWidth);
		container.BackColor = BorderLight;
	}

	public static void StyleSplitContainer(
		SplitContainer split,
		Color panel1Bg,
		Color panel2Bg,
		bool framePanel1 = false,
		bool framePanel2 = false)
	{
		split.BackColor = BorderLight;
		if (framePanel1)
			ApplyContentFrame(split.Panel1);
		else
			split.Panel1.BackColor = panel1Bg;
		if (framePanel2)
			ApplyContentFrame(split.Panel2);
		else
			split.Panel2.BackColor = panel2Bg;
	}

	public static void StyleDataGridView(DataGridView dgv)
	{
		dgv.BackgroundColor = PanelBackground;
		dgv.BorderStyle = BorderStyle.None;
		dgv.GridColor = BorderLight;
		dgv.EnableHeadersVisualStyles = false;
		dgv.CellBorderStyle = DataGridViewCellBorderStyle.SingleHorizontal;
		dgv.RowHeadersVisible = false;
		dgv.DefaultCellStyle.BackColor = PanelBackground;
		dgv.DefaultCellStyle.ForeColor = TextPrimary;
		dgv.DefaultCellStyle.SelectionBackColor = AccentMuted;
		dgv.DefaultCellStyle.SelectionForeColor = Accent;
		dgv.AlternatingRowsDefaultCellStyle.BackColor = ListRowAlternate;
		dgv.AlternatingRowsDefaultCellStyle.ForeColor = TextPrimary;
		dgv.AlternatingRowsDefaultCellStyle.SelectionBackColor = AccentMuted;
		dgv.AlternatingRowsDefaultCellStyle.SelectionForeColor = Accent;
		dgv.ColumnHeadersDefaultCellStyle.BackColor = SidebarBackground;
		dgv.ColumnHeadersDefaultCellStyle.ForeColor = TextSecondary;
		dgv.ColumnHeadersDefaultCellStyle.Font = UiFontSmall;
		dgv.ColumnHeadersDefaultCellStyle.SelectionBackColor = SidebarBackground;
		dgv.ColumnHeadersDefaultCellStyle.SelectionForeColor = TextSecondary;
		dgv.ColumnHeadersBorderStyle = DataGridViewHeaderBorderStyle.Single;
		dgv.AdvancedColumnHeadersBorderStyle.All = DataGridViewAdvancedCellBorderStyle.None;
		dgv.AdvancedColumnHeadersBorderStyle.Bottom = DataGridViewAdvancedCellBorderStyle.Single;
		dgv.RowTemplate.Height = 24;
	}

	public static void ApplyThemeToForm(Form form)
	{
		form.BackColor = PanelBackground;
		form.ForeColor = TextPrimary;
		form.Font = UiFont;
		ApplyThemeToControlsDeep(form.Controls);
		NativeControlTheme.ApplyDeep(form);
		ScrollBarTheme.Apply(form);
		ScrollBarTheme.Refresh(form);
		ReapplyOwnerColoredControlsDeep(form.Controls);
		form.Invalidate(true);
	}

	private static bool IsToolboxButton(Button button)
	{
		if (button is ToolboxButton)
			return true;

		for (Control parent = button.Parent; parent != null; parent = parent.Parent)
		{
			if (parent.Name == "panelToolBox")
				return true;
		}

		return false;
	}

	private static void ReapplyOwnerColoredControlsDeep(Control.ControlCollection controls)
	{
		foreach (Control ctrl in controls)
		{
			switch (ctrl)
			{
				case Button { FlatStyle: FlatStyle.Flat } btn when !btn.UseVisualStyleBackColor && !IsToolboxButton(btn):
					StyleDialogButtonCore(btn);
					NativeControlTheme.Reapply(btn);
					break;
				case CheckBox { FlatStyle: FlatStyle.Flat } chk when !chk.UseVisualStyleBackColor:
					StyleCheckBox(chk);
					NativeControlTheme.Reapply(chk);
					break;
				case RadioButton { FlatStyle: FlatStyle.Flat } rb when !rb.UseVisualStyleBackColor:
					rb.ForeColor = TextPrimary;
					rb.BackColor = Color.Transparent;
					NativeControlTheme.Reapply(rb);
					break;
			}

			if (ctrl.HasChildren)
				ReapplyOwnerColoredControlsDeep(ctrl.Controls);
		}
	}

	private static void ApplyThemeToControlsDeep(Control.ControlCollection controls)
	{
		foreach (Control ctrl in controls)
		{
			switch (ctrl)
			{
				case DataGridView dgv:
					StyleDataGridView(dgv);
					break;
				case TextBox txt:
					txt.BackColor = InputBackground;
					txt.ForeColor = TextPrimary;
					txt.Font = UiFont;
					txt.BorderStyle = BorderStyle.FixedSingle;
					break;
				case ComboBox cmb:
					StyleComboBox(cmb);
					break;
				case NumericUpDown nud:
					StyleNumericUpDown(nud);
					break;
				case Label lbl:
					StyleDialogLabel(lbl);
					break;
				case GroupBox grp:
					StyleDialogGroupBox(grp);
					break;
				case CheckBox chk:
					StyleCheckBox(chk);
					break;
				case RadioButton rb:
					rb.ForeColor = TextPrimary;
					rb.BackColor = Color.Transparent;
					rb.Font = UiFont;
					rb.FlatStyle = FlatStyle.Flat;
					rb.UseVisualStyleBackColor = false;
					break;
				case Button btn when !IsToolboxButton(btn):
					StyleDialogButtonCore(btn);
					break;
				case Panel panel:
					panel.BackColor = PanelBackground;
					panel.ForeColor = TextPrimary;
					break;
			}
			if (ctrl.HasChildren)
				ApplyThemeToControlsDeep(ctrl.Controls);
		}
	}
}
