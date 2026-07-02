using System.Runtime.InteropServices;

namespace MyWorkspace.Win;

/// <summary>
/// Forces comctl32 scrollbars to use Explorer::ScrollBar at creation time so vertical and
/// horizontal bars keep the same shape (including lazily created horizontal bars).
/// </summary>
internal static class Comctl32ScrollBarThemeHook
{
    private const int ImageDirectoryEntryDelayImport = 13;
    private const int OpenNcThemeDataOrdinal = 49;
    private const uint PageReadwrite = 0x04;

    private const string ScrollBarClass = "ScrollBar";
    private const string ExplorerScrollBarClass = "Explorer::ScrollBar";

    [UnmanagedFunctionPointer(CallingConvention.Winapi, CharSet = CharSet.Unicode)]
    private delegate IntPtr OpenNcThemeDataFn(IntPtr hWnd, string classList);

    private static OpenNcThemeDataFn? _hookTarget;
    private static OpenNcThemeDataFn? _originalOpenNcThemeData;
    private static bool _installed;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr LoadLibraryEx(string lpFileName, IntPtr hFile, uint dwFlags);

    [DllImport("kernel32.dll", CharSet = CharSet.Ansi, ExactSpelling = true, SetLastError = true)]
    private static extern IntPtr GetProcAddress(IntPtr hModule, IntPtr procName);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool VirtualProtect(IntPtr lpAddress, UIntPtr dwSize, uint flNewProtect, out uint lpflOldProtect);

    public static bool TryInstall()
    {
        if (_installed)
            return true;

        var comctl = LoadLibraryEx("comctl32.dll", IntPtr.Zero, 0x00000800); // LOAD_LIBRARY_SEARCH_SYSTEM32
        if (comctl == IntPtr.Zero)
            return false;

        var iatEntry = FindDelayLoadIatEntry(comctl, "uxtheme.dll", OpenNcThemeDataOrdinal);
        if (iatEntry == IntPtr.Zero)
            return false;

        var uxtheme = LoadLibraryEx("uxtheme.dll", IntPtr.Zero, 0x00000800);
        if (uxtheme == IntPtr.Zero)
            return false;

        var original = GetProcAddress(uxtheme, (IntPtr)OpenNcThemeDataOrdinal);
        if (original == IntPtr.Zero)
            return false;

        _originalOpenNcThemeData = Marshal.GetDelegateForFunctionPointer<OpenNcThemeDataFn>(original);
        _hookTarget = HookedOpenNcThemeData;
        var hookPointer = Marshal.GetFunctionPointerForDelegate(_hookTarget);

        if (!VirtualProtect(iatEntry, (UIntPtr)IntPtr.Size, PageReadwrite, out var oldProtect))
            return false;

        Marshal.WriteIntPtr(iatEntry, hookPointer);
        VirtualProtect(iatEntry, (UIntPtr)IntPtr.Size, oldProtect, out _);
        _installed = true;
        return true;
    }

    private static IntPtr HookedOpenNcThemeData(IntPtr hWnd, string classList)
    {
        if (string.Equals(classList, ScrollBarClass, StringComparison.Ordinal))
            return _originalOpenNcThemeData!(IntPtr.Zero, ExplorerScrollBarClass);

        return _originalOpenNcThemeData!(hWnd, classList);
    }

    private static IntPtr FindDelayLoadIatEntry(IntPtr moduleBase, string dllName, ushort ordinal)
    {
        var ntHeaders = GetNtHeaders(moduleBase);
        if (ntHeaders == IntPtr.Zero)
            return IntPtr.Zero;

        var delayDir = ReadDataDirectory(ntHeaders, ImageDirectoryEntryDelayImport);
        if (delayDir.Size == 0)
            return IntPtr.Zero;

        var descriptorAddress = moduleBase + (int)delayDir.VirtualAddress;
        for (var offset = 0; ; offset += 32)
        {
            var descriptor = descriptorAddress + offset;
            var nameRva = Marshal.ReadInt32(descriptor);
            if (nameRva == 0)
                break;

            var dllNameAddress = moduleBase + nameRva;
            var importedDll = Marshal.PtrToStringAnsi(dllNameAddress);
            if (!string.Equals(importedDll, dllName, StringComparison.OrdinalIgnoreCase))
                continue;

            var nameTableRva = Marshal.ReadInt32(descriptor + 12);
            var addressTableRva = Marshal.ReadInt32(descriptor + 16);
            var nameTable = moduleBase + nameTableRva;
            var addressTable = moduleBase + addressTableRva;

            for (var index = 0; ; index++)
            {
                var nameEntry = nameTable + index * IntPtr.Size;
                var iatEntry = addressTable + index * IntPtr.Size;
                var entry = Marshal.ReadIntPtr(nameEntry);
                if (entry == IntPtr.Zero)
                    break;

                if ((entry.ToInt64() & unchecked((long)0x8000000000000000)) != 0
                    && (entry.ToInt64() & 0xFFFF) == ordinal)
                {
                    return iatEntry;
                }
            }
        }

        return IntPtr.Zero;
    }

    private static IntPtr GetNtHeaders(IntPtr moduleBase)
    {
        var dosSignature = Marshal.ReadInt16(moduleBase);
        if (dosSignature != 0x5A4D)
            return IntPtr.Zero;

        var eLfanew = Marshal.ReadInt32(moduleBase + 0x3C);
        var ntHeaders = moduleBase + eLfanew;
        var peSignature = Marshal.ReadInt32(ntHeaders);
        return peSignature == 0x00004550 ? ntHeaders : IntPtr.Zero;
    }

    private static (uint VirtualAddress, uint Size) ReadDataDirectory(IntPtr ntHeaders, int index)
    {
        var optionalHeaderOffset = ntHeaders + 0x18;
        var magic = Marshal.ReadInt16(optionalHeaderOffset);
        var dataDirectoryOffset = magic == 0x20B
            ? optionalHeaderOffset + 0x70 + index * 8
            : optionalHeaderOffset + 0x60 + index * 8;

        var virtualAddress = (uint)Marshal.ReadInt32(dataDirectoryOffset);
        var size = (uint)Marshal.ReadInt32(dataDirectoryOffset + 4);
        return (virtualAddress, size);
    }
}
