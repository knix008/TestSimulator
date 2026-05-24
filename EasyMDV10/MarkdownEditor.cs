using System.Runtime.InteropServices;

namespace EasyMDV10;

/// <summary>
/// 마크다운 편집용 RichTextBox (WordWrap 유지).
/// 문서 구조 이동 시 해당 줄이 보이는 영역 최상단에 오고 커서를 그 위치로 둡니다.
/// </summary>
internal sealed class MarkdownEditor : RichTextBox
{
    private bool _suppressCaretScroll;

    public MarkdownEditor()
    {
        WordWrap = true;
        ScrollBars = RichTextBoxScrollBars.Vertical;
        HideSelection = false;
        DetectUrls = false;
    }

    /// <summary>
    /// 논리 줄의 시작으로 커서를 옮기고, 그 줄이 뷰포트 최상단에 오도록 스크롤합니다.
    /// </summary>
    public void ScrollLineToTop(int lineIndex)
    {
        if (lineIndex < 0 || !IsHandleCreated)
            return;

        int charIndex = GetFirstCharIndexFromLine(lineIndex);
        if (charIndex < 0)
            return;

        _suppressCaretScroll = true;
        try
        {
            ScrollDisplayLineToTop(charIndex);
            SelectionStart = charIndex;
            SelectionLength = 0;
            Focus();
        }
        finally
        {
            _suppressCaretScroll = false;
        }
    }

    private void ScrollDisplayLineToTop(int charIndex)
    {
        // WordWrap: 논리 줄 → 화면 표시 줄(EM_EXLINEFROMCHAR) 기준 스크롤
        int displayLine = (int)SendMessage(Handle, EmExLineFromChar, new IntPtr(-1), (IntPtr)charIndex);
        int delta = displayLine - GetFirstVisibleLine();
        if (delta != 0)
            LineScroll(delta);

        // 픽셀 보정 (EM_SETSCROLLPOS)
        for (int i = 0; i < 24; i++)
        {
            Point client = GetPositionFromCharIndex(charIndex);
            if (client.Y is >= 0 and <= 2)
                return;

            var scroll = new NativePoint();
            SendMessage(Handle, EmGetScrollPos, IntPtr.Zero, ref scroll);

            int targetY = scroll.Y + client.Y;
            if (targetY < 0)
                targetY = 0;

            var target = new NativePoint { X = 0, Y = targetY };
            SendMessage(Handle, EmSetScrollPos, IntPtr.Zero, ref target);
        }
    }

    protected override void WndProc(ref Message m)
    {
        if (_suppressCaretScroll && m.Msg == EmScrollCaret)
            return;

        base.WndProc(ref m);
    }

    private int GetFirstVisibleLine()
        => (int)SendMessage(Handle, EmGetFirstVisibleLine, IntPtr.Zero, IntPtr.Zero);

    private void LineScroll(int delta)
        => SendMessage(Handle, EmLineScroll, IntPtr.Zero, (IntPtr)delta);

    private const int EmGetFirstVisibleLine = 0x00CE;
    private const int EmLineScroll = 0x00B6;
    private const int EmExLineFromChar = 0x00A6;
    private const int EmGetScrollPos = 0x04DD;
    private const int EmSetScrollPos = 0x04DE;
    private const int EmScrollCaret = 0x00B7;

    [StructLayout(LayoutKind.Sequential)]
    private struct NativePoint
    {
        public int X;
        public int Y;
    }

    [DllImport("user32.dll", EntryPoint = "SendMessageW")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", EntryPoint = "SendMessageW")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, ref NativePoint lParam);
}
