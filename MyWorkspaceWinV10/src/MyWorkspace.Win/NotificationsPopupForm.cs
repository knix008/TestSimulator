using MyWorkspace.Core.Models;

namespace MyWorkspace.Win;

internal sealed class NotificationsPopupForm : Form
{
    private const int ItemHeight = 72;
    private const int HeaderHeight = 40;
    private const int FooterHeight = 36;
    private const int PopupWidth = 360;
    private const int MaxVisibleItems = 6;
    private const int DeleteButtonSize = 18;
    private const int ItemRightPadding = 32;

    private readonly Panel _header = new();
    private readonly Label _lblTitle = new();
    private readonly FlowLayoutPanel _headerActions = new();
    private readonly Button _btnMarkAllRead = new();
    private readonly Button _btnDeleteAll = new();
    private readonly ListBox _list = new();
    private readonly Label _lblEmpty = new();
    private readonly Panel _footer = new();
    private readonly Label _lblHint = new();
    private readonly ContextMenuStrip _itemContextMenu = new();
    private readonly ToolStripMenuItem _ctxOpen = new();
    private readonly ToolStripMenuItem _ctxMarkRead = new();
    private readonly ToolStripMenuItem _ctxDelete = new();

    private IReadOnlyList<UserNotificationListItem> _items = [];
    private int _hoveredIndex = -1;
    private bool _hoveredDelete;
    private int _contextMenuIndex = -1;

    public NotificationsPopupForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        AutoScaleMode = AutoScaleMode.None;
        ControlBox = false;
        MaximizeBox = false;
        MinimizeBox = false;
        KeyPreview = true;
        BackColor = AppTheme.Surface;
        Size = new Size(PopupWidth, HeaderHeight + FooterHeight + ItemHeight);

        _header.Dock = DockStyle.Top;
        _header.Height = HeaderHeight;
        _header.Padding = new Padding(12, 8, 12, 0);

        _lblTitle.AutoSize = false;
        _lblTitle.Dock = DockStyle.Fill;
        _lblTitle.TextAlign = ContentAlignment.MiddleLeft;
        _lblTitle.Font = AppTheme.UiFontSemibold;

        _headerActions.AutoSize = true;
        _headerActions.Dock = DockStyle.Right;
        _headerActions.FlowDirection = FlowDirection.LeftToRight;
        _headerActions.WrapContents = false;
        _headerActions.Margin = new Padding(0);
        _headerActions.Padding = new Padding(0);

        ConfigureHeaderButton(_btnMarkAllRead, (_, _) => MarkAllReadRequested?.Invoke(this, EventArgs.Empty));
        ConfigureHeaderButton(_btnDeleteAll, (_, _) => DeleteAllRequested?.Invoke(this, EventArgs.Empty));

        _headerActions.Controls.Add(_btnMarkAllRead);
        _headerActions.Controls.Add(_btnDeleteAll);

        _header.Controls.Add(_lblTitle);
        _header.Controls.Add(_headerActions);

        _list.BorderStyle = BorderStyle.None;
        _list.IntegralHeight = false;
        _list.Dock = DockStyle.Fill;
        _list.DrawMode = DrawMode.OwnerDrawFixed;
        _list.ItemHeight = ItemHeight;
        _list.TabStop = true;
        _list.DrawItem += DrawNotificationItem;
        _list.MouseMove += OnListMouseMove;
        _list.MouseLeave += (_, _) =>
        {
            _hoveredIndex = -1;
            _hoveredDelete = false;
            _list.Invalidate();
        };
        _list.MouseDown += OnListMouseDown;
        _list.DoubleClick += OnListDoubleClick;
        _list.MouseUp += OnListMouseUp;

        _lblEmpty.Dock = DockStyle.Fill;
        _lblEmpty.TextAlign = ContentAlignment.MiddleCenter;
        _lblEmpty.Visible = false;

        _footer.Dock = DockStyle.Bottom;
        _footer.Height = FooterHeight;
        _footer.Padding = new Padding(12, 0, 12, 8);

        _lblHint.Dock = DockStyle.Fill;
        _lblHint.TextAlign = ContentAlignment.MiddleLeft;
        _lblHint.Font = AppTheme.UiFontSmall;

        _footer.Controls.Add(_lblHint);

        ConfigureContextMenu();

        Controls.Add(_list);
        Controls.Add(_lblEmpty);
        Controls.Add(_footer);
        Controls.Add(_header);

        Deactivate += (_, _) => Hide();
        KeyDown += (_, e) =>
        {
            if (e.KeyCode == Keys.Escape)
                Hide();
        };

