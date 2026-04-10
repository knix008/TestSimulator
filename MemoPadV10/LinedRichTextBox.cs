namespace MemoPadV10;

public sealed class LinedRichTextBox : RichTextBox
{
    public Color LineColor { get; set; } = Color.FromArgb(230, 200, 120);
    private const int EmGetRect = 0x00B2;

    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
    private struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Auto)]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, ref Rect lParam);

    public LinedRichTextBox()
    {
        BorderStyle = BorderStyle.FixedSingle;
    }

    protected override void OnFontChanged(EventArgs e)
    {
        base.OnFontChanged(e);
        Invalidate();
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        Invalidate();
    }

    protected override void WndProc(ref Message m)
    {
        base.WndProc(ref m);

        const int WM_PAINT = 0x000F;
        const int WM_VSCROLL = 0x0115;
        const int WM_MOUSEWHEEL = 0x020A;
        const int WM_SIZE = 0x0005;
        const int WM_SETTEXT = 0x000C;
        const int WM_KEYUP = 0x0101;

        if (m.Msg == WM_PAINT)
        {
            DrawRuledLines();
        }
        else if (m.Msg == WM_VSCROLL || m.Msg == WM_MOUSEWHEEL || m.Msg == WM_SIZE || m.Msg == WM_SETTEXT || m.Msg == WM_KEYUP)
        {
            Invalidate();
        }
    }

    private void DrawRuledLines()
    {
        if (!IsHandleCreated || ClientSize.Width <= 0 || ClientSize.Height <= 0)
        {
            return;
        }

        int lineHeight;
        using (Graphics gMeasure = CreateGraphics())
        {
            lineHeight = Math.Max(1, (int)Math.Round(Font.GetHeight(gMeasure)));
        }

        Rect textRect = default;
        SendMessage(Handle, EmGetRect, IntPtr.Zero, ref textRect);
        int left = Math.Max(0, textRect.Left);
        int top = Math.Max(0, textRect.Top);
        int right = Math.Min(ClientSize.Width - 1, textRect.Right);
        if (right <= left)
        {
            right = ClientSize.Width - 1;
        }

        int firstChar = GetCharIndexFromPosition(new Point(left + 1, top + 1));
        int firstCharY = GetPositionFromCharIndex(firstChar).Y;
        int y = firstCharY + lineHeight - 1;
        while (y > top)
        {
            y -= lineHeight;
        }
        if (y < top)
        {
            y += lineHeight;
        }

        using Graphics g = Graphics.FromHwnd(Handle);
        using Pen pen = new(LineColor, 1f);
        for (; y < ClientSize.Height; y += lineHeight)
        {
            g.DrawLine(pen, left, y, right, y);
        }
    }
}
