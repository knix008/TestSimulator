using System;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

namespace TerminalWinV10
{
    /// <summary>
    /// 마지막 탭이 "터미널 추가 +", 각 터미널 탭에 "닫기"가 있는 탭 컨테이너.
    /// </summary>
    public sealed class TerminalTabContainer : UserControl
    {
        private const int CloseWidth = 44;
        private const string AddTabTag = "ADD_TAB";
        private const string AddTabTitle = "터미널 추가 +";

        private readonly TabControl _tabs;
        private TabPage? _addTabPage;
        private bool _ignoreSelectionChange;
        private bool _isAddingTab;

        public event EventHandler<TerminalPanelEventArgs>? SelectedPanelChanged;
        public event EventHandler<TerminalPanelEventArgs>? TabCloseRequested;
        public event EventHandler? AddTabRequested;

        public TerminalTabContainer()
        {
            _tabs = new TabControl
            {
                Dock = DockStyle.Fill,
                DrawMode = TabDrawMode.OwnerDrawFixed,
                ItemSize = new Size(150, 26),
                Padding = new Point(10, 4),
                SizeMode = TabSizeMode.Fixed,
                ShowToolTips = true
            };
            _tabs.DrawItem += Tabs_DrawItem;
            _tabs.MouseDown += Tabs_MouseDown;
            _tabs.SelectedIndexChanged += Tabs_SelectedIndexChanged;

            Controls.Add(_tabs);
        }

        public TerminalPanel? SelectedPanel
        {
            get
            {
                if (_tabs.SelectedTab == null || IsAddTabPage(_tabs.SelectedTab))
                    return null;
                return _tabs.SelectedTab.Controls.Count > 0
                    ? _tabs.SelectedTab.Controls[0] as TerminalPanel
                    : null;
            }
        }

        public int TabCount => _tabs.TabPages.Cast<TabPage>().Count(p => !IsAddTabPage(p));

        public void DisconnectAll()
        {
            foreach (TabPage page in _tabs.TabPages)
            {
                if (IsAddTabPage(page)) continue;
                if (page.Controls.Count > 0 && page.Controls[0] is TerminalPanel panel)
                    panel.Disconnect();
            }
        }

        public TerminalPanel AddTab(string title)
        {
            EnsureAddTabPage();

            var panel = new TerminalPanel { Dock = DockStyle.Fill };
            var page = new TabPage(title) { Padding = new Padding(3) };
            page.Controls.Add(panel);

            int insertIndex = _tabs.TabPages.IndexOf(_addTabPage!);
            if (insertIndex < 0)
                insertIndex = _tabs.TabPages.Count;
            _tabs.TabPages.Insert(insertIndex, page);

            _ignoreSelectionChange = true;
            try { _tabs.SelectedTab = page; }
            finally { _ignoreSelectionChange = false; }

            return panel;
        }

        public void SetTabTitle(TerminalPanel panel, string title)
        {
            foreach (TabPage page in _tabs.TabPages)
            {
                if (IsAddTabPage(page)) continue;
                if (page.Controls.Count > 0 && ReferenceEquals(page.Controls[0], panel))
                {
                    page.Text = title;
                    _tabs.Invalidate();
                    return;
                }
            }
        }

        public void CloseTab(TerminalPanel panel)
        {
            TabPage? toRemove = null;
            foreach (TabPage page in _tabs.TabPages)
            {
                if (IsAddTabPage(page)) continue;
                if (page.Controls.Count > 0 && ReferenceEquals(page.Controls[0], panel))
                {
                    toRemove = page;
                    break;
                }
            }

            if (toRemove == null) return;

            panel.Disconnect();
            TabCloseRequested?.Invoke(this, new TerminalPanelEventArgs(panel));

            if (toRemove.Controls.Contains(panel))
                toRemove.Controls.Remove(panel);

            panel.Dispose();
            _tabs.TabPages.Remove(toRemove);
            toRemove.Dispose();

            if (_tabs.SelectedTab == null || IsAddTabPage(_tabs.SelectedTab))
            {
                var lastTerminal = _tabs.TabPages.Cast<TabPage>().LastOrDefault(p => !IsAddTabPage(p));
                if (lastTerminal != null)
                    _tabs.SelectedTab = lastTerminal;
            }
        }

