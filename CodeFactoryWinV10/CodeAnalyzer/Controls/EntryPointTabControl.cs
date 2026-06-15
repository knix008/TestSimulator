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
    private const int SbLineLeft = 0;
    private const int SbLineRight = 1;
    private const int SbPageLeft = 2;
    private const int SbPageRight = 3;
    private const int SbThumbPosition = 4;  // UpDown 스핀 컨트롤이 전송하는 실제 코드

    private int _headerLayoutSuspendCount;
    private bool _applyingHeaderLayout;
    private Size _appliedItemSize = Size.Empty;
    private TabSizeMode _appliedSizeMode = TabSizeMode.Normal;
    private int _prevScrollPos;

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
            // 마우스 버튼: 스핀 컨트롤(◀▶) 영역 클릭 감지
            if (m.Msg is WmLButtonDown or WmLButtonUp
                && TryGetSpinButtonDelta(new Point(LowWord(m.LParam), HighWordSigned(m.LParam)), out var spinDelta))
            {
                if (m.Msg == WmLButtonUp)
                {
                    SelectRelativeTab(spinDelta);
                }

                base.WndProc(ref m);
                return;
            }

            // WM_HSCROLL: 내장 UpDown 스핀 컨트롤이 부모에게 전송하는 스크롤 메시지
            if (m.Msg == WmHScroll)
            {
                var code = LowWord(m.WParam);

                // SB_LINE*/SB_PAGE*: 방향이 코드에 명시된 경우
                if (TryMapScrollCode(code, out var directDelta))
                {
                    SelectRelativeTab(directDelta);
                    return;
                }

                // SB_THUMBPOSITION (4): UpDown 스핀이 실제로 전송하는 코드
                // wParam 상위 워드에 새 스크롤 위치(첫 번째 가시 탭 인덱스)가 담겨 있음
                if (code == SbThumbPosition)
                {
                    var newPos = HighWordSigned(m.WParam);
                    var dir = newPos > _prevScrollPos ? 1 : newPos < _prevScrollPos ? -1 : 0;
                    _prevScrollPos = newPos;
                    if (dir != 0)
                    {
                        SelectRelativeTab(dir);
                        return;
                    }
                }
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

    /// <summary>클릭 좌표가 내장 UpDown 스핀 컨트롤(msctls_updown32) 위인지 확인합니다.</summary>
    private bool TryGetSpinButtonDelta(Point clientPt, out int delta)
    {
        delta = 0;
        if (!IsHandleCreated)
        {
            return false;
        }

        var spinHwnd = FindWindowEx(Handle, IntPtr.Zero, "msctls_updown32", null);
        if (spinHwnd == IntPtr.Zero)
        {
            return false;
        }

        if (!GetWindowRect(spinHwnd, out var sr))
        {
            return false;
        }

        var topLeft = PointToClient(new Point(sr.Left, sr.Top));
        var spinBounds = new Rectangle(topLeft, new Size(sr.Right - sr.Left, sr.Bottom - sr.Top));

        if (!spinBounds.Contains(clientPt))
        {
            return false;
        }

        // 좌측 절반 = 이전(◀), 우측 절반 = 다음(▶)
        delta = clientPt.X < spinBounds.Left + spinBounds.Width / 2 ? -1 : 1;
        return true;
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
    private static extern nint FindWindowEx(nint hwndParent, nint hwndChildAfter, string lpszClass, string? lpszWindow);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetWindowRect(nint hWnd, out WinRect lpRect);

    [StructLayout(LayoutKind.Sequential)]
    private struct WinRect { public int Left, Top, Right, Bottom; }

    private static int LowWord(nint value) => (int)(value & 0xFFFF);

    private static int HighWordSigned(nint value) => (short)((value >> 16) & 0xFFFF);
}
