using System.Runtime.InteropServices;

namespace CodeAnalyzer.Controls;

/// <summary>진입점별 탭 — 기본 ◀▶ 클릭 시 이전/다음 탭을 선택해 내용을 전환합니다.</summary>
internal static class EntryPointTabControl
{
    public static NavigationTabControl Create() => new();
}

/// <summary>TabControl 기본 스크롤 ◀▶를 탭 선택(내용 전환)으로 연결합니다.</summary>
internal sealed class NavigationTabControl : TabControl
{
    private const int WmLButtonDown = 0x0201;
    private const int WmLButtonUp = 0x0202;
    private const int WmHScroll = 0x0114;
    private const int TcmHitTest = 0x1300 + 13;
    private const int TcmScroll = 0x1300 + 48;
    private const int TchtLeftHeaderButton = 10;
    private const int TchtRightHeaderButton = 11;
    private const int SbLineLeft = 0;
    private const int SbLineRight = 1;
    private const int SbPageLeft = 2;
    private const int SbPageRight = 3;

    private int _headerLayoutSuspendCount;
    private bool _applyingHeaderLayout;
    private Size _appliedItemSize = Size.Empty;
    private TabSizeMode _appliedSizeMode = TabSizeMode.Normal;

    public NavigationTabControl()
    {
        Dock = DockStyle.Fill;
        Multiline = false;
        SizeMode = TabSizeMode.Normal;
        Padding = new Point(6, 4);
    }

    public void SuspendHeaderLayout() => _headerLayoutSuspendCount++;

    public void ResumeHeaderLayout()
    {
        if (_headerLayoutSuspendCount > 0)
        {
            _headerLayoutSuspendCount--;
        }

        if (_headerLayoutSuspendCount == 0)
        {
            ApplyHeaderLayout();
        }
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        ApplyHeaderLayout();
    }

    protected override void OnLayout(LayoutEventArgs levent)
    {
        base.OnLayout(levent);
        ApplyHeaderLayout();
    }

    /// <summary>탭 폭을 컨트롤 너비보다 약간 크게 설정해 ◀▶ 스크롤 버튼이 항상 표시되도록 합니다.</summary>
    private void ApplyHeaderLayout()
    {
        if (_headerLayoutSuspendCount > 0
            || _applyingHeaderLayout
            || !IsHandleCreated
            || IsDisposed)
        {
            return;
        }

        if (TabCount <= 1)
        {
            if (_appliedSizeMode == TabSizeMode.Normal)
            {
                return;
            }

            _applyingHeaderLayout = true;
            try
            {
                SizeMode = TabSizeMode.Normal;
                _appliedSizeMode = TabSizeMode.Normal;
                _appliedItemSize = Size.Empty;
            }
            finally
            {
                _applyingHeaderLayout = false;
            }

            return;
        }

        // 탭 전체 너비가 컨트롤 너비를 초과하도록 계산 → ◀▶ 버튼 항상 표시
        const int minTabWidth = 48;
        const int tabHeight = 24;
        var tabWidth = Math.Max(minTabWidth, ClientSize.Width / Math.Max(1, TabCount) + 2);
        var itemSize = new Size(tabWidth, tabHeight);
        if (_appliedSizeMode == TabSizeMode.Fixed && _appliedItemSize == itemSize)
        {
            return;
        }

        _applyingHeaderLayout = true;
        try
        {
            SizeMode = TabSizeMode.Fixed;
            ItemSize = itemSize;
            _appliedSizeMode = TabSizeMode.Fixed;
            _appliedItemSize = itemSize;
        }
        finally
        {
            _applyingHeaderLayout = false;
        }
    }

    protected override void WndProc(ref Message m)
    {
        if (TabCount > 1)
        {
            if (m.Msg is WmLButtonDown or WmLButtonUp
                && TryGetHeaderScrollDeltaFromHitTest(m, out var hitDelta))
            {
                if (m.Msg == WmLButtonUp)
                {
                    SelectRelativeTab(hitDelta);
                }

                base.WndProc(ref m);
                return;
            }

            if (TryGetScrollMessageDelta(m, out var scrollDelta))
            {
                SelectRelativeTab(scrollDelta);
                return;
            }
        }

        base.WndProc(ref m);
    }

    private void SelectRelativeTab(int delta)
    {
        var nextIndex = SelectedIndex + delta;
        if (nextIndex >= 0 && nextIndex < TabCount)
        {
            SelectedIndex = nextIndex;
        }
    }

    private bool TryGetHeaderScrollDeltaFromHitTest(Message m, out int delta)
    {
        delta = 0;
        if (!IsHandleCreated)
        {
            return false;
        }

        var point = new Point(LowWord(m.LParam), HighWordSigned(m.LParam));
        var info = new TcHitTestInfo
        {
            Point = point
        };

        var hit = (int)SendMessage(Handle, TcmHitTest, 0, ref info);
        delta = hit switch
        {
            TchtLeftHeaderButton => -1,
            TchtRightHeaderButton => 1,
            _ => 0
        };

        return delta != 0;
    }

    private static bool TryGetScrollMessageDelta(Message m, out int delta)
    {
        delta = 0;

        if (m.Msg == WmHScroll)
        {
            return TryMapScrollCode(LowWord(m.WParam), out delta);
        }

        if (m.Msg == TcmScroll)
        {
            return TryMapScrollCode(m.WParam.ToInt32(), out delta);
        }

        return false;
    }

    private static bool TryMapScrollCode(int code, out int delta)
    {
        delta = code switch
        {
            SbLineLeft or SbPageLeft => -1,
            SbLineRight or SbPageRight => 1,
            _ => 0
        };

        return delta != 0;
    }

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern nint SendMessage(nint hWnd, int msg, int wParam, ref TcHitTestInfo lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct TcHitTestInfo
    {
        public Point Point;
        public uint Flags;
    }

    private static int LowWord(nint value) => (int)(value & 0xFFFF);

    private static int HighWordSigned(nint value) => (short)((value >> 16) & 0xFFFF);
}
