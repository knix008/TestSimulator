using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace FileMasterWinV10.Helpers;

public static class UiTheme
{
    private const int LvmGetHeader = 0x101F;

    private static readonly ConditionalWeakTable<Control, object?> NativeThemeHookedControls = new();
    private static readonly ConditionalWeakTable<ListView, object?> DrawHookedListViews = new();
    private static readonly ConditionalWeakTable<ListView, ListViewHeaderFiller> HeaderFillers = new();
    private static readonly ConditionalWeakTable<ListView, ListViewBodyFiller> BodyFillers = new();

    [DllImport("uxtheme.dll", CharSet = CharSet.Unicode)]
    private static extern int SetWindowTheme(IntPtr hwnd, string? pszSubAppName, string? pszSubIdList);

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

    private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20; // Win10 2004+/Win11
    private const int DWMWA_CAPTION_COLOR = 35;           // Win11
    private const int DWMWA_TEXT_COLOR = 36;              // Win11

    public static AppTheme CurrentTheme { get; set; } = AppTheme.Light;

    public static Color Background => CurrentTheme == AppTheme.Dark ? Color.FromArgb(28, 31, 36) : Color.FromArgb(245, 246, 248);
    public static Color Surface => CurrentTheme == AppTheme.Dark ? Color.FromArgb(37, 41, 48) : Color.FromArgb(255, 255, 255);
    public static Color Border => CurrentTheme == AppTheme.Dark ? Color.FromArgb(72, 78, 88) : Color.FromArgb(218, 222, 228);
    public static Color Accent => CurrentTheme == AppTheme.Dark ? Color.FromArgb(86, 156, 214) : Color.FromArgb(0, 103, 192);
    public static Color AccentHover => CurrentTheme == AppTheme.Dark ? Color.FromArgb(108, 178, 235) : Color.FromArgb(0, 90, 168);
    public static Color TextPrimary => CurrentTheme == AppTheme.Dark ? Color.FromArgb(238, 241, 245) : Color.FromArgb(30, 30, 30);
    public static Color TextSecondary => CurrentTheme == AppTheme.Dark ? Color.FromArgb(176, 184, 194) : Color.FromArgb(96, 102, 112);
    public static Color HeaderBg => CurrentTheme == AppTheme.Dark ? Color.FromArgb(45, 50, 58) : Color.FromArgb(237, 240, 244);
    public static Color ListAlternate => CurrentTheme == AppTheme.Dark ? Color.FromArgb(42, 46, 54) : Color.FromArgb(248, 249, 251);
    public static Color DriveBarBg => CurrentTheme == AppTheme.Dark ? Color.FromArgb(33, 37, 43) : Color.FromArgb(232, 235, 240);
    public static Color MenuSelection => CurrentTheme == AppTheme.Dark ? Color.FromArgb(57, 66, 78) : Color.FromArgb(226, 239, 255);
    public static Color MenuImageMargin => CurrentTheme == AppTheme.Dark ? Color.FromArgb(31, 35, 42) : Color.FromArgb(245, 247, 250);
    public static Color SelectionBg => CurrentTheme == AppTheme.Dark ? Color.FromArgb(0, 76, 132) : Color.FromArgb(204, 232, 255);
    public static Color SelectionText => CurrentTheme == AppTheme.Dark ? Color.White : Color.FromArgb(20, 40, 60);

    public static readonly Font UiFont = new("Segoe UI", 9.25f);
    public static readonly Font UiFontSmall = new("Segoe UI", 8.5f);
    public static readonly Font UiFontSemibold = new("Segoe UI Semibold", 9.25f);
    public static readonly Font MonoFont = new("Cascadia Mono", 9f);

    public static void ApplyForm(Form form)
    {
        form.BackColor = Background;
        form.Font = UiFont;
        form.ForeColor = TextPrimary;
        ApplyTitleBar(form);
    }

