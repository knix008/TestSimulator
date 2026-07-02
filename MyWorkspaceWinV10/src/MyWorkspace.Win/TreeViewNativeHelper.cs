using System.Runtime.InteropServices;

namespace MyWorkspace.Win;

internal static class TreeViewNativeHelper
{
    private const int TvmGetItemRect = 0x1104;
    private const int TvirBounds = 0;

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public static bool TryGetItemRowBounds(TreeView tree, TreeNode node, out Rectangle bounds)
    {
        bounds = default;
        if (!tree.IsHandleCreated || node.Handle == IntPtr.Zero)
            return false;

        var rect = new NativeRect { Left = TvirBounds };
        var result = SendMessage(tree.Handle, TvmGetItemRect, node.Handle, ref rect);
        if (result == IntPtr.Zero)
            return false;

        bounds = Rectangle.FromLTRB(rect.Left, rect.Top, rect.Right, rect.Bottom);
        return bounds.Width >= 0 && bounds.Height > 0;
    }

    public static Point GetClientPointFromLParam(IntPtr lParam)
    {
        var value = lParam.ToInt64();
        var x = (int)(value & 0xFFFF);
        var y = (int)((value >> 16) & 0xFFFF);
        if (x >= 32768)
            x -= 65536;
        if (y >= 32768)
            y -= 65536;
        return new Point(x, y);
    }

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, ref NativeRect lParam);
}
