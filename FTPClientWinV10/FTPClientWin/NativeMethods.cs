using System;
using System.Drawing;
using System.Runtime.InteropServices;

namespace FTPClientWin
{
    internal static class NativeMethods
    {
        private const uint SHGFI_ICON            = 0x100;
        private const uint SHGFI_SMALLICON       = 0x001;
        private const uint SHGFI_USEFILEATTRIBUTES = 0x010;
        private const uint FILE_ATTRIBUTE_DIRECTORY = 0x10;
        private const uint FILE_ATTRIBUTE_NORMAL    = 0x80;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
        private struct SHFILEINFO
        {
            public IntPtr hIcon;
            public int    iIcon;
            public uint   dwAttributes;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
            public string szDisplayName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
            public string szTypeName;
        }

        [DllImport("shell32.dll", CharSet = CharSet.Auto)]
        private static extern IntPtr SHGetFileInfo(
            string pszPath, uint dwFileAttributes,
            ref SHFILEINFO psfi, uint cbSize, uint uFlags);

        [DllImport("user32.dll")]
        private static extern bool DestroyIcon(IntPtr hIcon);

        internal static Bitmap GetShellIcon(string extension, bool isFolder)
        {
            var shfi = new SHFILEINFO { szDisplayName = "", szTypeName = "" };
            uint flags = SHGFI_ICON | SHGFI_SMALLICON | SHGFI_USEFILEATTRIBUTES;
            uint attrs = isFolder ? FILE_ATTRIBUTE_DIRECTORY : FILE_ATTRIBUTE_NORMAL;
            string path = isFolder ? "folder" : ("x" + extension);

            SHGetFileInfo(path, attrs, ref shfi,
                (uint)Marshal.SizeOf(typeof(SHFILEINFO)), flags);

            if (shfi.hIcon == IntPtr.Zero)
                return SystemIcons.WinLogo.ToBitmap();

            using var icon = Icon.FromHandle(shfi.hIcon);
            var bmp = icon.ToBitmap();
            DestroyIcon(shfi.hIcon);
            return bmp;
        }
    }
}