    /// <summary>제목 표시줄(캡션) 색을 현재 테마에 맞춘다. 창 핸들이 필요하므로 표시 이후에도 다시 호출한다.</summary>
    public static void ApplyTitleBar(Form form)
    {
        if (!form.IsHandleCreated) return;
        bool dark = CurrentTheme == AppTheme.Dark;

        int useDark = dark ? 1 : 0;
        try { DwmSetWindowAttribute(form.Handle, DWMWA_USE_IMMERSIVE_DARK_MODE, ref useDark, sizeof(int)); } catch { }

        // Windows 11에서는 캡션/텍스트 색을 직접 지정한다(구버전에서는 무시됨).
        int caption = ToColorRef(dark ? Background : Surface);
        int text = ToColorRef(dark ? TextPrimary : TextPrimary);
        try { DwmSetWindowAttribute(form.Handle, DWMWA_CAPTION_COLOR, ref caption, sizeof(int)); } catch { }
        try { DwmSetWindowAttribute(form.Handle, DWMWA_TEXT_COLOR, ref text, sizeof(int)); } catch { }
    }

    // Color → Win32 COLORREF(0x00BBGGRR)
    private static int ToColorRef(Color c) => c.R | (c.G << 8) | (c.B << 16);

    public static void ApplyControlTree(Control root)
    {
        root.BackColor = root is TextBoxBase or ListView or ListBox ? Surface : Background;
        root.ForeColor = TextPrimary;
        ApplyNativeTheme(root);
        foreach (Control child in root.Controls)
            ApplyControlTree(child);
    }

    public static void ApplyNativeTheme(Control control)
    {
        if (!NativeThemeHookedControls.TryGetValue(control, out _))
        {
            NativeThemeHookedControls.Add(control, null);
            control.HandleCreated += (_, _) => ApplyNativeTheme(control);
        }

        if (!control.IsHandleCreated) return;

        var themeName = CurrentTheme == AppTheme.Dark ? "DarkMode_Explorer" : "Explorer";
        try
        {
            SetWindowTheme(control.Handle, themeName, null);
            if (control is ListView)
            {
                var headerHandle = SendMessage(control.Handle, LvmGetHeader, IntPtr.Zero, IntPtr.Zero);
                if (headerHandle != IntPtr.Zero)
                    SetWindowTheme(headerHandle, themeName, null);
            }
        }
        catch { }
    }

    public static void StylePrimaryButton(Button btn)
    {
        btn.FlatStyle = FlatStyle.Flat;
        btn.FlatAppearance.BorderSize = 0;
        btn.BackColor = Accent;
        btn.ForeColor = Color.White;
        btn.Font = UiFont;
        btn.Cursor = Cursors.Hand;
        btn.Padding = new Padding(8, 0, 8, 0);
        btn.MouseEnter += (_, _) => btn.BackColor = AccentHover;
        btn.MouseLeave += (_, _) => btn.BackColor = Accent;
    }

    public static void StyleSecondaryButton(Button btn)
    {
        btn.FlatStyle = FlatStyle.Flat;
        btn.FlatAppearance.BorderColor = Border;
        btn.FlatAppearance.BorderSize = 1;
        btn.BackColor = Surface;
        btn.ForeColor = TextPrimary;
        btn.Font = UiFontSmall;
        btn.Cursor = Cursors.Hand;
        btn.Padding = new Padding(6, 0, 6, 0);
        btn.MouseEnter += (_, _) => btn.BackColor = HeaderBg;
        btn.MouseLeave += (_, _) => btn.BackColor = Surface;
    }

    public static void StyleNavButton(Button btn)
    {
        StyleSecondaryButton(btn);
        btn.Size = new Size(32, 28);
        btn.Margin = new Padding(0, 0, 4, 0);
    }

    public static void StyleComboBox(ComboBox combo)
    {
        combo.FlatStyle = FlatStyle.Flat;
        combo.BackColor = Surface;
        combo.ForeColor = TextPrimary;
        combo.Font = UiFont;
        ApplyNativeTheme(combo);
    }

    public static void StyleListView(ListView lv)
    {
        lv.BorderStyle = BorderStyle.None;
        lv.BackColor = Surface;
        lv.ForeColor = TextPrimary;
        lv.Font = UiFont;
        lv.GridLines = false;
        lv.MultiSelect = true;      // Shift/Ctrl 다중 선택
        lv.FullRowSelect = true;
        lv.OwnerDraw = true;
        EnableDoubleBuffer(lv);
        HookListViewDrawing(lv);
        HookHeaderFiller(lv);
        HookBodyFiller(lv);
        ApplyNativeTheme(lv);
    }

