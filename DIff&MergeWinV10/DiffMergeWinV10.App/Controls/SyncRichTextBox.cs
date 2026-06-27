using System.Runtime.InteropServices;

namespace DiffMergeWinV10.App.Controls;

/// <summary>
/// A read-only RichTextBox that keeps its vertical scroll position in lockstep with a
/// set of partner controls (used to scroll Base/Local/Remote panes together).
/// </summary>
public sealed class SyncRichTextBox : RichTextBox
{
    private const int WM_HSCROLL = 0x0114;
    private const int WM_VSCROLL = 0x0115;
    private const int WM_MOUSEWHEEL = 0x020A;
    private const int EM_GETFIRSTVISIBLELINE = 0x00CE;
    private const int EM_LINESCROLL = 0x00B6;
    private const int SB_TOP = 6;
    private const int SB_LEFT = 6;

    private bool _suppressSync;

    public List<SyncRichTextBox> Partners { get; } = new();

    public event EventHandler? Scrolled;

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    protected override void WndProc(ref Message m)
    {
        base.WndProc(ref m);

        if (!_suppressSync && (m.Msg == WM_VSCROLL || m.Msg == WM_MOUSEWHEEL))
        {
            Scrolled?.Invoke(this, EventArgs.Empty);
            SyncPartners();
        }
    }

    /// <summary>
    /// Forces the native control all the way to the top-left, bypassing
    /// RichTextBox.ScrollToCaret's "already visible" no-op check.
    /// </summary>
    public void ScrollToTopLeft()
    {
        Select(0, 0);
        SendMessage(Handle, WM_VSCROLL, (IntPtr)SB_TOP, IntPtr.Zero);
        SendMessage(Handle, WM_HSCROLL, (IntPtr)SB_LEFT, IntPtr.Zero);
    }

    public void SyncPartners()
    {
        int myFirstLine = (int)SendMessage(Handle, EM_GETFIRSTVISIBLELINE, IntPtr.Zero, IntPtr.Zero);
        foreach (var partner in Partners)
        {
            if (!partner.IsHandleCreated)
            {
                continue;
            }
            int partnerFirstLine = (int)SendMessage(partner.Handle, EM_GETFIRSTVISIBLELINE, IntPtr.Zero, IntPtr.Zero);
            int delta = myFirstLine - partnerFirstLine;
            if (delta != 0)
            {
                partner._suppressSync = true;
                SendMessage(partner.Handle, EM_LINESCROLL, IntPtr.Zero, (IntPtr)delta);
                partner._suppressSync = false;
                partner.Scrolled?.Invoke(partner, EventArgs.Empty);
            }
        }
    }
}
