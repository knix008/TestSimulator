namespace MyWorkspace.Win;

using System.ComponentModel;

internal sealed class EditorContextMenuStrip : ContextMenuStrip
{
    private EditorContextMenuDismissFilter? _dismissFilter;

    public EditorContextMenuStrip(IContainer container) : base(container)
    {
        KeyDown += OnKeyDown;
    }

    public bool CloseIfVisible()
    {
        if (!Visible)
            return false;

        Close(ToolStripDropDownCloseReason.CloseCalled);
        return true;
    }

    protected override void OnOpened(EventArgs e)
    {
        base.OnOpened(e);
        Focus();
        EnsureDismissFilter();
        Application.AddMessageFilter(_dismissFilter!);
    }

    protected override void OnClosed(ToolStripDropDownClosedEventArgs e)
    {
        if (_dismissFilter != null)
            Application.RemoveMessageFilter(_dismissFilter);

        base.OnClosed(e);
    }

    private void EnsureDismissFilter() =>
        _dismissFilter ??= new EditorContextMenuDismissFilter(this);

    private void OnKeyDown(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode != Keys.Escape)
            return;

        Close(ToolStripDropDownCloseReason.Keyboard);
        e.Handled = true;
    }

    private sealed class EditorContextMenuDismissFilter : IMessageFilter
    {
        private const int WmKeyDown = 0x0100;
        private const int WmLButtonDown = 0x0201;
        private const int WmRButtonDown = 0x0204;
        private const int WmMButtonDown = 0x0207;
        private const int WmNcLButtonDown = 0x00A1;
        private const int WmNcRButtonDown = 0x00A4;

        private readonly EditorContextMenuStrip _menu;

        public EditorContextMenuDismissFilter(EditorContextMenuStrip menu) => _menu = menu;

        public bool PreFilterMessage(ref Message m)
        {
            if (!_menu.Visible)
                return false;

            if (m.Msg == WmKeyDown && (Keys)(int)m.WParam == Keys.Escape)
            {
                _menu.Close(ToolStripDropDownCloseReason.Keyboard);
                return true;
            }

            if (m.Msg is WmLButtonDown or WmRButtonDown or WmMButtonDown or WmNcLButtonDown or WmNcRButtonDown)
            {
                if (!ContainsScreenPoint(_menu, Control.MousePosition))
                    _menu.Close(ToolStripDropDownCloseReason.AppFocusChange);
            }

            return false;
        }

        private static bool ContainsScreenPoint(ToolStripDropDown menu, Point screenPoint)
        {
            if (GetScreenBounds(menu).Contains(screenPoint))
                return true;

            return ContainsScreenPointInSubmenus(menu.Items, screenPoint);
        }

        private static bool ContainsScreenPointInSubmenus(ToolStripItemCollection items, Point screenPoint)
        {
            foreach (ToolStripItem item in items)
            {
                if (item is not ToolStripDropDownItem dropDownItem)
                    continue;

                var dropDown = dropDownItem.DropDown;
                if (!dropDown.Visible)
                    continue;

                if (GetScreenBounds(dropDown).Contains(screenPoint))
                    return true;

                if (ContainsScreenPointInSubmenus(dropDown.Items, screenPoint))
                    return true;
            }

            return false;
        }

        private static Rectangle GetScreenBounds(ToolStripDropDown dropdown)
        {
            var bounds = dropdown.Bounds;
            if (bounds.Width <= 0 || bounds.Height <= 0)
                bounds = new Rectangle(dropdown.Location, dropdown.GetPreferredSize(Size.Empty));

            return bounds;
        }
    }
}