    private static void EnableDoubleBuffer(ListView lv) => EnableDoubleBuffered(lv);

    /// <summary>컨트롤의 이중 버퍼링을 켠다(깜빡임·드래그 잔상 방지).</summary>
    public static void EnableDoubleBuffered(Control control)
    {
        typeof(Control)
            .GetProperty("DoubleBuffered", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)
            ?.SetValue(control, true);
    }

    private static void HookHeaderFiller(ListView lv)
    {
        if (HeaderFillers.TryGetValue(lv, out _)) return;
        HeaderFillers.Add(lv, new ListViewHeaderFiller(lv));
    }

    private static void HookBodyFiller(ListView lv)
    {
        if (BodyFillers.TryGetValue(lv, out _)) return;
        BodyFillers.Add(lv, new ListViewBodyFiller(lv));
    }

    public static void StyleTreeView(TreeView tree)
    {
        tree.BorderStyle = BorderStyle.None;
        tree.BackColor = Surface;
        tree.ForeColor = TextPrimary;
        tree.Font = UiFont;
        ApplyNativeTheme(tree);
    }

    public static void StyleScrollableControl(ScrollableControl control)
    {
        control.BackColor = control is FlowLayoutPanel ? DriveBarBg : Surface;
        control.ForeColor = TextPrimary;
        ApplyNativeTheme(control);
    }

    public static void StyleStatusStrip(StatusStrip strip)
    {
        strip.BackColor = HeaderBg;
        strip.ForeColor = TextSecondary;
        strip.Font = UiFontSmall;
        strip.Renderer = new ModernStatusStripRenderer();
    }

    public static void StyleMenuAndToolStrip(MenuStrip menu, ToolStrip toolbar)
    {
        // 전역 렌더러를 지정해 지연 생성되는 드롭다운(하위 메뉴)까지 다크 색을 일관 적용한다.
        ToolStripManager.Renderer = new ModernMenuRenderer();

        menu.BackColor = Surface;
        menu.ForeColor = TextPrimary;
        menu.Font = UiFont;
        menu.Renderer = new ModernMenuRenderer();
        StyleToolStripItems(menu.Items);

        toolbar.BackColor = Surface;
        toolbar.ForeColor = TextPrimary;
        toolbar.Font = UiFont;
        toolbar.GripStyle = ToolStripGripStyle.Hidden;
        toolbar.Padding = new Padding(6, 4, 6, 4);
        toolbar.Renderer = new ModernToolStripRenderer();
        StyleToolStripItems(toolbar.Items);
    }

    public static void StyleContextMenu(ContextMenuStrip menu)
    {
        menu.BackColor = Surface;
        menu.ForeColor = TextPrimary;
        menu.Font = UiFont;
        menu.Renderer = new ModernMenuRenderer();
        StyleToolStripItems(menu.Items);
    }

    private static void StyleToolStripItems(ToolStripItemCollection items)
    {
        foreach (ToolStripItem item in items)
        {
            item.ForeColor = item.Enabled ? TextPrimary : TextSecondary;
            item.BackColor = Surface;
            item.Font = UiFont;

            if (item is ToolStripMenuItem menuItem)
            {
                menuItem.DropDown.BackColor = Surface;
                menuItem.DropDown.ForeColor = TextPrimary;
                menuItem.DropDown.Font = UiFont;
                menuItem.DropDown.Renderer = new ModernMenuRenderer();
                StyleToolStripItems(menuItem.DropDownItems);
            }
        }
    }

    private static void HookListViewDrawing(ListView lv)
    {
        if (DrawHookedListViews.TryGetValue(lv, out _)) return;
        DrawHookedListViews.Add(lv, null);
        lv.DrawColumnHeader += OnDrawListViewColumnHeader;
        lv.DrawItem += OnDrawListViewItem;
        lv.DrawSubItem += OnDrawListViewSubItem;
        // 선택이 바뀌면 마지막 컬럼 뒤 확장 영역까지 다시 칠하도록 전체를 무효화한다.
        lv.SelectedIndexChanged += (_, _) => lv.Invalidate();
        // 크기가 바뀌면(스플리터 이동 등) 행 패턴이 전체 너비로 다시 그려지도록 무효화한다.
        lv.SizeChanged += (_, _) => lv.Invalidate();
    }

