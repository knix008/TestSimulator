using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using MyDesktop.Interop;

namespace MyDesktop.Services;

/// <summary>
/// Pulls the real shell icon for a path, including shortcut overlays, at 48 pixels.
/// </summary>
public static class ShellIconService
{
    private const uint FileAttributeNormal = 0x00000080;
    private const uint FileAttributeDirectory = 0x00000010;

    private static readonly Dictionary<string, ImageSource?> IconCache = new(StringComparer.OrdinalIgnoreCase);
    private static readonly Dictionary<string, string> TypeCache = new(StringComparer.OrdinalIgnoreCase);
    private static IImageList? _imageList;
    private static bool _imageListResolved;

    public static ImageSource? GetIcon(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return null;
        }

        if (IconCache.TryGetValue(path, out var cached))
        {
            return cached;
        }

        ImageSource? icon = null;
        try
        {
            icon = Extract(path);
        }
        catch (COMException)
        {
        }
        catch (ExternalException)
        {
        }

        IconCache[path] = icon;
        return icon;
    }

    public static string GetTypeName(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return "";
        }

        if (TypeCache.TryGetValue(path, out var cached))
        {
            return cached;
        }

        var info = new NativeMethods.SHFILEINFO();
        var flags = NativeMethods.SHGFI_TYPENAME;
        if (!Exists(path))
        {
            flags |= NativeMethods.SHGFI_USEFILEATTRIBUTES;
        }

        NativeMethods.SHGetFileInfo(path, Attributes(path), ref info, Marshal.SizeOf<NativeMethods.SHFILEINFO>(), flags);
        var name = info.szTypeName ?? "";
        TypeCache[path] = name;
        return name;
    }

    /// <summary>
    /// The icon for a shell item named the way the address bar names it, such as
    /// "::{645FF040-5081-101B-9F08-00AA002F954E}" for the Recycle Bin.
    /// </summary>
    public static ImageSource? GetShellIcon(string parsingName)
    {
        if (IconCache.TryGetValue(parsingName, out var cached))
        {
            return cached;
        }

        ImageSource? icon = null;
        if (NativeMethods.SHParseDisplayName(parsingName, IntPtr.Zero, out var pidl, 0, out _) == 0 && pidl != IntPtr.Zero)
        {
            try
            {
                var info = new NativeMethods.SHFILEINFO();
                var handle = NativeMethods.SHGetFileInfoPidl(pidl, 0, ref info,
                    Marshal.SizeOf<NativeMethods.SHFILEINFO>(), NativeMethods.SHGFI_PIDL | NativeMethods.SHGFI_SYSICONINDEX);

                if (handle != IntPtr.Zero && ResolveImageList() is { } list
                    && list.GetIcon(info.iIcon, NativeMethods.ILD_TRANSPARENT, out var iconHandle) == 0
                    && iconHandle != IntPtr.Zero)
                {
                    try
                    {
                        icon = FromHandle(iconHandle);
                    }
                    finally
                    {
                        NativeMethods.DestroyIcon(iconHandle);
                    }
                }
            }
            catch (COMException)
            {
            }
            finally
            {
                NativeMethods.CoTaskMemFree(pidl);
            }
        }

        IconCache[parsingName] = icon;
        return icon;
    }

    /// <summary>The name Windows shows for a shell place, in the user's own language.</summary>
    public static string? GetShellDisplayName(string parsingName)
    {
        if (NativeMethods.SHParseDisplayName(parsingName, IntPtr.Zero, out var pidl, 0, out _) != 0 || pidl == IntPtr.Zero)
        {
            return null;
        }

        try
        {
            var info = new NativeMethods.SHFILEINFO();
            var handle = NativeMethods.SHGetFileInfoPidl(pidl, 0, ref info,
                Marshal.SizeOf<NativeMethods.SHFILEINFO>(), NativeMethods.SHGFI_PIDL | NativeMethods.SHGFI_DISPLAYNAME);

            return handle != IntPtr.Zero && !string.IsNullOrWhiteSpace(info.szDisplayName) ? info.szDisplayName : null;
        }
        catch (COMException)
        {
            return null;
        }
        finally
        {
            NativeMethods.CoTaskMemFree(pidl);
        }
    }

    public static void Invalidate(string path)
    {
        IconCache.Remove(path);
        TypeCache.Remove(path);
    }

    public static void InvalidateAll()
    {
        IconCache.Clear();
        TypeCache.Clear();
    }

    private static ImageSource? Extract(string path)
    {
        var info = new NativeMethods.SHFILEINFO();
        var flags = NativeMethods.SHGFI_SYSICONINDEX;
        if (!Exists(path))
        {
            flags |= NativeMethods.SHGFI_USEFILEATTRIBUTES;
        }

        if (NativeMethods.SHGetFileInfo(path, Attributes(path), ref info, Marshal.SizeOf<NativeMethods.SHFILEINFO>(), flags) == IntPtr.Zero)
        {
            return null;
        }

        var list = ResolveImageList();
        if (list is null)
        {
            return SmallIcon(path);
        }

        if (list.GetIcon(info.iIcon, NativeMethods.ILD_TRANSPARENT, out var handle) != 0 || handle == IntPtr.Zero)
        {
            return SmallIcon(path);
        }

        try
        {
            return FromHandle(handle);
        }
        finally
        {
            NativeMethods.DestroyIcon(handle);
        }
    }

    private static ImageSource? SmallIcon(string path)
    {
        var info = new NativeMethods.SHFILEINFO();
        var flags = NativeMethods.SHGFI_ICON | NativeMethods.SHGFI_LARGEICON;
        if (!Exists(path))
        {
            flags |= NativeMethods.SHGFI_USEFILEATTRIBUTES;
        }

        if (NativeMethods.SHGetFileInfo(path, Attributes(path), ref info, Marshal.SizeOf<NativeMethods.SHFILEINFO>(), flags) == IntPtr.Zero
            || info.hIcon == IntPtr.Zero)
        {
            return null;
        }

        try
        {
            return FromHandle(info.hIcon);
        }
        finally
        {
            NativeMethods.DestroyIcon(info.hIcon);
        }
    }

    private static ImageSource? FromHandle(IntPtr handle)
    {
        var source = Imaging.CreateBitmapSourceFromHIcon(handle, Int32Rect.Empty, BitmapSizeOptions.FromEmptyOptions());
        source.Freeze();
        return source;
    }

    private static IImageList? ResolveImageList()
    {
        if (_imageListResolved)
        {
            return _imageList;
        }

        _imageListResolved = true;
        var iid = typeof(IImageList).GUID;
        if (NativeMethods.SHGetImageList(NativeMethods.SHIL_EXTRALARGE, ref iid, out var list) == 0)
        {
            _imageList = list;
        }

        return _imageList;
    }

    private static bool Exists(string path) => File.Exists(path) || Directory.Exists(path);

    private static uint Attributes(string path)
        => Directory.Exists(path) || path.EndsWith(System.IO.Path.DirectorySeparatorChar)
            ? FileAttributeDirectory
            : FileAttributeNormal;
}
