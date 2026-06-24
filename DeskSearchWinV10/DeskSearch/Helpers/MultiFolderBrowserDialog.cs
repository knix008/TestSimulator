using System.Runtime.InteropServices;

namespace DeskSearch.Helpers;

/// <summary>
/// .NET's FolderBrowserDialog has no multi-select option, so this drives the native
/// IFileOpenDialog COM API directly with FOS_PICKFOLDERS | FOS_ALLOWMULTISELECT —
/// the same dialog Explorer's "Open folder" uses, just configured for folders + multiselect.
/// </summary>
internal static class MultiFolderBrowserDialog
{
    private const uint FosPickFolders = 0x00000020;
    private const uint FosForceFileSystem = 0x00000040;
    private const uint FosAllowMultiSelect = 0x00000200;
    private const uint FosPathMustExist = 0x00000800;
    private const int SigdnFileSysPath = unchecked((int)0x80058000);
    private static readonly Guid IidIShellItem = new("43826D1E-E718-42EE-BC55-A1E261C37BFE");

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SHCreateItemFromParsingName(
        string path,
        IntPtr pbc,
        ref Guid riid,
        out IShellItem ppv);

    public static string[]? ShowDialog(IntPtr ownerHandle, string? initialFolder = null)
    {
        var dialog = (IFileOpenDialog)new FileOpenDialogRcw();
        try
        {
            dialog.SetOptions(FosPickFolders | FosForceFileSystem | FosAllowMultiSelect | FosPathMustExist);

            if (!string.IsNullOrWhiteSpace(initialFolder) && Directory.Exists(initialFolder))
            {
                try
                {
                    var riid = IidIShellItem;
                    SHCreateItemFromParsingName(initialFolder, IntPtr.Zero, ref riid, out var folderItem);
                    dialog.SetFolder(folderItem);
                }
                catch
                {
                    // not fatal — dialog just opens to its default location instead
                }
            }

            var hr = dialog.Show(ownerHandle);
            if (hr != 0)
                return null;

            dialog.GetResults(out var items);
            items.GetCount(out var count);

            var paths = new List<string>((int)count);
            for (uint i = 0; i < count; i++)
            {
                items.GetItemAt(i, out var item);
                item.GetDisplayName(SigdnFileSysPath, out var path);
                if (!string.IsNullOrWhiteSpace(path))
                    paths.Add(path);
            }

            return paths.ToArray();
        }
        finally
        {
            Marshal.ReleaseComObject(dialog);
        }
    }

    [ComImport]
    [Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
    private class FileOpenDialogRcw;

    [ComImport]
    [Guid("d57c7288-d4ad-4768-be02-9d969532d960")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileOpenDialog
    {
        [PreserveSig]
        int Show(IntPtr parent);

        void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
        void SetFileTypeIndex(uint iFileType);
        void GetFileTypeIndex(out uint piFileType);
        void Advise(IntPtr pfde, out uint pdwCookie);
        void Unadvise(uint dwCookie);
        void SetOptions(uint fos);
        void GetOptions(out uint pfos);
        void SetDefaultFolder(IShellItem psi);
        void SetFolder(IShellItem psi);
        void GetFolder(out IShellItem ppsi);
        void GetCurrentSelection(out IShellItem ppsi);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
        void GetResult(out IShellItem ppsi);
        void AddPlace(IShellItem psi, uint fdap);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
        void Close(int hr);
        void SetClientGuid(ref Guid guid);
        void ClearClientData();
        void SetFilter(IntPtr pFilter);

        void GetResults(out IShellItemArray ppenum);
        void GetSelectedItems(out IShellItemArray ppsai);
    }

    [ComImport]
    [Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem
    {
        void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem ppsi);
        void GetDisplayName(int sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
        void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
        void Compare(IShellItem psi, uint hint, out int piOrder);
    }

    [ComImport]
    [Guid("B63EA76D-1F85-456F-A19C-48159EFA858B")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItemArray
    {
        void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppvOut);
        void GetPropertyStore(int flags, ref Guid riid, out IntPtr ppv);
        void GetPropertyDescriptionList(IntPtr keyType, ref Guid riid, out IntPtr ppv);
        void GetAttributes(uint dwAttribFlags, uint sfgaoMask, out uint psfgaoAttribs);
        void GetCount(out uint pdwNumItems);
        void GetItemAt(uint dwIndex, out IShellItem ppsi);
        void EnumItems(out IntPtr ppenumShellItems);
    }
}