    private static void OnDrawListViewColumnHeader(object? sender, DrawListViewColumnHeaderEventArgs e)
    {
        if (e.Header == null) return;

        using var bg = new SolidBrush(HeaderBg);
        using var border = new Pen(Border);
        e.Graphics.FillRectangle(bg, e.Bounds);
        e.Graphics.DrawLine(border, e.Bounds.Right - 1, e.Bounds.Top + 4, e.Bounds.Right - 1, e.Bounds.Bottom - 4);
        e.Graphics.DrawLine(border, e.Bounds.Left, e.Bounds.Bottom - 1, e.Bounds.Right, e.Bounds.Bottom - 1);

        var flags = TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix;
        flags |= e.Header.TextAlign switch
        {
            HorizontalAlignment.Right => TextFormatFlags.Right,
            HorizontalAlignment.Center => TextFormatFlags.HorizontalCenter,
            _ => TextFormatFlags.Left
        };
        TextRenderer.DrawText(e.Graphics, e.Header.Text, UiFontSemibold, Rectangle.Inflate(e.Bounds, -8, 0), TextPrimary, flags);
    }

    private static void OnDrawListViewItem(object? sender, DrawListViewItemEventArgs e)
    {
        if (e.Item?.ListView is not ListView lv) return;
        // Details 뷰에서는 각 셀(DrawSubItem)에서 배경/텍스트를 그린다.
        if (lv.View != View.Details)
        {
            e.DrawBackground();
            e.DrawText();
        }
    }

    private static bool IsLastColumn(ListView lv, int columnIndex)
    {
        int maxDisplay = -1, lastIndex = 0;
        foreach (ColumnHeader c in lv.Columns)
            if (c.DisplayIndex > maxDisplay) { maxDisplay = c.DisplayIndex; lastIndex = c.Index; }
        return columnIndex == lastIndex;
    }

    private static void OnDrawListViewSubItem(object? sender, DrawListViewSubItemEventArgs e)
    {
        if (e.Item?.ListView is not ListView lv || e.Header == null || e.SubItem == null) return;

        var selected = e.Item.Selected;
        var rowColor = selected ? SelectionBg : (e.ItemIndex % 2 == 0 ? Surface : ListAlternate);

        // 각 셀 배경을 행 색으로 칠한다. 마지막 컬럼은 컨트롤 오른쪽 끝까지 확장해
        // 행 전체(마지막 컬럼 뒤 여백 포함)가 선택돼 보이게 한다.
        var fill = IsLastColumn(lv, e.ColumnIndex)
            ? new Rectangle(e.Bounds.Left, e.Bounds.Top, lv.ClientSize.Width - e.Bounds.Left, e.Bounds.Height)
            : e.Bounds;
        using (var bg = new SolidBrush(rowColor))
            e.Graphics.FillRectangle(bg, fill);

        var textBounds = Rectangle.Inflate(e.Bounds, -8, 0);
        if (e.ColumnIndex == 0 && e.Item.ImageList != null && e.Item.ImageIndex >= 0 && e.Item.ImageIndex < e.Item.ImageList.Images.Count)
        {
            var imageY = e.Bounds.Top + Math.Max(0, (e.Bounds.Height - 16) / 2);
            e.Item.ImageList.Draw(e.Graphics, e.Bounds.Left + 4, imageY, 16, 16, e.Item.ImageIndex);
            textBounds.X += 20;
            textBounds.Width -= 20;
        }

        var flags = TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix;
        flags |= e.Header.TextAlign switch
        {
            HorizontalAlignment.Right => TextFormatFlags.Right,
            HorizontalAlignment.Center => TextFormatFlags.HorizontalCenter,
            _ => TextFormatFlags.Left
        };
        TextRenderer.DrawText(e.Graphics, e.SubItem.Text, e.Item.ListView?.Font ?? UiFont, textBounds, selected ? SelectionText : TextPrimary, flags);
    }
}

