using System.Runtime.InteropServices;

namespace Palisades.Services;

/// <summary>
/// Deleting goes through the shell, so it lands in the Recycle Bin and can be undone, exactly as it
/// would from Explorer.
/// </summary>
public static class ShellFileOperations
{
    private const uint FO_DELETE = 0x0003;
    private const ushort FOF_ALLOWUNDO = 0x0040;
    private const ushort FOF_WANTNUKEWARNING = 0x4000;

    /// <summary>Sends the paths to the Recycle Bin. Returns true when the shell reported success.</summary>
    public static bool Recycle(IEnumerable<string> paths, IntPtr owner)
    {
        var real = paths
            .Where(path => !string.IsNullOrWhiteSpace(path) && !path.StartsWith("::{", StringComparison.Ordinal))
            .Where(path => File.Exists(path) || Directory.Exists(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (real.Length == 0)
        {
            return false;
        }

        var operation = new SHFILEOPSTRUCT
        {
            hwnd = owner,
            wFunc = FO_DELETE,
            pFrom = string.Join('\0', real) + "\0\0",
            // The warning matters: it is how the user finds out when something cannot be recycled and
            // would be deleted outright instead.
            fFlags = FOF_ALLOWUNDO | FOF_WANTNUKEWARNING
        };

        var result = SHFileOperation(ref operation);
        Diagnostics.Write($"recycle {real.Length} item(s) -> result={result} aborted={operation.fAnyOperationsAborted}");
        return result == 0 && !operation.fAnyOperationsAborted;
    }

    /// <summary>
    /// Empties the Recycle Bin on every drive. No flags are passed on purpose: the shell then asks
    /// the user first and shows its own progress, exactly as emptying it from Explorer does.
    /// </summary>
    public static bool EmptyRecycleBin(IntPtr owner)
    {
        var result = SHEmptyRecycleBin(owner, null, 0);
        Diagnostics.Write($"empty recycle bin -> result=0x{result:X8}");

        // An already empty bin answers with E_UNEXPECTED, which is nothing to complain about.
        return result is 0 or unchecked((int)0x8000FFFF);
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct SHFILEOPSTRUCT
    {
        public IntPtr hwnd;
        public uint wFunc;
        [MarshalAs(UnmanagedType.LPWStr)] public string pFrom;
        [MarshalAs(UnmanagedType.LPWStr)] public string? pTo;
        public ushort fFlags;
        [MarshalAs(UnmanagedType.Bool)] public bool fAnyOperationsAborted;
        public IntPtr hNameMappings;
        [MarshalAs(UnmanagedType.LPWStr)] public string? lpszProgressTitle;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SHFileOperation(ref SHFILEOPSTRUCT operation);

    [DllImport("shell32.dll", EntryPoint = "SHEmptyRecycleBinW", CharSet = CharSet.Unicode)]
    private static extern int SHEmptyRecycleBin(IntPtr owner, string? root, uint flags);
}
