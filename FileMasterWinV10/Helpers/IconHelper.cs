using System.Runtime.InteropServices;

namespace FileMasterWinV10.Helpers;

public static class IconHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct SHFILEINFO
    {
        public IntPtr hIcon;
        public int iIcon;
        public uint dwAttributes;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szDisplayName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
        public string szTypeName;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Auto)]
    private static extern IntPtr SHGetFileInfo(string pszPath, uint dwFileAttributes, ref SHFILEINFO psfi, uint cbSizeFileInfo, uint uFlags);

    [DllImport("user32.dll")]
    private static extern bool DestroyIcon(IntPtr hIcon);

    private const uint SHGFI_ICON = 0x100;
    private const uint SHGFI_SMALLICON = 0x1;
    private const uint SHGFI_USEFILEATTRIBUTES = 0x10;
    private const uint FILE_ATTRIBUTE_DIRECTORY = 0x10;
    private const uint FILE_ATTRIBUTE_NORMAL = 0x80;

    public static int GetIconIndex(ImageList imageList, string path, bool isDirectory)
    {
        string key = isDirectory ? "__DIR__" : Path.GetExtension(path).ToLower();
        if (string.IsNullOrEmpty(key)) key = "__FILE__";

        if (imageList.Images.ContainsKey(key))
            return imageList.Images.IndexOfKey(key);

        var shfi = new SHFILEINFO();
        uint flags = SHGFI_ICON | SHGFI_SMALLICON;
        uint attrs = isDirectory ? FILE_ATTRIBUTE_DIRECTORY : FILE_ATTRIBUTE_NORMAL;

        if (!File.Exists(path) && !Directory.Exists(path))
            flags |= SHGFI_USEFILEATTRIBUTES;

        SHGetFileInfo(path, attrs, ref shfi, (uint)Marshal.SizeOf(shfi), flags);

        if (shfi.hIcon == IntPtr.Zero) return 0;

        var icon = Icon.FromHandle(shfi.hIcon);
        imageList.Images.Add(key, icon.ToBitmap());
        icon.Dispose();
        DestroyIcon(shfi.hIcon);

        return imageList.Images.IndexOfKey(key);
    }
}
