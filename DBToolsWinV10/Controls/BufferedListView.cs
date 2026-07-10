using System;
using System.ComponentModel;
using System.Drawing;
using System.Windows.Forms;
using DBToolsWinV10.App;

namespace DBToolsWinV10.Controls;

internal sealed class BufferedListView : ListView
{
	private bool _themeHandlersAttached;

	/// <summary>
	/// Matches the right-bottom property grid: flat rows, horizontal separators only.
	/// </summary>
	[DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
	public bool PropertyGridStyle { get; set; }

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
			DrawItem += (_, _) => { };
			DrawSubItem += OnDrawSubItem;
			_themeHandlersAttached = true;
		}

		Invalidate(true);
		RefreshScrollbars();
	}

	protected override void OnHandleCreated(EventArgs e)
	{
		base.OnHandleCreated(e);
		RefreshScrollbars();
	}

	protected override void OnClientSizeChanged(EventArgs e)
	{
		base.OnClientSizeChanged(e);
		RefreshScrollbars();
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

		ScrollBarTheme.Refresh(this);
	}

	private void OnDrawColumnHeader(object sender, DrawListViewColumnHeaderEventArgs e)
	{
		var list = (ListView)sender;
		Color headerBg = PropertyGridStyle ? ModernTheme.PanelBackground : ModernTheme.SidebarBackground;
		Color headerFg = ModernTheme.TextSecondary;

		using (var bandBrush = new SolidBrush(headerBg))
		{
			e.Graphics.FillRectangle(bandBrush, e.Bounds);

			if (e.ColumnIndex == list.Columns.Count - 1)
			{
				int rightEdge = GetHeaderRightEdge(list);
				int gapLeft = e.Bounds.Right;
				if (gapLeft < rightEdge)
					e.Graphics.FillRectangle(bandBrush, gapLeft, e.Bounds.Top, rightEdge - gapLeft, e.Bounds.Height);
			}
		}

		var textRect = new Rectangle(e.Bounds.X + 8, e.Bounds.Y, e.Bounds.Width - 10, e.Bounds.Height);
		using var textBrush = new SolidBrush(headerFg);
		using var format = new StringFormat
		{
			LineAlignment = StringAlignment.Center,
			Trimming = StringTrimming.EllipsisCharacter,
			FormatFlags = StringFormatFlags.NoWrap | StringFormatFlags.LineLimit,
		};
		e.Graphics.DrawString(e.Header?.Text ?? string.Empty, ModernTheme.UiFontSmall, textBrush, textRect, format);

		if (e.ColumnIndex == list.Columns.Count - 1)
		{
			int rightEdge = GetHeaderRightEdge(list);
			using var bottomPen = new Pen(ModernTheme.BorderLight, 1f);
			e.Graphics.DrawLine(bottomPen, 0, e.Bounds.Bottom - 1, rightEdge, e.Bounds.Bottom - 1);
		}
		else if (!PropertyGridStyle)
		{
			using var dividerPen = new Pen(ModernTheme.BorderLight);
			e.Graphics.DrawLine(dividerPen, e.Bounds.Right - 1, e.Bounds.Top + 4, e.Bounds.Right - 1, e.Bounds.Bottom - 4);
		}
	}

	private static int GetHeaderRightEdge(ListView list)
	{
		int width = list.ClientSize.Width;
		if (list.Items.Count == 0)
			return width;

		try
		{
			int lastBottom = list.GetItemRect(list.Items.Count - 1, ItemBoundsPortion.Entire).Bottom;
			if (lastBottom > list.ClientRectangle.Bottom)
				width -= SystemInformation.VerticalScrollBarWidth;
		}
		catch
		{
			// Item rect unavailable while layout is updating.
		}

		return width;
	}

	private void OnDrawSubItem(object sender, DrawListViewSubItemEventArgs e)
	{
		if (e.Item.Tag is ListViewCategoryRow)
		{
			DrawCategoryRow(e);
			return;
		}

		bool selected = e.Item.Selected;
		Color bg = selected ? ModernTheme.AccentMuted : ResolveRowBackground(e.Item, e.ItemIndex);
		Color fg = selected
			? ModernTheme.Accent
			: (e.Item.ForeColor == Color.Empty ? ModernTheme.TextPrimary : e.Item.ForeColor);

		using var bgBrush = new SolidBrush(bg);
		e.Graphics.FillRectangle(bgBrush, e.Bounds);

		using var rowPen = new Pen(ModernTheme.BorderLight, 1f);
		e.Graphics.DrawLine(rowPen, e.Bounds.Left, e.Bounds.Bottom - 1, e.Bounds.Right - 1, e.Bounds.Bottom - 1);

		if (!PropertyGridStyle && e.ColumnIndex < Columns.Count - 1)
			e.Graphics.DrawLine(rowPen, e.Bounds.Right - 1, e.Bounds.Top, e.Bounds.Right - 1, e.Bounds.Bottom - 1);

		var textRect = new Rectangle(e.Bounds.X + 6, e.Bounds.Y, e.Bounds.Width - 8, e.Bounds.Height - 1);
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
}

internal sealed class ListViewCategoryRow;