/// <summary>
/// 오너드로우 ListView 헤더에서 마지막 컬럼 오른쪽에 남는 빈 영역을 테마 색으로 채운다.
/// (헤더 네이티브 컨트롤에 서브클래싱해 WM_PAINT 후 여백을 다시 칠한다.)
/// </summary>
internal sealed class ListViewHeaderFiller : NativeWindow
{
    private const int WM_PAINT = 0x000F;
    private const int LvmGetHeader = 0x101F;
    private const int HdmFirst = 0x1200;
    private const int HdmGetItemCount = HdmFirst + 0;
    private const int HdmGetItemRect = HdmFirst + 7;

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left, Top, Right, Bottom; }

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, ref RECT lParam);

    [DllImport("user32.dll")]
    private static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);

    private readonly ListView _listView;

    public ListViewHeaderFiller(ListView listView)
    {
        _listView = listView;
        _listView.HandleCreated += (_, _) => Attach();
        _listView.HandleDestroyed += (_, _) => Detach();
        if (_listView.IsHandleCreated) Attach();
    }

    private void Attach()
    {
        var header = SendMessage(_listView.Handle, LvmGetHeader, IntPtr.Zero, IntPtr.Zero);
        if (header == IntPtr.Zero) return;
        if (Handle != IntPtr.Zero) ReleaseHandle();
        AssignHandle(header);
    }

    private void Detach()
    {
        if (Handle != IntPtr.Zero) ReleaseHandle();
    }

    protected override void WndProc(ref Message m)
    {
        base.WndProc(ref m);
        if (m.Msg == WM_PAINT) PaintFiller();
    }

    private void PaintFiller()
    {
        if (!GetClientRect(Handle, out var client)) return;

        int right = 0;
        int count = (int)SendMessage(Handle, HdmGetItemCount, IntPtr.Zero, IntPtr.Zero);
        for (int i = 0; i < count; i++)
        {
            var r = new RECT();
            SendMessage(Handle, HdmGetItemRect, (IntPtr)i, ref r);
            if (r.Right > right) right = r.Right;
        }

        if (right >= client.Right) return;

        using var g = Graphics.FromHwnd(Handle);
        var fill = new Rectangle(right, client.Top, client.Right - right, client.Bottom - client.Top);
        using var bg = new SolidBrush(UiTheme.HeaderBg);
        g.FillRectangle(bg, fill);
        using var pen = new Pen(UiTheme.Border);
        g.DrawLine(pen, fill.Left, fill.Bottom - 1, fill.Right, fill.Bottom - 1);
    }
}

/// <summary>
/// 오너드로우 ListView의 마지막 항목 아래 빈 영역까지 교차 줄무늬를 이어 그려,
/// 목록이 하단에서 끊겨 보이지 않게 한다.
/// </summary>
internal sealed class ListViewBodyFiller : NativeWindow
{
    private const int WM_PAINT = 0x000F;
    private readonly ListView _lv;

    public ListViewBodyFiller(ListView lv)
    {
        _lv = lv;
        _lv.HandleCreated += (_, _) => { if (Handle == IntPtr.Zero) AssignHandle(_lv.Handle); };
        _lv.HandleDestroyed += (_, _) => { if (Handle != IntPtr.Zero) ReleaseHandle(); };
        if (_lv.IsHandleCreated) AssignHandle(_lv.Handle);
    }

    protected override void WndProc(ref Message m)
    {
        base.WndProc(ref m);
        if (m.Msg == WM_PAINT) PaintBelowLastItem();
    }

    private void PaintBelowLastItem()
    {
        if (_lv.View != View.Details || _lv.Items.Count == 0) return;

        var last = _lv.Items[_lv.Items.Count - 1].Bounds;
        int rowH = last.Height;
        if (rowH <= 0) return;

        var client = _lv.ClientRectangle;
        if (last.Bottom >= client.Bottom) return;

        using var g = Graphics.FromHwnd(_lv.Handle);
        using var surface = new SolidBrush(UiTheme.Surface);
        using var alt = new SolidBrush(UiTheme.ListAlternate);

        int y = last.Bottom;
        int idx = _lv.Items.Count; // 다음 행의 홀짝을 이어간다.
        while (y < client.Bottom)
        {
            var brush = idx % 2 == 0 ? surface : alt;
            g.FillRectangle(brush, new Rectangle(client.Left, y, client.Width, rowH));
            y += rowH;
            idx++;
        }
    }
}

internal sealed class ModernMenuRenderer : ToolStripProfessionalRenderer
{
    public ModernMenuRenderer() : base(new ModernColorTable()) { }

    protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
    {
        var rect = new Rectangle(Point.Empty, e.Item.Size);
        var color = e.Item.Selected || e.Item.Pressed ? UiTheme.MenuSelection : UiTheme.Surface;
        using var brush = new SolidBrush(color);
        e.Graphics.FillRectangle(brush, rect);
        if (e.Item.Selected || e.Item.Pressed)
        {
            using var pen = new Pen(UiTheme.Border);
            e.Graphics.DrawRectangle(pen, rect.X, rect.Y, rect.Width - 1, rect.Height - 1);
        }
    }

    protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
    {
        e.TextColor = e.Item.Enabled ? UiTheme.TextPrimary : UiTheme.TextSecondary;
        base.OnRenderItemText(e);
    }

    protected override void OnRenderImageMargin(ToolStripRenderEventArgs e)
    {
        using var brush = new SolidBrush(UiTheme.MenuImageMargin);
        e.Graphics.FillRectangle(brush, e.AffectedBounds);
    }

    protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
    {
        using var pen = new Pen(UiTheme.Border);
        var y = e.Item.Height / 2;
        e.Graphics.DrawLine(pen, 28, y, e.Item.Width - 4, y);
    }
}

internal sealed class ModernToolStripRenderer : ToolStripProfessionalRenderer
{
    public ModernToolStripRenderer() : base(new ModernColorTable()) { }

    protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e)
    {
        // 툴바 전체를 테마 배경색으로 채운다.
        using var brush = new SolidBrush(UiTheme.Surface);
        e.Graphics.FillRectangle(brush, e.AffectedBounds);
    }

    protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
    {
        // 기본 렌더러가 그리는 밝은 경계선을 그리지 않는다(다크 테마에서 흰 줄 방지).
    }

    protected override void OnRenderButtonBackground(ToolStripItemRenderEventArgs e)
    {
        if (e.Item is ToolStripButton { Selected: true } or ToolStripButton { Pressed: true })
        {
            var rect = new Rectangle(Point.Empty, e.Item.Size);
            using var brush = new SolidBrush(UiTheme.HeaderBg);
            e.Graphics.FillRectangle(brush, rect);
            using var pen = new Pen(UiTheme.Border);
            e.Graphics.DrawRectangle(pen, rect.X, rect.Y, rect.Width - 1, rect.Height - 1);
            return;
        }
        base.OnRenderButtonBackground(e);
    }
}

internal sealed class ModernStatusStripRenderer : ToolStripProfessionalRenderer
{
    public ModernStatusStripRenderer() : base(new ModernColorTable()) { }

    protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
    {
        // 상태 표시줄 위쪽 경계선을 그리지 않는다(요청: 없거나 아주 얇게).
    }
}

internal sealed class ModernColorTable : ProfessionalColorTable
{
    public override Color ToolStripGradientBegin => UiTheme.Surface;
    public override Color ToolStripGradientMiddle => UiTheme.Surface;
    public override Color ToolStripGradientEnd => UiTheme.Surface;
    public override Color MenuStripGradientBegin => UiTheme.Surface;
    public override Color MenuStripGradientEnd => UiTheme.Surface;
    public override Color MenuItemSelected => UiTheme.HeaderBg;
    public override Color MenuItemSelectedGradientBegin => UiTheme.HeaderBg;
    public override Color MenuItemSelectedGradientEnd => UiTheme.HeaderBg;
    public override Color MenuItemPressedGradientBegin => UiTheme.MenuSelection;
    public override Color MenuItemPressedGradientMiddle => UiTheme.MenuSelection;
    public override Color MenuItemPressedGradientEnd => UiTheme.MenuSelection;
    public override Color MenuItemBorder => UiTheme.Border;
    public override Color MenuBorder => UiTheme.Border;
    public override Color ToolStripBorder => UiTheme.Border;
    public override Color SeparatorDark => UiTheme.Border;
    public override Color SeparatorLight => UiTheme.Border;
    public override Color ImageMarginGradientBegin => UiTheme.Surface;
    public override Color ImageMarginGradientMiddle => UiTheme.Surface;
    public override Color ImageMarginGradientEnd => UiTheme.Surface;
}