        ApplyTheme();
    }

    public event EventHandler? MarkAllReadRequested;
    public event EventHandler? DeleteAllRequested;
    public event EventHandler<UserNotificationListItem>? NotificationSelected;
    public event EventHandler<UserNotificationListItem>? NotificationMarkReadRequested;
    public event EventHandler<UserNotificationListItem>? NotificationDeleteRequested;

    public void ApplyTheme()
    {
        BackColor = AppTheme.Surface;
        _header.BackColor = AppTheme.Surface;
        _footer.BackColor = AppTheme.Surface;
        _lblTitle.ForeColor = AppTheme.TextPrimary;
        _lblEmpty.ForeColor = AppTheme.TextSecondary;
        _lblHint.ForeColor = AppTheme.TextMuted;
        _list.BackColor = AppTheme.Surface;
        _list.ForeColor = AppTheme.TextPrimary;
        StyleHeaderButton(_btnMarkAllRead);
        StyleHeaderButton(_btnDeleteAll);
        AppTheme.StyleContextMenu(_itemContextMenu);
        Invalidate();
    }

    public void ApplyLocalization()
    {
        _lblTitle.Text = Localization.Get(K.NotificationsTitle);
        _btnMarkAllRead.Text = Localization.Get(K.NotificationsMarkAllRead);
        _btnDeleteAll.Text = Localization.Get(K.NotificationsDeleteAll);
        _lblEmpty.Text = Localization.Get(K.NotificationsEmpty);
        _lblHint.Text = Localization.Get(K.NotificationsOpenHint);

        _ctxOpen.Text = Localization.Get(K.NotificationsOpen);
        _ctxMarkRead.Text = Localization.Get(K.NotificationsMarkRead);
        _ctxDelete.Text = Localization.Get(K.NotificationsDelete);
    }

    public void SetNotifications(IReadOnlyList<UserNotificationListItem> items)
    {
        _items = items;
        _list.BeginUpdate();
        _list.Items.Clear();
        foreach (var item in items)
            _list.Items.Add(item);
        _list.EndUpdate();

        var hasItems = items.Count > 0;
        _list.Visible = hasItems;
        _lblEmpty.Visible = !hasItems;
        _btnMarkAllRead.Enabled = items.Any(item => !item.IsRead);
        _btnDeleteAll.Enabled = hasItems;

        var visibleCount = Math.Clamp(items.Count, 1, MaxVisibleItems);
        if (items.Count == 0)
            visibleCount = 1;

        Height = HeaderHeight + FooterHeight + visibleCount * ItemHeight + 2;
        Width = PopupWidth;
        _list.Invalidate();
    }

    public void ShowAt(Point screenPoint, int anchorHeight)
    {
        var workingArea = Screen.FromPoint(screenPoint).WorkingArea;
        var left = screenPoint.X + 4;
        var top = screenPoint.Y + ((anchorHeight - Height) / 2);

        if (left + Width > workingArea.Right)
            left = workingArea.Right - Width;
        if (top + Height > workingArea.Bottom)
            top = workingArea.Bottom - Height;
        if (top < workingArea.Top)
            top = workingArea.Top;

        Location = new Point(left, top);
        if (!Visible)
            Show();
        else
            BringToFront();

        Activate();
        if (_list.Items.Count > 0)
        {
            _list.SelectedIndex = 0;
            _list.Focus();
        }
    }

    private void ConfigureContextMenu()
    {
        _ctxOpen.Click += (_, _) => InvokeContextMenuAction(NotificationSelected);
        _ctxMarkRead.Click += (_, _) => InvokeContextMenuAction(NotificationMarkReadRequested);
        _ctxDelete.Click += (_, _) => InvokeContextMenuAction(NotificationDeleteRequested);

        _itemContextMenu.Items.Add(_ctxOpen);
        _itemContextMenu.Items.Add(_ctxMarkRead);
        _itemContextMenu.Items.Add(new ToolStripSeparator());
        _itemContextMenu.Items.Add(_ctxDelete);

        _itemContextMenu.Opening += (_, e) =>
        {
            if (_contextMenuIndex < 0 || _contextMenuIndex >= _items.Count)
            {
                e.Cancel = true;
                return;
            }

            var item = _items[_contextMenuIndex];
            _ctxOpen.Enabled = item.PageId.HasValue;
            _ctxMarkRead.Enabled = !item.IsRead;
        };
    }

    private void InvokeContextMenuAction(EventHandler<UserNotificationListItem>? handler)
    {
        if (_contextMenuIndex < 0 || _contextMenuIndex >= _items.Count)
            return;

        handler?.Invoke(this, _items[_contextMenuIndex]);
    }

    private static void ConfigureHeaderButton(Button button, EventHandler clickHandler)
    {
        button.AutoSize = true;
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.Cursor = Cursors.Hand;
        button.TabStop = false;
        button.Margin = new Padding(0, 0, 8, 0);
        button.Padding = new Padding(4, 2, 4, 2);
        button.Click += clickHandler;
    }

    private static void StyleHeaderButton(Button button)
    {
        button.BackColor = AppTheme.Surface;
        button.ForeColor = AppTheme.Accent;
        button.FlatAppearance.MouseOverBackColor = AppTheme.AccentHover;
        button.FlatAppearance.MouseDownBackColor = AppTheme.AccentPressed;
    }

    private void DrawNotificationItem(object? sender, DrawItemEventArgs e)
    {
        if (e.Index < 0 || e.Index >= _items.Count)
            return;

        var item = _items[e.Index];
        var bounds = e.Bounds;
        var isSelected = (e.State & DrawItemState.Selected) != 0;
        var isHovered = e.Index == _hoveredIndex;
        var backColor = isSelected || isHovered
            ? AppTheme.AccentHover
            : item.IsRead
                ? AppTheme.Surface
                : Color.FromArgb(24, AppTheme.Accent);

        using (var brush = new SolidBrush(backColor))
            e.Graphics.FillRectangle(brush, bounds);

        var titleColor = AppTheme.TextPrimary;
        var bodyColor = AppTheme.TextSecondary;
        var timeColor = AppTheme.TextMuted;
        var textWidth = bounds.Width - 12 - ItemRightPadding;

        var titleRect = new Rectangle(bounds.Left + 12, bounds.Top + 8, textWidth, 18);
        var bodyRect = new Rectangle(bounds.Left + 12, bounds.Top + 28, textWidth, 18);
        var timeRect = new Rectangle(bounds.Left + 12, bounds.Top + 48, textWidth, 16);

        TextRenderer.DrawText(
            e.Graphics,
            item.Title,
            AppTheme.UiFontSemibold,
            titleRect,
            titleColor,
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding);

        TextRenderer.DrawText(
            e.Graphics,
            item.Body,
            AppTheme.UiFont,
            bodyRect,
            bodyColor,
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding);

        TextRenderer.DrawText(
            e.Graphics,
            FormatTime(item.CreatedAt),
            AppTheme.UiFontSmall,
            timeRect,
            timeColor,
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);

        if (isHovered)
            DrawDeleteButton(e.Graphics, bounds, e.Index == _hoveredIndex && _hoveredDelete);

        if (e.Index < _items.Count - 1)
        {
            using var pen = new Pen(AppTheme.Border);
            e.Graphics.DrawLine(pen, bounds.Left + 12, bounds.Bottom - 1, bounds.Right - 12, bounds.Bottom - 1);
        }
    }

    private static void DrawDeleteButton(Graphics graphics, Rectangle bounds, bool pressed)
    {
        var deleteRect = GetDeleteButtonRect(bounds);
        var backColor = pressed ? AppTheme.AccentPressed : AppTheme.AccentHover;
        using (var brush = new SolidBrush(backColor))
            graphics.FillEllipse(brush, deleteRect);

        using var icon = IconAssets.Load(12, "delete");
        var iconX = deleteRect.Left + ((deleteRect.Width - icon.Width) / 2);
        var iconY = deleteRect.Top + ((deleteRect.Height - icon.Height) / 2);
        graphics.DrawImage(icon, iconX, iconY, icon.Width, icon.Height);
    }

    private static Rectangle GetDeleteButtonRect(Rectangle itemBounds) =>
        new(
            itemBounds.Right - DeleteButtonSize - 10,
            itemBounds.Top + ((itemBounds.Height - DeleteButtonSize) / 2),
            DeleteButtonSize,
            DeleteButtonSize);

    private static string FormatTime(DateTime createdAtUtc) =>
        createdAtUtc.ToLocalTime().ToString("g");

    private void OnListMouseMove(object? sender, MouseEventArgs e)
    {
        var index = _list.IndexFromPoint(e.Location);
        var hoveredDelete = index >= 0 && GetDeleteButtonRect(_list.GetItemRectangle(index)).Contains(e.Location);
        if (index == _hoveredIndex && hoveredDelete == _hoveredDelete)
            return;

        _hoveredIndex = index;
        _hoveredDelete = hoveredDelete;
        _list.Cursor = hoveredDelete ? Cursors.Hand : Cursors.Default;
        _list.Invalidate();
    }

    private void OnListMouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left)
            return;

        var index = _list.IndexFromPoint(e.Location);
        if (index < 0 || index >= _items.Count)
            return;

        if (GetDeleteButtonRect(_list.GetItemRectangle(index)).Contains(e.Location))
            NotificationDeleteRequested?.Invoke(this, _items[index]);
    }

    private void OnListDoubleClick(object? sender, EventArgs e)
    {
        var index = _list.IndexFromPoint(_list.PointToClient(Cursor.Position));
        if (index < 0)
            index = _list.SelectedIndex;
        if (index < 0 || index >= _items.Count)
            return;

        NotificationSelected?.Invoke(this, _items[index]);
    }

    private void OnListMouseUp(object? sender, MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Right)
        {
            var index = _list.IndexFromPoint(e.Location);
            if (index < 0 || index >= _items.Count)
                return;

            _contextMenuIndex = index;
            _list.SelectedIndex = index;
            _itemContextMenu.Show(_list, e.Location);
            return;
        }

        if (e.Button != MouseButtons.Left)
            return;

        var clickIndex = _list.IndexFromPoint(e.Location);
        if (clickIndex < 0 || clickIndex >= _items.Count)
            return;

        if (GetDeleteButtonRect(_list.GetItemRectangle(clickIndex)).Contains(e.Location))
            return;

        NotificationMarkReadRequested?.Invoke(this, _items[clickIndex]);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        using var pen = new Pen(AppTheme.Border);
        e.Graphics.DrawRectangle(pen, 0, 0, Width - 1, Height - 1);
    }
}
