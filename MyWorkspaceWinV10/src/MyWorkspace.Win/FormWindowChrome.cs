using System.Runtime.InteropServices;

namespace MyWorkspace.Win;

internal static class FormWindowChrome
{
    private const int DwmwaUseImmersiveDarkMode = 20;
    private const int DwmwaUseImmersiveDarkModeBefore20H1 = 19;

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

    public static void ApplyTitleBarTheme(Form form)
    {
        void Apply()
        {
            if (!form.IsHandleCreated)
                return;

            var useDark = AppTheme.IsDark ? 1 : 0;
            _ = DwmSetWindowAttribute(form.Handle, DwmwaUseImmersiveDarkMode, ref useDark, sizeof(int));
            _ = DwmSetWindowAttribute(form.Handle, DwmwaUseImmersiveDarkModeBefore20H1, ref useDark, sizeof(int));
        }

        if (form.IsHandleCreated)
        {
            Apply();
            return;
        }

        form.HandleCreated += (_, _) => Apply();
    }
}
