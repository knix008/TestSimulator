using System.Collections.Concurrent;
using System.Runtime.InteropServices;

namespace DCMViewer;

internal sealed class ShellFileIconProvider : IDisposable
{
    private const uint ShgfiIcon = 0x000000100;
    private const uint ShgfiSmallIcon = 0x000000001;
    private const uint ShgfiUseFileAttributes = 0x000000010;
    private const uint FileAttributeDirectory = 0x000000010;

    private readonly ConcurrentDictionary<string, int> _iconIndexCache = new(StringComparer.OrdinalIgnoreCase);

    public ImageList ImageList { get; } = new()
    {
        ColorDepth = ColorDepth.Depth32Bit,
        ImageSize = new Size(ViewerFileIcons.TreeIconSize, ViewerFileIcons.TreeIconSize),
    };

    public int GetFolderIconIndex(string directoryPath)
    {
        var key = "folder";
        return _iconIndexCache.GetOrAdd(key, _ => AddShellFolderIcon(directoryPath));
    }

    public int GetFileIconIndex(string filePath)
    {
        var extension = Path.GetExtension(filePath);
        if (string.IsNullOrEmpty(extension))
            extension = ".file";

        return _iconIndexCache.GetOrAdd(extension, ext =>
        {
            ImageList.Images.Add(ViewerFileIcons.ForExtension(ext));
            return ImageList.Images.Count - 1;
        });
    }

    private int AddShellFolderIcon(string directoryPath)
    {
        var shInfo = new SHFILEINFO();
        var flags = ShgfiIcon | ShgfiSmallIcon;
        uint attributes = 0;

        if (!Directory.Exists(directoryPath))
        {
            attributes = FileAttributeDirectory;
            flags |= ShgfiUseFileAttributes;
            directoryPath = "Folder";
        }

        if (SHGetFileInfo(directoryPath, attributes, ref shInfo, (uint)Marshal.SizeOf<SHFILEINFO>(), flags) == IntPtr.Zero
            || shInfo.hIcon == IntPtr.Zero)
            return AddFallbackFolderIcon();

        try
        {
            using var icon = Icon.FromHandle(shInfo.hIcon);
            ImageList.Images.Add(icon);
            return ImageList.Images.Count - 1;
        }
        finally
        {
            DestroyIcon(shInfo.hIcon);
        }
    }

    private int AddFallbackFolderIcon()
    {
        var shInfo = new SHFILEINFO();
        var flags = ShgfiIcon | ShgfiSmallIcon | ShgfiUseFileAttributes;

        if (SHGetFileInfo("Folder", FileAttributeDirectory, ref shInfo, (uint)Marshal.SizeOf<SHFILEINFO>(), flags) == IntPtr.Zero
            || shInfo.hIcon == IntPtr.Zero)
        {
            ImageList.Images.Add(SystemIcons.Application);
            return ImageList.Images.Count - 1;
        }

        try
        {
            using var icon = Icon.FromHandle(shInfo.hIcon);
            ImageList.Images.Add(icon);
            return ImageList.Images.Count - 1;
        }
        finally
        {
            DestroyIcon(shInfo.hIcon);
        }
    }

    public void Dispose()
    {
        ImageList.Dispose();
    }

    [DllImport("shell32.dll", CharSet = CharSet.Auto)]
    private static extern IntPtr SHGetFileInfo(
        string pszPath,
        uint dwFileAttributes,
        ref SHFILEINFO psfi,
        uint cbFileInfo,
        uint uFlags);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool DestroyIcon(IntPtr hIcon);

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
}
