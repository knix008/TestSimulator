using System;
using System.ComponentModel;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using DBToolsWinV10.App;

namespace DBToolsWinV10.Controls;

internal sealed class BufferedListView : ListView
{
	private const int LvmGetHeader = 0x101F;
	private const int LvmSetColumnWidth = 0x101E;
	private const int LvmGetColumnWidth = 0x101D;
	private const int LvscwAutosizeUseHeader = -2;
	private const int WmPaint = 0x000F;
	private const int LvmSetExtendedListViewStyle = 0x1036;
	private const int LvmGetExtendedListViewStyle = 0x1037;
	private const int LvsExGridLines = 0x00000001;
	private const int LvsExDoubleBuffer = 0x00010000;

	private const int LvmShowScrollBar = 0x1018;
	private const int SbVert = 1;
	private const int GwlStyle = -16;
	private const int HdsFlat = 0x0200;

	private bool _themeHandlersAttached;
	private bool _suppressStretch;
	private HeaderFillerOverlay _headerOverlay;

	/// <summary>
	/// Matches the right-bottom property grid: flat rows, horizontal separators only.
	/// </summary>
	[DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
	public bool PropertyGridStyle { get; set; }

	[DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
	public bool StretchLastColumn { get; set; }

	/// <summary>
	/// Keeps the vertical scrollbar visible so the header gutter does not show a native column divider.
	/// </summary>
	[DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
	public bool AlwaysShowVerticalScrollBar { get; set; }

	public BufferedListView()
	{
		DoubleBuffered = true;
		View = View.Details;
		FullRowSelect = true;
		UseCompatibleStateImageBehavior = false;
		ApplyTheme();
	}

	public void ApplyTheme()
	{
		BorderStyle = BorderStyle.None;
		BackColor = ModernTheme.PanelBackground;
		ForeColor = ModernTheme.TextPrimary;
		Font = ModernTheme.UiFont;
		GridLines = false;
		OwnerDraw = true;

		if (!_themeHandlersAttached)
		{
			DrawColumnHeader += OnDrawColumnHeader;
			DrawItem += OnDrawItem;
			DrawSubItem += OnDrawSubItem;
			_themeHandlersAttached = true;
		}

		Invalidate(true);
		RefreshScrollbars();
		StretchLastColumnWidth();
	}

	public void AutoSizeLeadingColumns()
	{
		if (!IsHandleCreated || Columns.Count == 0)
			return;

		int lastCol = Columns.Count - 1;
		_suppressStretch = true;
		try
		{
			for (int i = 0; i < lastCol; i++)
				SendMessage(Handle, LvmSetColumnWidth, i, LvscwAutosizeUseHeader);
		}
		finally
		{
			_suppressStretch = false;
		}
	}

	public void FillLastColumnOnly()
	{
		if (!StretchLastColumn || Columns.Count == 0 || !IsHandleCreated)
			return;

		int layoutRight = GetLayoutRightEdge(this);
		if (layoutRight <= 0)
			return;

		int lastCol = Columns.Count - 1;
		int used = 0;
		for (int i = 0; i < lastCol; i++)
		{
			int width = GetNativeColumnWidth(i);
			if (width <= 0)
				return;
			used += width;
		}

		const int minLastColumnWidth = 48;
		int lastWidth = Math.Max(minLastColumnWidth, layoutRight - used);

		_suppressStretch = true;
		try
		{
			SetNativeColumnWidth(lastCol, lastWidth);
		}
		finally
		{
			_suppressStretch = false;
		}

		EnsureHeaderOverlay();
		_headerOverlay?.RepaintFiller();
		Invalidate(true);
	}

	public void StretchLastColumnWidth()
	{
		if (!StretchLastColumn || Columns.Count == 0 || !IsHandleCreated)
			return;

		int layoutRight = GetLayoutRightEdge(this);
		if (layoutRight <= 0)
			return;

		int lastCol = Columns.Count - 1;
		var widths = new int[Columns.Count];
		for (int i = 0; i < lastCol; i++)
		{
			widths[i] = GetNativeColumnWidth(i);
			if (widths[i] <= 0)
				return;
		}

		const int minLeadingColumnWidth = 32;
		const int minLastColumnWidth = 48;
		int used = 0;
		for (int i = 0; i < lastCol; i++)
			used += widths[i];

		widths[lastCol] = Math.Max(minLastColumnWidth, layoutRight - used);
		int total = used + widths[lastCol];
		if (total > layoutRight)
		{
			int overflow = total - layoutRight;
			for (int i = 0; i < lastCol && overflow > 0; i++)
			{
				int shrinkable = Math.Max(0, widths[i] - minLeadingColumnWidth);
				if (shrinkable == 0)
					continue;

				int shrink = Math.Min(overflow, shrinkable);
				widths[i] -= shrink;
				overflow -= shrink;
			}

			used = 0;
			for (int i = 0; i < lastCol; i++)
				used += widths[i];
			widths[lastCol] = Math.Max(minLastColumnWidth, layoutRight - used);
		}

		_suppressStretch = true;
		try
		{
			for (int i = 0; i < Columns.Count; i++)
				SetNativeColumnWidth(i, widths[i]);
		}
		finally
		{
			_suppressStretch = false;
		}

		EnsureHeaderOverlay();
		_headerOverlay?.RepaintFiller();
		Invalidate(true);
	}

	private int GetNativeColumnWidth(int columnIndex)
		=> (int)SendMessage(Handle, LvmGetColumnWidth, columnIndex, 0);

	private void SetNativeColumnWidth(int columnIndex, int width)
	{
		SendMessage(Handle, LvmSetColumnWidth, columnIndex, width);
		Columns[columnIndex].Width = width;
	}

	private void EnsureHeaderOverlay()
	{
		if (!StretchLastColumn || !IsHandleCreated)
			return;

		nint header = SendMessage(Handle, LvmGetHeader, 0, 0);
		if (header == 0)
			return;

		if (_headerOverlay == null || _headerOverlay.TargetHandle != header)
		{
			_headerOverlay?.Dispose();
			_headerOverlay = new HeaderFillerOverlay(header, this);
		}

		try
		{
			SetWindowTheme(header, string.Empty, string.Empty);
			FlattenHeader(header);
		}
		catch
		{
			// uxtheme unavailable on some Windows builds.
		}
	}

	private static void FlattenHeader(nint header)
	{
		nint style = GetWindowLongPtr(header, GwlStyle);
		SetWindowLongPtr(header, GwlStyle, style | HdsFlat);
	}

	private void PaintHeaderFiller(Graphics graphics, Rectangle headerBounds)
	{
		if (!PropertyGridStyle || !StretchLastColumn)
			return;

		int columnsRight = 0;
		foreach (ColumnHeader column in Columns)
			columnsRight += column.Width;

		int fillLeft = Math.Max(0, columnsRight - 3);
		int fillRight = headerBounds.Width;
		if (fillLeft >= fillRight)
			return;

		var filler = new Rectangle(fillLeft, 0, fillRight - fillLeft, headerBounds.Height);
		using var brush = new SolidBrush(ModernTheme.PanelBackground);
		graphics.FillRectangle(brush, filler);
	}

	protected override void OnPaintBackground(PaintEventArgs pevent)
	{
		using var brush = new SolidBrush(ModernTheme.PanelBackground);
		pevent.Graphics.FillRectangle(brush, ClientRectangle);
	}

	private void OnDrawItem(object sender, DrawListViewItemEventArgs e)
	{
		if (!PropertyGridStyle || e.Item.Tag is ListViewCategoryRow)
			return;

		var list = (ListView)sender;
		int paintRight = StretchLastColumn ? GetLayoutRightEdge(list) : GetPaintRightEdge(list);
		bool selected = e.Item.Selected;
		Color bg = selected ? ModernTheme.AccentMuted : ResolveRowBackground(e.Item, e.ItemIndex);
		var rowBounds = new Rectangle(0, e.Bounds.Y, paintRight, e.Bounds.Height);

		using var bgBrush = new SolidBrush(bg);
		e.Graphics.FillRectangle(bgBrush, rowBounds);

		using var rowPen = new Pen(ModernTheme.BorderLight, 1f);
		e.Graphics.DrawLine(rowPen, 0, rowBounds.Bottom - 1, paintRight - 1, rowBounds.Bottom - 1);
	}

	protected override void OnHandleCreated(EventArgs e)
	{
		base.OnHandleCreated(e);
		ApplyNativeListStyles();
		RefreshScrollbars();
		EnsureHeaderOverlay();
	}

	private void ApplyNativeListStyles()
	{
		if (!IsHandleCreated)
			return;

		nint style = SendMessage(Handle, LvmGetExtendedListViewStyle, 0, 0);
		style &= ~LvsExGridLines;
		style |= LvsExDoubleBuffer;
		SendMessage(Handle, LvmSetExtendedListViewStyle, LvsExGridLines | LvsExDoubleBuffer, style);

		if (AlwaysShowVerticalScrollBar)
			SendMessage(Handle, LvmShowScrollBar, SbVert, 1);
	}

	protected override void WndProc(ref Message m)
	{
		base.WndProc(ref m);
		if (StretchLastColumn && PropertyGridStyle && m.Msg == WmPaint)
			PaintStretchFillerStrip();
	}

	private void PaintStretchFillerStrip()
	{
		if (!IsHandleCreated || Columns.Count == 0)
			return;

		int columnsRight = 0;
		foreach (ColumnHeader column in Columns)
			columnsRight += column.Width;

		int stripLeft = Math.Max(0, columnsRight - 3);
		int stripRight = GetLayoutRightEdge(this);
		if (stripLeft >= stripRight)
			stripLeft = Math.Max(0, stripRight - 3);

		if (stripLeft >= stripRight)
			return;

		using var graphics = Graphics.FromHwnd(Handle);
		using var brush = new SolidBrush(ModernTheme.PanelBackground);
		graphics.FillRectangle(brush, stripLeft, 0, stripRight - stripLeft, ClientSize.Height);
	}

	private int GetHeaderHeight()
	{
		nint header = SendMessage(Handle, LvmGetHeader, 0, 0);
		if (header == 0)
			return 0;

		GetClientRect(header, out RECT rect);
		return rect.Bottom;
	}

	protected override void OnHandleDestroyed(EventArgs e)
	{
		_headerOverlay?.Dispose();
		_headerOverlay = null;
		base.OnHandleDestroyed(e);
	}

	protected override void OnColumnWidthChanged(ColumnWidthChangedEventArgs e)
	{
		base.OnColumnWidthChanged(e);
		if (!StretchLastColumn || _suppressStretch)
			return;

		FillLastColumnOnly();
	}

	protected override void OnClientSizeChanged(EventArgs e)
	{
		base.OnClientSizeChanged(e);
		RefreshScrollbars();
		if (StretchLastColumn)
			FillLastColumnOnly();
	}

	protected override void OnVisibleChanged(EventArgs e)
	{
		base.OnVisibleChanged(e);
		if (Visible)
			RefreshScrollbars();
	}

	private void RefreshScrollbars()
	{
		if (!IsHandleCreated || IsDisposed)
			return;

		ScrollBarTheme.InvalidateThemedScrollbars(this);
	}

	private void OnDrawColumnHeader(object sender, DrawListViewColumnHeaderEventArgs e)
	{
		var list = (ListView)sender;
		Color headerBg = PropertyGridStyle ? ModernTheme.PanelBackground : ModernTheme.SidebarBackground;
		Color headerFg = ModernTheme.TextSecondary;
		int layoutRight = GetLayoutRightEdge(list);
		int paintRight = GetPaintRightEdge(list);
		bool stretchHeader = PropertyGridStyle && StretchLastColumn;

		if (stretchHeader && e.ColumnIndex == 0)
		{
			using var fullBrush = new SolidBrush(headerBg);
			e.Graphics.FillRectangle(fullBrush, 0, e.Bounds.Top, layoutRight, e.Bounds.Height);
		}
		else if (stretchHeader && e.ColumnIndex == list.Columns.Count - 1)
		{
			using var fullBrush = new SolidBrush(headerBg);
			e.Graphics.FillRectangle(fullBrush, e.Bounds.X, e.Bounds.Top, layoutRight - e.Bounds.X, e.Bounds.Height);
		}
		else
		{
			using var bandBrush = new SolidBrush(headerBg);
			e.Graphics.FillRectangle(bandBrush, e.Bounds);

			if (e.ColumnIndex == list.Columns.Count - 1)
			{
				int gapLeft = e.Bounds.Right;
				if (gapLeft < layoutRight)
					e.Graphics.FillRectangle(bandBrush, gapLeft, e.Bounds.Top, layoutRight - gapLeft, e.Bounds.Height);
			}
		}

		int textWidth = e.Bounds.Width - 10;
		if (stretchHeader && e.ColumnIndex == list.Columns.Count - 1)
			textWidth = Math.Max(textWidth, layoutRight - e.Bounds.X - 10);

		var textRect = new Rectangle(e.Bounds.X + 8, e.Bounds.Y, textWidth, e.Bounds.Height);
		using var textBrush = new SolidBrush(headerFg);
		using var format = new StringFormat
		{
			LineAlignment = StringAlignment.Center,
			Trimming = StringTrimming.EllipsisCharacter,
			FormatFlags = StringFormatFlags.NoWrap | StringFormatFlags.LineLimit,
		};
		e.Graphics.DrawString(e.Header?.Text ?? string.Empty, ModernTheme.UiFontSmall, textBrush, textRect, format);

		if (stretchHeader && e.ColumnIndex == list.Columns.Count - 1)
			_headerOverlay?.RepaintFiller();

		if (e.ColumnIndex == list.Columns.Count - 1)
		{
			using var bottomPen = new Pen(ModernTheme.BorderLight, 1f);
			int lineRight = stretchHeader ? layoutRight : paintRight;
			e.Graphics.DrawLine(bottomPen, 0, e.Bounds.Bottom - 1, lineRight, e.Bounds.Bottom - 1);
		}
		else if (!PropertyGridStyle)
		{
			using var dividerPen = new Pen(ModernTheme.BorderLight);
			e.Graphics.DrawLine(dividerPen, e.Bounds.Right - 1, e.Bounds.Top + 4, e.Bounds.Right - 1, e.Bounds.Bottom - 4);
		}
	}

	private static bool ShowsVerticalScrollBar(ListView list)
	{
		if (list.Items.Count == 0)
			return false;

		try
		{
			int lastBottom = list.GetItemRect(list.Items.Count - 1, ItemBoundsPortion.Entire).Bottom;
			return lastBottom > list.ClientRectangle.Bottom;
		}
		catch
		{
			return false;
		}
	}

	/// <summary>
	/// Width used when sizing the last column, including the header scrollbar gutter.
	/// </summary>
	private static int GetLayoutRightEdge(ListView list)
	{
		int width = list.ClientSize.Width;
		if (width <= 0)
			return 0;

		if (list is BufferedListView { AlwaysShowVerticalScrollBar: true })
			return width;

		if (ShowsVerticalScrollBar(list))
			return width;

		return width + SystemInformation.VerticalScrollBarWidth;
	}

	/// <summary>
	/// Width used when painting row/header content inside the client area.
	/// </summary>
	private static int GetPaintRightEdge(ListView list)
	{
		int width = list.ClientSize.Width;
		if (ShowsVerticalScrollBar(list))
			return width;

		return width;
	}

	private static int GetContentRightEdge(ListView list) => GetPaintRightEdge(list);

	private void OnDrawSubItem(object sender, DrawListViewSubItemEventArgs e)
	{
		if (e.Item.Tag is ListViewCategoryRow)
		{
			DrawCategoryRow(e);
			return;
		}

		bool selected = e.Item.Selected;
		Color fg = selected
			? ModernTheme.Accent
			: (e.Item.ForeColor == Color.Empty ? ModernTheme.TextPrimary : e.Item.ForeColor);

		if (!PropertyGridStyle)
		{
			Color bg = selected ? ModernTheme.AccentMuted : ResolveRowBackground(e.Item, e.ItemIndex);
			using var bgBrush = new SolidBrush(bg);
			e.Graphics.FillRectangle(bgBrush, e.Bounds);

			using var rowPen = new Pen(ModernTheme.BorderLight, 1f);
			e.Graphics.DrawLine(rowPen, e.Bounds.Left, e.Bounds.Bottom - 1, e.Bounds.Right - 1, e.Bounds.Bottom - 1);

			if (e.ColumnIndex < Columns.Count - 1 && !string.IsNullOrEmpty(e.SubItem?.Text))
				e.Graphics.DrawLine(rowPen, e.Bounds.Right - 1, e.Bounds.Top, e.Bounds.Right - 1, e.Bounds.Bottom - 1);
		}

		int textWidth = e.Bounds.Width - 8;
		if (PropertyGridStyle && StretchLastColumn && e.ColumnIndex == Columns.Count - 1)
		{
			var list = (ListView)sender;
			textWidth = Math.Max(textWidth, GetLayoutRightEdge(list) - e.Bounds.X - 8);
		}

		var textRect = new Rectangle(e.Bounds.X + 6, e.Bounds.Y, textWidth, e.Bounds.Height - 1);
		TextRenderer.DrawText(
			e.Graphics,
			e.SubItem?.Text ?? string.Empty,
			e.SubItem?.Font ?? e.Item?.Font ?? Font,
			textRect,
			fg,
			TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis);
	}

	private void DrawCategoryRow(DrawListViewSubItemEventArgs e)
	{
		Rectangle rowBounds = e.ColumnIndex == 0
			? GetItemRect(e.ItemIndex, ItemBoundsPortion.Entire)
			: e.Bounds;

		using var bgBrush = new SolidBrush(ModernTheme.SidebarBackground);
		e.Graphics.FillRectangle(bgBrush, rowBounds);

		using var bottomPen = new Pen(ModernTheme.BorderLight, 1f);
		e.Graphics.DrawLine(bottomPen, rowBounds.Left, rowBounds.Bottom - 1, rowBounds.Right - 1, rowBounds.Bottom - 1);

		if (e.ColumnIndex == 0)
		{
			var textRect = new Rectangle(rowBounds.X + 6, rowBounds.Y, rowBounds.Width - 8, rowBounds.Height);
			TextRenderer.DrawText(
				e.Graphics,
				e.Item.Text,
				ModernTheme.UiFont,
				textRect,
				ModernTheme.Accent,
				TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis);
		}
	}

	private Color ResolveRowBackground(ListViewItem item, int itemIndex)
	{
		if (PropertyGridStyle)
			return ModernTheme.PanelBackground;

		Color defaultBg = itemIndex % 2 == 0
			? ModernTheme.PanelBackground
			: ModernTheme.ListRowAlternate;

		Color itemBg = item.BackColor;
		bool hasCustomBg = itemBg != Color.Empty
			&& itemBg != SystemColors.Window
			&& itemBg != Color.White
			&& itemBg != ModernTheme.PanelBackground
			&& itemBg != ModernTheme.ListRowAlternate;

		return hasCustomBg ? itemBg : defaultBg;
	}

	[DllImport("user32.dll", CharSet = CharSet.Auto)]
	private static extern nint SendMessage(nint hWnd, int msg, nint wParam, nint lParam);

	private static nint SendMessage(nint hWnd, int msg, int wParam, int lParam)
		=> SendMessage(hWnd, msg, (nint)wParam, (nint)lParam);

	private static nint SendMessage(nint hWnd, int msg, int wParam, nint lParam)
		=> SendMessage(hWnd, msg, (nint)wParam, lParam);

	[DllImport("user32.dll", EntryPoint = "GetWindowLongPtr")]
	private static extern nint GetWindowLongPtr64(nint hWnd, int nIndex);

	[DllImport("user32.dll", EntryPoint = "GetWindowLong")]
	private static extern nint GetWindowLong32(nint hWnd, int nIndex);

	[DllImport("user32.dll", EntryPoint = "SetWindowLongPtr")]
	private static extern nint SetWindowLongPtr64(nint hWnd, int nIndex, nint dwNewLong);

	[DllImport("user32.dll", EntryPoint = "SetWindowLong")]
	private static extern nint SetWindowLong32(nint hWnd, int nIndex, nint dwNewLong);

	private static nint GetWindowLongPtr(nint hWnd, int nIndex)
		=> IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, nIndex) : GetWindowLong32(hWnd, nIndex);

	private static nint SetWindowLongPtr(nint hWnd, int nIndex, nint dwNewLong)
		=> IntPtr.Size == 8 ? SetWindowLongPtr64(hWnd, nIndex, dwNewLong) : SetWindowLong32(hWnd, nIndex, dwNewLong);

	[DllImport("uxtheme.dll", CharSet = CharSet.Unicode)]
	private static extern int SetWindowTheme(nint hwnd, string pszSubAppName, string pszSubIdList);

	[DllImport("user32.dll")]
	private static extern bool GetClientRect(nint hWnd, out RECT lpRect);

	[StructLayout(LayoutKind.Sequential)]
	private struct RECT
	{
		public int Left;
		public int Top;
		public int Right;
		public int Bottom;
	}

	private sealed class HeaderFillerOverlay : NativeWindow
	{
		private readonly BufferedListView _owner;

		public nint TargetHandle => Handle;

		public HeaderFillerOverlay(nint handle, BufferedListView owner)
		{
			_owner = owner;
			AssignHandle(handle);
		}

		public void RepaintFiller()
		{
			if (Handle == 0)
				return;

			using var graphics = Graphics.FromHwnd(Handle);
			GetClientRect(Handle, out RECT rect);
			_owner.PaintHeaderFiller(graphics, new Rectangle(0, 0, rect.Right - rect.Left, rect.Bottom - rect.Top));
		}

		protected override void WndProc(ref Message m)
		{
			base.WndProc(ref m);
			if (m.Msg == 0x000F)
				RepaintFiller();
		}

		public void Dispose()
		{
			if (Handle != 0)
				ReleaseHandle();
		}
	}
}

internal sealed class ListViewCategoryRow;
