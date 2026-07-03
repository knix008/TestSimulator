using System.Runtime.InteropServices;

namespace MyWorkspace.Win;

/// <summary>
/// Stabilizes IME when moving focus from WebView2 to native WinForms text fields.
/// WebView2 keeps its own IME context; closing it before native input avoids erratic mode switches.
/// </summary>
internal static class ImeInputHelper
{
    [DllImport("imm32.dll")]
    private static extern IntPtr ImmGetContext(IntPtr hWnd);

    [DllImport("imm32.dll")]
    private static extern bool ImmReleaseContext(IntPtr hWnd, IntPtr hIMC);

    [DllImport("imm32.dll")]
    private static extern bool ImmSetOpenStatus(IntPtr hIMC, bool open);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr hWnd, EnumWindowsProc lpEnumFunc, IntPtr lParam);

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public static void PrepareNativeTextInput(Form owner, Control? webViewHost, Control? fallbackFocusTarget = null)
    {
        if (webViewHost != null)
            CloseImeForControlTree(webViewHost);

        if (webViewHost != null && (webViewHost.Focused || webViewHost.ContainsFocus))
        {
            if (fallbackFocusTarget != null && fallbackFocusTarget.CanFocus)
                fallbackFocusTarget.Focus();
            else
            {
                owner.ActiveControl = null;
                owner.Focus();
            }
        }
    }

    public static void ConfigureNameTextBox(TextBox textBox)
    {
        // Do not force Hangul/multibyte mode; preserve the user's current IME choice.
        textBox.ImeMode = ImeMode.NoControl;
    }

    public static void FocusNameTextBox(TextBox textBox, bool selectAll = true)
    {
        textBox.Focus();
        if (selectAll && textBox.TextLength > 0)
            textBox.SelectAll();
    }

    private static void CloseImeForControlTree(Control control)
    {
        if (!control.IsHandleCreated)
            return;

        CloseImeForWindow(control.Handle);
        EnumChildWindows(control.Handle, CloseImeForChildWindow, IntPtr.Zero);
    }

    private static bool CloseImeForChildWindow(IntPtr hwnd, IntPtr _) =>
        CloseImeForWindow(hwnd);

    private static bool CloseImeForWindow(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero)
            return true;

        var context = ImmGetContext(hwnd);
        if (context == IntPtr.Zero)
            return true;

        try
        {
            ImmSetOpenStatus(context, false);
        }
        finally
        {
            ImmReleaseContext(hwnd, context);
        }

        return true;
    }
}
