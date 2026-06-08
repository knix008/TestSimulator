using System.Runtime.InteropServices;

namespace CodeAnalyzer.Controls;

internal static class TextBoxScrollHelper
{
    private const int WmVScroll = 0x0115;
    private const int SbTop = 6;

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    public static void ScrollToTop(TextBox textBox)
    {
        if (textBox.IsDisposed)
        {
            return;
        }

        if (!textBox.IsHandleCreated)
        {
            textBox.HandleCreated += (_, _) => ScrollToTopCore(textBox);
            return;
        }

        ScrollToTopCore(textBox);
    }

    private static void ScrollToTopCore(TextBox textBox)
    {
        if (!textBox.IsHandleCreated)
        {
            return;
        }

        textBox.SelectionStart = 0;
        textBox.SelectionLength = 0;
        textBox.ScrollToCaret();
        SendMessage(textBox.Handle, WmVScroll, (IntPtr)SbTop, IntPtr.Zero);
    }
}
