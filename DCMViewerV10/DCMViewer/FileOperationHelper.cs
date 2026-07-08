using System.Collections.Specialized;
using System.Runtime.InteropServices;

namespace DCMViewer;

internal static class FileOperationHelper
{
    private const int FoDelete = 0x0003;
    private const ushort FofAllowUndo = 0x0040;
    private const ushort FofNoConfirmation = 0x0010;
    private const ushort FofSilent = 0x0004;

    public static void CopyPathsToClipboard(IEnumerable<string> paths)
    {
        var collection = new StringCollection();
        foreach (var path in paths)
            collection.Add(path);

        if (collection.Count > 0)
            Clipboard.SetFileDropList(collection);
    }

    public static bool CanPasteFromClipboard() => Clipboard.ContainsFileDropList();

    public static IReadOnlyList<string> PasteFromClipboard(string targetDirectory, bool overwrite)
    {
        if (!Directory.Exists(targetDirectory) || !Clipboard.ContainsFileDropList())
            return Array.Empty<string>();

        var pasted = new List<string>();
        var files = Clipboard.GetFileDropList();
        for (var i = 0; i < files.Count; i++)
        {
            var sourcePath = files[i];
            if (string.IsNullOrWhiteSpace(sourcePath))
                continue;

            try
            {
                if (File.Exists(sourcePath))
                {
                    var destinationPath = Path.Combine(targetDirectory, Path.GetFileName(sourcePath));
                    if (File.Exists(destinationPath) && !overwrite)
                        continue;

                    Directory.CreateDirectory(targetDirectory);
                    File.Copy(sourcePath, destinationPath, overwrite);
                    pasted.Add(destinationPath);
                    continue;
                }

                if (Directory.Exists(sourcePath))
                {
                    var destinationPath = Path.Combine(targetDirectory, Path.GetFileName(sourcePath.TrimEnd('\\', '/')));
                    CopyDirectory(sourcePath, destinationPath, overwrite);
                    pasted.Add(destinationPath);
                }
            }
            catch
            {
                // Caller reports failures if nothing was pasted.
            }
        }

        return pasted;
    }

    public static string CreateUniqueDirectory(string parentDirectory, string baseName)
    {
        if (!Directory.Exists(parentDirectory))
            throw new DirectoryNotFoundException($"Directory not found: {parentDirectory}");

        var firstPath = Path.Combine(parentDirectory, baseName);
        if (!Directory.Exists(firstPath))
        {
            Directory.CreateDirectory(firstPath);
            return firstPath;
        }

        for (var index = 2; ; index++)
        {
            var candidate = Path.Combine(parentDirectory, $"{baseName} ({index})");
            if (Directory.Exists(candidate))
                continue;

            Directory.CreateDirectory(candidate);
            return candidate;
        }
    }

    public static bool SendToRecycleBin(IWin32Window? owner, string path)
    {
        if (!File.Exists(path) && !Directory.Exists(path))
            return false;

        var normalizedPath = Path.GetFullPath(path);
        if (Directory.Exists(normalizedPath))
            normalizedPath = normalizedPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;

        var operation = new SHFILEOPSTRUCT
        {
            hwnd = owner?.Handle ?? IntPtr.Zero,
            wFunc = FoDelete,
            pFrom = normalizedPath + '\0',
            fFlags = FofAllowUndo | FofNoConfirmation | FofSilent,
        };

        return SHFileOperation(ref operation) == 0;
    }

    private static void CopyDirectory(string sourceDirectory, string destinationDirectory, bool overwrite)
    {
        Directory.CreateDirectory(destinationDirectory);

        foreach (var file in Directory.EnumerateFiles(sourceDirectory))
        {
            var destinationFile = Path.Combine(destinationDirectory, Path.GetFileName(file));
            File.Copy(file, destinationFile, overwrite);
        }

        foreach (var directory in Directory.EnumerateDirectories(sourceDirectory))
        {
            var destinationSubDirectory = Path.Combine(destinationDirectory, Path.GetFileName(directory));
            CopyDirectory(directory, destinationSubDirectory, overwrite);
        }
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int SHFileOperation(ref SHFILEOPSTRUCT fileOperation);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct SHFILEOPSTRUCT
    {
        public IntPtr hwnd;
        public uint wFunc;
        public string pFrom;
        public string pTo;
        public ushort fFlags;
        [MarshalAs(UnmanagedType.Bool)]
        public bool fAnyOperationsAborted;
        public IntPtr hNameMappings;
        public string lpszProgressTitle;
    }
}
