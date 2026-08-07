using System.Runtime.InteropServices;

namespace FileMasterWinV10.Helpers;

/// <summary>
/// ComboBox의 드롭다운 목록에서 마우스 아래 항목의 전체 텍스트를 툴팁으로 보여준다.
/// 네이티브 리스트 창(hwndList)을 서브클래싱해 WM_MOUSEMOVE를 가로채므로,
/// 오너드로우 없이(네이티브 렌더링 유지) 동작한다.
/// </summary>
public sealed class ComboBoxDropDownTooltip : IDisposable
{
    private const int WM_MOUSEMOVE = 0x0200;
    private const int LB_ITEMFROMPOINT = 0x01A9;

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    private struct COMBOBOXINFO
    {
        public int cbSize;
        public RECT rcItem;
        public RECT rcButton;
        public int stateButton;
        public IntPtr hwndCombo;
        public IntPtr hwndItem;
        public IntPtr hwndList;
    }

    [DllImport("user32.dll")]
    private static extern bool GetComboBoxInfo(IntPtr hWnd, ref COMBOBOXINFO pcbi);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    private readonly ComboBox _combo;
    // 애니메이션·페이드를 끄면 마우스 이동 중 반복 표시해도 커서가 사라지거나 깜빡이지 않는다.
    private readonly ToolTip _tip = new() { ShowAlways = true, UseAnimation = false, UseFading = false };
    private ListNativeWindow? _list;
    private int _lastIndex = -1;

    public ComboBoxDropDownTooltip(ComboBox combo)
    {
        _combo = combo;
        _combo.DropDown += (_, _) => Hook();
        _combo.DropDownClosed += (_, _) => HideTip();
    }

    private void Hook()
    {
        if (!_combo.IsHandleCreated) return;
        var info = new COMBOBOXINFO { cbSize = Marshal.SizeOf<COMBOBOXINFO>() };
        if (!GetComboBoxInfo(_combo.Handle, ref info) || info.hwndList == IntPtr.Zero) return;

        _list ??= new ListNativeWindow(this);
        if (_list.Handle != info.hwndList)
        {
            if (_list.Handle != IntPtr.Zero) _list.ReleaseHandle();
            _list.AssignHandle(info.hwndList);
        }
    }

    private void HideTip()
    {
        if (_lastIndex == -1) return;
        _tip.Hide(_combo);
        _lastIndex = -1;
    }

    private void OnListMouseMove(IntPtr lParam)
    {
        // LB_ITEMFROMPOINT: 마우스(리스트 클라이언트 좌표)가 가리키는 항목 인덱스.
        int res = (int)SendMessage(_list!.Handle, LB_ITEMFROMPOINT, IntPtr.Zero, lParam);
        int index = res & 0xFFFF;
        int outside = (res >> 16) & 0xFFFF;

        if (outside != 0 || index < 0 || index >= _combo.Items.Count)
        {
            HideTip();
            return;
        }
        if (index == _lastIndex) return;   // 같은 항목이면 재표시하지 않는다(깜빡임 방지)

        _lastIndex = index;
        string text = _combo.Items[index]?.ToString() ?? "";
        if (text.Length == 0) { HideTip(); return; }

        var pt = _combo.PointToClient(Cursor.Position);
        _tip.Show(text, _combo, pt.X + 16, pt.Y + 20, 5000);
    }

    private sealed class ListNativeWindow : NativeWindow
    {
        private readonly ComboBoxDropDownTooltip _owner;
        public ListNativeWindow(ComboBoxDropDownTooltip owner) => _owner = owner;

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_MOUSEMOVE) _owner.OnListMouseMove(m.LParam);
            base.WndProc(ref m);
        }
    }

    public void Dispose()
    {
        _list?.ReleaseHandle();
        _tip.Dispose();
    }
}