        private void EnsureAddTabPage()
        {
            if (_addTabPage != null && _tabs.TabPages.Contains(_addTabPage))
                return;

            _addTabPage = new TabPage(AddTabTitle) { Tag = AddTabTag, Padding = new Padding(0) };
            _tabs.TabPages.Add(_addTabPage);
        }

        private static bool IsAddTabPage(TabPage page) => AddTabTag.Equals(page?.Tag as string);

        private void RequestNewTerminalTab()
        {
            if (_isAddingTab)
                return;

            _isAddingTab = true;
            _ignoreSelectionChange = true;
            try
            {
                AddTabRequested?.Invoke(this, EventArgs.Empty);
            }
            finally
            {
                _ignoreSelectionChange = false;
                _isAddingTab = false;
            }
        }

        private void Tabs_DrawItem(object? sender, DrawItemEventArgs e)
        {
            // TabPages는 add/close 시점에 동적으로 바뀌므로, 그리는 동안 인덱스가 범위를 벗어날 수 있습니다.
            // 여기서는 안전하게 가드하고 무시합니다.
            if (e.Index < 0 || e.Index >= _tabs.TabPages.Count)
                return;

            var tab = _tabs.TabPages[e.Index];
            var bounds = e.Bounds;
            bool selected = e.Index == _tabs.SelectedIndex;
            bool isAdd = IsAddTabPage(tab);

            var back = selected ? SystemColors.Window : SystemColors.ControlLight;
            using (var brush = new SolidBrush(back))
                e.Graphics.FillRectangle(brush, bounds);

            if (isAdd)
            {
                TextRenderer.DrawText(e.Graphics, AddTabTitle, _tabs.Font, bounds,
                    Color.FromArgb(0, 102, 204),
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            }
            else
            {
                var titleRect = new Rectangle(bounds.X + 8, bounds.Y + 5, bounds.Width - CloseWidth - 10, bounds.Height - 6);
                TextRenderer.DrawText(e.Graphics, tab.Text ?? "", _tabs.Font, titleRect, SystemColors.ControlText,
                    TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);

                var closeRect = GetCloseButtonRect(bounds);
                TextRenderer.DrawText(e.Graphics, "닫기", _tabs.Font, closeRect, Color.FromArgb(0, 102, 204),
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            }

            if (selected)
            {
                using var pen = new Pen(SystemColors.ControlDark);
                e.Graphics.DrawLine(pen, bounds.Left, bounds.Bottom - 1, bounds.Right, bounds.Bottom - 1);
            }
        }

        private static Rectangle GetCloseButtonRect(Rectangle tabBounds) =>
            new Rectangle(tabBounds.Right - CloseWidth, tabBounds.Top + 2, CloseWidth - 4, tabBounds.Height - 4);

        private void Tabs_MouseDown(object? sender, MouseEventArgs e)
        {
            for (int i = 0; i < _tabs.TabCount; i++)
            {
                var page = _tabs.TabPages[i];
                if (IsAddTabPage(page))
                    continue;

                if (!GetCloseButtonRect(_tabs.GetTabRect(i)).Contains(e.Location))
                    continue;

                if (page.Controls[0] is TerminalPanel panel)
                {
                    if (TabCount <= 1)
                    {
                        panel.Disconnect();
                        return;
                    }
                    CloseTab(panel);
                }
                return;
            }
        }

        private void Tabs_SelectedIndexChanged(object? sender, EventArgs e)
        {
            if (_ignoreSelectionChange) return;

            if (_tabs.SelectedTab != null && IsAddTabPage(_tabs.SelectedTab))
            {
                try
                {
                    RequestNewTerminalTab();
                }
                catch (Exception ex)
                {
                    // UI 이벤트 핸들러에서 예외가 올라오면 전체 프로세스가 죽을 수 있으니, 상세 내용을 보여줍니다.
                    var owner = (IWin32Window?)FindForm();
                    TerminalErrorDetailsForm.Show(owner, "터미널 추가 오류", ex);
                }
                return;
            }

            if (SelectedPanel is TerminalPanel panel)
                SelectedPanelChanged?.Invoke(this, new TerminalPanelEventArgs(panel));
        }
    }

    public sealed class TerminalPanelEventArgs : EventArgs
    {
        public TerminalPanel Panel { get; }
        public TerminalPanelEventArgs(TerminalPanel panel) => Panel = panel;
    }
}
